// Agent Loop — OpenClaw architecture + Claude Code three-layer design
// Plan → Act (parallel read-only) → Observe → Respond → Compaction → Repeat

import { BrowserWindow, nativeImage } from 'electron'
import fs from 'fs'
import { buildSystemPrompt } from './system-prompt'
import type { PersonaMode, ExecutionMode } from './system-prompt'
import { getTool, getAllTools, checkPermission, Tool, setApiConfig, getOpenAITools } from './tool-registry'
import type { PermissionMode } from './tool-registry'
import { addMessage, getContext } from './context'
import { recordDailyLog, updateProfile, addTodo } from './memory'
import { runPreToolHooks, runPostToolHooks, runStopHooks } from './hooks'
import { getActiveSkillsPrompt } from './plugins'
import { shouldUsePipeline, matchPipeline, runPipeline } from './pipeline'
import type { PipelineRun } from './pipeline'

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>
}

export interface ToolCall {
  action: string
  params: Record<string, any>
}

export interface AgentLoopConfig {
  apiKey: string
  model: string
  persona?: PersonaMode
  executionMode?: ExecutionMode
  permLevel?: number
  permissionMode?: PermissionMode
  thinkingEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  /** Called when default mode needs elevation to execute a higher-permission tool */
  onRequestPermission?: (toolName: string, toolDesc: string) => Promise<boolean>
  /** Check if this stream has been aborted (for background loading) */
  isAborted?: () => boolean
  /** AbortSignal for cancelling in-flight HTTP requests */
  abortSignal?: AbortSignal
  /** Current window for sending events */
  sender?: BrowserWindow
  /** Scene-specific system prompt to inject (e.g. PPT generation workflow) */
  scenePrompt?: string
  /** User's display name (for personalized system prompt) */
  userName?: string
  /** API base URL (e.g. https://api.deepseek.com/v1 or https://api.openai.com/v1) */
  apiUrl?: string
  /** 用户附带的文件路径列表（图片/文档） */
  attachments?: Array<{
    type: string   // 'image' | 'document'
    name: string
    path: string   // 文件在磁盘上的路径
  }>
}

const DEFAULT_CONFIG: Required<AgentLoopConfig> = {
  apiKey: '',
  model: 'deepseek-v4-pro',
  persona: 'office',
  executionMode: 'craft',
  permLevel: 3,
  permissionMode: 'default',
  thinkingEffort: 'medium',
  onRequestPermission: async () => false,
  isAborted: () => false,
  sender: undefined as any,
  scenePrompt: '',
  userName: '用户',
  apiUrl: 'https://api.deepseek.com/v1',
  attachments: [],
}

// ── Image resize/compress for API size limits ──
// DeepSeek API has input size limits; large images (10MB+ PNG) produce excessive base64
// We resize to max 1568px on longest edge, convert to JPEG @ 80% quality, cap at ~500KB output
const MAX_IMAGE_DIM = 1568
const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5MB — if under this, skip resize
const IMAGE_QUALITY = 80
const MAX_BASE64_LENGTH = 600_000 // ~450KB of base64 — safe for all models

function prepareImageForAPI(filePath: string): { base64: string; mime: string } | null {
  try {
    const rawBuffer = fs.readFileSync(filePath)
    
    // Determine MIME
    const ext = filePath.toLowerCase()
    const isPng = ext.endsWith('.png')
    const isGif = ext.endsWith('.gif')
    const isWebp = ext.endsWith('.webp')
    const isBmp = ext.endsWith('.bmp')
    
    // If the file is already reasonably small, use as-is
    if (rawBuffer.length <= MAX_IMAGE_BYTES) {
      const mime = isPng ? 'image/png' : isGif ? 'image/gif' : isWebp ? 'image/webp' : isBmp ? 'image/bmp' : 'image/jpeg'
      const base64 = rawBuffer.toString('base64')
      if (base64.length <= MAX_BASE64_LENGTH) {
        return { base64, mime }
      }
      // Base64 is still too long — fall through to resize
    }
    
    // Resize + compress using Electron's nativeImage (no external deps, works in asar)
    const img = nativeImage.createFromBuffer(rawBuffer)
    const size = img.getSize()
    
    // Guard against corrupted/empty images
    if (!size || size.width === 0 || size.height === 0) {
      console.error('[agent-loop] Invalid image dimensions:', filePath)
      return null
    }
    
    // If image dimensions are small but buffer is large (uncompressed format), just convert to JPEG
    if (size.width <= MAX_IMAGE_DIM && size.height <= MAX_IMAGE_DIM) {
      const base64 = img.toJPEG(IMAGE_QUALITY).toString('base64')
      if (base64.length <= MAX_BASE64_LENGTH) {
        return { base64, mime: 'image/jpeg' }
      }
    }
    
    // Calculate new dimensions preserving aspect ratio
    let newW = size.width
    let newH = size.height
    if (newW > MAX_IMAGE_DIM || newH > MAX_IMAGE_DIM) {
      const ratio = Math.min(MAX_IMAGE_DIM / newW, MAX_IMAGE_DIM / newH)
      newW = Math.round(newW * ratio)
      newH = Math.round(newH * ratio)
    }
    
    const resized = img.resize({ width: newW, height: newH, quality: 'good' })
    
    // Try JPEG at quality 80
    let jpegBuf = resized.toJPEG(IMAGE_QUALITY)
    let base64 = jpegBuf.toString('base64')
    
    // If still too large, step down quality
    if (base64.length > MAX_BASE64_LENGTH) {
      const qualities = [60, 40, 25]
      for (const q of qualities) {
        jpegBuf = resized.toJPEG(q)
        base64 = jpegBuf.toString('base64')
        if (base64.length <= MAX_BASE64_LENGTH) break
      }
    }
    
    // Final fallback: resize even smaller from already-resized image
    if (base64.length > MAX_BASE64_LENGTH) {
      const tinyImg = resized.resize({ width: 640, height: 640, quality: 'good' })
      jpegBuf = tinyImg.toJPEG(40)
      base64 = jpegBuf.toString('base64')
    }
    
    return { base64, mime: 'image/jpeg' }
  } catch (e: unknown) {
    console.error('[agent-loop] Image preparation failed:', filePath, e instanceof Error ? e.message : String(e))
    return null
  }
}

