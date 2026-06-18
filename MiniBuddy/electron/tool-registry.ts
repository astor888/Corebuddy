// Tool Registry — Claude Code style: unified standard, permission guard, registration center
// 6 permission modes: default/acceptEdits/plan/dontAsk/auto/bypassPermissions

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execSync } from 'child_process'
import { app, shell } from 'electron'
import { addTodo, markTodoDone, loadMemory, updateProfile, getProfileText, resetProfile } from './memory'
import { spawnSubAgent } from './sub-agent'

// Store current API config for sub-agent spawning
let currentApiConfig: { apiKey: string; model: string; apiUrl?: string } | null = null
export function setApiConfig(config: { apiKey: string; model: string; apiUrl?: string }) {
  currentApiConfig = config
}

/** Resolve paths: if relative, default to WorkBuddy outputs directory */
function resolveWorkPath(p: string): string {
  if (path.isAbsolute(p)) return p
  // Default to corebuddy-data/outputs/ under userData
  const outputsDir = path.join(app.getPath('userData'), 'corebuddy-data', 'outputs')
  fs.mkdirSync(outputsDir, { recursive: true })
  return path.join(outputsDir, p)
}

// Lazy-load document generators (pure JS, no native deps)
let docxModule: any = null
let pptxModule: any = null
function getDocx() { if (!docxModule) docxModule = require('docx'); return docxModule }
function getPptx() { if (!pptxModule) pptxModule = require('pptxgenjs'); return pptxModule }

export interface Tool {
  name: string
  description: string
  parameters: Record<string, string>
  permission: number  // L1(1)=read-only, L2(2)=safe-write, L3(3)=moderate, L4(4)=careful, L5(5)=blocked
  execute: (params: any) => Promise<string> | string
  // Mark as parallel-safe (concurrent execution OK)
  parallelSafe?: boolean
  domains?: string[]    // 所属领域：'office' | 'code' | 'creative'（留空表示 all）
}

// Claude Code Permission Modes
export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'dontAsk' | 'auto' | 'bypassPermissions'

const tools: Record<string, Tool> = {}

export function registerTool(tool: Tool) {
  tools[tool.name] = tool
}

export function getTool(name: string): Tool | undefined {
  return tools[name]
}

export function getAllTools(): Tool[] {
  return Object.values(tools)
}

export function getToolsPrompt(domain?: string): string {
  const filtered = domain ? getAllTools().filter(t => !t.domains || t.domains.includes(domain)) : getAllTools()
  return filtered
    .map(t => `- **${t.name}** (L${t.permission}${t.parallelSafe ? ', 可并行' : ''}): ${t.description}\n  Params: ${Object.entries(t.parameters).map(([k, v]) => `${k}(${v})`).join(', ')}`)
    .join('\n')
}

/**
 * Convert CoreBuddy Tool definitions to OpenAI-compatible function calling format.
 * Used when the API supports native function calling (DeepSeek V4, OpenAI, etc.)
 */
export function getOpenAITools(domain?: string): Array<{
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, { type: string; description: string }>
      required: string[]
    }
  }
}> {
  const filtered = domain ? getAllTools().filter(t => !t.domains || t.domains.includes(domain)) : getAllTools()
  return filtered.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object' as const,
        properties: Object.fromEntries(
          Object.entries(t.parameters).map(([key, desc]) => [
            key,
            { type: 'string', description: desc },
          ])
        ),
        required: Object.keys(t.parameters),
      },
    },
  }))
}

/** Check if a tool can be executed at the given permission level */
export function checkPermission(tool: Tool, permLevel: number, mode: PermissionMode): boolean {
  // bypassPermissions — allow everything
  if (mode === 'bypassPermissions') return true
  // plan mode — never execute, only plan
  if (mode === 'plan') return false
  // Tool's required level must be <= user's allowed level
  return tool.permission <= permLevel
}

// --- Register built-in tools ---

registerTool({
  name: 'list_dir',
  description: '列出目录中的文件和文件夹',
  parameters: { path: '目录路径（绝对路径）' },
  permission: 1,
  parallelSafe: true,
  domains: ['office', 'code', 'creative'],
  execute(params) {
    try {
      const p = params.path || '.'
      if (!fs.existsSync(p)) return `路径不存在: ${p}`
      const items = fs.readdirSync(p, { withFileTypes: true }).slice(0, 50)
      if (items.length === 0) return `目录为空: ${p}`
      return items.map(i => `${i.isDirectory() ? '[目录]' : '[文件]'} ${i.name}${i.isDirectory() ? '/' : ''}`).join('\n')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `列出目录失败: ${msg}`
    }
  },
})

registerTool({
  name: 'read_file',
  description: '读取文件内容',
  parameters: { path: '文件路径（绝对路径）' },
  permission: 1,
  parallelSafe: true,
  domains: ['office', 'code', 'creative'],
  execute(params) {
    try {
      if (!fs.existsSync(params.path)) return `文件不存在: ${params.path}`
      const stat = fs.statSync(params.path)
      if (stat.isDirectory()) return `路径是目录而非文件: ${params.path}`
      const c = fs.readFileSync(params.path, 'utf-8')
      return c.slice(0, 4000) + (c.length > 4000 ? `\n...(截断，共 ${c.length} 字符)` : '')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `读取文件失败: ${msg}`
    }
  },
})

registerTool({
  name: 'write_file',
  description: '创建或覆盖文件。相对路径默认保存到 CoreBuddy 输出目录。',
  parameters: { path: '文件路径', content: '要写入的内容' },
  permission: 2,
  domains: ['office', 'code', 'creative'],
  execute(params) {
    try {
      const filePath = resolveWorkPath(params.path)
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, params.content || '', 'utf-8')
      return `已写入: ${filePath}`
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `写入文件失败: ${msg}`
    }
  },
})

registerTool({
  name: 'run_command',
  description: '执行命令行。直接执行，系统会自动弹出确认窗口让用户批准。',
  parameters: { command: '要执行的命令' },
  permission: 4,
  domains: ['code'],
  execute(params) {
    try {
      const r = execSync(params.command, { encoding: 'utf-8', timeout: 30000, windowsHide: true, maxBuffer: 1024 * 1024 })
      return r || '(执行成功)'
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      const stderr = e instanceof Error ? (e as any).stderr || '' : ''
      return `命令执行失败: ${msg}\n${stderr}`.slice(0, 1000)
    }
  },
})

registerTool({
  name: 'open_url',
  description: '在默认浏览器中打开网址',
  parameters: { url: '网址' },
  permission: 3,
  domains: ['office', 'code', 'creative'],
  execute(params) {
    try {
      shell.openExternal(params.url)
      return `已打开: ${params.url}`
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `打开网址失败: ${msg}`
    }
  },
})

registerTool({
  name: 'search_web',
  description: '在百度上搜索并返回结果摘要（后台执行，不打开浏览器）',
  parameters: { query: '搜索关键词' },
  permission: 3,
  domains: ['office', 'code', 'creative'],
  async execute(params) {
    try {
      const query = params.query || ''
      if (!query) return '请提供搜索关键词'
      const response = await fetch(`https://www.baidu.com/s?wd=${encodeURIComponent(query)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) return `搜索失败: HTTP ${response.status}`
      const html = await response.text()
      
      // Strip all tags, scripts, styles first
      const cleanHtml = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, '\n')
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/&#\d+;/g, ' ')
      
      // Split into lines, filter meaningful content
      const lines = cleanHtml
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 15 && l.length < 300 && !/^\s*$/.test(l))
        .slice(5, 15) // Skip header noise, take 10 results
      
      return `## 搜索: ${query}\n${lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}\n(百度搜索结果摘要)`
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `搜索失败: ${msg}`
    }
  },
})

registerTool({
  name: 'read_profile',
  description: '读取当前用户档案（工作背景、个人偏好、当前关注、近期动态）。每次对话开始时调用一次，了解用户上下文。',
  parameters: {},
  permission: 1,
  parallelSafe: true,
  domains: ['office', 'code', 'creative'],
  execute() {
    try {
      return getProfileText()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `读取档案失败: ${msg}`
    }
  },
})

registerTool({
  name: 'update_profile',
  description: '更新用户档案。只更新有变化的部分，没变化的部分不用传。每次对话结束前调用一次，整理本对话学到的新信息。',
  parameters: {
    workBackground: '工作背景（做什么的、用什么工具、项目是什么）',
    personalBackground: '个人背景（工作习惯、偏好、沟通风格）',
    currentFocus: '当前关注（正在做什么、接下来要做什么）',
    recentActivities: 'JSON 数组，近期动态列表，如 ["修复了 PDF 解析", "重构了记忆系统"]',
  },
  permission: 2,
  domains: ['office', 'code', 'creative'],
  execute(params) {
    try {
      const updates: any = {}
      if (params.workBackground !== undefined) updates.workBackground = params.workBackground
      if (params.personalBackground !== undefined) updates.personalBackground = params.personalBackground
      if (params.currentFocus !== undefined) updates.currentFocus = params.currentFocus
      if (params.recentActivities !== undefined) {
        try { updates.recentActivities = JSON.parse(params.recentActivities) } catch { updates.recentActivities = [params.recentActivities] }
      }
      updateProfile(updates)
      return `档案已更新`
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `档案更新失败: ${msg}`
    }
  },
})

// ── reset_profile — 清空记忆 ──
registerTool({
  name: 'reset_profile',
  description: '清空所有用户档案和待办事项，恢复到初始状态。高风险操作！执行前必须请用户确认。',
  parameters: { confirm: '确认操作。必须设置为 true 才会执行' },
  permission: 3,
  domains: ['office', 'code', 'creative'],
  execute(params) {
    try {
      if (params.confirm !== true && params.confirm !== 'true') {
        return '⚠️ 此操作将清空所有记忆，无法恢复。如需继续，请设置 confirm=true'
      }
      resetProfile()
      return '已清空所有用户档案和待办事项'
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `清空失败: ${msg}`
    }
  },
})

// --- Document Generation Tools ---

registerTool({
  name: 'create_markdown',
  description: '创建 Markdown 文档（.md 文件）',
  parameters: { path: '文件路径（如 /path/to/doc.md）', content: 'Markdown 内容' },
  permission: 2,
  domains: ['office'],
  execute(params) {
    try {
      const filePath = resolveWorkPath(params.path)
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, params.content || '', 'utf-8')
      return `已创建 Markdown 文档: ${filePath} (${(params.content || '').length} 字符)`
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `创建 Markdown 失败: ${msg}`
    }
  },
})

