import electron, { dialog, shell } from 'electron'
const { app, BrowserWindow, ipcMain } = electron
import path from 'path'
import fs from 'fs'
import { configGet, configSet, allConvs, saveConv, delConv } from './database'
import { getContext } from './context'
import { agentLoop } from './agent-loop'
import { loadMemory, savePresetMemory, distillDailyLogs } from './memory'
import { loadAllPlugins, getLoadedSkills } from './plugins'
import { initPipelineRegistry } from './pipeline-registry'
import { getMarketplaceSkills, searchMarketplace, installSkill, uninstallSkill } from './skill-marketplace'
import { connectAllMcpServers, getMcpServers, connectOneMcpServer, disconnectMcpServer, updateMcpServer, removeMcpServer, getAllServerStatus, getServerTools } from './mcp-client'
import { startOAuthServer, startOAuthFlow, stopOAuthServer, getOAuthPort } from './oauth'
import { getAllConnectors, getConnector, setConnectorStatus, getAllConnectorStatuses } from './connectors'
import { getAllExperts, getActiveExpert, setActiveExpert, ExpertInfo } from './experts'

let mcpConnected = false

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 900, minHeight: 600,
    frame: false, titleBarStyle: 'hidden',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, webSecurity: true },
    backgroundColor: '#FFFFFF', show: false,
  })
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  if (process.env.VITE_DEV_SERVER_URL) mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  else mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
}

// Init data dirs
function init() {
  try {
    const d = path.join(app.getPath('userData'), 'corebuddy-data')
    fs.mkdirSync(path.join(d, 'context'), { recursive: true })
    if (!fs.existsSync(path.join(d, 'conversations.json'))) fs.writeFileSync(path.join(d, 'conversations.json'), '[]')
    // Config file handled by database.ts (minibuddy-config.json)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('初始化数据目录失败:', msg)
  }
}

// Window controls
ipcMain.handle('window:minimize', () => mainWindow?.minimize())
ipcMain.handle('window:maximize', () => { if (mainWindow?.isMaximized()) mainWindow?.unmaximize(); else mainWindow?.maximize(); return mainWindow?.isMaximized() })
ipcMain.handle('window:close', () => mainWindow?.close())
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() || false)

// Config
ipcMain.handle('config:get', (_e, k: string) => configGet(k))
ipcMain.handle('config:set', (_e, k: string, v: string) => { configSet(k, v); return true })

// Track active streams per conversation (for background loading + task list status)
const activeStreams = new Map<string, { abort: () => void }>()

function broadcastToAll(channel: string, data?: any) {
  for (const win of BrowserWindow.getAllWindows()) {
    try { win.webContents.send(channel, data) } catch (err) {
      console.error(`[IPC] broadcastToAll(${channel}) 失败:`, err)
    }
  }
}