export async function agentLoop(
  userMessage: string,
  convId: string,
  config: AgentLoopConfig,
  sender: BrowserWindow
): Promise<void> {

  const cfg = { ...DEFAULT_CONFIG, ...config }
  // Broadcast to ALL windows (supports background loading when user switches convs)
  const send = (channel: string, data?: any) => {
    const payload = data && typeof data === 'object' && !Array.isArray(data) ? { ...data, convId } : { value: data, convId }
    for (const win of BrowserWindow.getAllWindows()) {
      try { win.webContents.send(channel, payload) } catch (err) {
        console.error(`[IPC] webContents.send(${channel}) 失败:`, err)
      }
    }
  }

  // Set API config for sub-agent spawning
  setApiConfig({ apiKey: cfg.apiKey, model: cfg.model, apiUrl: cfg.apiUrl })

  // 1. Record user message
  addMessage(convId, { role: 'user', content: userMessage })

  // ★ Pipeline detection: 如果是多步骤复杂任务，启动 Pipeline 编排引擎 ★
  if (shouldUsePipeline(userMessage, cfg.executionMode || 'craft')) {
    const pipelineDef = matchPipeline(userMessage)
    if (pipelineDef) {
      send('chat:streamChunk', `\n> 🔍 检测到复杂任务，启动 **${pipelineDef.name}** 多 Agent 协同工作流\n`)

      const pipelineResult = await runPipeline(pipelineDef, userMessage, {
        apiKey: cfg.apiKey,
        model: cfg.model,
        apiUrl: cfg.apiUrl,
        persona: cfg.persona,
        send: (channel, data) => send(channel, data),
        convId,
        onPipelineComplete: (result: PipelineRun) => {
          // 把 Pipeline 最终输出作为 assistant 消息记录
          const finalOutput = result.context['_finalOutput'] || ''
          if (finalOutput) {
            addMessage(convId, { role: 'assistant', content: finalOutput })
          }
          recordDailyLog(convId, userMessage, `(pipeline: ${pipelineDef.id})`)
        },
        onPipelineError: (error: string) => {
          recordDailyLog(convId, userMessage, `(pipeline error: ${error})`)
        },
      })

      // 如果 Pipeline 成功完成，带简要总结
      if (pipelineResult.status === 'completed') {
        const completedStages = Array.from(pipelineResult.stages.values()).filter(s => s.status === 'completed').length
        const totalStages = pipelineResult.stages.size
        send('chat:streamChunk', `\n\n> ✅ **${pipelineDef.name} 完成** — ${completedStages}/${totalStages} 个阶段全部执行完毕`)
        send('chat:streamDone', { toolCount: pipelineResult.stages.size, artifactCount: 0, pipeline: true })
        runStopHooks(convId)
        return
      }

      // 如果 Pipeline 失败了，继续退回到普通的 Agent Loop 兜底
      send('chat:streamChunk', `\n> ⚠️ Pipeline 执行遇到问题，退回单 Agent 模式继续处理...\n`)
    }
  }

  // 2. Build system prompt + inject activated skills
  let systemPrompt: string
  try {
    systemPrompt = buildSystemPrompt(cfg.persona || 'office', cfg.userName, cfg.executionMode || 'craft')
  } catch (e: any) {
    console.error('[AGENT-LOOP] buildSystemPrompt crashed:', e?.message || e, e?.stack)
    send('chat:streamError', `系统提示构建失败: ${e?.message || e}`)
    return
  }
  const activeSkills = getActiveSkillsPrompt(userMessage)

  // 3. Build message array for LLM
  // Convert tool role to user role for DeepSeek API compatibility
  // Strip old tool blocks from assistant msgs — they were already executed, re-feeding confuses LLM
  const contextMsgs = getContext(convId, 30).map(m => {
    if (m.role === 'tool') {
      return { role: 'user' as const, content: `[工具结果] ${m.content.slice(0, 2000)}${m.content.length > 2000 ? '...(已截断)' : ''}` }
    }
    if (m.role === 'assistant') {
      const clean = m.content.replace(/```tool[\s\S]*?```/g, '').trim()
      return clean ? { role: 'assistant' as const, content: clean } : null
    }
    return m
  }).filter(Boolean) as AgentMessage[]
  let messages: AgentMessage[] = [
    { role: 'system', content: systemPrompt + (activeSkills ? '\n\n' + activeSkills : '') + (cfg.scenePrompt ? '\n\n' + cfg.scenePrompt : '') },
    ...contextMsgs,
  ]

  // ★ 注入附件信息到对话 ★
  // 检测模型是否支持多模态（可直接"看"图片）
  const isVisionModel = /vision|vl|gemini|gpt-4o|claude|qwen.*vl|image/i.test(cfg.model)
  if (cfg.attachments && cfg.attachments.length > 0) {
    const imageAttachments = cfg.attachments.filter(a => a.type === 'image')
    const docAttachments = cfg.attachments.filter(a => a.type !== 'image')

    // 找到最后一条 user 消息的位置，准备替换或追加
    const lastUserIdx = messages.map(m => m.role).lastIndexOf('user')

    if (isVisionModel && imageAttachments.length > 0) {
      // ★ 多模态模型：图片以 base64 直传给模型 ★
      // 空文本时给默认提示，避免 API 拒绝空 content
      const textPrompt = userMessage.trim() || '请分析这张图片的内容'
      const contentParts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
        { type: 'text', text: textPrompt }
      ]
      for (const img of imageAttachments) {
        try {
          const prepared = prepareImageForAPI(img.path)
          if (prepared) {
            contentParts.push({ type: 'image_url', image_url: { url: `data:${prepared.mime};base64,${prepared.base64}` } })
          }
        } catch {}
      }
      // 文档附件仍然以文本提示
      if (docAttachments.length > 0) {
        const docNotes = docAttachments.map(a => `- 文件附件: ${a.path}（如需读取，请使用 read_document 工具）`).join('\n')
        contentParts.push({ type: 'text', text: docNotes })
      }

      if (lastUserIdx >= 0) {
        (messages[lastUserIdx] as any) = { role: 'user', content: contentParts }
      } else {
        (messages as any[]).push({ role: 'user', content: contentParts })
      }
    } else {
      // 非多模态模型：附件以纯文本提示注入
      const notes = cfg.attachments.map((a: any) => {
        if (a.type === 'image') return `- 图片附件: ${a.path}`
        return `- 文件附件: ${a.path}（如需读取文件内容，请使用 read_document 工具）`
      }).join('\n')
      // 纯图片无文字 → 自动告诉模型执行 OCR
      const userText = userMessage.trim() || (imageAttachments.length > 0 ? '请使用 read_image_content 工具识别图片中的文字内容' : '')
      if (lastUserIdx >= 0) {
        messages[lastUserIdx] = { role: 'user', content: `${userText}\n\n${notes}` }
      } else {
        messages.push({ role: 'user', content: `${userText}\n\n${notes}` })
      }
    }
  }

  // 4. Core loop: LLM → Parse tools → Execute (parallel if safe) → Repeat
  let turnCount = 0
  let totalTools = 0
  let artifactsCreated = 0
  const MAX_TOOL_TURNS = 5
  const HARD_TIMEOUT_MS = 600_000 // WorkBuddy-style: 600s hard timeout
  const startTime = Date.now()

  while (turnCount < MAX_TOOL_TURNS) {
    try {
    // Check if aborted (user cancelled or navigated away)
    if (cfg.isAborted?.()) {
      send('chat:streamDone', { toolCount: 0, artifactCount: 0, aborted: true })
      recordDailyLog(convId, userMessage, '(user aborted)')
      runStopHooks(convId)
      return
    }
    // Hard timeout guard — prevent runaway loops
    if (Date.now() - startTime > HARD_TIMEOUT_MS) {
      send('chat:streamError', '任务执行超时（600秒），已自动终止')
      send('chat:streamDone', { toolCount: totalTools, artifactCount: artifactsCreated, timeout: true })
      recordDailyLog(convId, userMessage, '(timeout)')
      return
    }
    turnCount++

    // Three-layer context compaction (Claude Code style)
    // Layer 1: Tool results truncated in executeAndLog
    // Layer 2: LLM-powered compaction when >80% (51K) of 64K context used
    // Layer 3: Last-resort trim when >90% (57K) — keeps system + last 5 msgs
    send('chat:compacting', { active: true })
    try {
      messages = await compactMessages(messages, cfg)
    } finally {
      send('chat:compacting', { active: false })
    }

    // Call LLM
    const { content, toolCalls } = await callLLM(messages, cfg, send)

    if (!content && toolCalls.length === 0) {
      send('chat:streamError', '未获得有效响应，请检查 API 连接')
      return
    }

    // Save assistant response
    const fullContent = content || ''
    addMessage(convId, { role: 'assistant', content: fullContent })

    // No tool calls? Done.
    if (toolCalls.length === 0) {
      send('chat:streamDone', { toolCount: 0, artifactCount: 0 })
      recordDailyLog(convId, userMessage, fullContent)
      const stopNotes = runStopHooks(convId)
      // ★ 工作完成自省: 如果本次有工具调用过（前面的轮次），保存学习笔记
      if (totalTools > 0) {
        await saveReflection(convId, userMessage, fullContent, cfg)
      }
      return
    }

    // ★ Ask 模式: 拒绝执行任何工具，只返回文字回答
    if (cfg.executionMode === 'ask') {
      const warn = `\n\n> ⚠️ 当前为 Ask（仅问答）模式，已忽略工具调用请求。如需执行操作，请切换到 Craft 或 Plan 模式。`
      addMessage(convId, { role: 'assistant', content: fullContent + warn })
      send('chat:streamChunk', warn)
      send('chat:streamDone', { toolCount: 0, artifactCount: 0 })
      recordDailyLog(convId, userMessage, fullContent + '\n(ask mode - tools skipped)')
      return
    }

    // Send tool execution start event for loading indicator
    send('chat:toolStart', { count: toolCalls.length, names: toolCalls.map(t => t.action) })

    // Strip tool blocks from content for cleaner assistant message to LLM
    const cleanAssistantContent = fullContent.replace(/```tool[\s\S]*?```/g, '').trim()

    // Separate parallel-safe vs sequential tools
    const parallelCalls: ToolCall[] = []
    const sequentialCalls: ToolCall[] = []

    for (const tc of toolCalls) {
      const tool = getTool(tc.action)
      if (!tool) {
        addMessage(convId, { role: 'tool', content: `未知工具: ${tc.action}` })
        continue
      }
      if (tool.parallelSafe) {
        parallelCalls.push(tc)
      } else {
        sequentialCalls.push(tc)
      }
    }

    // Push assistant's reasoning (without tool blocks) to messages context
    if (cleanAssistantContent) {
      messages.push({ role: 'assistant', content: cleanAssistantContent })
    }

    // Track artifacts created (accumulated across turns)

    // Send tool progress event
    const thisTurnTools = parallelCalls.length + sequentialCalls.length
    totalTools += thisTurnTools
    let completedTools = 0
    const sendProgress = (action: string) => {
      completedTools++
      send('chat:toolProgress', { completed: completedTools, total: thisTurnTools })
      send('chat:toolAction', { action: getActionText(action), completed: completedTools, total: thisTurnTools })
    }

    // Execute parallel-safe tools concurrently
    if (parallelCalls.length > 0) {
      const results = await Promise.all(
        parallelCalls.map(async tc => {
          const r = await executeAndLog(tc, cfg, convId, send)
          sendProgress(tc.action)
          return r
        })
      )
      for (const r of results) {
        messages.push(r.toolMsg)
        if (r.artifactPath) artifactsCreated++
      }
    }

    // Execute sequential tools one by one
    for (const tc of sequentialCalls) {
      const r = await executeAndLog(tc, cfg, convId, send)
      sendProgress(tc.action)
      messages.push(r.toolMsg)
      if (r.artifactPath) artifactsCreated++
    }

    } catch (loopErr: unknown) {
      const errMsg = loopErr instanceof Error ? (loopErr?.message || String(loopErr)) : String(loopErr)
      const errStack = loopErr instanceof Error ? (loopErr?.stack?.split('\n').slice(0, 3).join('\n') || '') : ''
      console.error('[AGENT-LOOP] Turn error:', errMsg, '\n' + errStack)
      send('chat:streamError', `执行异常: ${errMsg}\n\n📍 ${errStack}`)
      send('chat:streamDone', { toolCount: totalTools, artifactCount: artifactsCreated })
      recordDailyLog(convId, userMessage, `(loop error: ${errMsg})`)
      return
    }
  }

  send('chat:streamDone', { toolCount: totalTools, artifactCount: artifactsCreated })
  recordDailyLog(convId, userMessage, '(multi-turn completed)')
  const stopNotes = runStopHooks(convId)
  // ★ 工作完成自省: 多轮工具调用后保存学习笔记
  if (totalTools > 0) {
    await saveReflection(convId, userMessage, '', cfg)
  }
}

