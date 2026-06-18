// ═══════════════════════════════════════════════════════════════════════
// Pipeline 编排引擎 — 多 Agent 协作层
// 把复杂任务拆成多个 Stage，每个 Stage 派专门的 Sub-Agent 执行
// 支持顺序/并行/条件跳转，ReviewAgent 做质量门禁
// ═══════════════════════════════════════════════════════════════════════

import { getTool, getAllTools } from './tool-registry'
import type { SubAgentConfig } from './sub-agent'
import { spawnSubAgent } from './sub-agent'
import { getActiveSkillsPromptForAgent } from './plugins'
import { getAllPipelines, getAllRoles } from './pipeline-registry'

// ── 核心类型定义 ──

/** Agent 角色 — 决定 Sub-Agent 的 Prompt 和可用工具 */
export interface AgentRole {
  name: string                    // 'planner' | 'researcher' | 'writer' | 'reviewer' | 'executor'
  displayName: string             // 中文名，如"规划师"、"研究员"
  prompt: string                  // 角色 system prompt
  tools: string[]                 // 该角色可用的工具名列表（空=全部可用）
  maxTurns: number                // 最大工具调用轮次
  allowedSkills: string[]         // 注入哪些技能的 tag 列表
  persona?: 'office' | 'creative' // 办公/创意风格
}

/** Stage 定义 — Pipeline 中的一步 */
export interface StageDefinition {
  id: string                      // 唯一标识
  name: string                    // 中文名
  description: string             // 描述
  agentRole: string               // 关联的 AgentRole 名称
  input: string                   // 给 sub-agent 的任务描述（模板，可引用上一步输出）
  dependencies: string[]          // 依赖的 stage id 列表（空=无依赖）
  parallelSafe: boolean           // 是否可与同级的其他 stage 并行
  reviewRequired: boolean         // 是否需要 review 才能进入下一步
  retryOnReviewFail: boolean      // review 不通过时是否重试
  maxRetries: number              // 最大重试次数
  timeoutMs: number               // 该 stage 超时时间
}

/** Pipeline 定义 — 一个完整的工作流 */
export interface PipelineDefinition {
  id: string                      // 唯一标识
  name: string                    // 中文名
  description: string             // 描述
  triggerPatterns: string[]       // 触发关键词（用户输入匹配到这些就启动此 pipeline）
  stages: StageDefinition[]       // 所有 stage
  roles: AgentRole[]              // 该 pipeline 用到的所有 agent 角色
  systemPrompt: string            // pipeline 额外的 system prompt
}

/** Stage 执行状态 */
export type StageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'reviewing'

/** Stage 运行时状态 */
export interface StageRunState {
  id: string
  status: StageStatus
  output: string                  // sub-agent 的输出
  error?: string
  retryCount: number
  startedAt?: number
  completedAt?: number
  reviewResult?: ReviewResult
  artifactPath?: string
}

/** Review 结果 */
export interface ReviewResult {
  passed: boolean
  feedback: string
  suggestions: string[]
}

/** 完整的 Pipeline 运行实例 */
export interface PipelineRun {
  pipelineId: string
  runId: string
  status: 'initializing' | 'running' | 'paused' | 'completed' | 'failed' | 'review_blocked'
  stages: Map<string, StageRunState>
  context: Record<string, string>   // stage id → stage output 的引用
  input: string                     // 用户的原始输入
  startedAt: number
  completedAt?: number
  currentStageId?: string
  error?: string
}

// ── 内置 Agent Role 定义 ──

