// Hooks System — Claude Code style: PreToolUse / PostToolUse / Stop
// Stored in {userData}/minibuddy-hooks.json
// Configurable via settings UI

import path from 'path'
import fs from 'fs'
import { app } from 'electron'

export interface HookRule {
  id: string
  type: 'PreToolUse' | 'PostToolUse' | 'Stop'
  enabled: boolean
  // For PreToolUse/PostToolUse: which tools to match
  toolPattern?: string  // regex or exact name
  // Action to take
  action: 'block' | 'warn' | 'log' | 'modify' | 'backup' | 'cleanup'
  // Optional message
  message?: string
  // Optional JS code for 'modify' action
  script?: string
  createdAt: string
}

const HOOKS_PATH = () => path.join(app.getPath('userData'), 'minibuddy-hooks.json')

export function loadHooks(): HookRule[] {
  try {
    if (fs.existsSync(HOOKS_PATH())) {
      return JSON.parse(fs.readFileSync(HOOKS_PATH(), 'utf-8'))
    }
  } catch {}
  return getDefaultHooks()
}

export function saveHooks(hooks: HookRule[]) {
  fs.writeFileSync(HOOKS_PATH(), JSON.stringify(hooks, null, 2))
}

function getDefaultHooks(): HookRule[] {
  return [
    {
      id: 'default-backup',
      type: 'PostToolUse',
      enabled: true,
      toolPattern: 'write_file|create_doc|create_pptx|create_csv|create_markdown',
      action: 'log',
      message: '文件已创建，建议定期备份到外部存储。',
    },
    {
      id: 'danger-warn',
      type: 'PreToolUse',
      enabled: true,
      toolPattern: 'run_command',
      action: 'warn',
      message: '即将执行系统命令，请确认这是你期望的操作。',
    },
    {
      id: 'daily-cleanup',
      type: 'Stop',
      enabled: false,
      action: 'cleanup',
      message: '建议清理超过 30 天的临时文件和上下文缓存。',
    },
  ]
}

interface HookContext {
  toolName: string
  params: Record<string, any>
  convId: string
}

interface HookResult {
  blocked: boolean
  warnings: string[]
  modifiedParams?: Record<string, any>
  notes: string[]
}

/**
 * Run PreToolUse hooks before a tool executes.
 * Returns { blocked, warnings, modifiedParams }
 */
export function runPreToolHooks(ctx: HookContext): HookResult {
  const hooks = loadHooks()
  const result: HookResult = { blocked: false, warnings: [], notes: [] }

  for (const hook of hooks) {
    if (hook.type !== 'PreToolUse' || !hook.enabled) continue
    if (!matchesTool(hook.toolPattern, ctx.toolName)) continue

    switch (hook.action) {
      case 'block':
        result.blocked = true
        result.warnings.push(hook.message || `工具 ${ctx.toolName} 已被钩子阻止`)
        break
      case 'warn':
        result.warnings.push(hook.message || `警告: 即将执行 ${ctx.toolName}`)
        break
      case 'log':
        result.notes.push(`[PreToolUse] ${hook.toolPattern}: 执行 ${ctx.toolName}`)
        break
      case 'modify':
        // modify action is reserved for future safe parameter transformation
        // Script-based modification has been disabled for security reasons
        result.notes.push(`[PreToolUse] ${hook.toolPattern}: modify action is disabled for security`)
        break
    }
  }

  return result
}

/**
 * Run PostToolUse hooks after a tool executes.
 * Returns { notes }
 */
export function runPostToolHooks(ctx: HookContext & { result: string }): HookResult {
  const hooks = loadHooks()
  const result: HookResult = { blocked: false, warnings: [], notes: [] }

  for (const hook of hooks) {
    if (hook.type !== 'PostToolUse' || !hook.enabled) continue
    if (!matchesTool(hook.toolPattern, ctx.toolName)) continue

    switch (hook.action) {
      case 'warn':
        result.notes.push(hook.message || `注意: ${ctx.toolName} 执行完毕`)
        break
      case 'log':
        result.notes.push(`[PostToolUse] ${ctx.toolName}: ${ctx.result.slice(0, 100)}`)
        break
      case 'backup':
        result.notes.push(`备份提醒: ${hook.message || '请定期备份重要文件'}`)
        break
    }
  }

  return result
}

/**
 * Run Stop hooks when agent loop completes.
 */
export function runStopHooks(convId: string): string[] {
  const hooks = loadHooks()
  const notes: string[] = []

  for (const hook of hooks) {
    if (hook.type !== 'Stop' || !hook.enabled) continue
    if (hook.action === 'cleanup') {
      notes.push(hook.message || '建议执行清理操作')
    }
  }

  return notes
}

function matchesTool(pattern: string | undefined, toolName: string): boolean {
  if (!pattern) return true
  try {
    return new RegExp(`^(${pattern})$`, 'i').test(toolName)
  } catch {
    return pattern === toolName
  }
}