// Chat — uses Agent Loop
ipcMain.handle('chat:sendMessage', async (_e, text: string, modelId: string, convId: string, permLevel?: number, persona?: string, scenePrompt?: string, userName?: string, executionMode?: string, attachments?: Array<{type: string; name: string; data?: string; path?: string; size?: number}>) => {
  if (!mainWindow) return
  const apiKey = configGet('apiKey')
  const modelsCfg = loadModelsConfig()
  const resolvedModelId = modelId || modelsCfg.defaultModel || 'deepseek-v4-pro'
  const modelEntry = modelsCfg.models.find((m: any) => m.id === resolvedModelId)
  // Allow model's own key to satisfy the API Key requirement
  if (!apiKey && !modelEntry?.apiKey) { broadcastToAll('chat:streamError', { message: '请先设置 API Key' }); return }

  // Create abort controller for this stream (check for existing first)
  const existing = activeStreams.get(convId)
  if (existing) existing.abort() // Cancel any previous stream for this conversation
  const abortController = new AbortController()
  activeStreams.set(convId, { abort: () => abortController.abort() })
  broadcastToAll('conv:status', { convId, loading: true })

  try {
    const apiUrl = modelEntry?.apiUrl || 'https://api.deepseek.com/v1'

    // ★ 模型专属 Key 缺失时弹窗引导，不静默降级到全局 Key
    const effectiveApiKey = modelEntry?.apiKey || apiKey
    if (!modelEntry?.apiKey && modelEntry && apiUrl !== 'https://api.deepseek.com/v1' && mainWindow) {
      const btnIdx = dialog.showMessageBoxSync(mainWindow, {
        type: 'warning',
        title: '需要专属 API Key',
        message: `模型 "${modelEntry.name}" 未配置专属 API Key`,
        detail: `该模型的 API 地址是 ${apiUrl}，全局 Key 可能不兼容。\n请前往设置页面为该模型单独配置 Key。`,
        buttons: ['取消', '去设置'],
        defaultId: 1,
        cancelId: 0,
      })
      if (btnIdx === 1) {
        broadcastToAll('ui:openSettings', { tab: 'models', focusModel: resolvedModelId })
      }
      broadcastToAll('chat:streamError', { message: `请先为模型 "${modelEntry.name}" 配置 API Key`, convId })
      activeStreams.delete(convId)
      return
    }

    await agentLoop(text, convId, {
      apiKey: effectiveApiKey,
      model: resolvedModelId,
      persona: (persona as any) || 'office',
      executionMode: (executionMode as any) || 'craft',
      permLevel: permLevel || 5,
      permissionMode: 'bypassPermissions',
      thinkingEffort: 'medium',
      scenePrompt: scenePrompt || undefined,
      userName: userName || undefined,
      apiUrl,
      attachments: attachments || undefined,
      onRequestPermission: async (toolName, toolDesc) => {
        if (!mainWindow || mainWindow.isDestroyed()) return false
        const result = await dialog.showMessageBox(mainWindow, {
          type: 'question',
          title: '权限确认',
          message: `CoreBuddy 想要执行: ${toolName}`,
          detail: `${toolDesc}\n\n当前为默认权限模式，该操作需要更高权限。`,
          buttons: ['允许执行', '拒绝'],
          defaultId: 0,
          cancelId: 1,
        })
        return result.response === 0
      },
      isAborted: () => abortController.signal.aborted,
      abortSignal: abortController.signal,
      sender: mainWindow!,
    }, mainWindow)

    // Update conversation title
    const conv = allConvs().find((c: any) => c.id === convId)
    if (conv && conv.title === '新对话') {
      conv.title = text.slice(0, 30) + (text.length > 30 ? '...' : '')
      conv.updatedAt = new Date().toISOString()
      saveConv(conv)
    }
    return { success: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? (e?.message || String(e)) : String(e)
    const stack = e instanceof Error ? (e?.stack?.split('\n').slice(0, 3).join('\n') || '') : ''
    console.error('[MAIN] Agent loop crash:', msg, '\n' + stack)
    broadcastToAll('chat:streamError', { message: `内部错误: ${msg}\n\n📍 ${stack}` })
    return { success: false, error: msg }
  } finally {
    activeStreams.delete(convId)
    broadcastToAll('conv:status', { convId, loading: false })
  }
})

// Check conversation loading status
ipcMain.handle('conv:status', () => {
  const result: Record<string, boolean> = {}
  activeStreams.forEach((_, convId) => { result[convId] = true })
  return result
})

// Abort active stream for a conversation
ipcMain.handle('chat:abort', (_e, convId: string) => {
  const stream = activeStreams.get(convId)
  if (stream) {
    stream.abort()
    activeStreams.delete(convId)
    broadcastToAll('conv:status', { convId, loading: false })
    return true
  }
  return false
})

// User feedback (like/dislike)
ipcMain.handle('chat:feedback', async (_e, convId: string, msgId: string, type: 'like' | 'dislike', content: string) => {
  try {
    const feedsPath = path.join(app.getPath('userData'), 'corebuddy-data', 'feedback.json')
    let feeds: any[] = []
    try { feeds = JSON.parse(fs.readFileSync(feedsPath, 'utf-8')) } catch {}
    feeds.push({ convId, msgId, type, content: content.slice(0, 500), time: new Date().toISOString() })
    fs.writeFileSync(feedsPath, JSON.stringify(feeds, null, 2), 'utf-8')

    // If liked, save the response style as a preference
    if (type === 'like') {
      const memPath = path.join(app.getPath('userData'), 'corebuddy-data', 'memory.json')
      let mem: any = { facts: [], preferences: [], projects: [], todos: [] }
      try { mem = JSON.parse(fs.readFileSync(memPath, 'utf-8')) } catch {}
      const pref = `用户喜欢这种回答风格: ${content.slice(0, 150).replace(/\n/g, ' ')}`
      if (!mem.preferences) mem.preferences = []
      // Avoid duplicates by checking exact content match
      const existing = mem.preferences.find((p: string) => p.includes('用户喜欢这种回答风格'))
      if (!existing || existing !== pref) {
        mem.preferences.push(pref)
        fs.writeFileSync(memPath, JSON.stringify(mem, null, 2), 'utf-8')
      }
    }
    return { success: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg }
  }
})

// Conversations
ipcMain.handle('conv:list', () => {
  const convs = allConvs()
  return convs.sort((a: any, b: any) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
})
ipcMain.handle('conv:create', (_e, id: string) => {
  const conv = { id, title: '新对话', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  saveConv(conv); return conv
})
ipcMain.handle('conv:delete', (_e, id: string) => {
  delConv(id)
  // Clean context file
  const ctxPath = path.join(app.getPath('userData'), 'corebuddy-data', 'context', `${id}.json`)
  try { if (fs.existsSync(ctxPath)) fs.unlinkSync(ctxPath) } catch {}
})
ipcMain.handle('conv:messages', (_e, id: string) => {
  try { return getContext(id, 100) } catch { return [] }
})

// Progress / Memory — for welcome screen
ipcMain.handle('progress:get', () => {
  const mem = loadMemory()
  return {
    projects: mem.projects,
    todos: mem.todos.filter(t => !t.done),
    factsCount: mem.facts.length,
    prefsCount: mem.preferences.length,
  }
})

// MCP Servers
/** Resolve relative MCP server paths to resourcesPath (where extraResources live) */
function resolveMcpConfig(config: any) {
  if (!config?.args) return config
  let args = typeof config.args === 'string' ? config.args.split(' ') : [...config.args]
  args = args.map((arg: string) => {
    // If relative path (not absolute drive letter or slash), resolve to resources
    if (arg.endsWith('.js') && !arg.startsWith('/') && !arg.match(/^[A-Za-z]:/)) {
      return path.join(process.resourcesPath, arg)
    }
    return arg
  })
  return { ...config, args }
}

ipcMain.handle('mcp:list', () => getMcpServers())
ipcMain.handle('mcp:connect', async () => {
  if (mcpConnected) return 'Already connected'
  const results = await connectAllMcpServers()
  mcpConnected = true
  return results
})
ipcMain.handle('mcp:connectOne', async (_e, name: string, config: any) => {
  const result = await connectOneMcpServer(name, resolveMcpConfig(config))
  return result
})
ipcMain.handle('mcp:disconnect', (_e, name: string) => {
  disconnectMcpServer(name)
  return true
})

// Reconnect using saved config (preserves credentials)
ipcMain.handle('mcp:reconnect', async (_e, name: string) => {
  const cfg = getMcpServers()
  const server = cfg.servers[name]
  if (!server) return `${name}: 暂无保存的配置`
  const result = await connectOneMcpServer(name, resolveMcpConfig({ ...server, enabled: true }))
  return result
})
ipcMain.handle('mcp:save', async (_e, name: string, config: any) => {
  await updateMcpServer(name, config)
  return true
})
ipcMain.handle('mcp:remove', (_e, name: string) => {
  removeMcpServer(name)
  return true
})
ipcMain.handle('mcp:status', () => getAllServerStatus())
ipcMain.handle('mcp:tools', (_e, name: string) => getServerTools(name))

// ── Connector Management ──
ipcMain.handle('connectors:list', () => {
  return getAllConnectors()
})

ipcMain.handle('connectors:status', () => {
  return getAllConnectorStatuses()
})

ipcMain.handle('connectors:connect', async (_e, id: string, config: Record<string, string>) => {
  const connector = getConnector(id)
  if (!connector) return { success: false, error: `连接器 "${id}" 不存在` }

  setConnectorStatus(id, 'connecting')

  try {
    if (connector.mcpCommand) {
      // Has an MCP server — delegate to MCP infrastructure
      const env: Record<string, string> = {}
      for (const field of connector.configSchema) {
        const val = config[field.key]
        if (val) {
          // Map schema key to env variable name (uppercase connector ID + key)
          const envKey = `${id.replace(/-/g, '_').toUpperCase()}_${field.key.toUpperCase()}`
          env[envKey] = val
        }
      }

      const result = await connectOneMcpServer(id, {
        command: connector.mcpCommand,
        args: connector.mcpArgs || [],
        env: Object.keys(env).length ? env : undefined,
        enabled: true,
      })

      if (result && result.includes('error')) {
        setConnectorStatus(id, 'disconnected')
        return { success: false, error: result }
      }
    } else {
      // Manual connector — simulate connection delay
      await new Promise(r => setTimeout(r, 800))
    }

    // Save config (only for MCP connectors)
    if (connector.mcpCommand) {
      updateMcpServer(id, { command: connector.mcpCommand, args: connector.mcpArgs || [], env: { ...config }, enabled: true })
    }

    setConnectorStatus(id, 'connected')
    return { success: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? (e?.message || '连接失败') : '连接失败'
    setConnectorStatus(id, 'disconnected')
    return { success: false, error: msg }
  }
})

ipcMain.handle('connectors:disconnect', async (_e, id: string) => {
  const connector = getConnector(id)
  if (!connector) return false

  try {
    if (connector.mcpCommand) {
      disconnectMcpServer(id)
    }
    setConnectorStatus(id, 'disconnected')
    return true
  } catch {
    setConnectorStatus(id, 'disconnected')
    return true
  }
})

// ── Model config ──
const MODELS_PATH = () => path.join(app.getPath('userData'), 'corebuddy-data', 'models.json')

function loadModelsConfig(): { models: Array<{ id: string; name: string; apiUrl: string; apiKey?: string }>; defaultModel: string } {
  try {
    if (fs.existsSync(MODELS_PATH())) return JSON.parse(fs.readFileSync(MODELS_PATH(), 'utf-8'))
  } catch {}
  return {
    models: [
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', apiUrl: 'https://api.deepseek.com/v1' },
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', apiUrl: 'https://api.deepseek.com/v1' },
      { id: 'agnes-2.0-flash', name: 'Agnes 2.0 Flash（日常聊天）', apiUrl: 'https://apihub.agnes-ai.com/v1' },
      { id: 'agnes-image-2.1-flash', name: 'Agnes Image 2.1 Flash（图片识别）', apiUrl: 'https://apihub.agnes-ai.com/v1' },
      { id: 'agnes-video-v2.0', name: 'Agnes Video V2.0（视频生成）', apiUrl: 'https://apihub.agnes-ai.com/v1' },
    ],
    defaultModel: 'deepseek-v4-pro',
  }
}

function saveModelsConfig(cfg: any) {
  fs.mkdirSync(path.dirname(MODELS_PATH()), { recursive: true })
  fs.writeFileSync(MODELS_PATH(), JSON.stringify(cfg, null, 2), 'utf-8')
}

ipcMain.handle('models:list', () => loadModelsConfig())
ipcMain.handle('models:save', (_e, config: any) => { saveModelsConfig(config); return true })
ipcMain.handle('models:add', (_e, model: any) => {
  const cfg = loadModelsConfig()
  if (cfg.models.find((m: any) => m.id === model.id)) return { success: false, error: '模型ID已存在' }
  cfg.models.push({ id: model.id, name: model.name, apiUrl: model.apiUrl, apiKey: model.apiKey || '' })
  if (!cfg.defaultModel) cfg.defaultModel = model.id
  saveModelsConfig(cfg)
  return { success: true }
})
ipcMain.handle('models:remove', (_e, id: string) => {
  const cfg = loadModelsConfig()
  cfg.models = cfg.models.filter((m: any) => m.id !== id)
  if (cfg.defaultModel === id) cfg.defaultModel = cfg.models[0]?.id || ''
  saveModelsConfig(cfg)
  return true
})
ipcMain.handle('models:setDefault', (_e, id: string) => {
  const cfg = loadModelsConfig()
  cfg.defaultModel = id
  saveModelsConfig(cfg)
  return true
})

// Connector config import/export — admin pre-configures, employees import
ipcMain.handle('mcp:export', async () => {
  const cfgPath = path.join(app.getPath('userData'), 'corebuddy-mcp.json')
  if (!fs.existsSync(cfgPath)) return { success: false, error: '暂无配置' }
  const result = await dialog.showSaveDialog({
    title: '导出连接器配置（含密钥）',
    defaultPath: 'corebuddy-connectors.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (result.canceled || !result.filePath) return { success: false, error: '已取消' }
  try {
    fs.copyFileSync(cfgPath, result.filePath)
    return { success: true, path: result.filePath }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg }
  }
})
ipcMain.handle('mcp:import', async () => {
  const result = await dialog.showOpenDialog({
    title: '导入连接器配置',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  })
  if (result.canceled || !result.filePaths.length) return { success: false, error: '已取消' }
  try {
    const cfgPath = path.join(app.getPath('userData'), 'corebuddy-mcp.json')
    fs.writeFileSync(cfgPath, fs.readFileSync(result.filePaths[0]), 'utf-8')
    // Connect all imported servers
    const results = await connectAllMcpServers()
    mcpConnected = true
    return { success: true, results }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg }
  }
})

// OAuth
ipcMain.handle('oauth:start', async (_e, serviceName: string, config: any) => {
  try {
    const result = await startOAuthFlow(serviceName, config)
    return { success: true, ...result }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg }
  }
})
ipcMain.handle('oauth:port', () => getOAuthPort())

// Memory preset
ipcMain.handle('memory:savePreset', (_e, preset: any) => {
  savePresetMemory(preset)
  return true
})

// Skills
ipcMain.handle('skills:list', () => {
  const skills = getLoadedSkills()
  return skills.map(s => ({ name: s.name, description: s.description, type: s.type, triggers: s.triggers }))
})

// Marketplace
ipcMain.handle('skills:marketplace', () => {
  return getMarketplaceSkills()
})

ipcMain.handle('skills:search', (_e, query: string) => {
  return searchMarketplace(query)
})

ipcMain.handle('skills:install', async (_e, id: string) => {
  return installSkill(id)
})

ipcMain.handle('skills:uninstall', async (_e, id: string) => {
  return uninstallSkill(id)
})

// Experts
ipcMain.handle('experts:list', () => {
  return getAllExperts()
})

ipcMain.handle('experts:active', () => {
  return getActiveExpert()
})

ipcMain.handle('experts:activate', async (_e, expertId: string) => {
  const experts = getAllExperts()
  const expert = experts.find(e => e.id === expertId)
  if (!expert) throw new Error(`专家 "${expertId}" 不存在`)
  setActiveExpert(expert)
  return expert
})

ipcMain.handle('experts:deactivate', () => {
  setActiveExpert(null)
  return true
})

// Open external URL
ipcMain.handle('openExternal', async (_e, url: string) => {
  await shell.openExternal(url)
  return true
})

// File operations for panel
ipcMain.handle('file:open', async (_e, filePath: string) => {
  try {
    if (!fs.existsSync(filePath)) return { success: false, error: `文件不存在: ${filePath}` }
    await shell.openPath(filePath)
    return { success: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg }
  }
})

ipcMain.handle('file:showInFolder', async (_e, filePath: string) => {
  try {
    shell.showItemInFolder(filePath)
    return { success: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg }
  }
})

ipcMain.handle('file:read', async (_e, filePath: string) => {
  try {
    if (!fs.existsSync(filePath)) return { success: false, error: `文件不存在: ${filePath}` }
    const stat = fs.statSync(filePath)
    const ext = path.extname(filePath).toLowerCase()
    // Only read text-based files
    const textExts = ['.txt', '.md', '.html', '.htm', '.css', '.js', '.ts', '.json', '.xml', '.csv', '.log', '.svg', '.py', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.env', '.sh', '.bat', '.ps1', '.vue', '.jsx', '.tsx']
    if (!textExts.includes(ext) && stat.size > 1024 * 1024) {
      return { success: false, error: '文件太大或非文本格式，无法预览' }
    }
    const content = fs.readFileSync(filePath, 'utf-8').slice(0, 100000)
    return { success: true, content, size: stat.size, ext }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg }
  }
})

ipcMain.handle('file:listOutputs', async () => {
  try {
    const outputsDir = path.join(app.getPath('userData'), 'corebuddy-data', 'outputs')
    if (!fs.existsSync(outputsDir)) return { success: true, files: [] }
    const items = fs.readdirSync(outputsDir, { withFileTypes: true })
    const files = items
      .filter(i => i.isFile())
      .map(i => {
        const fp = path.join(outputsDir, i.name)
        const stat = fs.statSync(fp)
        return {
          name: i.name,
          path: fp,
          size: stat.size,
          time: stat.mtime.toISOString(),
          ext: path.extname(i.name).toLowerCase(),
        }
      })
      .sort((a, b) => b.time.localeCompare(a.time))
      .slice(0, 50)
    return { success: true, files, dir: outputsDir }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg, files: [] }
  }
})

ipcMain.handle('file:getInfo', async (_e, filePath: string) => {
  try {
    if (!fs.existsSync(filePath)) return { success: false, error: '文件不存在' }
    const stat = fs.statSync(filePath)
    return {
      success: true,
      name: path.basename(filePath),
      path: filePath,
      size: stat.size,
      created: stat.birthtime.toISOString(),
      modified: stat.mtime.toISOString(),
      ext: path.extname(filePath).toLowerCase(),
      isDir: stat.isDirectory(),
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg }
  }
})

// Save temp file for pasted/dropped attachments
ipcMain.handle('file:saveTemp', async (_e, data: string, fileName: string) => {
  try {
    const tmpDir = path.join(app.getPath('userData'), 'corebuddy-data', 'temp-uploads')
    fs.mkdirSync(tmpDir, { recursive: true })
    const buffer = Buffer.from(data, 'base64')
    const filePath = path.join(tmpDir, fileName)
    fs.writeFileSync(filePath, buffer)
    return { success: true, path: filePath, size: buffer.length }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg }
  }
})

// ── Video Generation Storyboard ──
ipcMain.handle('storyboard:generate', async (_e, prompt: string) => {
  const apiKey = configGet('apiKey')
  const modelsCfg = loadModelsConfig()
  const modelEntry = modelsCfg.models.find((m: any) => m.id === modelsCfg.defaultModel)
  const apiUrl = modelEntry?.apiUrl || 'https://api.deepseek.com/v1'
  const effectiveApiKey = modelEntry?.apiKey || apiKey

  if (!effectiveApiKey) return { success: false, error: '请先配置 API Key' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 90000) // 90s timeout

  try {
    const resp = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${effectiveApiKey}`,
      },
      body: JSON.stringify({
        model: modelsCfg.defaultModel || 'deepseek-v4-pro',
        messages: [
          { role: 'system', content: '你是一个专业的视频制作导演。你只返回有效的JSON，不添加任何解释文字。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!resp.ok) {
      const errText = await resp.text()
      return { success: false, error: `API 错误: ${resp.status} - ${errText.slice(0, 200)}` }
    }

    const json = await resp.json() as any
    const content = json?.choices?.[0]?.message?.content || ''

    // Return raw text alongside parsed JSON (for summary generation)
    const rawText = content

    // Try to parse JSON — try whole content first, then extract JSON blocks
    let data: any = null
    try { data = JSON.parse(content) } catch {}
    
    if (!data) {
      // Try matching ```json ... ``` code blocks
      const blobMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
      if (blobMatch) {
        try { data = JSON.parse(blobMatch[1]) } catch {}
      }
    }
    
    if (!data) {
      // Try finding JSON objects from the end (LLM sometimes adds preamble)
      const jsonMatches = content.match(/\{[\s\S]*\}/g) // greedy, matches full nested JSON
      if (jsonMatches) {
        for (let i = jsonMatches.length - 1; i >= 0; i--) {
          try {
            data = JSON.parse(jsonMatches[i])
            break
          } catch { /* try previous match */ }
        }
      }
    }
    
    if (data) {
      return { success: true, data, raw: rawText }
    }
    
    return { success: true, error: '无法从 AI 响应中提取 JSON', raw: rawText }
  } catch (e: unknown) {
    clearTimeout(timer)
    const msg = e instanceof Error ? (e.name === 'AbortError' ? '请求超时（90秒），请重试' : e.message) : String(e)
    return { success: false, error: msg }
  }
})

// ── Video Generation ──
ipcMain.handle('video-gen:generate', async (_e, prompt: string) => {
  const apiKey = configGet('apiKey')
  const modelsCfg = loadModelsConfig()
  const videoModel = modelsCfg.models.find((m: any) => m.id === 'agnes-video-v2.0')
  const apiUrl = videoModel?.apiUrl || 'https://apihub.agnes-ai.com/v1'
  const effectiveApiKey = videoModel?.apiKey || apiKey

  if (!effectiveApiKey) return { success: false, error: '请先配置视频模型 API Key' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120000) // 2min timeout for video generation

  try {
    // Try chat/completions endpoint first (OpenAI-compatible video model)
    const resp = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${effectiveApiKey}`,
      },
      body: JSON.stringify({
        model: 'agnes-video-v2.0',
        messages: [
          { role: 'user', content: `Generate a video: ${prompt}` },
        ],
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!resp.ok) {
      const errText = await resp.text()
      return { success: false, error: `视频生成 API 错误: ${resp.status} - ${errText.slice(0, 300)}` }
    }

    const json = await resp.json() as any
    // Handle both sync response and async task response
    const videoUrl = json?.choices?.[0]?.message?.content
      || json?.data?.[0]?.url
      || json?.video_url || json?.url
      || json?.output?.video_url
      || ''

    // Handle async task (polling pattern)
    if (!videoUrl && (json?.task_id || json?.id)) {
      const taskId = json.task_id || json.id
      // Poll for result (up to 10 times, 5s intervals)
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise(r => setTimeout(r, 5000))
        try {
          const pollResp = await fetch(`${apiUrl}/tasks/${taskId}`, {
            headers: { 'Authorization': `Bearer ${effectiveApiKey}` },
            signal: AbortSignal.timeout(10000),
          })
          if (pollResp.ok) {
            const pollJson = await pollResp.json() as any
            if (pollJson?.status === 'completed') {
              const resultUrl = pollJson?.video_url || pollJson?.url || pollJson?.output?.video_url || ''
              if (resultUrl) return { success: true, videoUrl: resultUrl }
            }
            if (pollJson?.status === 'failed') {
              return { success: false, error: pollJson?.error || '视频生成任务失败' }
            }
          }
        } catch {
          // Poll request failed — continue polling
          continue
        }
      }
      return { success: false, error: '视频生成超时，任务未在50秒内完成' }
    }

    return { success: !!videoUrl, videoUrl, error: videoUrl ? '' : '未获取到视频地址' }
  } catch (e: unknown) {
    clearTimeout(timer)
    const msg = e instanceof Error ? (e.name === 'AbortError' ? '视频生成超时（2分钟），请重试' : e.message) : String(e)
    return { success: false, error: msg }
  }
})