registerTool({
  name: 'create_csv',
  description: '创建 CSV 文件（可用 Excel 打开），data 为二维数组，headers 为表头数组',
  parameters: { path: '文件路径（如 /path/to/data.csv）', headers: '逗号分隔的表头，如：姓名,年龄,部门', data: 'JSON 格式的二维数组，如：[["张三","25","研发"],["李四","30","销售"]]' },
  permission: 2,
  domains: ['office'],
  execute(params) {
    try {
      let csv = '\uFEFF' // BOM for Excel Chinese support
      if (params.headers) {
        csv += params.headers + '\n'
      }
      let rows: any[][] = []
      try { rows = JSON.parse(params.data || '[]') } catch { rows = [] }
      for (const row of rows) {
        csv += row.map((cell: any) => {
          const s = String(cell || '')
          if (s.includes(',') || s.includes('"') || s.includes('\n')) {
            return '"' + s.replace(/"/g, '""') + '"'
          }
          return s
        }).join(',') + '\n'
      }
      const filePath = resolveWorkPath(params.path)
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, csv, 'utf-8')
      return `已创建 CSV 文件: ${filePath} (${rows.length} 行数据)`
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `创建 CSV 失败: ${msg}`
    }
  },
})

registerTool({
  name: 'create_doc',
  description: '创建 Word 文档（.docx），支持标题、段落、列表、表格',
  parameters: {
    path: '文件路径（如 /path/to/doc.docx）',
    title: '文档标题',
    sections: 'JSON 数组：[{"type":"heading","content":"标题","level":1},{"type":"text","content":"段落"},{"type":"bullet","items":["项1","项2"]},{"type":"table","headers":["列1","列2"],"rows":[["a","b"]]}]'
  },
  permission: 2,
  domains: ['office'],
  execute(params) {
    try {
      const docx = getDocx()
      const {
        Document, Packer, Paragraph, TextRun, HeadingLevel,
        Table, TableRow, TableCell, WidthType, convertInchesToTwip,
      } = docx

      let sections: any[] = []
      try { sections = JSON.parse(params.sections || '[]') } catch { sections = [] }

      const children: any[] = []

      if (params.title) {
        children.push(new Paragraph({
          text: params.title,
          heading: HeadingLevel.TITLE,
          spacing: { after: 300 },
        }))
      }

      for (const sec of sections) {
        switch (sec.type) {
          case 'heading':
            children.push(new Paragraph({
              text: sec.content || '',
              heading: sec.level === 1 ? HeadingLevel.HEADING_1 : sec.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
              spacing: { before: 240, after: 120 },
            }))
            break
          case 'text':
            for (const line of (sec.content || '').split('\n')) {
              children.push(new Paragraph({
                children: [new TextRun({ text: line, size: 21 })],
                spacing: { after: 120 },
              }))
            }
            break
          case 'bullet':
            for (const item of (sec.items || [])) {
              children.push(new Paragraph({
                text: item,
                bullet: { level: 0 },
                spacing: { after: 60 },
              }))
            }
            break
          case 'table':
            if (sec.headers && sec.rows) {
              const allRows = [
                sec.headers.map((h: string) => new TableCell({
                  children: [new Paragraph({ text: h, bold: true })],
                  shading: { fill: 'E7E9EC' },
                  width: { size: convertInchesToTwip(1.5), type: WidthType.AUTO },
                })),
                ...sec.rows.map((row: string[]) => row.map((cell: string) => new TableCell({
                  children: [new Paragraph({ text: cell || '' })],
                  width: { size: convertInchesToTwip(1.5), type: WidthType.AUTO },
                }))),
              ]
              children.push(new Table({
                rows: allRows.map((cells: any[]) => new TableRow({ children: cells })),
                width: { size: 100, type: WidthType.PERCENTAGE },
              }))
              children.push(new Paragraph({ spacing: { after: 120 } }))
            }
            break
        }
      }

      if (children.length === 0) {
        children.push(new Paragraph({ text: '(空文档)', spacing: { after: 120 } }))
      }

      const doc = new Document({
        styles: { default: { document: { run: { font: 'Microsoft YaHei', size: 21 } } } },
        sections: [{ children }],
      })

      return Packer.toBuffer(doc).then((buffer: any) => {
        const filePath = resolveWorkPath(params.path)
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
        fs.writeFileSync(filePath, buffer)
        return `已创建 Word 文档: ${filePath}`
      }).catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e)
        return `创建 Word 文档失败: ${msg}`
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `创建 Word 文档失败: ${msg}`
    }
  },
})

registerTool({
  name: 'create_pptx',
  description: '创建 PPTX 演示文稿，slides 为 JSON 数组',
  parameters: {
    path: '文件路径（如 /path/to/pres.pptx）',
    slides: 'JSON 数组：[{"title":"页码标题","content":["要点1","要点2"]}]'
  },
  permission: 2,
  domains: ['office', 'code', 'creative'],
  execute(params) {
    try {
      const PptxGenJS = getPptx()
      const pres = new PptxGenJS()

      let slides: any[] = []
      try { slides = JSON.parse(params.slides || '[]') } catch { slides = [] }

      if (slides.length === 0) {
        const slide = pres.addSlide()
        slide.addText('(空演示文稿)', { x: 1, y: 2, w: 8, fontSize: 18, color: '666666' })
      }

      for (const s of slides) {
        const slide = pres.addSlide()
        if (s.title) {
          slide.addText(s.title, {
            x: 0.5, y: 0.3, w: 9, h: 1,
            fontSize: 28, bold: true, color: '1F2937',
            align: 'left',
          })
        }
        if (s.content && s.content.length > 0) {
          const bullets = s.content.map((item: string) => ({
            text: item,
            options: { fontSize: 18, color: '4B5563', bullet: true, breakLine: true },
          }))
          slide.addText(bullets, {
            x: 0.8, y: 1.5, w: 8.4, h: 4,
            valign: 'top',
          })
        }
      }

      return pres.writeFile({ fileName: resolveWorkPath(params.path) }).then(() => {
        return `已创建 PPTX 演示文稿: ${resolveWorkPath(params.path)} (${slides.length} 页)`
      }).catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e)
        return `保存 PPTX 失败: ${msg}`
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `创建 PPTX 失败: ${msg}`
    }
  },
})


// ── mark_todo_done — 标记待办完成 ──
registerTool({
  name: 'mark_todo_done',
  description: '标记一条待办事项为已完成',
  parameters: { text: '待办事项的文本内容（必须完全匹配）' },
  permission: 2,
  domains: ['office', 'code', 'creative'],
  execute(params) {
    try {
      if (!params.text) return '请指定待办事项内容'
      markTodoDone(params.text)
      return `已标记完成: ${params.text}`
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `标记待办失败: ${msg}`
    }
  },
})

// --- Sub-Agent Tool ---

registerTool({
  name: 'spawn_agent',
  description: '创建子代理处理独立任务。子代理拥有独立上下文和受限工具，完成后返回结果。适用于：分析大段内容、并行处理多个独立任务。',
  parameters: {
    task: '子代理要完成的具体任务',
    context: '可选的背景信息（如文件内容、数据等），帮助子代理理解任务',
  },
  permission: 2,
  domains: ['office', 'code', 'creative'],
  execute(params) {
    return new Promise(async (resolve) => {
      try {
        if (!currentApiConfig) {
          resolve('错误：未配置 API，无法创建子代理')
          return
        }
        // Sub-agents get L1-L2 tools only, excluding spawn_agent itself
        const subTools = getAllTools()
          .filter(t => t.permission <= 2 && t.name !== 'spawn_agent')
          .map(t => ({ name: t.name, description: t.description, permission: t.permission, execute: t.execute }))

        const result = await spawnSubAgent({
          apiKey: currentApiConfig.apiKey,
          model: currentApiConfig.model,
          apiUrl: currentApiConfig.apiUrl,
          task: params.task || '',
          context: params.context || '',
          tools: subTools,
        })
        resolve(`[子代理完成]\n${result}`)
      } catch (e: unknown) {
        resolve(`子代理执行失败: ${msg}`)
      }
    })
  },
})

// --- System Tools (本地系统连接器) ---

/** Get human-readable file size */
function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

/** Safe file scanning — never follow symlinks, limit depth */
function safeScan(dir: string, maxDepth: number, excludeDirs: Set<string> = new Set()): Array<{ path: string; size: number; ext: string }> {
  const results: Array<{ path: string; size: number; ext: string }> = []
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true })
    for (const item of items.slice(0, 200)) {
      if (excludeDirs.has(item.name)) continue
      const fp = path.join(dir, item.name)
      try {
        if (item.isDirectory() && maxDepth > 0) {
          results.push(...safeScan(fp, maxDepth - 1, excludeDirs))
        } else if (item.isFile()) {
          const stat = fs.statSync(fp)
          results.push({ path: fp, size: stat.size, ext: path.extname(fp).toLowerCase() })
        }
      } catch {}
    }
  } catch {}
  return results
}

registerTool({
  name: 'get_disk_info',
  description: '获取所有磁盘分区的空间使用情况（总空间、已用、剩余、使用率）',
  parameters: {},
  permission: 1,
  parallelSafe: true,
  domains: ['office', 'code', 'creative'],
  execute() {
    try {
      const result = execSync('wmic logicaldisk get size,freespace,caption,volumename', {
        encoding: 'utf-8', timeout: 10000, windowsHide: true
      })
      const lines = result.trim().split('\n').slice(1).filter(l => l.trim())
      const parts: string[] = ['## 磁盘空间信息\n']
      for (const line of lines) {
        const cols = line.trim().split(/\s+/)
        if (cols.length >= 2) {
          const drive = cols[0]
          const free = parseInt(cols[cols.length - 2] || '0')
          const total = parseInt(cols[cols.length - 1] || '0')
          if (total > 0) {
            const used = total - free
            const pct = ((used / total) * 100).toFixed(1)
            const bar = '█'.repeat(Math.round(used / total * 20)) + '░'.repeat(20 - Math.round(used / total * 20))
            parts.push(`**${drive}**: ${formatSize(used)} / ${formatSize(total)} (${pct}%)\n\`${bar}\``)
          }
        }
      }
      return parts.join('\n')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `获取磁盘信息失败: ${msg}`
    }
  },
})