const BUILTIN_ROLES: Record<string, AgentRole> = {
  planner: {
    name: 'planner',
    displayName: '规划师',
    prompt: `你是 CoreBuddy Pipeline 的"规划师"(Planner Agent)。
你的任务只有一个：**拆解任务**。
收到用户请求后：
1. 分析请求包含几个子任务
2. 确定每个子任务的依赖关系
3. 确定哪些可以并行做，哪些必须串行
4. 输出一个清晰的执行计划

回复格式要求：
- 用结构化 Markdown 输出
- 每个子任务一行：任务名 | 依赖 | 可并行
- 最后给出建议的执行顺序`,
    tools: [],
    maxTurns: 1,
    allowedSkills: [],
    persona: 'office',
  },

  researcher: {
    name: 'researcher',
    displayName: '研究员',
    prompt: `你是 CoreBuddy Pipeline 的"研究员"(Researcher Agent)。
你的任务：**收集和搜索信息**。
- 搜索网络、读取文件、查询数据源
- 整理搜索结果，去重、去噪
- 输出结构化信息摘要
- 如果信息不足，明确标出缺失的部分

规则：
- 不要编造信息。找不到就说找不到。
- 用列表输出，方便下游处理。`,
    tools: ['search_web', 'read_file', 'read_document', 'list_dir', 'search_files', 'read_image_content'],
    maxTurns: 5,
    allowedSkills: [],
    persona: 'office',
  },

  writer: {
    name: 'writer',
    displayName: '写手',
    prompt: `你是 CoreBuddy Pipeline 的"写手"(Writer Agent)。
你的任务：**根据已有信息生成内容**。
- 阅读上游 stage 提供的资料
- 按要求生成文档/代码/报告
- 注意格式规范、语言风格
- 使用工具写入文件

规则：
- 不要搜索新信息，基于已有材料写作
- 使用 create_markdown/create_doc/create_pptx 等工具输出`,
    tools: ['write_file', 'create_markdown', 'create_csv', 'create_doc', 'create_pptx', 'read_file'],
    maxTurns: 5,
    allowedSkills: [],
    persona: 'office',
  },

  executor: {
    name: 'executor',
    displayName: '执行者',
    prompt: `你是 CoreBuddy Pipeline 的"执行者"(Executor Agent)。
你的任务：**动手执行具体操作**。
- 写代码、改文件、运行命令、整理数据
- 遵循明确的指令一步步操作
- 完成后报告结果

规则：
- 不擅自修改计划之外的内容
- 每步操作前确认参数正确
- 出错时给出错误信息，不要隐瞒`,
    tools: ['run_command', 'write_file', 'read_file', 'multi_edit', 'search_files', 'notebook_read', 'image_edit'],
    maxTurns: 8,
    allowedSkills: [],
    persona: 'office',
  },

  reviewer: {
    name: 'reviewer',
    displayName: '审阅师',
    prompt: `你是 CoreBuddy Pipeline 的"审阅师"(Review Agent)。
你的任务：**检查上一阶段产出的质量**。

检查要点：
1. 是否完整？有没有遗漏的关键内容？
2. 是否准确？信息有没有矛盾或错误？
3. 是否符合用户要求？
4. 格式是否正确？
5. 代码能否运行？文档是否结构清晰？

输出格式：
{
  "passed": true/false,
  "feedback": "总体评价",
  "issues": ["问题1", "问题2"],
  "suggestions": ["改进建议1", "改进建议2"]
}

规则：
- 铁面无私。有问题就说有问题，不用怕得罪人。
- 如果是格式问题，指出具体位置。
- 如果是内容问题，给出修改建议。`,
    tools: ['read_file', 'read_document', 'search_files'],
    maxTurns: 3,
    allowedSkills: [],
    persona: 'office',
  },
}

// ── 内置 Pipeline 定义 ──

