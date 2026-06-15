// Plugin System — OpenClaw style: drop-in .js tools + SKILL.md declarations
// Scans {userData}/corebuddy-plugins/ and .workbuddy/skills/ on startup

import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { registerTool, Tool } from './tool-registry'

interface SkillDeclaration {
  name: string
  description: string
  type: 'skill' | 'tool'
  prompt?: string
  triggers?: string[]
}

const loadedSkills: SkillDeclaration[] = []

/** Get all loaded skill prompts (for injection into system prompt) */
export function getSkillsPrompt(): string {
  if (loadedSkills.length === 0) return ''
  return loadedSkills
    .map(s => `## Skill: ${s.name}\n${s.prompt || s.description}${s.triggers ? `\n触发词: ${s.triggers.join(', ')}` : ''}`)
    .join('\n\n')
}

/** Get skills matching the current user message (trigger-based activation) */
export function getActiveSkillsPrompt(userMessage: string): string {
  if (loadedSkills.length === 0) return ''
  const msg = userMessage.toLowerCase()
  const active = loadedSkills.filter(s => {
    if (!s.triggers || s.triggers.length === 0) return false // Only trigger-based skills activate
    return s.triggers.some(t => msg.includes(t.toLowerCase()))
  })
  if (active.length === 0) return ''
  return active
    .map(s => `## Activated Skill: ${s.name}\n${s.prompt || s.description}`)
    .join('\n\n')
}

/** Get all loaded skill declarations */
export function getLoadedSkills(): SkillDeclaration[] {
  return [...loadedSkills]
}

/**
 * Load all plugins from standard directories.
 * Call once at startup.
 */
export function loadAllPlugins() {
  const dirs = [
    path.join(app.getPath('userData'), 'corebuddy-plugins'),
  ]

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
      // Create a sample plugin to show users the format
      createSamplePlugin(dir)
    }
    loadFromDirectory(dir)
  }
}

function loadFromDirectory(dir: string) {
  try {
    const entries = fs.readdirSync(dir)
    for (const entry of entries) {
      const fullPath = path.join(dir, entry)
      const stat = fs.statSync(fullPath)

      if (stat.isDirectory()) {
        // Scan subdirectory for SKILL.md or index.js
        const skillMd = path.join(fullPath, 'SKILL.md')
        const indexJs = path.join(fullPath, 'index.js')
        if (fs.existsSync(skillMd)) loadSkillMd(skillMd)
        if (fs.existsSync(indexJs)) loadJsPlugin(indexJs)
      } else if (entry.endsWith('.js') && entry !== 'SKILL.md') {
        loadJsPlugin(fullPath)
      } else if (entry === 'SKILL.md' || entry.endsWith('.skill.md')) {
        loadSkillMd(fullPath)
      }
    }
  } catch (e: any) {
    console.error('Plugin load error:', e.message)
  }
}

function loadJsPlugin(filePath: string) {
  try {
    // Clear require cache to allow hot-reload
    delete require.cache[require.resolve(filePath)]
    const mod = require(filePath)
    const tool: Tool = mod.default || mod

    if (!tool.name || typeof tool.execute !== 'function') {
      console.error(`Plugin ${filePath}: missing name or execute`)
      return
    }

    // Ensure required fields have defaults
    const fullTool: Tool = {
      name: tool.name,
      description: tool.description || '用户自定义工具',
      parameters: tool.parameters || {},
      permission: tool.permission || 3,
      parallelSafe: tool.parallelSafe || false,
      execute: tool.execute,
    }

    registerTool(fullTool)
    console.log(`Plugin loaded: ${fullTool.name} from ${path.basename(filePath)}`)
  } catch (e: any) {
    console.error(`Failed to load plugin ${filePath}:`, e.message)
  }
}

function loadSkillMd(filePath: string) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const skill = parseSkillMd(content, path.basename(path.dirname(filePath)))

    loadedSkills.push(skill)
    console.log(`Skill loaded: ${skill.name} from ${path.basename(filePath)}`)
  } catch (e: any) {
    console.error(`Failed to load SKILL.md ${filePath}:`, e.message)
  }
}

/**
 * Parse SKILL.md format:
 * ---
 * name: my-skill
 * description: does something
 * triggers: [keyword1, keyword2]
 * ---
 * # Skill content (prompt)
 */
function parseSkillMd(content: string, dirName: string): SkillDeclaration {
  const lines = content.split('\n')
  const skill: SkillDeclaration = {
    name: dirName || 'unknown',
    description: '',
    type: 'skill',
  }

  // Parse YAML frontmatter
  if (lines[0]?.trim() === '---') {
    const endIdx = lines.indexOf('---', 1)
    if (endIdx > 0) {
      for (let i = 1; i < endIdx; i++) {
        const line = lines[i].trim()
        const colonIdx = line.indexOf(':')
        if (colonIdx > 0) {
          const key = line.slice(0, colonIdx).trim()
          const value = line.slice(colonIdx + 1).trim()
          switch (key) {
            case 'name': skill.name = value; break
            case 'description': skill.description = value; break
            case 'type': skill.type = value as 'skill' | 'tool'; break
            case 'triggers':
              try {
                skill.triggers = JSON.parse(value.replace(/'/g, '"'))
              } catch {
                skill.triggers = value.split(',').map(s => s.trim().replace(/['"]/g, ''))
              }
              break
          }
        }
      }
      // Rest is prompt content
      skill.prompt = lines.slice(endIdx + 1).join('\n').trim()
    }
  } else {
    // No frontmatter — whole file is prompt
    skill.prompt = content.trim()
  }

  return skill
}

function createSamplePlugin(dir: string) {
  const samplePath = path.join(dir, 'hello-world.js')
  if (fs.existsSync(samplePath)) return

  const sampleCode = `// CoreBuddy Plugin: Hello World
// Drop .js files into this directory to add custom tools.
// Each file should export a tool object with: name, description, parameters, permission, execute

module.exports = {
  name: 'hello_world',
  description: '一个示例插件，返回问候语',
  parameters: { name: '要问候的名字（可选）' },
  permission: 1,
  parallelSafe: true,
  execute(params) {
    const name = params.name || '世界'
    return '你好，' + name + '！这是来自 CoreBuddy 插件的问候。'
  },
}
`

  const skillSamplePath = path.join(dir, 'SKILL.md')
  const skillSample = `---
name: example-skill
description: 一个示例技能声明
triggers: [示例, 演示, example]
---
# 示例技能

这是一个 SKILL.md 格式的技能声明示例。

当用户的请求匹配触发词时，这个技能的内容会被注入到系统提示词中。

你可以在这里写任何帮助 AI 更好完成任务的内容：
- 工作流程
- 参考信息
- 特定领域的知识
- 工具使用指导
`

  try {
    fs.writeFileSync(samplePath, sampleCode, 'utf-8')
    fs.writeFileSync(skillSamplePath, skillSample, 'utf-8')
  } catch {}
}