/**
 * ★ 工作完成自省 — 将本次任务的关键发现保存到记忆
 * 用 LLM 快速分析：任务做了什么？用户有什么偏好？学到了什么？
 */
async function saveReflection(
  convId: string,
  userMsg: string,
  finalResponse: string,
  cfg: Required<AgentLoopConfig>
): Promise<void> {
  try {
    const recentContext = getContext(convId, 8)
    const recentText = recentContext
      .filter(m => m.role !== 'system')
      .slice(-6)
      .map(m => `[${m.role}]: ${m.content.slice(0, 300)}`)
      .join('\n\n')

    const reflectionPrompt = [
      { role: 'system' as const, content: `你是 CoreBuddy 的"自省模块"。分析最近的对话，从以下维度提取可持久化的信息：

1. 用户透露了任何偏好、格式要求、命名规则吗？
2. 有没有创建或修改了项目？项目状态是什么？
3. 用户有没有提到待办事项？
4. 有什么关键决策需要记住？

如果以上都没有，输出"无"。如果发现了，用以下 JSON 格式输出（每行一条,每个维度最多一条）：

FACT: 关键事实
PREFERENCE: 偏好
PROJECT: 项目名:项目状态
TODO: 待办事项描述` },
      { role: 'user' as const, content: `最近对话:\n${recentText}` },
    ]

    const apiBase = cfg.apiUrl || 'https://api.deepseek.com/v1'
    const resp = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: reflectionPrompt,
        stream: false,
        max_tokens: 300,
        temperature: 0.3,
      }),
    })

    if (!resp.ok) return // Fail silently — reflection is non-critical

    const data: any = await resp.json()
    const reflection = data.choices?.[0]?.message?.content?.trim() || ''

    if (!reflection || reflection === '无') return

    // Parse reflection into memory actions
    const lines = reflection.split('\n')
    const activities: string[] = []
    let bgUpdated = false
    for (const line of lines) {
      const t = line.trim()
      if (t.startsWith('FACT:') || t.startsWith('PREFERENCE:')) {
        activities.push(t.startsWith('FACT:') ? t.slice(5).trim() : t.slice(11).trim())
        bgUpdated = true
      }
      else if (t.startsWith('TODO:')) addTodo(t.slice(5).trim())
    }
    if (bgUpdated && activities.length > 0) {
      updateProfile({ recentActivities: activities })
    }
  } catch {
    // 自省失败不影响主流程
  }
}

