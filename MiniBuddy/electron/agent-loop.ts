// Agent Loop — OpenClaw architecture + Claude Code three-layer design
// Plan → Act (parallel read-only) → Observe → Respond → Compaction → Repeat

import { BrowserWindow } from 'electron'
import { buildSystemPrompt } from './system-prompt'
import type { PersonaMode } from './system-prompt'
import { getTool, getAllTools, checkPermission, Tool, setApiConfig } from './tool-registry'
import type { PermissionMode } from './tool-registry'
import { addMessage, getContext } from './context'
import { recordDailyLog } from './memory'
import { runPreToolHooks, runPostToolHooks, runStopHooks } from './hooks'
import { getActiveSkillsPrompt } from './plugins'

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
}

export interface ToolCall {
  action: string
  params: Record<string, any>
}

export interface AgentLoopConfig {
  apiKey: string
  model: string
  persona?: PersonaMode
  permLevel?: number
  permissionMode?: PermissionMode
  thinkingEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  /** Called when default mode needs elevation to execute a higher-permission tool */
  onRequestPermission?: (toolName: string, toolDesc: string) => Promise<boolean>
  /** Check if this stream has been aborted (for background loading) */
  isAborted?: () => boolean
  /** Current window for sending events */
  sender?: BrowserWindow
  /** Scene-specific system prompt to inject (e.g. PPT generation workflow) */
  scenePrompt?: string
  /** User's display name (for personalized system prompt) */
  userName?: string
  /** API base URL (e.g. https://api.deepseek.com/v1 or https://api.openai.com/v1) */
  apiUrl?: string
}

const DEFAULT_CONFIG: Required<AgentLoopConfig> = {
  apiKey: '',
  model: 'deepseek-v4-pro',
  permLevel: 3,
  permissionMode: 'default',
  thinkingEffort: 'medium',
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
      try { win.webContents.send(channel, payload) } catch {}
    }
  }

  // Set API config for sub-agent spawning
  setApiConfig({ apiKey: cfg.apiKey, model: cfg.model })

  // 1. Record user message
  addMessage(convId, { role: 'user', content: userMessage })

  // 2. Build system prompt + inject activated skills
  const systemPrompt = buildSystemPrompt(config.persona || 'office', cfg.userName)
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

  // 4. Core loop: LLM → Parse tools → Execute (parallel if safe) → Repeat
  let turnCount = 0
  let totalTools = 0
  let artifactsCreated = 0
  const MAX_TOOL_TURNS = 5

  while (turnCount < MAX_TOOL_TURNS) {
    // Check if aborted (user cancelled or navigated away)
    if (cfg.isAborted?.()) {
      send('chat:streamDone', { toolCount: 0, artifactCount: 0, aborted: true })
      recordDailyLog(convId, userMessage, '(user aborted)')
      runStopHooks(convId)
      return
    }
    turnCount++

    // Three-layer context compaction (Claude Code style)
    // Layer 1: Tool results truncated in executeAndLog
    // Layer 2: LLM-powered compaction when >80% (51K) of 64K context used
    // Layer 3: Last-resort trim when >90% (57K) — keeps system + last 5 msgs
    messages = await compactMessages(messages, cfg)

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

    // Feed result back for next turn
    if (turnCount >= MAX_TOOL_TURNS) {
      messages.push({ role: 'assistant', content: fullContent })
    }
  }

  send('chat:streamDone', { toolCount: totalTools, artifactCount: artifactsCreated })
  recordDailyLog(convId, userMessage, '(multi-turn completed)')
  const stopNotes = runStopHooks(convId)
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
  } catch (e: any) {
    const errMsg = `工具 ${tool.name} 执行失败: ${e?.message || e}`
    addMessage(convId, { role: 'tool', content: errMsg })
    return {
      assistantMsg: { role: 'assistant', content: `[${tc.action} 执行出错: ${e?.message || e}]` },
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

// LLM Call with streaming
async function callLLM(
  messages: AgentMessage[],
  cfg: Required<AgentLoopConfig>,
  send: (ch: string, data?: any) => void
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const requestBody: any = {
    model: cfg.model,
    messages,
    stream: true,
    max_tokens: 8192,
    temperature: 0.7,
  }

  // Claude Code thinking mode support (DeepSeek reasoning_effort)
  if (cfg.thinkingEffort && cfg.thinkingEffort !== 'medium') {
    const thinkingInstruction = getThinkingInstruction(cfg.thinkingEffort)
    const newMessages = [...messages]
    newMessages[0] = {
      ...newMessages[0],
      content: newMessages[0].content + '\n\n' + thinkingInstruction,
    }
    requestBody.messages = newMessages
  }

  try {
    const apiBase = cfg.apiUrl || 'https://api.deepseek.com/v1'
    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errText = await response.text()
      const errMsg = errText.length > 300 ? errText.slice(0, 300) + '...' : errText
      send('chat:streamError', `API 错误 (${response.status}): ${errMsg}`)
      return { content: '', toolCalls: [] }
    }

    if (!response.body) {
      send('chat:streamError', '无响应体')
      return { content: '', toolCalls: [] }
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let content = '', buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        const t = line.trim()
        if (!t || !t.startsWith('data: ')) continue
        const d = t.slice(6)
        if (d === '[DONE]') return { content, toolCalls: parseTools(content) }
        try {
          const p = JSON.parse(d)
          const c = p.choices?.[0]?.delta?.content || ''
          if (c) {
            content += c
            send('chat:streamChunk', c)
          }
        } catch {}
      }
    }

    return { content, toolCalls: parseTools(content) }
  } catch (e: any) {
    send('chat:streamError', `网络错误: ${e.message}`)
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
function estimateTokens(text: string): number {
  let tokens = 0
  for (const ch of text) {
    tokens += (ch >= '\u4e00' && ch <= '\u9fff') || (ch >= '\u3000' && ch <= '\u303f') ? 0.7 : 0.25
  }
  return Math.ceil(tokens)
}

function estimateTotalTokens(msgs: AgentMessage[]): number {
  let total = 0
  for (const m of msgs) {
    total += estimateTokens(m.role) + estimateTokens(m.content) + 4
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

  const KEEP_RECENT = 5
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
  // Build compacted representation: keep 800 chars per message, label tool results clearly
  const conversation = msgs.map(m => {
    const content = m.content.slice(0, 800) + (m.content.length > 800 ? '...(省略)' : '')
    // Tool results are stored as user role — detect and label properly
    const isToolResult = m.role === 'user' && /^\[.+\s*(结果|result)/i.test(content)
    const label = isToolResult ? 'tool_result' : m.role
    return `[${label}]: ${content}`
  }).join('\n\n')

  const summaryPrompt = [
    { role: 'system' as const, content: '你是一个对话摘要器。用3-5句中文精炼总结以下对话的关键信息。只包含：用户的核心请求、做出的决策、执行的操作和结果。不要包含技术细节，只保留对后续对话有用的上下文。直接输出摘要，不要说"以下是摘要"。' },
    { role: 'user' as const, content: `<conversation>\n${conversation}\n</conversation>\n\n请总结以上对话。` },
  ]

  const body = JSON.stringify({
    model: cfg.model,
    messages: summaryPrompt,
    stream: false,
    max_tokens: 500,
    temperature: 0.3,
  })

  const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`,
    },
    body,
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
