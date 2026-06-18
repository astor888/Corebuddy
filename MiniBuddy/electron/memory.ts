import path from 'path'
import fs from 'fs'
import { app } from 'electron'

const DATA_DIR = () => path.join(app.getPath('userData'), 'corebuddy-data')
const MEM_PATH = () => path.join(DATA_DIR(), 'memory.json')
const MEM_BAK_PATH = () => path.join(DATA_DIR(), 'memory.json.bak')
const PROFILE_MD_PATH = () => path.join(DATA_DIR(), 'profile.md')
const PRESET_PATH = () => path.join(DATA_DIR(), 'memory-preset.json')
const LOGS_DIR = () => path.join(DATA_DIR(), 'memory-logs')

// --- Limits ---
const MAX_TODOS = 100
const PROFILE_CHAR_LIMIT = 4000
const CACHE_TTL_MS = 30_000

export interface MemoryProfile {
  workBackground: string
  personalBackground: string
  currentFocus: string
  recentActivities: string[]
}

export interface TodoEntry {
  text: string
  done: boolean
  createdAt: string
}

export interface Memory {
  profile: MemoryProfile
  todos: TodoEntry[]
  updatedAt: string
  version: number
}

function defaultMemory(): Memory {
  return {
    profile: {
      workBackground: '',
      personalBackground: '',
      currentFocus: '',
      recentActivities: [],
    },
    todos: [],
    updatedAt: new Date().toISOString(),
    version: 4,
  }
}

// --- Cache ---
let cache: { memory: Memory; loadedAt: number } | null = null
function invalidateCache() { cache = null }

/** Migrate old versions to current schema */
function migrateMemory(raw: any): Memory {
  let mem = { ...raw }

  // v1-v3: flatten facts/preferences/projects into a basic profile
  if (!mem.version || mem.version < 4) {
    const facts: string[] = []
    if (Array.isArray(mem.facts)) {
      for (const f of mem.facts) {
        if (typeof f === 'string') facts.push(f)
        else if (f && typeof f === 'object' && f.text) facts.push(f.text)
      }
    }
    if (Array.isArray(mem.preferences)) facts.push(...mem.preferences)

    const workFacts = facts.filter(f => /开发者|工程师|项目|代码|技术/i.test(f))
    const personalFacts = facts.filter(f => /喜欢|偏好|习惯|追求|倾向|希望|要求/i.test(f))
    const currentFacts = facts.filter(f => /正在|当前|最近|升级|优化|重构/i.test(f))

    mem.profile = {
      workBackground: workFacts.slice(0, 3).join('；') || '(暂无信息)',
      personalBackground: personalFacts.slice(0, 3).join('；') || '(暂无信息)',
      currentFocus: currentFacts.slice(0, 3).join('；') || '(暂无信息)',
      recentActivities: facts.slice(0, 5),
    }

    // Migrate todos if they're still objects without importance
    if (Array.isArray(mem.todos)) {
      mem.todos = mem.todos.map((t: any) => {
        if (typeof t === 'object' && t.text) return { text: t.text, done: !!t.done, createdAt: t.createdAt || mem.updatedAt || new Date().toISOString() }
        if (typeof t === 'string') return { text: t, done: false, createdAt: mem.updatedAt || new Date().toISOString() }
        return t
      })
    } else {
      mem.todos = []
    }

    mem.version = 4
  }

  return mem as Memory
}

/** Render profile as readable Markdown */
function renderProfileMd(mem: Memory): string {
  const lines = [
    '# CoreBuddy — 用户档案',
    `> 最后更新: ${mem.updatedAt}`,
    '',
    '**工作背景**',
    mem.profile.workBackground || '(暂无)',
    '',
    '**个人背景**',
    mem.profile.personalBackground || '(暂无)',
    '',
    '**当前关注**',
    mem.profile.currentFocus || '(暂无)',
    '',
    '**近期动态**',
    ...(mem.profile.recentActivities.length > 0
      ? mem.profile.recentActivities.map(a => `- ${a}`)
      : ['(暂无)']),
    '',
    '**待办事项**',
    ...(mem.todos.filter(t => !t.done).length > 0
      ? mem.todos.filter(t => !t.done).map(t => `- [ ] ${t.text}`)
      : ['(无待办)']),
    '',
  ]
  return lines.join('\n')
}

export function loadPresetMemory(): Partial<Memory> | null {
  try {
    if (fs.existsSync(PRESET_PATH())) return JSON.parse(fs.readFileSync(PRESET_PATH(), 'utf-8'))
  } catch {}
  return null
}

export function savePresetMemory(preset: Partial<Memory>): void {
  fs.writeFileSync(PRESET_PATH(), JSON.stringify(preset, null, 2))
}

export function loadMemory(): Memory {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.memory
  try {
    if (fs.existsSync(MEM_PATH())) {
      const raw = JSON.parse(fs.readFileSync(MEM_PATH(), 'utf-8'))
      const mem = migrateMemory(raw)
      const preset = loadPresetMemory()
      if (preset?.profile) {
        if (preset.profile.workBackground && !mem.profile.workBackground) mem.profile.workBackground = preset.profile.workBackground
        if (preset.profile.personalBackground && !mem.profile.personalBackground) mem.profile.personalBackground = preset.profile.personalBackground
        if (preset.profile.currentFocus && !mem.profile.currentFocus) mem.profile.currentFocus = preset.profile.currentFocus
      }
      cache = { memory: mem, loadedAt: Date.now() }
      return mem
    }
  } catch {}
  const def = defaultMemory()
  saveMemory(def)
  return def
}

