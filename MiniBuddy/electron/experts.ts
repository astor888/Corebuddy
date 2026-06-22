// Expert Manager — loads expert packages from {userData}/corebuddy-experts/
// Each expert is a directory with plugin.json + agents/xxx.md
// Built-in experts are defined inline so they work without file copies.

import path from 'path'
import fs from 'fs'
import { app } from 'electron'

export interface ExpertInfo {
  id: string
  name: string
  displayName: string
  description: string
  category: string
  icon: string
  tags: string[]
  quickPrompts: string[]
  agentMd: string
  version: string
  author: string
  builtin: boolean
}

// Currently active expert (only one can be active at a time)
let activeExpert: ExpertInfo | null = null

/** Get the currently active expert */
export function getActiveExpert(): ExpertInfo | null {
  return activeExpert
}

/** Set the active expert */
export function setActiveExpert(expert: ExpertInfo | null) {
  activeExpert = expert
}

// ── Built-in Experts ──
const BUILTIN_EXPERTS: ExpertInfo[] = [
  {
    id: 'code-reviewer',
    name: 'code-reviewer',
    displayName: '代码审查专家',
    description: '专业的代码审查助手，帮你发现潜在 Bug、安全隐患和性能问题',
    category: '开发',
    icon: '🔍',
    tags: ['代码审查', '安全', '性能', '最佳实践'],
    quickPrompts: ['审查这段代码', '检查安全问题', '优化建议'],
    agentMd: '# 代码审查专家\n\n你是一位资深代码审查专家，精通多种编程语言和框架。\n\n审查时请关注：\n1. 安全漏洞（注入攻击、XSS、敏感信息泄露等）\n2. 逻辑错误和边界条件\n3. 性能瓶颈\n4. 代码可维护性\n5. 最佳实践遵循\n\n输出格式：按严重程度排序，给出具体问题和修复建议。',
    version: '1.0.0',
    author: 'CoreBuddy',
    builtin: true,
  },
  {
    id: 'ui-designer',
    name: 'ui-designer',
    displayName: 'UI 设计师',
    description: '帮你优化界面设计，提供用户体验建议和视觉方案',
    category: '设计',
    icon: '🎨',
    tags: ['UI', 'UX', '设计', '视觉', '交互'],
    quickPrompts: ['设计一个登录页面', '优化这个组件的 UI', '提供配色方案'],
    agentMd: '# UI 设计师\n\n你是一位经验丰富的 UI/UX 设计师。\n\n工作方式：\n1. 先了解用户场景和目标用户\n2. 提供多个设计方向供选择\n3. 关注交互细节和视觉一致性\n4. 考虑无障碍访问\n\n可以生成 HTML/CSS 原型、设计规范文档、组件库建议。',
    version: '1.0.0',
    author: 'CoreBuddy',
    builtin: true,
  },
  {
    id: 'data-analyst',
    name: 'data-analyst',
    displayName: '数据分析师',
    description: '帮你分析数据、生成图表、撰写分析报告',
    category: '数据分析',
    icon: '📊',
    tags: ['数据分析', '可视化', '报告', '统计'],
    quickPrompts: ['分析这份数据', '生成可视化图表', '写一份分析报告'],
    agentMd: '# 数据分析师\n\n你是一位资深数据分析师，擅长从数据中提取洞察。\n\n能力：\n1. 数据清洗和预处理\n2. 统计分析和趋势发现\n3. 可视化图表生成\n4. 分析报告撰写\n\n使用 Python/pandas 进行数据处理，matplotlib/echarts 生成图表。',
    version: '1.0.0',
    author: 'CoreBuddy',
    builtin: true,
  },
  {
    id: 'content-writer',
    name: 'content-writer',
    displayName: '内容创作者',
    description: '帮你撰写高质量文章、文案、营销内容',
    category: '办公',
    icon: '✍️',
    tags: ['写作', '文案', '内容', '营销', '公众号'],
    quickPrompts: ['写一篇公众号文章', '优化产品文案', '生成营销方案'],
    agentMd: '# 内容创作者\n\n你是一位专业内容创作者，擅长各类文体写作。\n\n写作前先确认：\n1. 目标受众和场景\n2. 风格和语调\n3. 篇幅和格式要求\n\n支持：公众号文章、产品文案、技术文档、营销方案、演讲稿等。',
    version: '1.0.0',
    author: 'CoreBuddy',
    builtin: true,
  },
  {
    id: 'project-manager',
    name: 'project-manager',
    displayName: '项目规划师',
    description: '帮你做项目规划、任务拆解、进度管理',
    category: '办公',
    icon: '📋',
    tags: ['项目管理', '规划', '任务', '进度'],
    quickPrompts: ['制定项目计划', '拆解任务', '评估风险'],
    agentMd: '# 项目规划师\n\n你是一位经验丰富的项目经理。\n\n工作方式：\n1. 先了解项目目标和约束\n2. 拆解为可执行的任务\n3. 评估风险并给出预案\n4. 制定里程碑和时间线\n\n输出：WBS 工作分解、甘特图、风险矩阵。',
    version: '1.0.0',
    author: 'CoreBuddy',
    builtin: true,
  },
]

