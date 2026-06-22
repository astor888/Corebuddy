/**
 * Auto-Scheduler — Background scheduling engine for CoreBuddy automations.
 *
 * Scans active automations every 30 seconds and invokes the agent loop
 * when the scheduled time is reached.
 */

import { BrowserWindow, app } from 'electron'
import fs from 'fs'
import path from 'path'
import { agentLoop } from './agent-loop'
import { configGet } from './database'

// ====== Types ======

export interface AutomationItem {
  id: string
  name: string
  prompt: string
  frequency: 'daily' | 'weekly' | 'hourly' | 'once'
  hour: string   // '00'-'23'
  minute: string // '00','15','30','45'
  weekDay: string // '1'-'7' (Monday-Sunday, for weekly)
  validFrom: string // ISO date or ''
  validUntil: string // ISO date or ''
  notify: boolean
  tools: string
  connector: string
  cwd: string
  active: boolean
  /** When was it last executed (ISO timestamp) */
  lastRunAt: string | null
  /** Execution history (most recent first) */
  history: Array<{
    runAt: string
    status: 'running' | 'completed' | 'failed'
    summary?: string
    error?: string
  }>
}

// ====== State ======

let checkTimer: ReturnType<typeof setInterval> | null = null
let executingIds = new Set<string>() // Prevent re-entry

const CHECK_INTERVAL_MS = 30_000 // Check every 30 seconds

// ====== Storage ======

function getDataDir(): string {
  const dir = path.join(app.getPath('userData'), 'corebuddy-data')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getAutomationsPath(): string {
  return path.join(getDataDir(), 'automations.json')
}

/** Normalize a single item: migrate Chinese frequency values → English, ensure fields exist */
function normalizeItem(raw: any): AutomationItem {
  const freqMap: Record<string, 'daily' | 'weekly' | 'hourly' | 'once'> = {
    '每天': 'daily', '每日': 'daily',
    '每周': 'weekly',
    '每小时': 'hourly', '每': 'hourly',
    '单次': 'once', '一次': 'once',
  }
  let frequency = raw.frequency
  if (typeof frequency === 'string' && frequency in freqMap) {
    frequency = freqMap[frequency]
  }
  // Default to daily if unknown
  if (!['daily', 'weekly', 'hourly', 'once'].includes(frequency)) {
    frequency = 'daily'
  }
  return {
    id: raw.id || '',
    name: raw.name || '',
    prompt: raw.prompt || '',
    frequency,
    hour: raw.hour || '09',
    minute: raw.minute || '00',
    weekDay: raw.weekDay || '1',
    validFrom: raw.validFrom || '',
    validUntil: raw.validUntil || '',
    notify: raw.notify !== false,
    tools: raw.tools || 'auto',
    connector: raw.connector || '',
    cwd: raw.cwd || '',
    active: raw.active !== false,
    lastRunAt: raw.lastRunAt || null,
    history: Array.isArray(raw.history) ? raw.history.slice(0, 50) : [],
  }
}

function loadAll(): AutomationItem[] {
  try {
    const p = getAutomationsPath()
    if (!fs.existsSync(p)) return []
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8'))
    if (!Array.isArray(raw)) return []
    return raw.map(normalizeItem)
  } catch {
    return []
  }
}

function saveAll(items: AutomationItem[]): void {
  try {
    const p = getAutomationsPath()
    const tmp = p + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(items, null, 2), 'utf-8')
    fs.renameSync(tmp, p) // atomic write
  } catch (e) {
    console.error('[AutoScheduler] save failed:', e)
  }
}

// ====== Schedule Check ======

/** Return the hash key for the current time slot to prevent duplicate runs */
function timeSlotKey(item: AutomationItem, now: Date): string {
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()
  const h = now.getHours()
  const freq = item.frequency // Already normalized by normalizeItem

  switch (freq) {
    case 'hourly':
      return `${y}-${m}-${d}-${h}` // Once per hour
    case 'daily':
      return `${y}-${m}-${d}` // Once per day
    case 'weekly': {
      // Get the Monday of this week
      const dayOfWeek = now.getDay() // 0=Sun, 1=Mon...
      const monday = new Date(now)
      monday.setDate(d - ((dayOfWeek + 6) % 7))
      return `${monday.getFullYear()}-${monday.getMonth()}-${monday.getDate()}-${item.weekDay}`
    }
    case 'once':
      return item.id // Only once ever
    default:
      return `${y}-${m}-${d}-${h}`
  }
}

/** Check if current time is within the effective date range */
function isInDateRange(item: AutomationItem, now: Date): boolean {
  if (item.validFrom) {
    const from = new Date(item.validFrom)
    if (now < from) return false
  }
  if (item.validUntil) {
    const until = new Date(item.validUntil)
    // Include the validUntil day
    until.setHours(23, 59, 59, 999)
    if (now > until) return false
  }
  return true
}

/** Check if the automation should run right now */
function shouldRunNow(item: AutomationItem, now: Date): boolean {
  if (!item.active) return false
  if (!isInDateRange(item, now)) return false

  const hours = now.getHours()
  const minutes = now.getMinutes()
  const dayOfWeek = now.getDay() // 0=Sun, 1=Mon ... 6=Sat
  const freq = item.frequency // Already normalized by normalizeItem

  switch (freq) {
    case 'daily': {
      const h = parseInt(item.hour, 10)
      const m = parseInt(item.minute, 10)
      return hours === h && minutes >= m && minutes < m + 5
    }
    case 'weekly': {
      const weekDay = parseInt(item.weekDay, 10) // 1=Mon ... 7=Sun
      const wd = dayOfWeek === 0 ? 7 : dayOfWeek // Convert to 1=Mon .. 7=Sun
      if (wd !== weekDay) return false
      const h = parseInt(item.hour, 10)
      const m = parseInt(item.minute, 10)
      return hours === h && minutes >= m && minutes < m + 5
    }
    case 'hourly':
      return minutes < 5 // Within first 5 minutes of each hour
    case 'once': {
      if (item.hour && item.minute) {
        const h = parseInt(item.hour, 10)
        const m = parseInt(item.minute, 10)
        return hours === h && minutes >= m && minutes < m + 5
      }
      // If no specific time set, check if already run
      return !item.lastRunAt
    }
    default:
      return false
  }
}