const BUILTIN_PIPELINES: PipelineDefinition[] = [
  {
    id: 'report',
    name: '报告生成',
    description: '收集信息 → 分析整理 → 撰写报告 → 质量审阅',
    triggerPatterns: ['报告', '调研', '分析', '研究', '报告生成', '写一份', '总结', '周报', '月报'],
    roles: [BUILTIN_ROLES.planner, BUILTIN_ROLES.researcher, BUILTIN_ROLES.writer, BUILTIN_ROLES.reviewer],
    systemPrompt: '当前正在执行"报告生成"Pipeline。我会先规划任务，再分阶段执行。',
    stages: [
      {
        id: 'plan',
        name: '规划任务',
        description: '拆解用户请求，制定执行计划',
        agentRole: 'planner',
        input: '分析以下请求，输出执行计划：\n{userInput}',
        dependencies: [],
        parallelSafe: false,
        reviewRequired: false,
        retryOnReviewFail: false,
        maxRetries: 1,
        timeoutMs: 120_000,
      },
      {
        id: 'research',
        name: '收集资料',
        description: '搜索和整理相关信息',
        agentRole: 'researcher',
        input: '根据计划，收集所需资料。\n计划：{plan.output}\n用户需求：{userInput}',
        dependencies: ['plan'],
        parallelSafe: false,
        reviewRequired: false,
        retryOnReviewFail: false,
        maxRetries: 1,
        timeoutMs: 300_000,
      },
      {
        id: 'draft',
        name: '撰写初稿',
        description: '基于资料生成文档初稿',
        agentRole: 'writer',
        input: '基于以下资料，撰写文档。\n资料：{research.output}\n用户需求：{userInput}',
        dependencies: ['research'],
        parallelSafe: false,
        reviewRequired: false,
        retryOnReviewFail: false,
        maxRetries: 1,
        timeoutMs: 300_000,
      },
      {
        id: 'review',
        name: '质量审阅',
        description: '检查初稿质量',
        agentRole: 'reviewer',
        input: '审阅以下文档，检查质量和完整性。\n文档：{draft.output}\n用户需求：{userInput}',
        dependencies: ['draft'],
        parallelSafe: false,
        reviewRequired: true,
        retryOnReviewFail: true,
        maxRetries: 2,
        timeoutMs: 120_000,
      },
    ],
  },
  {
    id: 'code',
    name: '代码开发',
    description: '理解需求 → 设计方案 → 编码实现 → 代码审查',
    triggerPatterns: ['写代码', '实现', '开发', '写一个', '编程', '脚本', '功能'],
    roles: [BUILTIN_ROLES.planner, BUILTIN_ROLES.researcher, BUILTIN_ROLES.executor, BUILTIN_ROLES.reviewer],
    systemPrompt: '当前正在执行"代码开发"Pipeline。我会先理解需求，再设计方案，然后编码实现，最后审查代码。',
    stages: [
      {
        id: 'plan',
        name: '需求分析',
        description: '理解用户需求，输出技术方案',
        agentRole: 'planner',
        input: '分析以下编程需求，输出技术方案和实现计划：\n{userInput}',
        dependencies: [],
        parallelSafe: false,
        reviewRequired: false,
        retryOnReviewFail: false,
        maxRetries: 1,
        timeoutMs: 120_000,
      },
      {
        id: 'research',
        name: '参考调研',
        description: '搜索相关技术和最佳实践',
        agentRole: 'researcher',
        input: '基于以下方案，搜索相关参考资料和最佳实践：\n方案：{plan.output}\n需求：{userInput}',
        dependencies: ['plan'],
        parallelSafe: false,
        reviewRequired: false,
        retryOnReviewFail: false,
        maxRetries: 1,
        timeoutMs: 120_000,
      },
      {
        id: 'implement',
        name: '编码实现',
        description: '编写代码',
        agentRole: 'executor',
        input: '基于方案和参考资料，编写代码。\n方案：{plan.output}\n参考：{research.output}\n需求：{userInput}',
        dependencies: ['plan', 'research'],
        parallelSafe: false,
        reviewRequired: false,
        retryOnReviewFail: false,
        maxRetries: 1,
        timeoutMs: 300_000,
      },
      {
        id: 'review',
        name: '代码审查',
        description: '检查代码质量和正确性',
        agentRole: 'reviewer',
        input: '审查以下代码。\n代码：{implement.output}\n需求：{userInput}',
        dependencies: ['implement'],
        parallelSafe: false,
        reviewRequired: true,
        retryOnReviewFail: true,
        maxRetries: 2,
        timeoutMs: 120_000,
      },
    ],
  },
  {
    id: 'data',
    name: '数据分析',
    description: '数据收集 → 清洗处理 → 分析 → 可视化 → 报告',
    triggerPatterns: ['分析数据', '数据', '统计', '图表', '可视化', '画图', '数据文件'],
    roles: [BUILTIN_ROLES.planner, BUILTIN_ROLES.researcher, BUILTIN_ROLES.executor, BUILTIN_ROLES.writer, BUILTIN_ROLES.reviewer],
    systemPrompt: '当前正在执行"数据分析"Pipeline。我会先理解数据，再进行分析，然后生成可视化图表，最后输出分析报告。',
    stages: [
      {
        id: 'plan',
        name: '规划分析方案',
        description: '理解数据和需求，制定分析方案',
        agentRole: 'planner',
        input: '分析以下数据处理需求，输出分析方案：\n{userInput}',
        dependencies: [],
        parallelSafe: false,
        reviewRequired: false,
        retryOnReviewFail: false,
        maxRetries: 1,
        timeoutMs: 120_000,
      },
      {
        id: 'collect',
        name: '收集数据',
        description: '读取并理解数据',
        agentRole: 'researcher',
        input: '读取和理解数据文件。\n方案：{plan.output}\n需求：{userInput}',
        dependencies: ['plan'],
        parallelSafe: false,
        reviewRequired: false,
        retryOnReviewFail: false,
        maxRetries: 1,
        timeoutMs: 120_000,
      },
      {
        id: 'analyze',
        name: '数据处理与分析',
        description: '清洗、分析数据',
        agentRole: 'executor',
        input: '处理数据，执行分析计算。\n数据：{collect.output}\n方案：{plan.output}',
        dependencies: ['collect'],
        parallelSafe: false,
        reviewRequired: false,
        retryOnReviewFail: false,
        maxRetries: 1,
        timeoutMs: 300_000,
      },
      {
        id: 'visualize',
        name: '生成可视化',
        description: '创建图表',
        agentRole: 'executor',
        input: '基于分析结果，生成可视化图表。\n分析结果：{analyze.output}\n需求：{userInput}',
        dependencies: ['analyze'],
        parallelSafe: false,
        reviewRequired: false,
        retryOnReviewFail: false,
        maxRetries: 1,
        timeoutMs: 300_000,
      },
      {
        id: 'report',
        name: '撰写报告',
        description: '整合分析和图表成报告',
        agentRole: 'writer',
        input: '撰写数据分析报告，整合分析结果和可视化图表。\n分析：{analyze.output}\n图表：{visualize.output}\n需求：{userInput}',
        dependencies: ['analyze', 'visualize'],
        parallelSafe: false,
        reviewRequired: false,
        retryOnReviewFail: false,
        maxRetries: 1,
        timeoutMs: 300_000,
      },
      {
        id: 'review',
        name: '报告审阅',
        description: '检查报告质量',
        agentRole: 'reviewer',
        input: '审阅以下数据分析报告：\n报告：{report.output}\n需求：{userInput}',
        dependencies: ['report'],
        parallelSafe: false,
        reviewRequired: true,
        retryOnReviewFail: true,
        maxRetries: 2,
        timeoutMs: 120_000,
      },
    ],
  },
]

