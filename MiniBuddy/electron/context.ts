import path from 'path'
import fs from 'fs'
import { app } from 'electron'

const DATA_DIR = () => path.join(app.getPath('userData'), 'corebuddy-data')
const CONTEXT_DIR = () => path.join(DATA_DIR(), 'context')

export interface StoredMessage {
  role: 'user' | 'assistant' | 'system' | 'tool' | 'boundary'
  content: string
  time: string
  // Claude Code: compact_boundary marks where old content was summarized
  isBoundary?: boolean
  // For compacted summaries
  summary?: string
}

function convPath(convId: string) { return path.join(CONTEXT_DIR(), `${convId}.json`) }

export function addMessage(convId: string, msg: StoredMessage) {
  fs.mkdirSync(CONTEXT_DIR(), { recursive: true })
  const p = convPath(convId)
  let msgs: StoredMessage[] = []
  try { msgs = JSON.parse(fs.readFileSync(p, 'utf-8')) } catch {}
  msgs.push({ ...msg, time: new Date().toISOString() })
  // Keep last 60 messages; compact if needed
  if (msgs.length > 60) {
    msgs = autoCompact(msgs)
  }
  fs.writeFileSync(p, JSON.stringify(msgs, null, 2))
}

/**
 * Auto-compaction — Claude Code style:
 * - Keep last 10 messages intact (uncompacted)
 * - Summarize the rest into a compact_boundary message
 * - Sum total: 10 recent + 1 boundary = ~3000 chars
 */
function autoCompact(msgs: StoredMessage[]): StoredMessage[] {
  const KEEP_RECENT = 10
  if (msgs.length <= KEEP_RECENT) return msgs

  // Check if we already have a boundary — merge into it
  const boundaryIdx = msgs.findIndex(m => m.role === 'boundary' && m.isBoundary)
  const boundaryContent = boundaryIdx >= 0 ? msgs[boundaryIdx].summary || '' : ''

  // Everything to compact: before the boundary (if exists) + between boundary and recent
  const recent = msgs.slice(-KEEP_RECENT)
  let toCompact: StoredMessage[]
  if (boundaryIdx >= 0 && boundaryIdx < msgs.length - KEEP_RECENT) {
    // Merge: old boundary content + everything between boundary and recent
    toCompact = msgs.slice(boundaryIdx + 1, -KEEP_RECENT)
  } else {
    // No boundary or boundary is inside recent range
    toCompact = msgs.slice(0, -KEEP_RECENT)
  }

  if (toCompact.length === 0) {
    // Keep existing boundary + recent, don't discard history
    if (boundaryIdx >= 0) {
      return [msgs[boundaryIdx], ...recent]
    }
    return recent
  }

  const summary = buildCompactSummary(toCompact, boundaryContent)

  return [
    {
      role: 'boundary',
      content: `[COMPACT_BOUNDARY]`,
      time: new Date().toISOString(),
      isBoundary: true,
      summary,
    },
    ...recent,
  ]
}

function buildCompactSummary(toCompact: StoredMessage[], existingSummary: string): string {
  const parts: string[] = []
  if (existingSummary) parts.push(existingSummary)

  // Extract key info from messages being compacted
  const userMsgs = toCompact.filter(m => m.role === 'user')
  const assistantMsgs = toCompact.filter(m => m.role === 'assistant' && m.content.length > 0)
  const toolMsgs = toCompact.filter(m => m.role === 'tool')

  // Summarize user topics/requests
  if (userMsgs.length > 0) {
    const topics = userMsgs.map(m => {
      const t = m.content.replace(/\n/g, ' ').trim()
      return t.length > 80 ? t.slice(0, 80) + '...' : t
    })
    parts.push(`用户讨论了 ${userMsgs.length} 个话题: ${topics.slice(0, 8).join(' | ')}${topics.length > 8 ? '...' : ''}`)
  }

  // Summarize what was accomplished
  if (toolMsgs.length > 0) {
    parts.push(`执行了 ${toolMsgs.length} 次工具操作`)
  }

  // Summarize key assistant responses
  if (assistantMsgs.length > 0) {
    const keyResponses = assistantMsgs
      .filter(m => m.content.length > 30)
      .slice(0, 3)
      .map(m => m.content.replace(/\n/g, ' ').slice(0, 100))
    if (keyResponses.length > 0) {
      parts.push(`助手回复要点: ${keyResponses.join(' | ')}`)
    }
  }

  const summary = parts.join('\n')
  const totalDiscarded = toCompact.length
  return `${summary}\n(共 ${totalDiscarded} 条消息已压缩)`
}

/**
 * Get context for LLM — Claude Code style:
 * - Boundary messages are transformed into readable summaries
 * - Recent messages kept as-is
 */
export function getContext(convId: string, limit: number = 40): Array<{ role: string; content: string }> {
  const p = convPath(convId)
  try {
    const msgs: StoredMessage[] = JSON.parse(fs.readFileSync(p, 'utf-8'))
    const total = msgs.length
    // Only fetch recent portion if over limit
    const subset = total > limit ? msgs.slice(-limit) : msgs

    return subset.map(m => {
      if (m.role === 'boundary' && m.isBoundary && m.summary) {
        return {
          role: 'system' as const,
          content: `[历史对话压缩] ${m.summary}`,
        }
      }
      return { role: m.role, content: m.content }
    })
  } catch {
    return []
  }
}

/**
 * Manual full compaction — summarize everything into one boundary
 */
export function compactContext(convId: string): string {
  const p = convPath(convId)
  try {
    const msgs: StoredMessage[] = JSON.parse(fs.readFileSync(p, 'utf-8'))
    const summary = buildCompactSummary(msgs, '')
    const compacted: StoredMessage[] = [{
      role: 'boundary',
      content: `[COMPACT_BOUNDARY]`,
      time: new Date().toISOString(),
      isBoundary: true,
      summary,
    }]
    fs.writeFileSync(p, JSON.stringify(compacted, null, 2))
    return summary
  } catch { return '' }
}

/**
 * Delete context file for a conversation
 */
export function deleteContext(convId: string) {
  const p = convPath(convId)
  try { if (fs.existsSync(p)) fs.unlinkSync(p) } catch {}
}
