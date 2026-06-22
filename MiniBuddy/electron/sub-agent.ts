// Sub-Agent System — Claude Code style isolated agent spawning
// Each sub-agent gets: independent context, limited tools, max 3 turns, no memory access
// Sub-agents CANNOT spawn further sub-agents

export interface ToolDef {
  name: string
  description: string
  permission: number
  execute: (params: any) => Promise<string> | string
}

export interface SubAgentConfig {
  apiKey: string
  model: string
  apiUrl?: string
  task: string
  context?: string
  tools: ToolDef[]
  timeoutMs?: number // Timeout for the entire sub-agent execution (default 5 min)
}

interface SubAgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
}

/**
 * Spawn a sub-agent to handle an isolated subtask.
 * Returns the agent's final response.
 */
export async function spawnSubAgent(config: SubAgentConfig): Promise<string> {
  const { apiKey, model, task, context, tools, apiUrl } = config
  const timeoutMs = config.timeoutMs || 300_000 // 5 min default

  // Run with overall timeout
  const result = await Promise.race([
    runSubAgent(apiKey, model, task, context, tools, apiUrl),
    new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error(`子代理执行超时 (${timeoutMs / 1000}s)`)), timeoutMs)
    ),
  ])
  return result
}

async function runSubAgent(
  apiKey: string, model: string, task: string, context: string | undefined,
  tools: ToolDef[], apiUrl?: string
): Promise<string> {
  const sysPrompt = buildSubAgentPrompt(tools, task, context)

  const messages: SubAgentMessage[] = [
    { role: 'system', content: sysPrompt },
    { role: 'user', content: task },
  ]

  const MAX_TURNS = 3
  let turnCount = 0

  while (turnCount < MAX_TURNS) {
    turnCount++

    // Retry on transient LLM failures (max 2 retries)
    let llmResult: { content: string; toolCalls: any[] } | null = null
    for (let retry = 0; retry < 3; retry++) {
      try {
        llmResult = await callLLM(messages, apiKey, model, apiUrl)
        break
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        if (retry >= 2) throw new Error(`LLM调用失败(已重试3次): ${msg}`)
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retry)))
      }
    }
    if (!llmResult) return '(子代理LLM调用失败)'

    const { content, toolCalls } = llmResult

    if (!content && toolCalls.length === 0) {
      return '(子代理无响应)'
    }

    // No tool calls? Return result
    if (toolCalls.length === 0) {
      return content || '(子代理完成)'
    }

    // Execute tools (sequential for sub-agents, simpler)
    for (const tc of toolCalls) {
      const tool = tools.find(t => t.name === tc.action)
      if (!tool) {
        messages.push(
          { role: 'assistant', content: content || `(tried ${tc.action})` },
          { role: 'tool', content: `Unknown tool: ${tc.action}` }
        )
        continue
      }

      let result: string
      try {
        result = await tool.execute(tc.params)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        result = `工具执行失败: ${msg}`
      }

      messages.push(
        { role: 'assistant', content: content || `(executing ${tc.action})` },
        { role: 'tool', content: `Tool "${tc.action}" result: ${result.slice(0, 2000)}` }
      )
    }
  }

  // Max turns reached — ask LLM for final summary
  messages.push({
    role: 'system',
    content: '已达到最大工具调用次数。请基于已有信息给出最终回答。',
  })
  const { content } = await callLLM(messages, apiKey, model)
  return content || '(子代理达到最大轮次)'
}

function buildSubAgentPrompt(tools: ToolDef[], task: string, context?: string): string {
  const ctxSection = context
    ? `\n## Background Context\n${context.slice(0, 1000)}\n`
    : ''

  return `You are a sub-agent of CoreBuddy. Your ONLY job is to complete this specific task.
Do NOT do anything else. Do NOT ask questions. Just complete the task and return a result.

## Task
${task.slice(0, 500)}
${ctxSection}
## Rules
- Complete ONLY this task. Return a clear result.
- Use tools if needed (max 3 operations).
- You CANNOT spawn more agents.
- You have NO memory of the main conversation.
- Be concise but thorough.

## Available Tools
${tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

## Response Format
Return your result directly. For file reads, include the content. For analysis, give conclusions.
If a tool fails, try an alternative. If you cannot complete the task, explain why.`
}

async function callLLM(
  messages: SubAgentMessage[],
  apiKey: string,
  model: string,
  apiUrl?: string
): Promise<{ content: string; toolCalls: Array<{ action: string; params: any }> }> {
  try {
    const baseUrl = apiUrl || 'https://api.deepseek.com/v1'
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        max_tokens: 8192,
        temperature: 0.5,
      }),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown')
      console.error(`Sub-agent API error (${response.status}): ${errText.slice(0, 200)}`)
      return { content: '', toolCalls: [] }
    }

    const data: any = await response.json()
    const content = data.choices?.[0]?.message?.content || ''

    // Parse tool calls from content
    const toolCalls: Array<{ action: string; params: any }> = []
    const regex = /```tool\s*\n?(\{[\s\S]*?\})\s*```/g
    let match
    while ((match = regex.exec(content)) !== null) {
      try {
        const t = JSON.parse(match[1])
        if (t.action && t.params) toolCalls.push({ action: t.action, params: t.params })
      } catch {}
    }

    return { content, toolCalls }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`Sub-agent LLM call failed: ${msg}`)
  }
}