// ── Pipeline 匹配器 ──

/**
 * 根据用户输入匹配最合适的 Pipeline
 * 先查用户自定义的 Pipeline（优先级高），再查内置的
 */
export function matchPipeline(userInput: string): PipelineDefinition | null {
  const input = userInput.toLowerCase()

  // 合并所有 pipeline：用户自定义 + 内置
  const allPipelines = [...getAllPipelines(), ...BUILTIN_PIPELINES]

  // 按触发词数量排序（更精准的匹配优先）
  const scored = allPipelines.map(p => {
    const matchCount = p.triggerPatterns.filter(t => input.includes(t.toLowerCase())).length
    return { pipeline: p, score: matchCount }
  })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)

  return scored.length > 0 ? scored[0].pipeline : null
}

/**
 * 判断是否需要启动 Pipeline（而非直接执行 Agent Loop）
 * 规则：匹配到 Pipeline + 任务明显是多步骤复杂任务
 */
export function shouldUsePipeline(userInput: string, executionMode: string): boolean {
  // Ask 模式不用 Pipeline
  if (executionMode === 'ask') return false

  const pipeline = matchPipeline(userInput)
  if (!pipeline) return false

  // 简单任务（少于 15 字）不启动 Pipeline，直接单 Agent 处理
  if (userInput.length < 15) return false

  return true
}

// ── Pipeline Runner ──

export interface PipelineRunnerConfig {
  apiKey: string
  model: string
  apiUrl?: string
  persona?: 'office' | 'creative'
  onStageStart?: (stageId: string, stageName: string) => void
  onStageComplete?: (stageId: string, stageName: string, output: string) => void
  onStageError?: (stageId: string, stageName: string, error: string) => void
  onPipelineComplete?: (result: PipelineRun) => void
  onPipelineError?: (error: string) => void
  onReviewRequired?: (stageId: string, result: ReviewResult, retryCallback: () => void) => Promise<boolean>
  send?: (channel: string, data?: any) => void
  convId?: string
}

/**
 * Pipeline 运行器 — 按 DAG 依赖顺序执行 stages
 * 核心流程：
 * 1. 解析依赖图，找到可执行的 stage（所有依赖已完成）
 * 2. 并行执行 parallelSafe 的 stage
 * 3. 串行执行非 parallelSafe 的 stage
 * 4. Review 阶段暂停等待人工确认
 * 5. 重试机制（review 不通过时）
 */