// ── Video Synthesis ──
ipcMain.handle('video-gen:synthesize', async (_e, shots: Array<{ name: string; videoUrl: string }>) => {
  if (!Array.isArray(shots) || shots.length === 0) {
    return { success: false, error: '没有可合成的视频分镜' }
  }

  const apiKey = configGet('apiKey')
  const modelsCfg = loadModelsConfig()
  const videoModel = modelsCfg.models.find((m: any) => m.id === 'agnes-video-v2.0')
  const apiUrl = videoModel?.apiUrl || 'https://apihub.agnes-ai.com/v1'
  const effectiveApiKey = videoModel?.apiKey || apiKey

  if (!effectiveApiKey) return { success: false, error: '请先配置视频模型 API Key' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 180000) // 3min timeout for synthesis

  try {
    const videoList = shots.map((s, i) => `[镜头${i + 1}] ${s.name}: ${s.videoUrl}`).join('\n')
    const resp = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${effectiveApiKey}`,
      },
      body: JSON.stringify({
        model: 'agnes-video-v2.0',
        messages: [
          { role: 'user', content: `Concatenate and blend the following video clips into a single seamless video. Between each clip, add a 5-second smooth crossfade transition (fade out / fade in). Maintain consistent color grading and audio levels throughout. Output the final video URL only:\n${videoList}\n\nIMPORTANT: Each transition between clips MUST be a 5-second crossfade. No hard cuts.` },
        ],
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!resp.ok) {
      const errText = await resp.text()
      return { success: false, error: `合成 API 错误: ${resp.status} - ${errText.slice(0, 300)}` }
    }

    const json = await resp.json() as any
    const finalVideoUrl = json?.choices?.[0]?.message?.content
      || json?.data?.[0]?.url
      || json?.video_url || json?.url
      || json?.output?.video_url
      || ''

    if (!finalVideoUrl && (json?.task_id || json?.id)) {
      const taskId = json.task_id || json.id
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise(r => setTimeout(r, 5000))
        try {
          const pollResp = await fetch(`${apiUrl}/tasks/${taskId}`, {
            headers: { 'Authorization': `Bearer ${effectiveApiKey}` },
            signal: AbortSignal.timeout(10000),
          })
          if (pollResp.ok) {
            const pollJson = await pollResp.json() as any
            if (pollJson?.status === 'completed') {
              const resultUrl = pollJson?.video_url || pollJson?.url || pollJson?.output?.video_url || ''
              if (resultUrl) return { success: true, finalVideoUrl: resultUrl }
            }
            if (pollJson?.status === 'failed') {
              return { success: false, error: pollJson?.error || '合成任务失败' }
            }
          }
        } catch {
          continue
        }
      }
      return { success: false, error: '视频合成超时，任务未在50秒内完成' }
    }

    return { success: !!finalVideoUrl, finalVideoUrl, error: finalVideoUrl ? '' : '未获取到合成视频地址' }
  } catch (e: unknown) {
    clearTimeout(timer)
    const msg = e instanceof Error ? (e.name === 'AbortError' ? '视频合成超时（3分钟），请重试' : e.message) : String(e)
    return { success: false, error: msg }
  }
})

app.whenReady().then(async () => {
  await startOAuthServer()
  createWindow()
  init()
  loadAllPlugins()
  initPipelineRegistry()
  // Memory maintenance: distill old logs on start
  try { distillDailyLogs() } catch {}
  // Connect MCP servers (non-blocking)
  connectAllMcpServers().then(results => {
    mcpConnected = true
    console.log('MCP servers connected:', results)
  }).catch(e => {
    console.error('MCP init error:', e)
  })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
