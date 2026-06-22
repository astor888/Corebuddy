/**
 * Shared mutable permission state for the current session.
 * Supports:
 * - Full-session override (default/full)
 * - Per-tool session allow (for "本次会话始终允许")
 * - Per-tool always allow (persistent across restarts via file)
 */

import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

let sessionPermOverride: 'default' | 'full' = 'default'

/** Per-tool session-level allow cache (toolName -> true) */
const sessionAllowedTools = new Set<string>()

/** File path for persistent "一直允许" rules */
function getPermStorePath(): string {
  const p = path.join(app.getPath('userData'), 'corebuddy-data', 'always-allow-perms.json')
  return p
}

/** Load persistent always-allow rules from disk */
function loadAlwaysAllow(): Set<string> {
  try {
    const p = getPermStorePath()
    if (!fs.existsSync(p)) return new Set()
    const raw = fs.readFileSync(p, 'utf-8')
    const arr = JSON.parse(raw)
    return new Set<string>(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set<string>()
  }
}

/** Save persistent always-allow rules to disk */
function saveAlwaysAllow(rules: Set<string>): void {
  try {
    const p = getPermStorePath()
    const dir = path.dirname(p)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(p, JSON.stringify([...rules], null, 2), 'utf-8')
  } catch (e) {
    console.error('[Perm] Failed to save always-allow rules:', e)
  }
}

/** Always-allow cache (loaded once at start, persisted on write) */
let alwaysAllowTools: Set<string> | null = null
function getAlwaysAllow(): Set<string> {
  if (!alwaysAllowTools) alwaysAllowTools = loadAlwaysAllow()
  return alwaysAllowTools
}
function persistAlwaysAllow(): void {
  if (alwaysAllowTools) saveAlwaysAllow(alwaysAllowTools)
}

// --- Public API ---

export function getSessionPermOverride(): 'default' | 'full' {
  return sessionPermOverride
}

export function setSessionPermOverride(val: 'default' | 'full'): void {
  sessionPermOverride = val
}

export function getEffectivePermLevel(basePermLevel: number): number {
  if (sessionPermOverride === 'full') return 5
  return basePermLevel
}

/**
 * Check if a tool has been pre-allowed (session or always).
 * Priority: always-allow > session-allow > none
 */
export function isToolAllowed(toolName: string): boolean {
  if (getAlwaysAllow().has(toolName)) return true
  if (sessionAllowedTools.has(toolName)) return true
  return false
}

/** Add a tool to the session-level allow list (resets on app restart) */
export function addSessionAllow(toolName: string): void {
  sessionAllowedTools.add(toolName)
}

/** Add a tool to the always-allow list (persistent across restarts) */
export function addAlwaysAllow(toolName: string): void {
  getAlwaysAllow().add(toolName)
  persistAlwaysAllow()
}

/** Remove a tool from the always-allow list */
export function removeAlwaysAllow(toolName: string): void {
  getAlwaysAllow().delete(toolName)
  persistAlwaysAllow()
}

/** Get the list of always-allowed tools */
export function getAlwaysAllowList(): string[] {
  return [...getAlwaysAllow()]
}

/** Clear all session-level allows */
export function clearSessionAllow(): void {
  sessionAllowedTools.clear()
}