export async function runPipeline(
  pipelineDef: PipelineDefinition,
  userInput: string,
  config: PipelineRunnerConfig
): Promise<PipelineRun> {
  const run: PipelineRun = {
    pipelineId: pipelineDef.id,
    runId: `pipeline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    status: 'initializing',
    stages: new Map(),
    context: {},
    input: userInput,
    startedAt: Date.now(),
  }

  // 初始化所有 stage 状态
  for (const stage of pipelineDef.stages) {
    run.stages.set(stage.id, {
      id: stage.id,
      status: 'pending',
      output: '',
      retryCount: 0,
    })
  }

  const send = config.send || (() => {})
  const convId = config.convId || ''

  // 通知前端 Pipeline 启动
  const notify = (channel: string, data: any) => {
    send(channel, convId ? { ...data, convId } : data)
  }

  notify('chat:streamChunk', `\n\n> 🔄 **启动 ${pipelineDef.name} Pipeline** — 共 ${pipelineDef.stages.length} 个阶段\n\n`)

  // 发送 Pipeline 启动事件（前端进度展示用）
  notify('chat:pipelineStart', {
    pipelineId: pipelineDef.id,
    pipelineName: pipelineDef.name,
    stages: pipelineDef.stages.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      agentRole: s.agentRole,
      status: 'pending',
    })),
    totalStages: pipelineDef.stages.length,
  })

  run.status = 'running'
  config.onPipelineComplete = config.onPipelineComplete || (() => {})
  config.onPipelineError = config.onPipelineError || (() => {})

  try {
    // 按依赖顺序执行阶段
    const executed = new Set<string>()
    const maxIterations = pipelineDef.stages.length * 5 // 防止死循环
    let iterations = 0

    while (executed.size < pipelineDef.stages.length && iterations < maxIterations) {
      iterations++

      // 找到当前可执行的 stages（所有依赖已完成，自身未执行）
      const readyStages = pipelineDef.stages.filter(stage => {
        if (executed.has(stage.id)) return false
        const state = run.stages.get(stage.id)!
        if (state.status === 'running') return false
        return stage.dependencies.every(depId => executed.has(depId))
      })

      if (readyStages.length === 0) {
        // 没有就绪的 stage 但还有未完成的 — 说明有循环依赖或死锁
        if (executed.size < pipelineDef.stages.length) {
          throw new Error(`Pipeline 死锁: 有 ${pipelineDef.stages.length - executed.size} 个 stage 无法执行`)
        }
        break
      }

      // 分离可并行和串行的 stages
      const parallelStages = readyStages.filter(s => s.parallelSafe)
      const sequentialStages = readyStages.filter(s => !s.parallelSafe)

      // 执行并行 stages
      if (parallelStages.length > 0) {
        notify('chat:streamChunk', `\n> ⚡ **并行执行**: ${parallelStages.map(s => s.name).join('、')}\n\n`)
        await Promise.all(parallelStages.map(s => executeStage(s, run, userInput, config, notify)))
        for (const s of parallelStages) executed.add(s.id)
      }

      // 执行串行 stages
      for (const stage of sequentialStages) {
        await executeStage(stage, run, userInput, config, notify)
        executed.add(stage.id)

        // Review 门禁处理
        if (stage.reviewRequired) {
          const state = run.stages.get(stage.id)!
          if (state.status === 'failed') {
            // Review 失败，且设置了重试
            if (state.retryCount < stage.maxRetries) {
              notify('chat:streamChunk', `\n> 🔄 **Review 不通过，第 ${state.retryCount + 1}/${stage.maxRetries} 次重试**\n\n`)
              // 重新执行
              state.status = 'pending'
              state.retryCount++
              executed.delete(stage.id)
              continue
            } else {
              throw new Error(`Stage "${stage.name}" review 失败，已达最大重试次数`)
            }
          }
        }
      }
    }

    // Pipeline 完成
    run.status = 'completed'
    run.completedAt = Date.now()
    notify('chat:streamChunk', `\n\n> ✅ **${pipelineDef.name} Pipeline 完成！** 耗时 ${Math.round((Date.now() - run.startedAt) / 1000)}s\n\n`)

    // 发送 Pipeline 完成事件（前端进度展示关闭用）
    notify('chat:pipelineComplete', {
      pipelineId: pipelineDef.id,
      status: 'completed',
      totalStages: pipelineDef.stages.length,
      duration: Date.now() - run.startedAt,
    })

    // 拼接最终输出
    const finalOutput = buildFinalOutput(run, pipelineDef)
    run.context['_finalOutput'] = finalOutput
    config.onPipelineComplete!(run)

    return run
  } catch (err: any) {
    run.status = 'failed'
    run.error = err.message || String(err)
    notify('chat:streamChunk', `\n\n> ❌ **Pipeline 执行失败**: ${run.error}\n\n`)

    // 发送 Pipeline 失败事件
    notify('chat:pipelineComplete', {
      pipelineId: pipelineDef.id,
      status: 'failed',
      error: run.error,
      totalStages: pipelineDef.stages.length,
      duration: Date.now() - run.startedAt,
    })
    config.onPipelineError!(run.error)
    return run
  }
}

/**
 * 执行单个 Stage
 */
async function executeStage(
  stage: StageDefinition,
  run: PipelineRun,
  userInput: string,
  config: PipelineRunnerConfig,
  notify: (channel: string, data: any) => void
): Promise<void> {
  const state = run.stages.get(stage.id)!
  state.status = 'running'
  state.startedAt = Date.now()
  config.onStageStart?.(stage.id, stage.name)

  notify('chat:streamChunk', `\n> 📋 **${stage.name}** — ${stage.description}\n\n`)

  // 发送 stage 进度事件
  notify('chat:pipelineStageUpdate', {
    pipelineId: run.pipelineId,
    stageId: stage.id,
    status: 'running',
    stageName: stage.name,
    agentRole: stage.agentRole,
    stageIndex: stageIndexInPipeline(run.pipelineId, stage.id),
    totalStages: totalStagesInPipeline(run.pipelineId),
  })

  // 查找这个 stage 对应的 agent role
  const role = [...BUILTIN_ROLES, ...(pipelineDefRoles(run.pipelineId))].find(r => r.name === stage.agentRole)

  // 构建 sub-agent 的任务描述（模板替换）
  const task = buildStageTask(stage, run, userInput)

  // 准备 sub-agent 的工具列表
  const tools = getToolsForRole(role)

  // 注入角色相关的技能
  const skillsPrompt = role ? getActiveSkillsPromptForAgent(role.name, role.allowedSkills) : ''

  const subConfig: SubAgentConfig = {
    apiKey: config.apiKey,
    model: config.model,
    apiUrl: config.apiUrl,
    task: `${task}\n\n${skillsPrompt ? `## 可用技能\n${skillsPrompt}\n` : ''}`,
    context: role?.prompt || '',
    tools,
  }

  try {
    const result = await spawnSubAgent(subConfig)
    state.output = result
    state.status = 'completed'
    state.completedAt = Date.now()
    run.context[stage.id] = result
    config.onStageComplete?.(stage.id, stage.name, result)

    notify('chat:streamChunk', `> ✅ **${stage.name} 完成**\n\`\`\`\n${result.slice(0, 500)}${result.length > 500 ? '\n...（已截断）' : ''}\n\`\`\`\n\n`)

    // 发送 stage 完成事件
    notify('chat:pipelineStageUpdate', {
      pipelineId: run.pipelineId,
      stageId: stage.id,
      status: 'completed',
      stageName: stage.name,
      agentRole: stage.agentRole,
      stageIndex: stageIndexInPipeline(run.pipelineId, stage.id),
      totalStages: totalStagesInPipeline(run.pipelineId),
    })
  } catch (err: any) {
    state.status = 'failed'
    state.error = err.message || String(err)
    config.onStageError?.(stage.id, stage.name, state.error)
    notify('chat:streamChunk', `> ❌ **${stage.name} 失败**: ${state.error}\n\n`)

    // 发送 stage 失败事件
    notify('chat:pipelineStageUpdate', {
      pipelineId: run.pipelineId,
      stageId: stage.id,
      status: 'failed',
      error: state.error,
      stageName: stage.name,
      agentRole: stage.agentRole,
      stageIndex: stageIndexInPipeline(run.pipelineId, stage.id),
      totalStages: totalStagesInPipeline(run.pipelineId),
    })

    // Review 门禁 — 如果失败且设置了重试
    if (stage.reviewRequired) {
      state.status = 'failed'
      // 通知外部等待处理
      if (config.onReviewRequired) {
        const approved = await config.onReviewRequired(stage.id, {
          passed: false,
          feedback: state.error,
          suggestions: ['建议重试或修改输入'],
        }, async () => {})
        // 这里只是通知，外部决定是否重试
      }
    }
  }
}