registerTool({
  name: 'system_scan',
  description: '全面系统扫描：磁盘空间、Windows临时文件、回收站、浏览器缓存、系统日志、下载文件夹、大文件等。返回可清理项目的详细报告。',
  parameters: { scope: '扫描范围：all(全部)|temp(临时文件)|large(大文件)|downloads(下载)', quick: '是否快速模式(跳过深度扫描)，默认true' },
  permission: 1,
  parallelSafe: true,
  domains: ['office', 'code', 'creative'],
  execute(params) {
    const scope = params.scope || 'all'
    const quick = params.quick !== 'false'
    const results: string[] = ['## 系统扫描报告\n']
    let totalJunkSize = 0

    try {
      const homeDir = os.homedir()
      const windir = process.env.WINDIR || 'C:\\Windows'

      // 1. Windows Temp folder
      if (scope === 'all' || scope === 'temp') {
        const tempDir = path.join(windir, 'Temp')
        const localTemp = path.join(homeDir, 'AppData', 'Local', 'Temp')
        let tempSize = 0, localTempSize = 0
        try {
          const files = safeScan(tempDir, 1)
          for (const f of files) tempSize += f.size
        } catch {}
        try {
          const files = safeScan(localTemp, 2)
          for (const f of files) localTempSize += f.size
        } catch {}
        results.push(`### 📁 Windows 临时文件`)
        if (tempSize > 0) results.push(`- C:\\Windows\\Temp: ${formatSize(tempSize)}`)
        if (localTempSize > 0) results.push(`- %LocalAppData%\\Temp: ${formatSize(localTempSize)}`)
        results.push(`- **可清理合计: ${formatSize(tempSize + localTempSize)}**`)
        totalJunkSize += tempSize + localTempSize
      }

      // 2. Recycle Bin
      if (scope === 'all' || scope === 'temp') {
        try {
          const recycleBin = path.join(process.env.SystemDrive || 'C:', '$Recycle.Bin')
          if (fs.existsSync(recycleBin)) {
            const files = safeScan(recycleBin, 2)
            const size = files.reduce((s, f) => s + f.size, 0)
            if (size > 0) {
              results.push(`\n### 🗑️ 回收站`)
              results.push(`- 回收站文件大小: ${formatSize(size)} (${files.length} 个文件)`)
              results.push(`- **可清理: ${formatSize(size)}**`)
              totalJunkSize += size
            }
          }
        } catch {}
      }

      // 3. Browser cache
      if (scope === 'all' && !quick) {
        results.push(`\n### 🌐 浏览器缓存`)
        const browserPaths = [
          { name: 'Chrome', p: path.join(homeDir, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'Cache') },
          { name: 'Edge', p: path.join(homeDir, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data', 'Default', 'Cache') },
          { name: 'Firefox', p: path.join(homeDir, 'AppData', 'Local', 'Mozilla', 'Firefox', 'Profiles') },
        ]
        for (const browser of browserPaths) {
          try {
            if (fs.existsSync(browser.p)) {
              const files = safeScan(browser.p, 2)
              const size = files.reduce((s, f) => s + f.size, 0)
              if (size > 0) {
                results.push(`- ${browser.name}: ${formatSize(size)}`)
                totalJunkSize += size
              }
            }
          } catch {}
        }
      }

      // 4. System logs
      if ((scope === 'all' || scope === 'temp') && !quick) {
        try {
          const logDirs = [
            path.join(windir, 'Logs'),
            path.join(windir, 'System32', 'winevt', 'Logs'),
            path.join(homeDir, 'AppData', 'Local', 'Microsoft', 'Windows', 'WER'),
          ]
          let logSize = 0
          for (const logDir of logDirs) {
            try {
              if (fs.existsSync(logDir)) {
                const files = safeScan(logDir, 2)
                logSize += files.reduce((s, f) => s + f.size, 0)
              }
            } catch {}
          }
          if (logSize > 0) {
            results.push(`\n### 📋 系统日志`)
            results.push(`- 日志文件大小: ${formatSize(logSize)}`)
            results.push(`- **可清理: ${formatSize(logSize)}**`)
            totalJunkSize += logSize
          }
        } catch {}
      }

      // 5. Downloads folder — list large/old files
      if (scope === 'all' || scope === 'downloads') {
        const downloadsDir = path.join(homeDir, 'Downloads')
        try {
          if (fs.existsSync(downloadsDir)) {
            const files = safeScan(downloadsDir, 2)
            const size = files.reduce((s, f) => s + f.size, 0)
            const oldFiles = files.filter(f => {
              try { return (Date.now() - fs.statSync(f.path).mtimeMs) > 30 * 24 * 3600 * 1000 } catch { return false }
            })
            results.push(`\n### 📥 下载文件夹`)
            results.push(`- 总大小: ${formatSize(size)} (${files.length} 个文件)`)
            if (oldFiles.length > 0) {
              const oldSize = oldFiles.reduce((s, f) => s + f.size, 0)
              results.push(`- 超过30天未使用: ${oldFiles.length} 个文件, ${formatSize(oldSize)}`)
            }
          }
        } catch {}
      }

      // 6. Find large files on Desktop
      if (scope === 'all' || scope === 'large') {
        const desktopDir = path.join(homeDir, 'Desktop')
        try {
          if (fs.existsSync(desktopDir)) {
            const files = safeScan(desktopDir, 2)
            const largeFiles = files.filter(f => f.size > 50 * 1024 * 1024).sort((a, b) => b.size - a.size).slice(0, 10)
            if (largeFiles.length > 0) {
              results.push(`\n### 📦 桌面大文件 (>50MB)`)
              for (const f of largeFiles) {
                results.push(`- ${path.basename(f.path)} — ${formatSize(f.size)}`)
              }
            }
          }
        } catch {}
      }

      // 7. System health summary
      if (scope === 'all') {
        try {
          const totalMem = os.totalmem()
          const freeMem = os.freemem()
          const cpuInfo = os.cpus()
          results.push(`\n### 💻 系统概况`)
          results.push(`- CPU: ${cpuInfo[0]?.model?.trim() || '未知'} (${cpuInfo.length} 核)`)
          results.push(`- 内存: ${formatSize(freeMem)} 可用 / ${formatSize(totalMem)} 总计 (${((1 - freeMem/totalMem) * 100).toFixed(1)}% 已用)`)
          results.push(`- 系统: Windows ${os.release()}`)
          results.push(`- 用户目录: ${homeDir}`)
        } catch {}
      }

      // Summary
      if (totalJunkSize > 0) {
        results.push(`\n---`)
        results.push(`### ✅ 清理建议`)
        results.push(`**可清理垃圾总计: ${formatSize(totalJunkSize)}**`)
        results.push(`\n⚠️ 以上数据仅供预览，不会自动删除。如需清理请使用 clean_junk_files 工具。`)
        results.push(`建议优先清理：Windows临时文件 > 回收站 > 浏览器缓存 > 系统日志`)
      } else {
        results.push(`\n✅ 未发现明显的可清理项，系统保持整洁！`)
      }

      return results.join('\n')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `系统扫描失败: ${msg}`
    }
  },
})

registerTool({
  name: 'clean_junk_files',
  description: '清理指定的垃圾文件类别。会先预览要删除的文件，需用户确认后执行。删除前自动备份到回收区，7天内可恢复。支持：temp(临时文件)|recycle(回收站)|cache(浏览器缓存)|logs(系统日志)|downloads_old(旧下载文件)',
  parameters: {
    target: '清理目标：temp|recycle|cache|logs|downloads_old',
    dry_run: '是否仅预览不删除（默认true，设为false才真正执行）',
  },
  permission: 3,
  domains: ['office', 'code', 'creative'],
  execute(params) {
    const target = params.target
    const dryRun = params.dry_run !== 'false'
    try {
      const homeDir = os.homedir()
      const windir = process.env.WINDIR || 'C:\\Windows'
      const filesToDelete: string[] = []
      let totalSize = 0

      switch (target) {
        case 'temp': {
          const dirs = [path.join(windir, 'Temp'), path.join(homeDir, 'AppData', 'Local', 'Temp')]
          for (const d of dirs) {
            try {
              const files = safeScan(d, 2)
              for (const f of files) { filesToDelete.push(f.path); totalSize += f.size }
            } catch {}
          }
          break
        }
        case 'recycle': {
          try {
            const rb = path.join(process.env.SystemDrive || 'C:', '$Recycle.Bin')
            const files = safeScan(rb, 2)
            for (const f of files) { filesToDelete.push(f.path); totalSize += f.size }
          } catch {}
          break
        }
        case 'cache': {
          const dirs = [
            path.join(homeDir, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'Cache'),
            path.join(homeDir, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data', 'Default', 'Cache'),
          ]
          for (const d of dirs) {
            try {
              const files = safeScan(d, 2)
              for (const f of files) { filesToDelete.push(f.path); totalSize += f.size }
            } catch {}
          }
          break
        }
        case 'logs': {
          const dirs = [path.join(windir, 'Logs'), path.join(windir, 'System32', 'winevt', 'Logs')]
          for (const d of dirs) {
            try {
              const files = safeScan(d, 1)
              for (const f of files) { filesToDelete.push(f.path); totalSize += f.size }
            } catch {}
          }
          break
        }
        case 'downloads_old': {
          const downloadsDir = path.join(homeDir, 'Downloads')
          const files = safeScan(downloadsDir, 2)
          for (const f of files) {
            try {
              if ((Date.now() - fs.statSync(f.path).mtimeMs) > 30 * 24 * 3600 * 1000) {
                filesToDelete.push(f.path)
                totalSize += f.size
              }
            } catch {}
          }
          break
        }
        default:
          return `未知清理目标: ${target}。支持: temp, recycle, cache, logs, downloads_old`
      }

      if (filesToDelete.length === 0) {
        return `✅ 没有找到可清理的 ${target} 文件`
      }

      // Preview mode
      const shownFiles = filesToDelete.slice(0, 30)
      const preview = [
        `## ${dryRun ? '🔍 预览' : '🧹 正在清理'} ${target}`,
        `文件数: ${filesToDelete.length}`,
        `总大小: ${formatSize(totalSize)}`,
        '',
      ]

      if (filesToDelete.length > 30) {
        preview.push(`(显示前30个，共${filesToDelete.length}个文件)`)
      }

      for (const f of shownFiles) {
        preview.push(`- \`${f}\``)
      }

      if (dryRun) {
        preview.push('', '⚠️ **预览模式** — 文件未被删除。确认后请再次调用此工具并设置 dry_run=false')
      } else {
        // Backup then delete — 7-day rollback support
        const backupDir = path.join(app.getPath('userData'), 'corebuddy-data', 'file-backup', Date.now().toString(36))
        fs.mkdirSync(backupDir, { recursive: true })
        const backupLog: Array<{ original: string; backup: string; size: number; time: string }> = []

        let deleted = 0, failed = 0, backedUp = 0
        for (const f of filesToDelete.slice(0, 500)) {
          try {
            const relPath = f.replace(/[:<>"|?*]/g, '_').replace(/\\/g, '/').replace(/^\//, '')
            const backupPath = path.join(backupDir, relPath)
            fs.mkdirSync(path.dirname(backupPath), { recursive: true })
            fs.copyFileSync(f, backupPath)
            backedUp++
            const stat = fs.statSync(f)
            backupLog.push({ original: f, backup: backupPath, size: stat.size, time: new Date().toISOString() })

            fs.unlinkSync(f)
            deleted++
          } catch { failed++ }
        }

        // Save backup log
        fs.writeFileSync(path.join(backupDir, '.backup-log.json'), JSON.stringify(backupLog, null, 2), 'utf-8')

        // Save index to global backup registry
        const regPath = path.join(app.getPath('userData'), 'corebuddy-data', 'file-backup', '.registry.json')
        let registry: any[] = []
        try { registry = JSON.parse(fs.readFileSync(regPath, 'utf-8')) } catch {}
        registry.push({
          dir: backupDir,
          target,
          files: backupLog.length,
          size: backupLog.reduce((s, l) => s + l.size, 0),
          time: new Date().toISOString(),
          expires: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        })
        fs.writeFileSync(regPath, JSON.stringify(registry, null, 2), 'utf-8')

        preview.push('',
          `✅ 已删除 ${deleted} 个文件，${failed} 个失败`,
          `📦 已备份 ${backedUp} 个文件到回收区（7天内可恢复）`,
          `💾 释放空间: ${formatSize(totalSize)}`,
          '',
          '💡 如需恢复，可使用 `restore_files` 工具查看备份列表并选择恢复')
      }

      return preview.join('\n')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `清理失败: ${msg}`
    }
  },
})

registerTool({
  name: 'restore_files',
  description: '恢复被清理的文件。列出最近的清理记录，可选择批量恢复。支持：list(查看记录)|restore(恢复指定批次)|cleanup(清除过期备份)',
  parameters: {
    action: 'list|restore|cleanup（默认list查看备份列表）',
    batch_id: '恢复时指定批次ID（从list获取），不指定则恢复最近一批',
  },
  permission: 2,
  domains: ['office', 'code', 'creative'],
  execute(params) {
    try {
      const backupRoot = path.join(app.getPath('userData'), 'corebuddy-data', 'file-backup')
      const regPath = path.join(backupRoot, '.registry.json')

      if (!fs.existsSync(regPath)) return '📦 暂无备份记录。备份在删除文件时自动创建，7天内有效。'

      let registry: any[]
      try { registry = JSON.parse(fs.readFileSync(regPath, 'utf-8')) } catch { return '⚠️ 备份索引损坏' }

      const now = Date.now()
      // Auto-cleanup expired backups
      const validRegistry = registry.filter((r: any) => {
        const expires = new Date(r.expires).getTime()
        if (now > expires) {
          try { fs.rmSync(r.dir, { recursive: true, force: true }) } catch {}
          return false
        }
        return true
      })
      if (validRegistry.length !== registry.length) {
        fs.writeFileSync(regPath, JSON.stringify(validRegistry, null, 2), 'utf-8')
      }

      const action = params.action || 'list'

      if (action === 'cleanup') {
        for (const r of validRegistry) {
          try { fs.rmSync(r.dir, { recursive: true, force: true }) } catch {}
        }
        try { fs.unlinkSync(regPath) } catch {}
        return '✅ 所有备份已清除'
      }

      if (action === 'restore') {
        const batch = params.batch_id
          ? validRegistry.find((r: any) => r.dir.endsWith(params.batch_id))
          : validRegistry[validRegistry.length - 1]

        if (!batch) return '⚠️ 未找到指定的备份批次'

        const logPath = path.join(batch.dir, '.backup-log.json')
        if (!fs.existsSync(logPath)) return '⚠️ 备份日志不存在'

        const files: Array<{ original: string; backup: string; size: number }> = JSON.parse(fs.readFileSync(logPath, 'utf-8'))
        let restored = 0, failed = 0
        for (const f of files) {
          try {
            if (fs.existsSync(f.backup)) {
              fs.mkdirSync(path.dirname(f.original), { recursive: true })
              fs.copyFileSync(f.backup, f.original)
              restored++
            } else {
              failed++
            }
          } catch { failed++ }
        }

        // Remove this batch from registry after restore
        const newReg = validRegistry.filter((r: any) => r.dir !== batch.dir)
        fs.writeFileSync(regPath, JSON.stringify(newReg, null, 2), 'utf-8')
        try { fs.rmSync(batch.dir, { recursive: true, force: true }) } catch {}

        return [
          '## 🔄 文件恢复',
          '',
          `已恢复: ${restored} 个文件`,
          `失败: ${failed} 个文件`,
          `恢复大小: ${formatSize(files.reduce((s: number, f: any) => s + f.size, 0))}`,
          `目标: ${batch.target} (${new Date(batch.time).toLocaleString('zh-CN')})`,
        ].join('\n')
      }

      // List mode (default)
      if (validRegistry.length === 0) return '📦 暂无有效备份（备份在删除文件时自动创建，7天内有效）'

      const lines = ['## 📦 文件备份回收区\n']
      let totalFiles = 0, totalSize = 0
      for (const r of validRegistry) {
        totalFiles += r.files
        totalSize += r.size
        const remaining = Math.max(0, Math.ceil((new Date(r.expires).getTime() - now) / (24 * 3600 * 1000)))
        lines.push(`### 批次 \`${path.basename(r.dir)}\``)
        lines.push(`- 清理类型: ${r.target}`)
        lines.push(`- 文件数: ${r.files} 个, ${formatSize(r.size)}`)
        lines.push(`- 清理时间: ${new Date(r.time).toLocaleString('zh-CN')}`)
        lines.push(`- ⏳ ${remaining} 天后过期`)
        lines.push('')
      }

      lines.push(`---`)
      lines.push(`总计: ${validRegistry.length} 批次 | ${totalFiles} 个文件 | ${formatSize(totalSize)}`)
      lines.push('')
      lines.push('💡 使用 `restore_files action=restore` 恢复最近一批')
      lines.push('💡 使用 `restore_files action=restore batch_id=<ID>` 恢复指定批次')
      lines.push('💡 使用 `restore_files action=cleanup` 清除所有备份')
      return lines.join('\n')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `恢复操作失败: ${msg}`
    }
  },
})

registerTool({
  name: 'find_large_files',
  description: '搜索指定目录中的大文件，按大小排序',
  parameters: {
    directory: '搜索目录（默认桌面）',
    min_size_mb: '最小文件大小(MB)，默认50',
    top_n: '返回前N个结果，默认20',
  },
  permission: 1,
  parallelSafe: true,
  domains: ['office', 'code', 'creative'],
  execute(params) {
    try {
      const dir = params.directory || path.join(os.homedir(), 'Desktop')
      const minSize = (parseInt(params.min_size_mb) || 50) * 1024 * 1024
      const topN = parseInt(params.top_n) || 20
      if (!fs.existsSync(dir)) return `目录不存在: ${dir}`

      const files = safeScan(dir, 3)
      const largeFiles = files
        .filter(f => f.size > minSize)
        .sort((a, b) => b.size - a.size)
        .slice(0, topN)

      if (largeFiles.length === 0) return `在 ${dir} 中没有找到大于 ${formatSize(minSize)} 的文件`

      const lines = [`## 大文件扫描: ${dir}`, `(${largeFiles.length} 个文件 > ${formatSize(minSize)})`, '']
      for (const f of largeFiles) {
        lines.push(`- **${path.basename(f.path)}** — ${formatSize(f.size)}\n  \`${f.path}\``)
      }
      const total = largeFiles.reduce((s, f) => s + f.size, 0)
      lines.push('', `总计: ${formatSize(total)}`)
      return lines.join('\n')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `搜索大文件失败: ${msg}`
    }
  },
})

registerTool({
  name: 'list_startup_apps',
  description: '列出 Windows 开机启动程序',
  parameters: {},
  permission: 1,
  parallelSafe: true,
  domains: ['office', 'code', 'creative'],
  execute() {
    try {
      const homeDir = os.homedir()
      const startupFolders = [
        path.join(homeDir, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'),
        path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'),
      ]
      const lines = ['## 开机启动程序\n']
      for (const folder of startupFolders) {
        try {
          if (fs.existsSync(folder)) {
            const items = fs.readdirSync(folder)
            if (items.length > 0) {
              lines.push(`### ${path.basename(path.dirname(folder))}`)
              for (const item of items) {
                lines.push(`- ${item}`)
              }
            }
          }
        } catch {}
      }

      // Also check registry
      try {
        const reg = execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" 2>nul', {
          encoding: 'utf-8', timeout: 5000, windowsHide: true
        })
        if (reg.trim()) {
          const rLines = reg.trim().split('\n').slice(2).filter(l => l.trim())
          if (rLines.length > 0) {
            lines.push(`\n### 注册表启动项 (HKCU\\Run)`)
            for (const rl of rLines) {
              const parts = rl.trim().split(/\s{2,}/)
              if (parts.length >= 2) {
                lines.push(`- **${parts[0].trim()}** → \`${parts.slice(1).join(' ').trim()}\``)
              }
            }
          }
        }
      } catch {}

      if (lines.length === 1) lines.push('未发现启动项')
      return lines.join('\n')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `获取启动项失败: ${msg}`
    }
  },
})

registerTool({
  name: 'get_system_health',
  description: '获取系统健康状态：CPU负载、内存使用、运行时间、进程数等',
  parameters: {},
  permission: 1,
  parallelSafe: true,
  domains: ['office', 'code', 'creative'],
  execute() {
    try {
      const totalMem = os.totalmem()
      const freeMem = os.freemem()
      const memUsed = totalMem - freeMem
      const memPct = (memUsed / totalMem * 100).toFixed(1)
      const bar = '█'.repeat(Math.round(memUsed / totalMem * 20)) + '░'.repeat(20 - Math.round(memUsed / totalMem * 20))

      const cpuInfo = os.cpus()
      const uptime = os.uptime()
      const hours = Math.floor(uptime / 3600)
      const mins = Math.floor((uptime % 3600) / 60)

      const lines = [
        '## 🖥️ 系统健康状态',
        '',
        `**CPU**: ${cpuInfo[0]?.model?.trim() || '未知'} | ${cpuInfo.length} 核心`,
        `**内存**: ${formatSize(memUsed)} / ${formatSize(totalMem)} (${memPct}%)`,
        `\`${bar}\``,
        `**运行时间**: ${hours} 小时 ${mins} 分钟`,
        '',
        '### 💡 优化建议',
      ]

      if (parseFloat(memPct) > 80) {
        lines.push('- ⚠️ 内存使用率较高，建议关闭不必要的程序')
      } else {
        lines.push('- ✅ 内存使用正常')
      }

      if (hours > 48) {
        lines.push('- 💡 系统已运行超过48小时，建议重启以获得最佳性能')
      }

      // Check Windows version
      const winVer = os.release()
      lines.push(`- 📋 Windows 版本: ${winVer}`)

      return lines.join('\n')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `获取系统健康失败: ${msg}`
    }
  },
})

// --- Full PC Management Tools ---

registerTool({
  name: 'check_drivers',
  description: '检查Windows设备驱动程序状态，列出有问题的设备。危险等级：低（只读）',
  parameters: {},
  permission: 1,
  parallelSafe: true,
  domains: ['office', 'code', 'creative'],
  execute() {
    try {
      const lines = ['## 🔧 驱动程序检查\n']
      // Use driverquery to list all drivers
      try {
        const result = execSync('driverquery /FO CSV /NH 2>nul', { encoding: 'utf-8', timeout: 15000, windowsHide: true })
        const rows = result.trim().split('\n')
        let total = 0, issues = 0
        for (const row of rows) {
          const match = row.match(/^"([^"]+)","([^"]+)","([^"]+)","([^"]*)"/)
          if (match) {
            total++
            const [_, name, displayName, type, state] = match
            // Check for stopped critical drivers
            if (state && state.toLowerCase() !== 'running' && type === 'Kernel') {
              issues++
              lines.push(`- ⚠️ **${displayName || name}** — ${state} (核心驱动)`)
            }
          }
        }
        if (issues === 0) {
          // Try checking device manager for problem devices
          try {
            const pnpResult = execSync('pnputil /enum-devivers /problem 2>nul', { encoding: 'utf-8', timeout: 10000, windowsHide: true })
            if (pnpResult.includes('问题')) {
              lines.push('发现存在问题的设备驱动（通过PnP检测）：')
              lines.push(pnpResult.slice(0, 500))
              issues++
            }
          } catch {}
          if (issues === 0) lines.push(`✅ 已检查 ${total} 个驱动，未发现明显问题`)
        }
        lines.push('', `总计: ${total} 个驱动 | 问题: ${issues} 个`)
      } catch {
        lines.push('⚠️ 无法获取驱动列表（需要管理员权限）')
      }

      lines.push('', '💡 建议：')
      lines.push('- 使用 Windows Update 自动更新驱动')
      lines.push('- 到设备制造商官网（Dell/Lenovo/HP）下载最新驱动')
      lines.push('- 使用设备管理器检查黄色感叹号标记的设备')
      return lines.join('\n')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `驱动检查失败: ${msg}`
    }
  },
})

registerTool({
  name: 'check_security',
  description: '检查Windows安全状态：Defender状态、防火墙、最近威胁扫描。只读操作。',
  parameters: {},
  permission: 1,
  parallelSafe: true,
  domains: ['office', 'code', 'creative'],
  execute() {
    try {
      const lines = ['## 🛡️ 安全状态检查\n']

      // Windows Defender status
      try {
        const defStatus = execSync('powershell -Command "Get-MpComputerStatus | Select-Object AntivirusEnabled,RealTimeProtectionEnabled,OnAccessProtectionEnabled,IoavProtectionEnabled | ConvertTo-Json" 2>nul', { encoding: 'utf-8', timeout: 15000, windowsHide: true })
        if (defStatus.trim()) {
          const status = JSON.parse(defStatus)
          lines.push('### Windows Defender')
          lines.push(`- 杀毒引擎: ${status.AntivirusEnabled ? '✅ 已启用' : '⚠️ 未启用'}`)
          lines.push(`- 实时保护: ${status.RealTimeProtectionEnabled ? '✅ 已启用' : '⚠️ 未启用'}`)
          lines.push(`- 访问保护: ${status.OnAccessProtectionEnabled ? '✅ 已启用' : '⚠️ 未启用'}`)
          lines.push(`- 网络检查: ${status.IoavProtectionEnabled ? '✅ 已启用' : '⚠️ 未启用'}`)
        }
      } catch { lines.push('⚠️ 无法获取 Defender 状态（需要管理员权限）') }

      // Firewall
      try {
        const fw = execSync('netsh advfirewall show allprofiles state 2>nul', { encoding: 'utf-8', timeout: 10000, windowsHide: true })
        const fwOn = fw.includes('ON') || fw.includes('启用')
        lines.push('')
        lines.push('### 防火墙')
        lines.push(fwOn ? '- ✅ 防火墙已开启' : '- ⚠️ 防火墙可能未开启')
      } catch { lines.push('- ⚠️ 无法检查防火墙状态') }

      // Recent threats
      try {
        const threats = execSync('powershell -Command "Get-MpThreatDetection | Select-Object -First 5 | ConvertTo-Json" 2>nul', { encoding: 'utf-8', timeout: 10000, windowsHide: true })
        if (threats.trim() && threats.trim() !== '[]') {
          lines.push('')
          lines.push('### 最近威胁')
          lines.push(threats.slice(0, 500))
        } else {
          lines.push('', '✅ 最近未检测到威胁')
        }
      } catch {}

      lines.push('')
      lines.push('💡 建议：')
      lines.push('- 确保 Windows Defender 实时保护始终开启')
      lines.push('- 定期运行 Windows Update 获取安全更新')
      lines.push('- 不要下载来路不明的软件')
      return lines.join('\n')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `安全检查失败: ${msg}`
    }
  },
})

registerTool({
  name: 'diagnose_network',
  description: '网络诊断：检查网络连接、DNS状态、常见网站连通性。只读操作。',
  parameters: {},
  permission: 1,
  parallelSafe: true,
  domains: ['office', 'code', 'creative'],
  execute() {
    try {
      const lines = ['## 🌐 网络诊断\n']
      // IP config
      try {
        const ip = execSync('ipconfig | findstr /C:"IPv4" /C:"默认网关" /C:"DNS"', { encoding: 'utf-8', timeout: 8000, windowsHide: true })
        lines.push('### IP 配置')
        lines.push('```')
        lines.push(ip.trim())
        lines.push('```')
      } catch {}

      // DNS test
      lines.push('')
      lines.push('### 域名解析测试')
      const targets = [
        { name: '百度', host: 'www.baidu.com' },
        { name: 'Google DNS', host: '8.8.8.8' },
        { name: '阿里 DNS', host: '223.5.5.5' },
      ]
      for (const t of targets) {
        try {
          execSync(`ping -n 1 -w 2000 ${t.host}`, { encoding: 'utf-8', timeout: 3000, windowsHide: true })
          lines.push(`- ✅ ${t.name} (${t.host}) — 可达`)
        } catch {
          lines.push(`- ❌ ${t.name} (${t.host}) — 不可达`)
        }
      }

      // Check hosts file
      try {
        const hostsFile = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts')
        if (fs.existsSync(hostsFile)) {
          const hosts = fs.readFileSync(hostsFile, 'utf-8')
          const entries = hosts.split('\n').filter(l => l.trim() && !l.trim().startsWith('#') && l.includes(' '))
          if (entries.length > 0) {
            lines.push('')
            lines.push('### Hosts 文件自定义解析')
            for (const e of entries.slice(0, 10)) {
              lines.push(`- ${e.trim()}`)
            }
          }
        }
      } catch {}

      lines.push('')
      lines.push('💡 建议：')
      lines.push('- 如果百度不可达，检查网络连接')
      lines.push('- 如果DNS问题，尝试更换为 8.8.8.8 或 223.5.5.5')
      lines.push('- 检查路由器是否正常工作')
      return lines.join('\n')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `网络诊断失败: ${msg}`
    }
  },
})

registerTool({
  name: 'check_windows_updates',
  description: '检查Windows更新状态：最近更新、待安装更新数量。只读操作。',
  parameters: {},
  permission: 1,
  parallelSafe: true,
  domains: ['office', 'code', 'creative'],
  execute() {
    try {
      const lines = ['## 📥 Windows 更新检查\n']

      // Check last update time
      try {
        const updates = execSync('wmic qfe list brief 2>nul', { encoding: 'utf-8', timeout: 10000, windowsHide: true })
        const updateLines = updates.trim().split('\n').filter(l => l.trim() && !l.includes('Description'))
        lines.push(`已安装更新: ${updateLines.length} 个`)
        if (updateLines.length > 0) {
          const sorted = updateLines.sort().reverse()
          const recent = sorted.slice(0, 3)
          lines.push('最近安装:')
          for (const u of recent) {
            const parts = u.trim().split(/\s+/)
            lines.push(`- ${parts.slice(1, 3).join(' ')}`)
          }
        }
      } catch { lines.push('⚠️ 无法获取更新历史') }

      // Check pending updates
      try {
        const pending = execSync('powershell -Command "(New-Object -ComObject Microsoft.Update.Session).CreateUpdateSearcher().Search(\'IsInstalled=0\').Updates.Count" 2>nul', { encoding: 'utf-8', timeout: 15000, windowsHide: true })
        const count = parseInt(pending.trim()) || 0
        if (count > 0) {
          lines.push('')
          lines.push(`⚠️ 有 ${count} 个更新待安装`)
          lines.push('建议：打开「设置 → Windows 更新」安装更新')
        } else {
          lines.push('', '✅ 系统已是最新版本')
        }
      } catch { lines.push('⚠️ 无法检查待安装更新') }

      // Auto update status
      try {
        const au = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update" /v AUOptions 2>nul', { encoding: 'utf-8', timeout: 5000, windowsHide: true })
        if (au.includes('0x4')) lines.push('', '✅ 自动更新已启用')
      } catch {}

      lines.push('')
      lines.push('💡 建议：')
      lines.push('- 保持 Windows 自动更新开启，修复安全漏洞')
      lines.push('- 每月第二个周二（Patch Tuesday）微软发布安全更新')
      return lines.join('\n')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `更新检查失败: ${msg}`
    }
  },
})

registerTool({
  name: 'get_running_processes',
  description: '列出当前运行的高资源占用进程（内存>.5GB或CPU高负载）。只读操作。',
  parameters: {},
  permission: 1,
  parallelSafe: true,
  domains: ['office', 'code', 'creative'],
  execute() {
    try {
      const lines = ['## 📊 进程资源分析\n']
      try {
        const result = execSync('tasklist /FO CSV /NH 2>nul', { encoding: 'utf-8', timeout: 10000, windowsHide: true })
        const rows = result.trim().split('\n')
        const procs: Array<{ name: string; pid: string; mem: number }> = []
        for (const row of rows) {
          const match = row.match(/"([^"]+)","(\d+)","[^"]+","\d+","([\d,.]+) K"/)
          if (match) {
            const mem = parseInt(match[3].replace(/[,.]/g, '')) || 0
            if (mem > 500000) { // >500 MB
              procs.push({ name: match[1], pid: match[2], mem })
            }
          }
        }
        procs.sort((a, b) => b.mem - a.mem)

        if (procs.length === 0) {
          lines.push('✅ 未发现高内存占用的进程')
        } else {
          lines.push('### 高内存占用进程 (>500 MB)')
          let totalMem = 0
          for (const p of procs.slice(0, 15)) {
            lines.push(`- **${p.name}** (PID ${p.pid}) — ${formatSize(p.mem * 1024)}`)
            totalMem += p.mem
          }
          lines.push('', `这些进程合计: ${formatSize(totalMem * 1024)}`)
        }

        // CPU-intensive processes hint
        lines.push('')
        lines.push('### 常见可优化的后台进程')
        lines.push('- 浏览器（Chrome/Edge 多标签页）→ 关闭不需要的标签页')
        lines.push('- 开发工具（VS Code/IDE）→ 关闭不用的项目')
        lines.push('- 即时通讯（微信/钉钉/飞书）→ 内存占用通常较大')
        lines.push('- Java/Node.js 进程 → 检查是否有多余的开发服务')
      } catch { lines.push('⚠️ 无法获取进程列表') }

      lines.push('')
      lines.push('⚠️ 注意：不要随意结束系统进程或未知进程，可能导致系统不稳定')
      lines.push('如需结束进程，请在任务管理器中操作')
      return lines.join('\n')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `进程分析失败: ${msg}`
    }
  },
})

registerTool({
  name: 'search_files',
  description: '在电脑中搜索文件。可按文件名、扩展名、大小筛选。只读操作。',
  parameters: {
    query: '搜索关键词或文件名（支持通配符 * ?）',
    directory: '搜索目录（默认用户目录）',
    extensions: '限定扩展名，逗号分隔（如: .exe,.dll,.txt）',
    min_size_mb: '最小文件大小(MB)',
    max_depth: '搜索深度（1=浅层 3=深层，默认2）',
  },
  permission: 1,
  parallelSafe: true,
  domains: ['office', 'code', 'creative'],
  execute(params) {
    try {
      const searchDir = params.directory || os.homedir()
      const query = (params.query || '').toLowerCase()
      const exts = params.extensions ? params.extensions.split(',').map((e: string) => e.trim().toLowerCase()) : null
      const minSize = (parseInt(params.min_size_mb) || 0) * 1024 * 1024
      const maxDepth = parseInt(params.max_depth) || 2

      if (!fs.existsSync(searchDir)) return `目录不存在: ${searchDir}`

      const files = safeScan(searchDir, Math.min(maxDepth, 3))
      let results = files

      // Filter by query
      if (query) {
        const isWildcard = query.includes('*') || query.includes('?')
        if (isWildcard) {
          const regex = new RegExp('^' + query.replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i')
          results = results.filter(f => regex.test(path.basename(f.path).toLowerCase()))
        } else {
          results = results.filter(f => path.basename(f.path).toLowerCase().includes(query))
        }
      }

      // Filter by extension
      if (exts) {
        results = results.filter(f => exts.includes(f.ext))
      }

      // Filter by size
      if (minSize) {
        results = results.filter(f => f.size >= minSize)
      }

      // Sort by relevance/size
      results.sort((a, b) => b.size - a.size).slice(0, 50)

      if (results.length === 0) {
        return `在 ${searchDir} 中未找到匹配 "${params.query}" 的文件`
      }

      // Group results by directory for collapsible display
      const grouped: Record<string, typeof results> = {}
      for (const f of results) {
        const dir = path.dirname(f.path)
        if (!grouped[dir]) grouped[dir] = []
        if (grouped[dir].length < 8) grouped[dir].push(f)
      }

      const lines = [`## 🔍 搜索: "${params.query || '*'}"`, `目录: ${searchDir}`, `找到: ${results.length} 个文件`, '']
      for (const [dir, items] of Object.entries(grouped)) {
        if (items.length > 0) {
          const totalSize = items.reduce((s, f) => s + f.size, 0)
          lines.push(`### 📁 ${dir}`)
          lines.push(`(共 ${(files.filter(f => path.dirname(f.path) === dir).length || items.length)} 个, ${formatSize(totalSize)})`)
          for (const f of items.slice(0, 5)) {
            lines.push(`- **${path.basename(f.path)}** — ${formatSize(f.size)}`)
          }
          if (items.length > 5) lines.push(`  ... 还有 ${items.length - 5} 个`)
          lines.push('')
        }
      }

      // Total
      const totalSize = results.reduce((s, f) => s + f.size, 0)
      lines.push(`总计: ${results.length} 个文件, ${formatSize(totalSize)}`)
      return lines.join('\n')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `搜索文件失败: ${msg}`
    }
  },
})

registerTool({
  name: 'check_startup_impact',
  description: '分析开机启动项对系统启动速度的影响。只读操作。',
  parameters: {},
  permission: 1,
  parallelSafe: true,
  domains: ['office', 'code', 'creative'],
  execute() {
    try {
      const lines = ['## ⏱️ 开机启动项分析\n']

      // Auto-start programs
      const homeDir = os.homedir()
      const startupPaths = [
        { label: '当前用户启动', path: path.join(homeDir, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup') },
        { label: '所有用户启动', path: path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup') },
      ]

      for (const sp of startupPaths) {
        try {
          if (fs.existsSync(sp.path)) {
            const items = fs.readdirSync(sp.path)
            if (items.length > 0) {
              lines.push(`### ${sp.label} (${items.length} 个)`)
              for (const item of items.slice(0, 10)) {
                const fp = path.join(sp.path, item)
                const stat = fs.statSync(fp)
                lines.push(`- ${item} (${formatSize(stat.size)})`)
              }
            }
          }
        } catch {}
      }

      // Registry auto-run
      try {
        const reg = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run" 2>nul', { encoding: 'utf-8', timeout: 5000, windowsHide: true })
        const rLines = reg.trim().split('\n').filter(l => l.includes('REG_SZ') || l.includes('REG_EXPAND_SZ'))
        if (rLines.length > 0) {
          lines.push(`### 注册表自动运行 (系统)`)
          for (const rl of rLines.slice(0, 10)) {
            const m = rl.match(/\s+(\S+)\s+REG/)
            if (m) lines.push(`- ${m[1]}`)
          }
        }
      } catch {}

      lines.push('')
      lines.push('💡 建议：')
      lines.push('- 禁用不常用的启动项可加快开机速度')
      lines.push('- 使用「任务管理器 → 启动」查看启动影响（高/中/低）')
      lines.push('- 安全软件的启动项通常不建议禁用')
      return lines.join('\n')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `启动项分析失败: ${msg}`
    }
  },
})

// ── read_document — 解析 docx/pptx/xlsx/pdf 提取文本 ──
registerTool({
  name: 'read_document',
  description: '读取文档内容，自动识别格式并提取文本。支持 .docx .pptx .xlsx .pdf .txt .md .csv',
  parameters: {
    path: '文档绝对路径',
    maxLength: '最大返回字符数（默认 5000）',
  },
  permission: 1,
  parallelSafe: true,
  domains: ['office', 'code', 'creative'],
  execute(params) {
    try {
      const filePath = params.path
      if (!filePath || !fs.existsSync(filePath)) return `文件不存在: ${filePath}`
      const ext = path.extname(filePath).toLowerCase()
      const maxLen = parseInt(params.maxLength) || 5000
      const stat = fs.statSync(filePath)

      // Plain text files
      if (['.txt', '.md', '.csv', '.json', '.xml', '.html', '.css', '.js', '.ts', '.py', '.log'].includes(ext)) {
        const data = fs.readFileSync(filePath, 'utf-8')
        return `[${ext} 文本, ${stat.size} 字节]\n\n${data.slice(0, maxLen)}${data.length > maxLen ? `\n...(共 ${data.length} 字符, 已截断)` : ''}`
      }

      // Office documents via JSZip
      if (['.docx', '.pptx', '.xlsx'].includes(ext)) {
        const JSZip = require('jszip')
        const buffer = fs.readFileSync(filePath)
        const zip = new JSZip()
        return new Promise((resolve, reject) => {
          zip.loadAsync(buffer).then((zipData: any) => {
            const texts: string[] = []
            const promises: Promise<void>[] = []

            if (ext === '.docx') {
              const docFile = zipData.file('word/document.xml')
              if (docFile) promises.push(
                docFile.async('text').then((xml: string) => {
                  const paragraphs = xml.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) || []
                  const text = paragraphs.map((p: string) => p.replace(/<[^>]+>/g, '')).join('\n')
                  texts.push(`[Word 文档]\n\n${text}`)
                })
              )
            } else if (ext === '.pptx') {
              const slideFiles = Object.keys(zipData.files).filter((k: string) => k.startsWith('ppt/slides/slide') && k.endsWith('.xml'))
              promises.push(...slideFiles.map((k: string, i: number) =>
                zipData.file(k)!.async('text').then((xml: string) => {
                  const shapes = xml.match(/<a:t[^>]*>([^<]+)<\/a:t>/g) || []
                  const slideText = shapes.map((s: string) => s.replace(/<[^>]+>/g, '')).join('\n')
                  if (slideText.trim()) texts.push(`[幻灯片 ${i + 1}]\n${slideText}`)
                })
              ))
            } else if (ext === '.xlsx') {
              const sheetFile = zipData.file('xl/sharedStrings.xml')
              const sheetFiles = Object.keys(zipData.files).filter((k: string) => k.startsWith('xl/worksheets/sheet') && k.endsWith('.xml'))
              const strings: string[] = []
              if (sheetFile) promises.push(
                sheetFile.async('text').then((xml: string) => {
                  const items = xml.match(/<t[^>]*>([^<]+)<\/t>/g) || []
                  strings.push(...items.map((s: string) => s.replace(/<[^>]+>/g, '')))
                })
              )
              Promise.all(promises).then(() => {
                if (strings.length > 0) texts.push(`[Excel 表格, ${strings.length} 个文本值]\n${strings.slice(0, 200).join(' | ')}`)
              })
            }

            Promise.all(promises).then(() => {
              const result = texts.join('\n\n')
              resolve(result.slice(0, maxLen) + (result.length > maxLen ? `\n...(共 ${result.length} 字符, 已截断)` : ''))
            }).catch(reject)
          }).catch(reject)
        })
      }

      // PDF
      if (ext === '.pdf') {
        const { PDFParse } = require('pdf-parse')
        const buffer = fs.readFileSync(filePath)
        return new Promise((resolve) => {
          ;(async () => {
            try {
              const parser = new PDFParse({ data: buffer })
              const info = await parser.getInfo()
              const textResult = await parser.getText()
              await parser.destroy()
              const text = textResult?.text || '(PDF 无文字内容)'
              const numPages = info?.total || 0
              const header = numPages ? `[PDF ${numPages} 页]\n\n` : '[PDF]\n\n'
              resolve(header + text.slice(0, maxLen) + (text.length > maxLen ? `\n...(共 ${text.length} 字符, 已截断)` : ''))
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : String(e)
              resolve(`PDF 解析失败: ${msg}\n路径: ${filePath}\n大小: ${(stat.size / 1024).toFixed(1)} KB`)
            }
          })()
        })
      }

      return `不支持的文档格式: ${ext}\n支持: .docx .pptx .xlsx .pdf .txt .md .csv .json .html`
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `文档读取失败: ${msg}`
    }
  },
})

// ── read_image_content — OCR 识别图片中的文字 ──
registerTool({
  name: 'read_image_content',
  description: '使用 OCR 识别图片中的文字内容（中文+英文）。支持 png/jpg 等常见格式。',
  parameters: {
    path: '图片绝对路径',
    language: '识别语言（默认 chi_sim+eng，可选 eng/jpn/kor）',
  },
  permission: 1,
  parallelSafe: true,
  domains: ['office', 'code', 'creative'],
  execute(params) {
    try {
      const filePath = params.path
      if (!filePath || !fs.existsSync(filePath)) return `图片不存在: ${filePath}`
      const lang = params.language || 'chi_sim+eng'
      const ext = path.extname(filePath).toLowerCase()
      if (!['.png', '.jpg', '.jpeg', '.bmp', '.webp', '.tiff'].includes(ext)) {
        return `不支持的图片格式: ${ext}。支持: png, jpg, bmp, webp, tiff`
      }

      const Tesseract = require('tesseract.js')
      return new Promise((resolve) => {
        Tesseract.recognize(filePath, lang, {
          logger: (m: any) => { /* silent */ }
        }).then((result: any) => {
          const text = result.data.text || ''
          if (!text.trim()) resolve('图片中未识别到文字。请确认: 1) 图片包含清晰的文字 2) 文字为中文或英文')
          else {
            const confidence = Math.round((result.data.confidence || 0))
            resolve(`[OCR 识别, 置信度 ${confidence}%]\n\n${text.trim()}`)
          }
        }).catch((err: any) => {
          resolve(`OCR 识别失败: ${err.message}\n\n请确保图片可正常打开。首次使用需下载中文语言包(~12MB)。`)
        })
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `图片识别失败: ${msg}`
    }
  },
})

// ── MultiEdit — batch string replacements on a single file ──
registerTool({
  name: 'multi_edit',
  description: '对同一文件执行批量字符串替换（原子操作）。每个编辑项包含 old_string 和 new_string。',
  parameters: {
    path: '目标文件的绝对路径',
    edits: '编辑项数组，每项格式: [{old_string: "旧文本", new_string: "新文本", replace_all: false}]，replace_all=true 替换全部出现',
  },
  permission: 2,
  domains: ['office', 'code', 'creative'],
  execute(params) {
    try {
      const filePath = params.path
      if (!filePath || !fs.existsSync(filePath)) return `文件不存在: ${filePath}`
      let content = fs.readFileSync(filePath, 'utf-8')
      const edits: Array<{ old_string: string; new_string: string; replace_all?: boolean }> =
        Array.isArray(params.edits) ? params.edits : (params.edits ? JSON.parse(params.edits) : [])

      if (edits.length === 0) return '未提供编辑项'
      let changed = 0
      for (const edit of edits) {
        if (!edit.old_string || edit.old_string === edit.new_string) continue
        if (edit.replace_all) {
          const escaped = edit.old_string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const count = (content.match(new RegExp(escaped, 'g')) || []).length
          content = content.split(edit.old_string).join(edit.new_string)
          changed += count
        } else {
          const idx = content.indexOf(edit.old_string)
          if (idx === -1) return `未找到匹配: ${edit.old_string.slice(0, 50)}`
          content = content.slice(0, idx) + edit.new_string + content.slice(idx + edit.old_string.length)
          changed++
        }
      }
      if (changed > 0) {
        fs.writeFileSync(filePath, content, 'utf-8')
        return `文件 ${path.basename(filePath)} 已更新: ${changed} 处修改`
      }
      return '文件无变化'
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `批量编辑失败: ${msg}`
    }
  },
})

// ── ImageEdit — edit an existing image based on text instructions (uses sharp, bundled) ──
registerTool({
  name: 'image_edit',
  description: '根据文本指令编辑已有图片。内建 sharp 引擎，无需额外安装。支持: resize/crop/grayscale/rotate/blur/sharpen/flip/format/compress',
  parameters: {
    path: '源图片绝对路径',
    instruction: '编辑指令（如: "resize 800x600"、"crop 100,100,500,400"、"grayscale"、"rotate 90"、"format png"、"flip"）',
    output: '输出路径（可选，留空自动加 _edited 后缀）',
  },
  permission: 2,
  domains: ['office', 'code', 'creative'],
  execute(params) {
    try {
      const srcPath = params.path
      if (!srcPath || !fs.existsSync(srcPath)) return `图片不存在: ${srcPath}`
      const output = params.output || srcPath.replace(/(\.\w+)$/, '_edited$1')
      const instruction = (params.instruction || '').trim().toLowerCase()

      const ext = path.extname(srcPath).toLowerCase()
      const supported = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.tiff', '.avif']
      if (!supported.includes(ext)) return `不支持的格式: ${ext}。支持: ${supported.join(', ')}`

      const sharp = require('sharp')
      let pipeline = sharp(srcPath)

      if (instruction.includes('resize') || /\d+x\d+/.test(instruction)) {
        const m = instruction.match(/(\d+)\s*x\s*(\d+)/)
        if (m) pipeline = pipeline.resize(parseInt(m[1]), parseInt(m[2]), { fit: 'fill' })
        else {
          const m2 = instruction.match(/(\d+)/)
          if (m2) pipeline = pipeline.resize(parseInt(m2[1]))
        }
      }

      if (instruction.includes('grayscale') || instruction.includes('gray') || instruction.includes('黑白')) {
        pipeline = pipeline.grayscale()
      }

      if (instruction.includes('rotate')) {
        const m = instruction.match(/(\d+)/)
        pipeline = pipeline.rotate(m ? parseInt(m[1]) : 90, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      }

      if (instruction.includes('crop')) {
        const nums = instruction.match(/\d+/g)
        if (nums && nums.length >= 4) {
          pipeline = pipeline.extract({ left: parseInt(nums[0]), top: parseInt(nums[1]), width: parseInt(nums[2]), height: parseInt(nums[3]) })
        }
      }

      if (instruction.includes('blur')) {
        const m = instruction.match(/[\d.]+/)
        pipeline = pipeline.blur(m ? parseFloat(m[0]) : 5)
      }

      if (instruction.includes('sharpen')) {
        pipeline = pipeline.sharpen()
      }

      if (instruction.includes('flip')) {
        pipeline = pipeline.flip()
      }
      if (instruction.includes('flop') || instruction.includes('mirror')) {
        pipeline = pipeline.flop()
      }

      if (instruction.includes('normalize')) {
        pipeline = pipeline.normalize()
      }

      if (instruction.includes('format') || instruction.includes('convert')) {
        const fmtMatch = instruction.match(/format\s+(\w+)|convert\s+to\s+(\w+)/)
        const fmt = fmtMatch ? (fmtMatch[1] || fmtMatch[2]) : null
        if (fmt) pipeline = pipeline.toFormat(fmt)
      }

      if (instruction.includes('compress') || instruction.includes('quality')) {
        const qMatch = instruction.match(/(\d+)/)
        const quality = qMatch ? parseInt(qMatch[1]) : 80
        if (ext === '.png') pipeline = pipeline.png({ quality, compressionLevel: 9 })
        else pipeline = pipeline.jpeg({ quality })
      }

      // Build pipeline and execute
      return new Promise((resolve) => {
        pipeline.toFile(output, (err: any, info: any) => {
          if (err) resolve(`图片编辑失败: ${err.message}`)
          else resolve(`图片编辑完成: ${output}\n操作: ${instruction}\n尺寸: ${info.width}x${info.height}, 格式: ${info.format}`)
        })
      }) as any
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `图片编辑失败: ${msg}`
    }
  },
})

// ── NotebookRead — 读取 Jupyter Notebook (.ipynb) 内容 ──
registerTool({
  name: 'notebook_read',
  description: '读取 Jupyter Notebook (.ipynb) 文件，提取所有 cell 的代码和输出。',
  parameters: {
    path: '.ipynb 文件路径',
    maxCells: '最大返回 cell 数（默认 20）',
  },
  permission: 1,
  parallelSafe: true,
  domains: ['code'],
  execute(params) {
    try {
      const filePath = params.path
      if (!filePath || !fs.existsSync(filePath)) return `文件不存在: ${filePath}`
      const ext = path.extname(filePath).toLowerCase()
      if (ext !== '.ipynb') return `不是 Jupyter Notebook: ${ext}`
      
      const raw = fs.readFileSync(filePath, 'utf-8')
      const nb = JSON.parse(raw)
      const maxCells = parseInt(params.maxCells) || 20
      const cells = nb.cells || []
      
      const parts: string[] = [`[Notebook] ${path.basename(filePath)} (${cells.length} cells)\n`]
      
      for (let i = 0; i < Math.min(cells.length, maxCells); i++) {
        const cell = cells[i]
        const type = cell.cell_type === 'code' ? 'Code' : 'Markdown'
        const source = Array.isArray(cell.source) ? cell.source.join('') : (cell.source || '')
        
        parts.push(`[${type} #${i + 1}]`)
        parts.push(source.slice(0, 2000))
        
        if (cell.outputs && cell.outputs.length > 0) {
          const outputs: string[] = []
          for (const out of cell.outputs) {
            if (out.text) outputs.push(Array.isArray(out.text) ? out.text.join('') : out.text)
            else if (out.data?.['text/plain']) outputs.push(String(out.data['text/plain']))
            else if (out.data?.['text/html']) outputs.push('[HTML 输出]')
            else if (out.name === 'stderr') outputs.push(`[stderr] ${out.text || ''}`)
          }
          if (outputs.length > 0) {
            parts.push(`  → 输出: ${outputs.map(o => o.slice(0, 500)).join('\n')}`)
          }
        }
        parts.push('')
      }
      
      if (cells.length > maxCells) {
        parts.push(`...(共 ${cells.length} cells, 仅显示前 ${maxCells})`)
      }
      
      return parts.join('\n')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `Notebook 读取失败: ${msg}`
    }
  },
})

// ── WaitForMcpServers — 等待 MCP 服务器就绪 ──
registerTool({
  name: 'wait_for_mcp',
  description: '等待指定的 MCP 服务器连接就绪，用于确保后续工具调用时有可用的外部服务。',
  parameters: {
    servers: '要等待的服务器名，逗号分隔。如 "github,feishu"',
    timeout: '超时秒数（默认 30）',
  },
  permission: 1,
  parallelSafe: false,
  domains: ['office', 'code', 'creative'],
  execute(params) {
    try {
      const names = (params.servers || '').split(',').map((s: string) => s.trim()).filter(Boolean)
      if (names.length === 0) return '未指定服务器名'
      
      // Dynamic require to avoid circular deps
      const { getAllServerStatus } = require('./mcp-client')
      const status = getAllServerStatus()
      
      const results: string[] = []
      let allReady = true
      for (const name of names) {
        const s = status[name] || 'unknown'
        if (s === 'connected' || s === 'builtin') {
          results.push(`  ✓ ${name}: 已就绪`)
        } else {
          results.push(`  ✗ ${name}: ${s}`)
          allReady = false
        }
      }
      
      if (allReady) {
        return `所有 MCP 服务器已就绪:\n${results.join('\n')}`
      }
      return `部分服务器未就绪:\n${results.join('\n')}\n\n建议: 1) 检查连接器页面配置 2) 确认外部服务可访问 3) 稍后重试`
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `MCP 状态查询失败: ${msg}`
    }
  },
})

// ── Workflow — 工作流编排执行 ──
registerTool({
  name: 'workflow',
  description: '按顺序执行多步工作流。每步是一个工具调用，支持条件跳转。',
  parameters: {
    name: '工作流名称',
    steps: '步骤数组 JSON: [{"tool":"read_file","params":{"path":"x.txt"},"description":"读取文件"}]',
  },
  permission: 2,
  domains: ['office', 'code', 'creative'],
  execute(params) {
    try {
      const name = params.name || 'unnamed'
      let steps: Array<{ tool: string; params: Record<string, any>; description?: string }> = []
      try {
        steps = Array.isArray(params.steps) ? params.steps : JSON.parse(params.steps || '[]')
      } catch { return '无效的步骤格式，需要 JSON 数组' }

      if (steps.length === 0) return '工作流没有步骤'

      const plan = steps.map((s, i) => `  ${i + 1}. ${s.description || s.tool}`).join('\n')
      return `[工作流: ${name}] (${steps.length} 步)

执行计划:
${plan}

请按顺序依次执行以上步骤。每步完成后汇报结果，再执行下一步。`
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `工作流创建失败: ${msg}`
    }
  },
})

// ── SlashCommand — register and execute custom slash commands ──
const slashCommands = new Map<string, { prompt: string; description: string }>()

slashCommands.set('review', { description: '审查当前代码/文档', prompt: '请审查以下内容，关注质量、安全性和可维护性:' })
slashCommands.set('explain', { description: '解释选中的代码/文本', prompt: '请详细解释以下内容:' })
slashCommands.set('fix', { description: '修复代码问题', prompt: '请修复以下代码中的问题:' })
slashCommands.set('optimize', { description: '优化代码性能', prompt: '请优化以下代码的性能:' })
slashCommands.set('translate', { description: '翻译为中文', prompt: '请将以下内容翻译为中文:' })
slashCommands.set('summarize', { description: '总结内容要点', prompt: '请用3-5点总结以下内容:' })

registerTool({
  name: 'slash_command',
  description: '执行自定义斜杠命令。内置: /review /explain /fix /optimize /translate /summarize',
  parameters: {
    command: '命令名（不含 /）',
    content: '要处理的内容（可选，填了直接返回组合指令；不填返回命令前缀）',
  },
  permission: 1,
  parallelSafe: true,
  domains: ['office', 'code', 'creative'],
  execute(params) {
    const cmd = slashCommands.get(params.command)
    if (!cmd) {
      return `未知命令: /${params.command}\n可用: ${[...slashCommands.keys()].map(k => '/' + k).join(', ')}`
    }
    return params.content ? `${cmd.prompt}\n\n${params.content}` : cmd.prompt
  },
})

// ── Team Management ──
interface TeamMember { name: string; role: string; prompt: string }

const activeTeams = new Map<string, { members: TeamMember[]; messages: Array<{ from: string; to: string; content: string }> }>()

registerTool({
  name: 'team_create',
  description: '创建 Agent 协作团队。成员各有角色，通过 send_message 协调工作。默认含 pm/dev/review 三角色。',
  parameters: {
    name: '团队名称',
    members: '自定义成员数组（可选），格式 [{name, role, prompt}]。留空使用默认三角色。',
  },
  permission: 2,
  domains: ['office', 'code', 'creative'],
  execute(params) {
    try {
      const name = params.name
      if (!name) return '团队名称不能为空'
      if (activeTeams.has(name)) return `团队 "${name}" 已存在`

      let members: TeamMember[] = []
      try {
        members = Array.isArray(params.members) ? params.members : (params.members ? JSON.parse(params.members) : [])
      } catch { members = [] }
      
      if (members.length === 0) {
        members = [
          { name: 'pm', role: '项目经理', prompt: '负责任务分解、需求分析和进度跟踪' },
          { name: 'dev', role: '开发工程师', prompt: '负责编写代码和实现功能' },
          { name: 'review', role: '代码审查员', prompt: '负责审查代码质量和安全性' },
        ]
      }

      activeTeams.set(name, { members, messages: [] })
      const list = members.map(m => `  ${m.name} (${m.role})`).join('\n')
      return `团队 "${name}" 已创建:\n${list}\n\n使用 send_message 向队友发送消息。`
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `创建团队失败: ${msg}`
    }
  },
})

registerTool({
  name: 'team_delete',
  description: '删除 Agent 协作团队。',
  parameters: { name: '团队名称' },
  permission: 2,
  domains: ['office', 'code', 'creative'],
  execute(params) {
    if (!activeTeams.has(params.name)) return `团队 "${params.name}" 不存在`
    activeTeams.delete(params.name)
    return `团队 "${params.name}" 已删除`
  },
})

registerTool({
  name: 'send_message',
  description: '在团队内向指定队友发送消息，协调多代理工作。',
  parameters: {
    team: '团队名称',
    to: '接收者名（团队成员 name）',
    content: '消息内容',
  },
  permission: 1,
  domains: ['office', 'code', 'creative'],
  execute(params) {
    const team = activeTeams.get(params.team)
    if (!team) return `团队 "${params.team}" 不存在`
    const to = team.members.find(m => m.name === params.to)
    if (!to) return `成员 "${params.to}" 不在团队中。成员: ${team.members.map(m => m.name).join(', ')}`

    team.messages.push({ from: 'ai', to: params.to, content: params.content })

    // If API config available, spawn sub-agent to execute the teammate's task
    if (currentApiConfig) {
      const subTools = getAllTools()
        .filter(t => t.permission <= 2 && t.name !== 'spawn_agent' && t.name !== 'send_message')
        .map(t => ({ name: t.name, description: t.description, permission: t.permission, execute: t.execute }))

      spawnSubAgent({
        apiKey: currentApiConfig.apiKey, model: currentApiConfig.model,
        apiUrl: currentApiConfig.apiUrl,
        task: `${to.role} (${to.name}) 收到任务: ${params.content}`,
        tools: subTools,
      }).then(result => {
        team.messages.push({ from: to.name, to: 'ai', content: result.slice(0, 2000) })
      }).catch(() => {})

      return `已向 ${to.role} (${to.name}) 分派任务，正在异步执行...\n\n任务: ${params.content}`
    }

    return `[${to.role} - ${to.name}]\n任务: ${params.content}\n\n(需配置 API Key 以启用自动执行)`
  },
})

// ── StructuredOutput — JSON Schema 约束输出 ──
registerTool({
  name: 'structured_output',
  description: '要求 AI 按 JSON Schema 返回结构化数据。约束后续回复为纯 JSON。',
  parameters: {
    schema: 'JSON Schema 定义字符串或对象。如 {"type":"object","properties":{"name":{"type":"string"}},"required":["name"]}',
  },
  permission: 1,
  parallelSafe: true,
  domains: ['office', 'code', 'creative'],
  execute(params) {
    const schema = typeof params.schema === 'string' ? params.schema : JSON.stringify(params.schema)
    return `请严格按照以下 JSON Schema 输出，只返回 JSON 对象，不要加 markdown 包装:

Schema:
${schema}

规则:
- 只输出 JSON，不要用 \`\`\`json 包裹
- 不要输出解释性文字
- 所有 required 字段必须存在`
  },
})