// ====== Execution ======

function getActiveWindow(): BrowserWindow | null {
  const wins = BrowserWindow.getAllWindows()
  return wins.length > 0 ? wins[0] : null
}

/** Load model config to get user's default model and API key */
function loadModelConfig(): { defaultModel: string; apiKey: string; apiUrl: string } {
  const globalKey = configGet('apiKey') || ''
  try {
    const modelsPath = path.join(app.getPath('userData'), 'corebuddy-data', 'models.json')
    if (fs.existsSync(modelsPath)) {
      const cfg = JSON.parse(fs.readFileSync(modelsPath, 'utf-8'))
      const modelId = cfg.defaultModel || 'deepseek-v4-pro'
      const modelEntry = cfg.models?.find((m: any) => m.id === modelId)
      return {
        defaultModel: modelId,
        apiKey: modelEntry?.apiKey || globalKey,
        apiUrl: modelEntry?.apiUrl || 'https://api.deepseek.com/v1',
      }
    }
  } catch {}
  return {
    defaultModel: 'deepseek-v4-pro',
    apiKey: globalKey,
    apiUrl: 'https://api.deepseek.com/v1',
  }
}

async function executeAutomation(item: AutomationItem): Promise<void> {
  if (executingIds.has(item.id)) return
  executingIds.add(item.id)

  const win = getActiveWindow()
  if (!win) {
    executingIds.delete(item.id)
    return
  }

  const historyEntry: AutomationItem['history'][number] = {
    runAt: new Date().toISOString(),
    status: 'running',
  }

  // Append running entry to history
  const items = loadAll()
  const idx = items.findIndex(i => i.id === item.id)
  if (idx >= 0) {
    if (!items[idx].history) items[idx].history = []
    items[idx].history.unshift(historyEntry)
    // Keep max 50 history entries
    if (items[idx].history.length > 50) items[idx].history = items[idx].history.slice(0, 50)
    items[idx].lastRunAt = historyEntry.runAt
    saveAll(items)
  }

  try {
    const modelCfg = loadModelConfig()
    const autoConvId = `auto-${item.id}-${Date.now().toString(36)}`

    await agentLoop(item.prompt, autoConvId, {
      apiKey: modelCfg.apiKey,
      model: modelCfg.defaultModel,
      apiUrl: modelCfg.apiUrl,
      persona: 'office',
      executionMode: 'craft',
      permLevel: 3,
      permissionMode: 'bypassPermissions',
      sender: win,
      userName: '自动化',
    }, win)

    // Mark completed
    const updatedItems = loadAll()
    const uIdx = updatedItems.findIndex(i => i.id === item.id)
    if (uIdx >= 0 && updatedItems[uIdx].history && updatedItems[uIdx].history.length > 0) {
      updatedItems[uIdx].history[0].status = 'completed'
      saveAll(updatedItems)
    }

    console.log(`[AutoScheduler] ✅ "${item.name}" completed`)
  } catch (err: any) {
    console.error(`[AutoScheduler] ❌ "${item.name}" failed:`, err?.message || err)

    const updatedItems = loadAll()
    const uIdx = updatedItems.findIndex(i => i.id === item.id)
    if (uIdx >= 0 && updatedItems[uIdx].history && updatedItems[uIdx].history.length > 0) {
      updatedItems[uIdx].history[0].status = 'failed'
      updatedItems[uIdx].history[0].error = err?.message || String(err)
      saveAll(updatedItems)
    }
  } finally {
    executingIds.delete(item.id)
  }
}

// ====== Check Cycle ======

function checkCycle(): void {
  try {
    const items = loadAll()
    const now = new Date()

    for (const item of items) {
      if (!item.active) continue
      if (executingIds.has(item.id)) continue

      // Prevent duplicate runs within the same time slot
      const slotKey = timeSlotKey(item, now)
      if (item.lastRunAt) {
        const lastRun = new Date(item.lastRunAt)
        const lastSlotKey = timeSlotKey(item, lastRun)
        if (lastSlotKey === slotKey) continue // Already ran this slot
      }

      if (shouldRunNow(item, now)) {
        // Launch async — don't block the check cycle
        executeAutomation(item).catch(e => console.error('[AutoScheduler] execute error:', e))
      }
    }
  } catch (e) {
    console.error('[AutoScheduler] check cycle error:', e)
  }
}

// ====== Public API ======

export function startScheduler(): void {
  if (checkTimer) return
  console.log('[AutoScheduler] Starting scheduler...')
  // Run first check immediately
  checkCycle()
  checkTimer = setInterval(checkCycle, CHECK_INTERVAL_MS)
}

export function stopScheduler(): void {
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
    console.log('[AutoScheduler] Stopped.')
  }
}

export function getHistory(itemId: string): AutomationItem['history'] {
  const items = loadAll()
  const item = items.find(i => i.id === itemId)
  return item?.history || []
}