async function executeAndLog(
  tc: ToolCall,
  cfg: Required<AgentLoopConfig>,
  convId: string,
  send: (ch: string, data?: any) => void
): Promise<{ assistantMsg: AgentMessage; toolMsg: AgentMessage; artifactPath?: string }> {
  const tool = getTool(tc.action)!

  // Permission check
  if (!checkPermission(tool, cfg.permLevel, cfg.permissionMode)) {
    // If in default mode (permLevel=3) and tool needs higher permission,
    // try to elevate via confirmation dialog
    if (cfg.permLevel === 3 && tool.permission > 3 && cfg.onRequestPermission) {
      const approved = await cfg.onRequestPermission(tool.name, tool.description)
      if (!approved) {
        const err = `用户拒绝了 ${tool.name} 的执行请求`
        addMessage(convId, { role: 'tool', content: err })
        return {
          assistantMsg: { role: 'assistant', content: `[${tc.action} 被用户拒绝]` },
          toolMsg: { role: 'user', content: `[Tool "${tc.action}" rejected by user]` },
        }
      }
      // Approved — proceed with execution
    } else {
      const err = `权限不足: ${tool.name} 需要更高权限，当前为默认权限`
      addMessage(convId, { role: 'tool', content: err })
      return {
        assistantMsg: { role: 'assistant', content: `[调用 ${tc.action} 被权限阻止]` },
        toolMsg: { role: 'user', content: `[Tool "${tc.action}" error: ${err}]` },
      }
    }
  }

  // --- PreToolUse hooks ---
  const preHooks = runPreToolHooks({ toolName: tc.action, params: tc.params, convId })
  if (preHooks.blocked) {
    const msg = preHooks.warnings.join('\n')
    addMessage(convId, { role: 'tool', content: `Hook blocked: ${msg}` })
    return {
      assistantMsg: { role: 'assistant', content: `[${tc.action} 被钩子阻止]` },
      toolMsg: { role: 'user', content: `[Tool "${tc.action}" blocked by hook: ${msg}]` },
    }
  }
  if (preHooks.warnings.length > 0) {
    for (const w of preHooks.warnings) {
      addMessage(convId, { role: 'tool', content: `[Hook 警告] ${w}` })
    }
  }
  // Apply param modifications
  if (preHooks.modifiedParams) {
    tc = { ...tc, params: { ...tc.params, ...preHooks.modifiedParams } }
  }

  // Execute tool silently — results shown in collapsible section
  let result: string
  try {
    const raw = await tool.execute(tc.params)
    result = typeof raw === 'string' ? raw : JSON.stringify(raw)
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? (e?.message || String(e)) : String(e)
    addMessage(convId, { role: 'tool', content: `工具 ${tool.name} 执行失败: ${errMsg}` })
    return {
      assistantMsg: { role: 'assistant', content: `[${tc.action} 执行出错: ${errMsg}]` },
      toolMsg: { role: 'user', content: `[Tool "${tc.action}" error: ${errMsg}]` },
    }
  }

  // Extract file path from result for artifact tracking
  let artifactPath: string | undefined
  const pathMatch = result.match?.(/(?:已写入|已创建|已生成|Created|Written|Saved)[：:\s]+(.+)/i)
  if (pathMatch && tool.name !== 'run_command' && tool.name !== 'search_web') {
    artifactPath = pathMatch[1].split(' ')[0] // Take first part (file path)
    // Send artifact event to frontend (convId added by send wrapper)
    send('chat:artifact', {
      tool: tool.name,
      path: artifactPath,
      type: artifactPath.match(/\.(\w+)$/)?.[1] || 'unknown',
      time: new Date().toISOString(),
    })
  }

  // PostToolUse hooks
  const postHooks = runPostToolHooks({ toolName: tc.action, params: tc.params, convId, result })
  const hookNotes = postHooks.notes.length > 0 ? postHooks.notes.join('\n') : ''
  const finalResult = hookNotes ? `${result}\n\n${hookNotes}` : result
  // ---

  // Don't stream tool results — they appear in collapsible sections

  // Truncate large results to prevent context overflow (DeepSeek 64K limit)
  const truncated = finalResult.length > 3000
    ? finalResult.slice(0, 3000) + `\n...(已截断，原始 ${finalResult.length} 字符)`
    : finalResult

  addMessage(convId, { role: 'tool', content: finalResult })

  return {
    assistantMsg: { role: 'assistant', content: `[调用工具 ${tc.action}]` },
    toolMsg: { role: 'user', content: `[${tc.action} 结果]:\n${truncated}` },
    artifactPath,
  }
}

