import path from 'path'
import fs from 'fs'
import { app } from 'electron'

const DATA_DIR = () => path.join(app.getPath('userData'), 'corebuddy-data')
const MEM_PATH = () => path.join(DATA_DIR(), 'memory.json')
const PRESET_PATH = () => path.join(DATA_DIR(), 'memory-preset.json')
const LOGS_DIR = () => path.join(DATA_DIR(), 'memory-logs')

interface Memory {
  facts: string[]
  preferences: string[]
  projects: Array<{ name: string; status: string; lastUpdate: string }>
  todos: Array<{ text: string; done: boolean; createdAt: string }>
  updatedAt: string
}

function defaultMemory(): Memory {
  return {
    facts: [],
    preferences: [],
    projects: [],
    todos: [],
    updatedAt: new Date().toISOString(),
  }
}

/** Load preset memory config (optional, for enterprise pre-configuration) */
export function loadPresetMemory(): Partial<Memory> | null {
  try {
    if (fs.existsSync(PRESET_PATH())) {
      return JSON.parse(fs.readFileSync(PRESET_PATH(), 'utf-8'))
    }
  } catch {}
  return null
}

/** Save preset memory config */
export function savePresetMemory(preset: Partial<Memory>): void {
  fs.writeFileSync(PRESET_PATH(), JSON.stringify(preset, null, 2))
}

export function loadMemory(): Memory {
  try {
    if (fs.existsSync(MEM_PATH())) {
      const mem = JSON.parse(fs.readFileSync(MEM_PATH(), 'utf-8'))
      // Merge preset memory (never overwritten by user)
      const preset = loadPresetMemory()
      if (preset) {
        if (preset.facts) mem.facts = [...new Set([...preset.facts, ...mem.facts])]
        if (preset.preferences) mem.preferences = [...new Set([...preset.preferences, ...mem.preferences])]
        if (preset.projects) {
          for (const pp of preset.projects) {
            if (!mem.projects.find((p: any) => p.name === pp.name)) mem.projects.push(pp)
          }
        }
      }
      return mem
    }
  } catch {}
  const def = defaultMemory()
  // Merge preset into default too
  const preset = loadPresetMemory()
  if (preset) {
    if (preset.facts) def.facts = [...new Set([...preset.facts, ...def.facts])]
    if (preset.preferences) def.preferences = [...new Set([...preset.preferences, ...def.preferences])]
    if (preset.projects) {
      for (const pp of preset.projects) {
        if (!def.projects.find(p => p.name === pp.name)) def.projects.push(pp)
      }
    }
  }
  saveMemory(def)
  return def
}

export function saveMemory(mem: Memory) {
  fs.mkdirSync(DATA_DIR(), { recursive: true })
  mem.updatedAt = new Date().toISOString()
  fs.writeFileSync(MEM_PATH(), JSON.stringify(mem, null, 2))
}

export function addFact(fact: string) {
  const mem = loadMemory()
  if (!mem.facts.includes(fact)) mem.facts.push(fact)
  saveMemory(mem)
}

export function updateProject(name: string, status: string) {
  const mem = loadMemory()
  const p = mem.projects.find(p => p.name === name)
  if (p) { p.status = status; p.lastUpdate = new Date().toISOString() }
  else mem.projects.push({ name, status, lastUpdate: new Date().toISOString() })
  saveMemory(mem)
}

export function addTodo(text: string) {
  const mem = loadMemory()
  mem.todos.push({ text, done: false, createdAt: new Date().toISOString() })
  saveMemory(mem)
}

// Daily log — OpenClaw style
export function recordDailyLog(convId: string, userMsg: string, aiResponse: string) {
  const today = new Date().toISOString().slice(0, 10)
  const logPath = path.join(LOGS_DIR(), `${today}.md`)
  fs.mkdirSync(LOGS_DIR(), { recursive: true })

  const entry = `\n## ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}\n\n**用户:** ${userMsg.slice(0, 100)}${userMsg.length > 100 ? '...' : ''}\n\n**CoreBuddy:** ${aiResponse.slice(0, 200)}${aiResponse.length > 200 ? '...' : ''}\n`

  fs.appendFileSync(logPath, entry, 'utf-8')
}