export function saveMemory(mem: Memory) {
  fs.mkdirSync(DATA_DIR(), { recursive: true })
  mem.updatedAt = new Date().toISOString()

  // .bak backup
  if (fs.existsSync(MEM_PATH())) {
    try { fs.copyFileSync(MEM_PATH(), MEM_BAK_PATH()) } catch {}
  }

  // Save JSON (machine-readable)
  fs.writeFileSync(MEM_PATH(), JSON.stringify(mem, null, 2))

  // Save Markdown (human-readable, dual format like WorkBuddy)
  try { fs.writeFileSync(PROFILE_MD_PATH(), renderProfileMd(mem), 'utf-8') } catch {}

  invalidateCache()
}

/** Enforce profile character limit (trim from oldest sections first) */
function trimProfile(profile: MemoryProfile): MemoryProfile {
  const total = profile.workBackground.length + profile.personalBackground.length + profile.currentFocus.length + profile.recentActivities.join('').length
  if (total <= PROFILE_CHAR_LIMIT) return profile
  // Trim recent activities first (least important for context)
  while (profile.recentActivities.length > 3 && total > PROFILE_CHAR_LIMIT) {
    profile.recentActivities.pop()
  }
  return profile
}

/** Trim completed todos older than 30 days */
function trimTodos(todos: TodoEntry[]): TodoEntry[] {
  const thirtyDaysAgo = Date.now() - 30 * 86400_000
  const active = todos.filter(t => !t.done || new Date(t.createdAt).getTime() > thirtyDaysAgo)
  if (active.length > MAX_TODOS)
    return active.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, MAX_TODOS)
  return active
}

// --- Profile tools ---

/** Read the full memory profile (injected into system prompt) */
export function getProfileText(): string {
  const mem = loadMemory()
  const parts: string[] = []
  parts.push(`**工作背景**\n${mem.profile.workBackground || '(暂无)'}`)
  parts.push(`**个人背景**\n${mem.profile.personalBackground || '(暂无)'}`)
  parts.push(`**当前关注**\n${mem.profile.currentFocus || '(暂无)'}`)
  if (mem.profile.recentActivities.length > 0) {
    parts.push(`**近期动态**\n${mem.profile.recentActivities.map(a => `- ${a}`).join('\n')}`)
  }
  return parts.join('\n\n')
}

/** Update the profile (full overwrite) */
export function updateProfile(updates: Partial<MemoryProfile>) {
  const mem = loadMemory()
  if (updates.workBackground !== undefined) mem.profile.workBackground = updates.workBackground
  if (updates.personalBackground !== undefined) mem.profile.personalBackground = updates.personalBackground
  if (updates.currentFocus !== undefined) mem.profile.currentFocus = updates.currentFocus
  if (updates.recentActivities !== undefined) {
    // Merge: prepend new activities, dedup by first 40 chars
    const existingKeys = new Set(mem.profile.recentActivities.map(a => a.slice(0, 40)))
    const newOnes = updates.recentActivities.filter(a => !existingKeys.has(a.slice(0, 40)))
    mem.profile.recentActivities = [...newOnes, ...mem.profile.recentActivities].slice(0, 10)
  }
  mem.profile = trimProfile(mem.profile)
  saveMemory(mem)
}

// --- Todo tools ---

export function addTodo(text: string) {
  const mem = loadMemory()
  if (mem.todos.some(t => !t.done && t.text === text)) return
  mem.todos.push({ text, done: false, createdAt: new Date().toISOString() })
  mem.todos = trimTodos(mem.todos)
  saveMemory(mem)
}

export function markTodoDone(text: string) {
  const mem = loadMemory()
  const todo = mem.todos.find(t => !t.done && t.text === text)
  if (todo) todo.done = true
  saveMemory(mem)
}

/** Clear all memory and reset to defaults */
export function resetProfile() {
  saveMemory(defaultMemory())
}

// --- Daily Log ---

export function recordDailyLog(convId: string, userMsg: string, aiResponse: string) {
  const today = new Date().toISOString().slice(0, 10)
  const logPath = path.join(LOGS_DIR(), `${today}.md`)
  fs.mkdirSync(LOGS_DIR(), { recursive: true })
  const entry = `\n## ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}\n\n**用户:** ${userMsg.slice(0, 100)}${userMsg.length > 100 ? '...' : ''}\n\n**CoreBuddy:** ${aiResponse.slice(0, 200)}${aiResponse.length > 200 ? '...' : ''}\n`
  fs.appendFileSync(logPath, entry, 'utf-8')
}

// --- Daily Log Distillation ---

export function distillDailyLogs(retentionDays = 30) {
  const logsDir = LOGS_DIR()
  if (!fs.existsSync(logsDir)) return
  const cutoff = Date.now() - retentionDays * 86400_000
  const files = fs.readdirSync(logsDir).filter(f => f.endsWith('.md'))
  for (const file of files) {
    const dateStr = file.replace('.md', '')
    const fileDate = new Date(dateStr).getTime()
    if (isNaN(fileDate) || fileDate >= cutoff) continue
    const fullPath = path.join(logsDir, file)
    try {
      const content = fs.readFileSync(fullPath, 'utf-8').trim()
      if (!content) { fs.unlinkSync(fullPath); continue }
      const entryCount = (content.match(/## \d{2}:\d{2}/g) || []).length
      const userLines = content.split('\n').filter(l => l.startsWith('**用户:**'))
      const topics = userLines.map(l => l.replace('**用户:**', '').trim()).filter(Boolean)
      const summary = `# ${dateStr} 工作日志（已压缩）\n\n> 原日志 ${entryCount} 条对话\n\n${topics.map(t => `- ${t}`).join('\n')}\n`
      fs.writeFileSync(fullPath, summary, 'utf-8')
    } catch {}
  }
}
