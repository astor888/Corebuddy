// ═══════════════════════════════════════════════════════════════════════
// Pipeline 注册系统 — 用户自定义工作流
// 从 {userData}/corebuddy-data/pipelines/ 加载 .json 文件
// 每个 .json 文件定义一个 PipelineDefinition
// ═══════════════════════════════════════════════════════════════════════

import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import type { PipelineDefinition, AgentRole } from './pipeline'

const PIPELINES_DIR = path.join(app.getPath('userData'), 'corebuddy-data', 'pipelines')
const ROLES_DIR = path.join(app.getPath('userData'), 'corebuddy-data', 'agent-roles')

/** 已注册的用户自定义 Pipeline */
const userPipelines: PipelineDefinition[] = []
/** 已注册的用户自定义 AgentRole */
const userRoles: AgentRole[] = []

/**
 * 初始化 Pipeline 注册表
 * 服务启动时调用一次
 */
export function initPipelineRegistry(): void {
  // 确保目录存在并创建示例文件
  ensureDirectories()
  // 加载已有的 Pipeline 和 Role 定义
  loadUserPipelines()
  loadUserRoles()
}

/**
 * 获取所有可用 Pipeline（内置 + 用户自定义）
 * 用户自定义优先级高于内置
 */
export function getAllPipelines(): PipelineDefinition[] {
  return [...userPipelines]
}

/**
 * 获取所有可用 AgentRole（内置 + 用户自定义）
 * 用户自定义优先级高于内置
 */
export function getAllRoles(): AgentRole[] {
  return [...userRoles]
}

/**
 * 注册一个新的用户 Pipeline（直接传入对象）
 */
export function registerUserPipeline(pipeline: PipelineDefinition): void {
  const existing = userPipelines.findIndex(p => p.id === pipeline.id)
  if (existing >= 0) {
    userPipelines[existing] = pipeline
  } else {
    userPipelines.push(pipeline)
  }
  // 保存到文件
  savePipelineToFile(pipeline)
}

/**
 * 注册一个新的用户 AgentRole
 */
export function registerUserRole(role: AgentRole): void {
  const existing = userRoles.findIndex(r => r.name === role.name)
  if (existing >= 0) {
    userRoles[existing] = role
  } else {
    userRoles.push(role)
  }
  saveRoleToFile(role)
}

/**
 * 删除一个用户 Pipeline
 */
export function deleteUserPipeline(pipelineId: string): boolean {
  const idx = userPipelines.findIndex(p => p.id === pipelineId)
  if (idx < 0) return false
  userPipelines.splice(idx, 1)
  // 删除对应的文件
  const filePath = path.join(PIPELINES_DIR, `${pipelineId}.json`)
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {}
  return true
}

/**
 * 删除一个用户 AgentRole
 */
export function deleteUserRole(roleName: string): boolean {
  const idx = userRoles.findIndex(r => r.name === roleName)
  if (idx < 0) return false
  userRoles.splice(idx, 1)
  const filePath = path.join(ROLES_DIR, `${roleName}.json`)
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {}
  return true
}

// ── 内部实现 ──

function ensureDirectories(): void {
  // 创建 pipelines 目录
  if (!fs.existsSync(PIPELINES_DIR)) {
    fs.mkdirSync(PIPELINES_DIR, { recursive: true })
    createSamplePipeline()
  }
  // 创建 agent-roles 目录
  if (!fs.existsSync(ROLES_DIR)) {
    fs.mkdirSync(ROLES_DIR, { recursive: true })
    createSampleRole()
  }
}

let loadingErrors: string[] = []

export function getLoadingErrors(): string[] {
  return loadingErrors
}

function loadUserPipelines(): void {
  loadingErrors = []
  try {
    const files = fs.readdirSync(PIPELINES_DIR)
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const fullPath = path.join(PIPELINES_DIR, file)
      try {
        const content = fs.readFileSync(fullPath, 'utf-8')
        const parsed = JSON.parse(content) as PipelineDefinition
        // 基本校验
        if (!parsed.id || !parsed.name || !Array.isArray(parsed.stages)) {
          const msg = `Pipeline ${file}: 缺少必要字段 (id/name/stages)`
          console.error(msg)
          loadingErrors.push(msg)
          continue
        }
        userPipelines.push(parsed)
        console.log(`User pipeline loaded: ${parsed.name} (${parsed.id})`)
      } catch (e: unknown) {
        const msg = `Failed to load pipeline ${file}: ${e instanceof Error ? e.message : String(e)}`
        console.error(msg)
        loadingErrors.push(msg)
      }
    }
  } catch (e: unknown) {
    const msg = `Failed to scan pipelines dir: ${e instanceof Error ? e.message : String(e)}`
    console.error(msg)
    loadingErrors.push(msg)
  }
}