/** Get all installed experts (built-in + user-installed) */
export function getAllExperts(): ExpertInfo[] {
  const userExperts = loadUserExperts()
  return [...BUILTIN_EXPERTS, ...userExperts]
}

function loadUserExperts(): ExpertInfo[] {
  const dir = getExpertDir()
  if (!fs.existsSync(dir)) return []

  const experts: ExpertInfo[] = []
  try {
    const entries = fs.readdirSync(dir)
    for (const entry of entries) {
      const expertDir = path.join(dir, entry)
      if (!fs.statSync(expertDir).isDirectory()) continue
      
      const pluginJsonPath = path.join(expertDir, 'plugin.json')
      if (!fs.existsSync(pluginJsonPath)) continue

      try {
        const expert = loadExpertFromDir(expertDir, entry)
        if (expert) experts.push(expert)
      } catch (e) {
        console.error(`Failed to load expert "${entry}":`, e)
      }
    }
  } catch (e) {
    console.error('Failed to scan expert directory:', e)
  }
  
  return experts
}

function loadExpertFromDir(expertDir: string, id: string): ExpertInfo | null {
  const pluginJsonPath = path.join(expertDir, 'plugin.json')
  const manifest = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf-8'))
  
  // Resolve agent MD path — 安全检查防止路径穿越
  const agentPath = manifest.agents?.[0]
  let agentMd = ''
  if (agentPath) {
    const fullPath = path.resolve(expertDir, agentPath)
    if (fullPath.startsWith(path.resolve(expertDir)) && fs.existsSync(fullPath)) {
      agentMd = fs.readFileSync(fullPath, 'utf-8')
    }
  }

  return {
    id,
    name: manifest.name || id,
    displayName: manifest.displayName?.zh || manifest.displayName?.en || manifest.name || id,
    description: manifest.displayDescription?.zh || manifest.displayDescription?.en || manifest.description || '',
    category: manifest.categoryId || '未分类',
    icon: manifest.avatar ? (() => {
      const avatarPath = path.resolve(expertDir, manifest.avatar)
      return avatarPath.startsWith(path.resolve(expertDir)) ? `file://${avatarPath}` : '🧠'
    })() : '🧠',
    tags: (manifest.tags || []).map((t: any) => t.zh || t.en || ''),
    quickPrompts: (manifest.quickPrompts || []).map((q: any) => q.zh || q.en || ''),
    agentMd,
    version: manifest.version || '1.0.0',
    author: manifest.author || '',
    builtin: false,
  }
}

function getExpertDir(): string {
  return path.join(app.getPath('userData'), 'corebuddy-experts')
}

/** Get expert directory path for external use */
export function getExpertDirPath(): string {
  return getExpertDir()
}

/** Seed built-in experts from the project's seed directory (if available) */
export function seedBuiltinExperts() {
  const targetDir = getExpertDir()
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }

  // Copy seed experts from the project's seed directory
  try {
    const seedDir = path.join(__dirname, 'experts-seed')
    if (!fs.existsSync(seedDir)) return

    const entries = fs.readdirSync(seedDir)
    for (const entry of entries) {
      const sourceDir = path.join(seedDir, entry)
      if (!fs.statSync(sourceDir).isDirectory()) continue

      const targetExpertDir = path.join(targetDir, entry)
      if (fs.existsSync(targetExpertDir)) continue // Already exists

      copyDirSync(sourceDir, targetExpertDir)
      console.log(`Seeded expert files: ${entry}`)
    }
  } catch (e) {
    console.error('Failed to copy seed experts:', e)
  }
}

function copyDirSync(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}