// LLM Call with streaming — supports both text-block tool parsing AND native Function Calling
// DeepSeek V4 / OpenAI compatible
async function callLLM(
  messages: AgentMessage[],
  cfg: Required<AgentLoopConfig>,
  send: (ch: string, data?: any) => void
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const requestBody: any = {
    model: cfg.model,
    stream: true,
    max_tokens: 8192,
    temperature: 0.7,
  }

  // Always inject tools — AI self-judges whether to use them
  requestBody.tools = getOpenAITools(cfg.persona)
  requestBody.tool_choice = 'auto'

  // Claude Code thinking mode support (DeepSeek reasoning_effort)
  if (cfg.thinkingEffort && cfg.thinkingEffort !== 'medium') {
    const thinkingInstruction = getThinkingInstruction(cfg.thinkingEffort)
    const newMessages = [...messages]
    if (typeof newMessages[0]?.content === 'string') {
      newMessages[0] = {
        ...newMessages[0],
        content: newMessages[0].content + '\n\n' + thinkingInstruction,
      }
    }
    requestBody.messages = newMessages
  } else {
    requestBody.messages = messages
  }

  try {
    const apiBase = cfg.apiUrl || 'https://api.deepseek.com/v1'
    const apiUrl = `${apiBase}/chat/completions`

    // Retry on rate-limit (429) and server errors (5xx) with exponential backoff
    const MAX_RETRIES = 3
    let response: Response | null = null
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 8000)
        await new Promise(r => setTimeout(r, delay))
        if (cfg.isAborted?.()) return { content: '', toolCalls: [] }
      }
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: cfg.abortSignal,
      }).catch(() => null)
      if (!response) continue
      if (response.status === 429 || response.status >= 500) {
        if (attempt < MAX_RETRIES - 1) continue
      }
      break
    }

    if (!response || !response.ok) {
      const status = response?.status || 0
      const errText = response ? await response.text().catch(() => '') : ''
      const errMsg = errText.length > 300 ? errText.slice(0, 300) + '...' : errText
      send('chat:streamError', `API 错误 (${status}${!response ? ', 网络不可达' : ''}${attempt > 0 ? `, 已重试${attempt}次` : ''}): ${errMsg || '无响应'}`)
      return { content: '', toolCalls: [] }
    }

    if (!response.body) {
      send('chat:streamError', '无响应体')
      return { content: '', toolCalls: [] }
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let content = '', buffer = ''

    // ★ Function Calling accumulator ★
    // Accumulate tool_calls deltas by index across streaming chunks
    const accumulatedToolCalls: Map<number, {
      id: string
      type: string
      function: { name: string; arguments: string }
    }> = new Map()

    while (true) {
      // Check abort during streaming
      if (cfg.isAborted?.()) {
        reader.cancel()
        return { content, toolCalls: [] }
      }
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        const t = line.trim()
        if (!t || !t.startsWith('data: ')) continue
        const d = t.slice(6)
        if (d === '[DONE]') {
          // Build tool calls from accumulated function calling data
          const fcToolCalls: ToolCall[] = []
          for (const [_, tc] of accumulatedToolCalls) {
            if (tc.function?.name && tc.function?.arguments) {
              try {
                const params = JSON.parse(tc.function.arguments)
                fcToolCalls.push({ action: tc.function.name, params })
              } catch {
                // Function arguments not valid JSON yet — skip
              }
            }
          }
          // Merge: text-block tool calls + function-calling tool calls
          const textToolCalls = parseTools(content)
          const merged = [...textToolCalls, ...fcToolCalls]
          // Deduplicate by action name (prefer function calling result)
          const seen = new Set<string>()
          const deduped = merged.filter(tc => {
            const key = tc.action
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
          return { content, toolCalls: deduped }
        }
        try {
          const p = JSON.parse(d)
          const delta = p.choices?.[0]?.delta
          if (!delta) continue

          // Handle text content
          const c = delta.content || ''
          if (c) {
            content += c
            send('chat:streamChunk', c)
          }

          // ★ Handle Function Calling tool_calls in streaming delta ★
          if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
            for (const tcDelta of delta.tool_calls) {
              const idx = tcDelta.index ?? 0
              let existing = accumulatedToolCalls.get(idx)
              if (!existing) {
                existing = { id: '', type: 'function', function: { name: '', arguments: '' } }
                accumulatedToolCalls.set(idx, existing)
              }
              if (tcDelta.id && !existing.id) existing.id = tcDelta.id
              if (tcDelta.type && !existing.type) existing.type = tcDelta.type
              if (tcDelta.function) {
                // Name: only set on first delta (DeepSeek may repeat full name in every chunk)
                // Arguments: accumulate incrementally across chunks
                if (tcDelta.function.name && !existing.function.name) {
                  existing.function.name = tcDelta.function.name
                }
                if (tcDelta.function.arguments) existing.function.arguments += tcDelta.function.arguments
              }
            }
          }
        } catch {}
      }
    }

    // Fallback — parse text-based tool blocks, deduplicate by action name
    const textToolCalls = parseTools(content)
    const fcToolCalls: ToolCall[] = []
    for (const [_, tc] of accumulatedToolCalls) {
      if (tc.function?.name && tc.function?.arguments) {
        try {
          const params = JSON.parse(tc.function.arguments)
          fcToolCalls.push({ action: tc.function.name, params })
        } catch {}
      }
    }
    const merged = [...textToolCalls, ...fcToolCalls]
    const seen = new Set<string>()
    const deduped = merged.filter(tc => {
      const key = tc.action
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    return { content, toolCalls: deduped }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    const stack = e instanceof Error ? (e.stack?.split('\n').slice(0, 3).join('\n') || '') : ''
    console.error('[AGENT-LOOP] callLLM error:', msg, '\n' + stack)
    send('chat:streamError', `网络错误: ${msg}\n\n📍 ${stack}`)
    return { content: '', toolCalls: [] }
  }
}

/** Parse multiple tool calls from content */
function parseTools(content: string): ToolCall[] {
  // Match all ```tool blocks
  const regex = /```tool\s*\n?(\{[\s\S]*?\})\s*```/g
  const calls: ToolCall[] = []
  let match
  while ((match = regex.exec(content)) !== null) {
    try {
      const t = JSON.parse(match[1])
      if (t.action && t.params) {
        calls.push({ action: t.action, params: t.params })
      }
    } catch { /* malformed JSON tool block — skip */ }
  }
  return calls
}

function getThinkingInstruction(effort: string): string {
  const effortMap: Record<string, string> = {
    low: 'Think briefly before responding. Keep reasoning concise and to the point.',
    medium: 'Think carefully before responding. Consider multiple approaches.',
    high: 'Think deeply and thoroughly. Explore edge cases, alternatives, and potential issues before responding.',
    xhigh: 'Think exhaustively. Analyze from multiple angles, consider long-term implications, verify assumptions.',
    max: 'Maximum analytical depth. Exhaust all reasoning paths before concluding.',
  }
  return effortMap[effort] || effortMap.medium
}

// ── Three-Layer Context Compaction (Claude Code style) ──
// DeepSeek chat: 64K context, reserves 10K for response + overhead
const COMPACT_THRESHOLD = 51000  // 80% — compact via LLM summary
const TRIM_THRESHOLD    = 57000  // 90% — last resort, trim oldest messages

/** Rough token estimation — 1 token ≈ 3 chars for CJK, ≈ 4 chars for Latin */
function estimateTokens(content: any): number {
  // 多模态消息：content 是数组，提取所有 text 部分
  if (Array.isArray(content)) {
    let tokens = 0
    for (const part of content) {
      if (part.type === 'text' && typeof part.text === 'string') {
        tokens += estimateTokensText(part.text)
      } else if (part.type === 'image_url') {
        // Realistic token estimation: base64 data ≈ 1 token per 3 chars
        // plus overhead for the data URI wrapper (~20 tokens)
        const url = typeof part.image_url?.url === 'string' ? part.image_url.url : ''
        const dataIdx = url.indexOf(';base64,')
        if (dataIdx > 0) {
          const base64Len = url.length - dataIdx - 8  // skip ";base64,"
          tokens += Math.ceil(base64Len / 3) + 20
        } else {
          tokens += 85 // URL-only (no inline data) — standard placeholder
        }
      }
    }
    return tokens
  }
  if (typeof content !== 'string') return 0
  return estimateTokensText(content)
}
function estimateTokensText(text: string): number {
  let tokens = 0
  for (const ch of text) {
    tokens += (ch >= '\u4e00' && ch <= '\u9fff') || (ch >= '\u3000' && ch <= '\u303f') ? 0.7 : 0.25
  }
  return Math.ceil(tokens)
}

function estimateTotalTokens(msgs: AgentMessage[]): number {
  let total = 0
  for (const m of msgs) {
    total += estimateTokensText(m.role) + estimateTokens(m.content) + 4
  }
  return total
}

/**
 * Three-layer compaction:
 *   Layer 1: Tool results already truncated in executeAndLog (≤3000 chars to LLM)
 *   Layer 2: When total > COMPACT_THRESHOLD, compress oldest messages into a summary via LLM
 *   Layer 3: When total > TRIM_THRESHOLD, drop oldest messages (keep system + last 5)
 *
 * Preserves: system prompt always at [0], last KEEP_RECENT messages intact
 */
async function compactMessages(
  msgs: AgentMessage[],
  cfg: Required<AgentLoopConfig>
): Promise<AgentMessage[]> {
  const systemMsg = msgs[0]
  const rest = msgs.slice(1)

  if (rest.length === 0) return msgs

  const systemTokens = estimateTokens(systemMsg.content) + 4
  const totalTokens = systemTokens + estimateTotalTokens(rest)

  // Under 80% — no action needed
  if (totalTokens < COMPACT_THRESHOLD) return msgs

  const KEEP_RECENT = 8
  let compactionAttempted = false

  // Layer 2: LLM-powered compaction
  if (rest.length > KEEP_RECENT + 3) {
    // Find last compaction boundary — messages before it (inclusive) are already summarized
    let compactFrom = 0
    for (let i = rest.length - 1; i >= 0; i--) {
      if (rest[i].content.includes('[COMPACT_BOUNDARY]')) {
        compactFrom = i + 1  // Keep the boundary itself, compact everything after it
        break
      }
    }

    const toCompact = rest.slice(compactFrom, -KEEP_RECENT)
    const recent = rest.slice(-KEEP_RECENT)

    // Guard: nothing to compact or already at boundary
    if (toCompact.length < 4) return msgs

    try {
      compactionAttempted = true
      const summary = await summarizeMessages(toCompact, cfg)
      const alreadyCompacted = rest.slice(0, compactFrom)
      const summaryMsg: AgentMessage = {
        role: 'system',
        content: `[COMPACT_BOUNDARY]\n以下为之前 ${toCompact.length} 条消息的摘要。完整细节已省略，仅保留关键信息:\n\n${summary}\n\n--- 以下是最近的消息 ---`,
      }
      return [systemMsg, ...alreadyCompacted, summaryMsg, ...recent]
    } catch {
      // Compaction failed — fall through to Layer 3
    }
  }

  // Layer 3: Safety trim — always run when compaction was attempted or threshold exceeded
  // After compaction failure, we may be at 51K-57K — still need trimming to avoid 400
  const needTrim = totalTokens >= TRIM_THRESHOLD || (compactionAttempted && totalTokens >= COMPACT_THRESHOLD)
  if (!needTrim) return msgs

  const trimmed = [...rest]
  let currentTotal = systemTokens + estimateTotalTokens(trimmed)
  while (trimmed.length > KEEP_RECENT && currentTotal > TRIM_THRESHOLD) {
    const removed = trimmed.shift()!
    currentTotal -= (estimateTokens(removed.role) + estimateTokens(removed.content) + 4)
  }

  const removedCount = rest.length - trimmed.length
  if (removedCount > 0) {
    trimmed.unshift({
      role: 'system',
      content: `[COMPACT_BOUNDARY] 上下文过长，已省略 ${removedCount} 条较早消息。`,
    })
  }

  return [systemMsg, ...trimmed]
}

/** Call LLM to summarize a conversation segment for compaction */
async function summarizeMessages(
  msgs: AgentMessage[],
  cfg: Required<AgentLoopConfig>
): Promise<string> {
  // Build compacted representation: keep 1500 chars per message, label tool results clearly
  const conversation = msgs.map(m => {
    const content = m.content.slice(0, 1500) + (m.content.length > 1500 ? '...(省略)' : '')
    // Detect tool results: role=tool, or role=user with tool/result markers
    const isToolResult = m.role === 'tool' || (m.role === 'user' && /^\[(Tool|工具|附件|img)/.test(content))
    const label = isToolResult ? 'tool_result' : m.role
    return `[${label}]: ${content}`
  }).join('\n\n')

  const summaryPrompt = [
    { role: 'system' as const, content: '你是一个对话摘要器。用3-5句精炼总结以下对话。必须保留：用户的核心需求、决策内容、执行了哪些工具及关键结果、项目/文件/技术要点。省略：寒暄、重复内容、调试过程中的中间步骤。输出直接给后续对话使用，不要说"以下是摘要"。' },
    { role: 'user' as const, content: `<conversation>\n${conversation}\n</conversation>\n\n请总结以上对话。` },
  ]

  const body = JSON.stringify({
    model: cfg.model,
    messages: summaryPrompt,
    stream: false,
    max_tokens: 500,
    temperature: 0.3,
  })

  const apiBase = cfg.apiUrl || 'https://api.deepseek.com/v1'
  const resp = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`,
    },
    body,
    signal: cfg.abortSignal,
  })

  if (!resp.ok) throw new Error(`Compaction API error: ${resp.status}`)

  const data: any = await resp.json()
  return data.choices?.[0]?.message?.content?.trim() || '(摘要生成失败)'
}

/** Map tool action name to a user-friendly Chinese status text */
function getActionText(action: string): string {
  const map: Record<string, string> = {
    list_dir: '正在读取目录...',
    read_file: '正在读取文件...',
    write_file: '正在写入文件...',
    run_command: '正在执行命令...',
    open_url: '正在打开网页...',
    search_web: '正在搜索...',
    update_memory: '正在更新记忆...',
    remember: '正在记录...',
    recall_memory: '正在读取记忆...',
    create_markdown: '正在生成 Markdown...',
    create_csv: '正在生成 CSV...',
    create_doc: '正在生成 Word 文档...',
    create_pptx: '正在生成 PPT...',
    get_progress: '正在获取进度...',
    daily_briefing: '正在生成日报...',
    extract_todos: '正在提取待办...',
    spawn_agent: '正在执行子任务...',
    get_disk_info: '正在分析磁盘空间...',
    system_scan: '正在扫描系统...',
    clean_junk_files: '正在清理垃圾文件...',
    restore_files: '正在恢复文件...',
    find_large_files: '正在搜索大文件...',
    list_startup_apps: '正在检查启动项...',
    get_system_health: '正在检测系统健康...',
    check_drivers: '正在检查驱动程序...',
    check_security: '正在检查安全状态...',
    diagnose_network: '正在诊断网络...',
    check_windows_updates: '正在检查更新...',
    get_running_processes: '正在分析进程...',
    search_files: '正在搜索文件...',
    check_startup_impact: '正在分析启动项...',
    multi_edit: '正在批量编辑...',
    read_document: '正在读取文档...',
    notebook_read: '正在读取 Notebook...',
    read_image_content: '正在识别图片...',
    image_edit: '正在编辑图片...',
    wait_for_mcp: '正在检查服务...',
    workflow: '正在执行工作流...',
    slash_command: '正在执行命令...',
    team_create: '正在创建团队...',
    team_delete: '正在删除团队...',
    send_message: '正在发送消息...',
    structured_output: '正在生成结构化数据...',
  }
  return map[action] || `正在执行 ${action}...`
}