function loadUserRoles(): void {
  try {
    const files = fs.readdirSync(ROLES_DIR)
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const fullPath = path.join(ROLES_DIR, file)
      try {
        const content = fs.readFileSync(fullPath, 'utf-8')
        const parsed = JSON.parse(content) as AgentRole
        if (!parsed.name || !parsed.displayName || !parsed.prompt) {
          console.error(`Role ${file}: 缺少必要字段 (name/displayName/prompt)`)
          continue
        }
        userRoles.push(parsed)
        console.log(`User role loaded: ${parsed.displayName} (${parsed.name})`)
      } catch (e: unknown) {
        console.error(`Failed to load role ${file}:`, e instanceof Error ? e.message : String(e))
      }
    }
  } catch (e: unknown) {
    console.error('Failed to scan roles dir:', e instanceof Error ? e.message : String(e))
  }
}

function savePipelineToFile(pipeline: PipelineDefinition): void {
  const filePath = path.join(PIPELINES_DIR, `${pipeline.id}.json`)
  try {
    fs.writeFileSync(filePath, JSON.stringify(pipeline, null, 2), 'utf-8')
  } catch (e: unknown) {
    console.error(`Failed to save pipeline ${pipeline.id}:`, e instanceof Error ? e.message : String(e))
  }
}

function saveRoleToFile(role: AgentRole): void {
  const filePath = path.join(ROLES_DIR, `${role.name}.json`)
  try {
    fs.writeFileSync(filePath, JSON.stringify(role, null, 2), 'utf-8')
  } catch (e: unknown) {
    console.error(`Failed to save role ${role.name}:`, e instanceof Error ? e.message : String(e))
  }
}

function createSamplePipeline(): void {
  const sample: PipelineDefinition = {
    id: 'weekly-report',
    name: '周报生成',
    description: '收集一周工作内容 → 生成结构化的周报 → 审阅格式',
    triggerPatterns: ['周报', 'weekly', '周报生成'],
    roles: [
      {
        name: 'collector',
        displayName: '信息收集员',
        prompt: `你是 CoreBuddy Pipeline 的"信息收集员"。
你的任务：回顾本周的对话记录和 Git 提交，收集工作要点。
输出格式：按日期列出已完成项和在推进项。`,
        tools: ['search_files', 'read_file'],
        maxTurns: 4,
        allowedSkills: [],
        persona: 'office',
      },
    ],
    systemPrompt: '当前正在执行"周报生成"Pipeline。由三个子 Agent 协作完成。',
    stages: [
      {
        id: 'collect',
        name: '收集信息',
        description: '查看对话记录和提交日志',
        agentRole: 'collector',
        input: '请回顾本周（周一到今天）的工作内容。\n用户需求：{userInput}',
        dependencies: [],
        parallelSafe: false,
        reviewRequired: false,
        retryOnReviewFail: false,
        maxRetries: 1,
        timeoutMs: 120_000,
      },
      {
        id: 'draft',
        name: '写周报',
        description: '生成周报初稿',
        agentRole: 'writer',
        input: '基于收集到的信息，撰写格式规范的周报。\n信息：{collect.output}\n用户需求：{userInput}',
        dependencies: ['collect'],
        parallelSafe: false,
        reviewRequired: false,
        retryOnReviewFail: false,
        maxRetries: 1,
        timeoutMs: 180_000,
      },
      {
        id: 'review',
        name: '审阅',
        description: '检查周报格式和内容完整性',
        agentRole: 'reviewer',
        input: '审阅以下周报的格式和内容。\n周报：{draft.output}',
        dependencies: ['draft'],
        parallelSafe: false,
        reviewRequired: true,
        retryOnReviewFail: true,
        maxRetries: 2,
        timeoutMs: 60_000,
      },
    ],
  }

  try {
    fs.writeFileSync(
      path.join(PIPELINES_DIR, 'weekly-report.json'),
      JSON.stringify(sample, null, 2),
      'utf-8'
    )
  } catch {}
}

function createSampleRole(): void {
  const sample: AgentRole = {
    name: 'translator',
    displayName: '翻译官',
    prompt: `你是 CoreBuddy Pipeline 的"翻译官"(Translator Agent)。
你的任务：将输入内容翻译成目标语言。
- 保持原文格式和排版
- 注意专业术语的准确性
- 输出可读性优先，不要逐词翻译`,
    tools: ['read_file', 'write_file'],
    maxTurns: 3,
    allowedSkills: [],
    persona: 'office',
  }

  try {
    fs.writeFileSync(
      path.join(ROLES_DIR, 'translator.json'),
      JSON.stringify(sample, null, 2),
      'utf-8'
    )
  } catch {}
}