/**
 * 获取指定 stage 在 pipeline 中的索引
 */
function stageIndexInPipeline(pipelineId: string, stageId: string): number {
  const allPipelines = [...getAllPipelines(), ...BUILTIN_PIPELINES]
  const def = allPipelines.find(p => p.id === pipelineId)
  if (!def) return 0
  return def.stages.findIndex(s => s.id === stageId)
}

/**
 * 获取 pipeline 的总 stage 数
 */
function totalStagesInPipeline(pipelineId: string): number {
  const allPipelines = [...getAllPipelines(), ...BUILTIN_PIPELINES]
  const def = allPipelines.find(p => p.id === pipelineId)
  return def?.stages.length || 0
}

/**
 * 构建 Stage 任务描述（模板变量替换）
 */
function buildStageTask(stage: StageDefinition, run: PipelineRun, userInput: string): string {
  let task = stage.input

  // 替换 {userInput}
  task = task.replace(/\{userInput\}/g, userInput)

  // 替换 {stageId.output} 引用
  for (const [stageId, output] of Object.entries(run.context)) {
    task = task.replace(new RegExp(`\\{${stageId}\\.output\\}`, 'g'), output.slice(0, 3000))
  }

  // 替换其他已完成的 stage
  const stageIds = [...run.stages.keys()]
  for (const sid of stageIds) {
    const s = run.stages.get(sid)!
    if (s.status === 'completed' && s.output) {
      task = task.replace(new RegExp(`\\{${sid}\\.output\\}`, 'g'), s.output.slice(0, 3000))
    }
  }

  return task
}

/**
 * 获取 AgentRole 对应的可用工具
 * - 如果 role 未指定工具（空列表），返回全部注册工具
 * - 如果指定了工具，只返回匹配的工具
 */
function getToolsForRole(role?: AgentRole): SubAgentConfig['tools'] {
  // 没指定 role 或 tools 为空 → 全部工具可用
  if (!role || role.tools.length === 0) {
    return getAllTools().map(t => ({
      name: t.name,
      description: t.description,
      permission: t.permission,
      execute: (params: any) => t.execute(params),
    }))
  }

  return role.tools
    .map(name => getTool(name))
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .map(t => ({
      name: t.name,
      description: t.description,
      permission: t.permission,
      execute: (params: any) => t.execute(params),
    }))
}

/**
 * 根据 pipelineId 查找 pipeline 定义中的 roles
 * 先查用户自定义，再查内置
 */
function pipelineDefRoles(pipelineId: string): AgentRole[] {
  const userPipelines = getAllPipelines()
  const userDef = userPipelines.find(p => p.id === pipelineId)
  if (userDef) return userDef.roles

  const def = BUILTIN_PIPELINES.find(p => p.id === pipelineId)
  return def?.roles || []
}

/**
 * 构建最终输出（汇总所有 stage 的结果）
 */
function buildFinalOutput(run: PipelineRun, pipelineDef: PipelineDefinition): string {
  const parts: string[] = [
    `# ${pipelineDef.name} 完成\n`,
    `**用时**: ${Math.round((Date.now() - run.startedAt) / 1000)}s\n`,
  ]

  for (const stage of pipelineDef.stages) {
    const state = run.stages.get(stage.id)!
    const emoji = state.status === 'completed' ? '✅' : state.status === 'failed' ? '❌' : '⏳'
    parts.push(`\n---\n### ${emoji} ${stage.name}\n`)

    if (state.status === 'completed' && state.output) {
      parts.push(state.output.slice(0, 1000))
      if (state.output.length > 1000) parts.push('\n*...内容较长，请查看产生的文件*')
    } else if (state.error) {
      parts.push(`\n❌ 错误：${state.error}`)
    }
  }

  return parts.join('\n')
}

/**
 * 导出内置 Pipeline 和 Role 定义（供其他模块使用）
 */
export function getBuiltinPipelines(): PipelineDefinition[] {
  return [...BUILTIN_PIPELINES]
}

export function getBuiltinRoles(): AgentRole[] {
  return { ...BUILTIN_ROLES }
}
