import React, { useState, useRef, useEffect, useCallback } from 'react'
import type { PermissionLevel, ChatMode, PersonaMode, SkillInfo, MarketplaceSkill, ArtifactInfo, StreamDoneData, ConnectorConfig } from './types/electron'
import logoText from '../assets/logo-text.png'
import logoIcon from '../assets/logo-icon.png'
import appIcon from '../assets/app-icon.jpg'
import aiAvatar from '../assets/ai-avatar-round.png'

import { iconSVG, fileIcon, uid, api, permToNumber, CollapsibleSection } from './components/shared'
import { FormattedContent } from './components/MessageRenderer'
import { ArtifactsPanel } from './components/ArtifactsPanel'
import { FilesPanel } from './components/FilesPanel'
import { ChangesPanel } from './components/ChangesPanel'
import { PreviewPanel } from './components/PreviewPanel'
import { SkillsView } from './components/SkillsView'
import { ConnectorsView } from './components/ConnectorsView'
import { ExpertsView } from './components/ExpertsView'
import { AutomationsView } from './components/AutomationsView'
import { MoreView } from './components/MoreView'
import { SettingsModal } from './components/SettingsModal'
import { MemoryModal } from './components/MemoryModal'

// ====== Types & Interfaces ======

interface Msg { id: string; role: string; content: string; time: string }
interface Conv { id: string; title: string; updatedAt: string }
interface ScenePrompt { label: string; text: string }
interface SceneItem { id: string; name: string; icon: string; desc: string; color: string; systemPrompt: string; prompts: ScenePrompt[]; keywords: string[]; persona?: PersonaMode }
interface ToolStep { name: string; params: string; status: 'pending' | 'running' | 'completed' | 'failed'; result?: string; artifact?: boolean }
interface PendingTask {
  id: string
  text: string
  attachments: Array<{ name: string; path: string; type: string; size: number }>
  timestamp: number
}
interface AppState {
  loggedIn: boolean; userName: string; apiKey: string
  convs: Conv[]; activeId: string | null; msgs: Msg[]
  search: string; input: string; loading: boolean
  view: 'chat' | 'skills' | 'experts' | 'automations' | 'more' | 'connectors'; modelId: string
  perm: PermissionLevel; mode: ChatMode; persona: 'office' | 'creative' | 'code'; showSet: boolean; showRight: boolean; showMem: boolean
  rightTab: 'artifacts' | 'files' | 'changes' | 'preview'
  thinking: boolean
  showProfile: boolean
  showOnboarding: boolean
  onboardingStep: number
  artifacts: ArtifactInfo[]
  toolStatus: { active: boolean; names: string[]; completed: number; total: number; action: string }
  toolSteps: ToolStep[]
  creditUsed: number
  activeScene: string | null
  attachments: Array<{ name: string; path: string; type: string; size: number }>
  pendingTasks: PendingTask[]
  autoConfig: { defaultModel: string; imageModel: string }
}

// ====== App Version ======
const APP_VERSION = '1.9.6'

// ====== Scene Data (可后台自定义，当前为模拟数据) ======
const sceneData: SceneItem[] = [
  { id: 'ppt', name: '幻灯片', icon: 'doc', color: '#F53F3F', desc: '生成演示文稿', keywords: ['pptx', 'ppt', '幻灯片', '演示文稿', 'slide', 'slides', '汇报ppt', '提案ppt', '路演', '演讲', 'keynote'],
    systemPrompt: '【场景：幻灯片制作】你是一个PPT制作专家。先和用户确认：页数、风格（简洁/商务/创意）、配色偏好、是否需要图表。确认后使用 create_pptx 工具生成。生成后将文件路径告知用户。',
    prompts: [
      { label: '生成公司介绍PPT', text: '帮我生成一份10页的公司介绍PPT，包含公司概况、业务范围、核心优势、团队介绍、发展规划。风格简洁专业。' },
      { label: '项目汇报幻灯片', text: '帮我制作项目进展汇报PPT，包含项目背景、当前进度、关键成果、风险与对策、下阶段计划。' },
      { label: '产品发布演示', text: '创建一份产品发布会PPT，包含产品亮点、功能演示、市场分析、定价策略、上市路线图。' },
    ]},
  { id: 'code', name: '程序员', icon: 'code', color: '#165DFF', desc: '写代码、调试、架构', keywords: ['代码', '编程', '开发', '写代码', 'debug', '修复', 'bug', '调试', '架构', '重构', '代码审查', 'code', 'programming', '算法', 'lru缓存', '前端', '后端'],
    systemPrompt: '【场景：编程开发】你是一个资深全栈工程师。先理解用户的需求，确认技术栈和关键设计点后再动手。使用 write_file 工具创建代码文件，文件默认保存到输出目录。',
    prompts: [
      { label: '写一个新功能', text: '帮我用TypeScript实现一个LRU缓存类，要求O(1)时间复杂度的get和put操作，支持泛型。' },
      { label: '代码审查', text: '请审查以下代码，关注安全性、性能、可维护性，给出具体改进建议。' },
      { label: '架构设计', text: '帮我设计一个微服务架构的系统，包括用户服务、订单服务、支付服务，画出架构图并说明技术选型。' },
    ]},
  { id: 'write', name: '内容创作', icon: 'palette', color: '#FF7D00', desc: '写文章、文案、报告', keywords: ['文章', '文案', '内容', '写作', '创作', '公众号', '博客', '新闻稿', '小红书', '文案策划', '报告', '申报材料'],
    systemPrompt: '【场景：内容创作】你是一个专业内容创作者。先和用户确认文章的角色定位、篇幅和风格，再开始写作。输出较长内容时使用 create_markdown 工具保存为文件。',
    prompts: [
      { label: '写一篇公众号文章', text: '帮我写一篇关于"AI如何改变中小企业工作方式"的公众号文章，1500字左右，面向企业管理者。' },
      { label: '项目申报材料', text: '帮我撰写一份高新企业认定申报材料，包含企业基本情况、核心技术与知识产权、研发团队介绍。' },
      { label: '产品文案', text: '为一款面向程序员的AI编程助手写产品介绍文案，突出提高效率、降低错误率等核心卖点。' },
    ]},
  { id: 'legal', name: '法律/合同', icon: 'data', color: '#7B61FF', desc: '法律分析、合同审查', keywords: ['法律', '合同', '协议', '保护', '版权', '知识产权', '合规', '律师', '诉讼', '保密协议', '条款', '违约责任', '合规建议', '法律风险'],
    systemPrompt: '【场景：法律/合同】你是一个法律顾问。先了解具体场景和关注点，再给出分析。生成合同文档时使用 create_doc 工具保存为 Word 文件。',
    prompts: [
      { label: '审查合同条款', text: '请帮我审查这份合同的关键条款，重点关注：违约责任、知识产权归属、保密条款、争议解决方式。' },
      { label: '生成保密协议', text: '帮我生成一份员工保密协议，包含保密范围、保密期限、违约责任、竞业限制条款。' },
      { label: '法律风险分析', text: '分析以下商业行为可能存在的法律风险，并给出合规建议。' },
    ]},
  { id: 'research', name: '深度研究', icon: 'chart', color: '#00B42A', desc: '数据分析、市场调研', keywords: ['研究', '调研', '分析', '市场', '数据', '报告', '趋势', '行业', '竞品', '用户调研', '市场规模', '市场分析', '行业趋势'],
    systemPrompt: '【场景：深度研究分析】你是一个市场研究分析师。先确认范围、维度、输出格式，再做分析。生成报告时使用 create_markdown 或 create_doc 工具保存文件。',
    prompts: [
      { label: '市场调研报告', text: '帮我做一份关于中国AI办公软件市场的调研报告，包含市场规模、主要玩家、用户需求、发展趋势。' },
      { label: '竞品分析', text: '分析飞书、钉钉、企业微信三款产品的功能差异、定价策略和用户口碑，用表格呈现。' },
      { label: '行业趋势分析', text: '分析2026年企业数字化转型的5大趋势，每个趋势给出具体数据和案例支撑。' },
    ]},
  { id: 'ops', name: '运营/策划', icon: 'rocket', color: '#F77234', desc: '活动策划、用户运营', keywords: ['运营', '策划', '活动', '裂变', '私域', '社群', '营销', '推广', '转化', '用户运营', '内容运营', '品牌', '活动策划'],
    systemPrompt: '【场景：运营策划】你是一个资深运营策划。先了解预算、目标人群和核心KPI，再输出方案。使用 create_markdown 保存为文档。',
    prompts: [
      { label: '活动策划方案', text: '帮我在微信私域策划一场用户裂变活动，包含活动目标、玩法设计、奖品设置、推广节奏、预期效果。' },
      { label: '社群运营规划', text: '制定一份知识付费社群3个月的运营计划，包括内容排期、互动玩法、转化路径。' },
      { label: '营销文案', text: '为我即将举办的线上直播写推广文案，主题是"中小企业数字化转型实战"，目标吸引500人报名。' },
    ]},
  { id: 'finance', name: '财务/投资', icon: 'money', color: '#E8652D', desc: '财务分析、投资研究', keywords: ['财务', '投资', '税务', '营收', '利润', '现金流', '财报', '估值', '股票', '基金', '资产', '负债', '审计', '财务分析', '投资分析'],
    systemPrompt: '【场景：财务投资分析】你是一个财务分析师。先确认分析维度，再给出结论。生成报告时创建 .md 或 .docx 文件。',
    prompts: [
      { label: '财务报表分析', text: '帮我分析以下财务数据，重点关注：营收增长率、毛利率趋势、现金流状况、资产负债率。给出投资建议。' },
      { label: '投资分析报告', text: '对某家上市公司做基本面分析，包括行业地位、财务指标、估值分析、风险提示。' },
      { label: '税务筹划建议', text: '针对一家年营收5000万的中小企业，给出合理的税务筹划方案，重点考虑研发费用加计扣除。' },
    ]},
  { id: 'personal', name: '生活助手', icon: 'sun', color: '#0FC6C2', desc: '个人生活、学习规划', keywords: ['生活', '学习', '旅行', '攻略', '健康', '饮食', '运动', '健身', '计划', '规划', '安排', '食谱', '减肥', '建议', '个人'],
    systemPrompt: '【场景：生活学习助手】你是一个贴心的个人生活顾问。回复要实用、具体、可执行。',
    prompts: [
      { label: '制定学习计划', text: '帮我制定一门Python数据分析的学习计划，每周8小时，12周完成，包括学习内容和实践项目。' },
      { label: '旅行攻略', text: '帮我制定一个5天4夜的成都旅行攻略，包括景点推荐、美食打卡、交通建议、住宿选择。' },
      { label: '健康饮食建议', text: '根据久坐办公族的身体状况，给我一个一周的健康饮食计划，包含早中晚餐和加餐。' },
    ]},
]

// ====== Main App ======

export function App() {
  const [s, setS] = useState<AppState>({
    loggedIn: false, userName: '', apiKey: '', convs: [], activeId: null, msgs: [],
    search: '', input: '', loading: false, view: 'chat', modelId: 'auto',
    perm: 'default', mode: 'craft', persona: 'office', showSet: false, showRight: false, showMem: false,
    rightTab: 'artifacts', thinking: false, showProfile: false,
    showOnboarding: false, onboardingStep: 0,
    artifacts: [],
    toolStatus: { active: false, names: [], completed: 0, total: 0, action: '' },
    toolSteps: [], creditUsed: 0,
    attachments: [],
    pendingTasks: [],
    autoConfig: { defaultModel: 'deepseek-v4-pro', imageModel: 'deepseek-v4-flash' },
    activeScene: null,
  })
  const endRef = useRef<HTMLDivElement>(null)
  const streamRef = useRef('')
  const sendingRef = useRef(false)
  const activeIdRef = useRef<string | null>(null)
  const cleanupRef = useRef<Array<() => void>>([])
  const [ready, setReady] = useState(false)
  const [compacting, setCompacting] = useState(false)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const skillsRef = useRef<HTMLDivElement>(null)
  const [modelOpen, setModelOpen] = useState(false)
  const modelDropdownRef = useRef<HTMLDivElement>(null)
  const selectedModelName = s.modelId === 'auto' ? 'Auto' : (allModels.find(m => m.id === s.modelId)?.name || s.modelId)

  // Close model dropdown on outside click
  useEffect(() => {
    if (!modelOpen) return
    const handler = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setModelOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [modelOpen])

  // Close model dropdown when AI starts generating
  useEffect(() => {
    if (s.loading) setModelOpen(false)
  }, [s.loading])

  // Click outside to close skills dropdown
  useEffect(() => {
    if (!skillsOpen) return
    const handler = (e: MouseEvent) => {
      if (skillsRef.current && !skillsRef.current.contains(e.target as Node)) {
        setSkillsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [skillsOpen])
  const [convLoading, setConvLoading] = useState<Record<string, boolean>>({})
  const [msgFeedback, setMsgFeedback] = useState<Record<string, 'like' | 'dislike' | null>>({})

  const u = useCallback((p: Partial<AppState>) => setS(prev => ({ ...prev, ...p })), [])

  // Global error handler — catch "i is not a function" and prevent crash
  const errorRef = useRef<Array<{time: string; msg: string}>>([])
  useEffect(() => {
    const handler = (event: ErrorEvent) => {
      const msg = event.message || ''
      errorRef.current = [...errorRef.current.slice(-4), { time: new Date().toISOString().slice(11,19), msg }]
      console.error('[CoreBuddy Error]', msg, event.error?.stack)
    }
    window.addEventListener('error', handler)
    return () => window.removeEventListener('error', handler)
  }, [])

  useEffect(() => {
    if (ready || !api()) return
    setReady(true)
    api()!.config.get('apiKey').then(k => { if (k) u({ apiKey: k }) })
    api()!.config.get('userName').then(n => {
      if (n) { u({ userName: n, loggedIn: true }); loadConvs() }
    })
    // Listen for conversation loading status changes (background generation)
    api()!.conv.status().then(st => setConvLoading(st))
    api()!.conv.onStatusChange(data => {
      setConvLoading(prev => ({ ...prev, [data.convId]: data.loading }))
    })
    // Listen for context compaction status
    api()!.chat.onCompacting(data => {
      if ((data as any).convId === undefined || (data as any).convId === activeIdRef.current) {
        setCompacting(data.active)
      }
    })
  }, [ready])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [s.msgs])
  useEffect(() => { activeIdRef.current = s.activeId }, [s.activeId])
  // Cleanup IPC listeners on unmount
  useEffect(() => () => { cleanupRef.current.forEach(f => f()) }, [])

  const loadConvs = async () => {
    if (!api()) return
    const convs = await api()!.conv.list()
    u({ convs })
    if (convs.length > 0 && !s.activeId) {
      u({ activeId: convs[0].id })
      u({ msgs: await api()!.conv.messages(convs[0].id) })
    }
  }
  const loadMsgs = async (id: string) => { if (!api()) return; u({ msgs: await api()!.conv.messages(id) }) }
  const login = async (name: string, key: string) => {
    if (!api() || !name.trim()) return
    await api()!.config.set('userName', name.trim())
    if (key.trim()) await api()!.config.set('apiKey', key.trim())
    u({ userName: name.trim(), apiKey: key.trim(), loggedIn: true, showOnboarding: true, onboardingStep: 0 })
    loadConvs()
  }
  const newConv = async () => {
    if (!api()) return
    const id = uid()
    await api()!.conv.create(id)
    u({ activeId: id, msgs: [], input: '', view: 'chat' })
    loadConvs()
  }
  const delConv = async (id: string) => {
    if (!api()) return
    await api()!.conv.delete(id)
    if (s.activeId === id) u({ activeId: null, msgs: [] })
    loadConvs()
  }
  const switchConv = async (id: string) => {
    if (id === s.activeId) return
    if (s.activeId) { try { await api()?.chat.abort(s.activeId) } catch {} }
    u({ activeId: id, msgs: [], view: 'chat' })
    loadMsgs(id)
  }

  const send = async (scenePrompt?: string, presetText?: string, presetAttachments?: Array<{ name: string; path: string; type: string; size: number }>) => {
    const text = presetText || s.input.trim()
    if (!text || !api()) return
    if (!s.apiKey) { u({ showSet: true }); return }

    // If already loading, add to pending task queue instead of discarding
    const currentAttachments = presetAttachments || s.attachments
    if (sendingRef.current) {
      const newTask: PendingTask = {
        id: uid(),
        text: text,
        attachments: [...currentAttachments],
        timestamp: Date.now(),
      }
      u({ pendingTasks: [...s.pendingTasks, newTask], input: '', attachments: [] })
      return
    }

    // Only auto-detect scene if not explicitly passed (e.g., from preset)
    let effectiveScenePrompt = scenePrompt
    if (!scenePrompt) {
      const detected = detectScene(text)
      const matchedScene = detected ? sceneData.find(sc => sc.id === detected) : null
      if (matchedScene) {
        effectiveScenePrompt = matchedScene.systemPrompt
        if (matchedScene.persona) u({ persona: matchedScene.persona as any })
      }
    }

    // Auto-create conversation if none selected
    let thisConvId = s.activeId
    if (!thisConvId) {
      thisConvId = uid()
      await api()!.conv.create(thisConvId)
      u({ activeId: thisConvId, convs: [{ id: thisConvId, title: text.slice(0, 30), updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() }, ...s.convs] })
    }

    sendingRef.current = true
    u({ input: '', loading: true, toolStatus: { active: false, names: [], completed: 0, total: 0, action: '' }, toolSteps: [], creditUsed: 0, attachments: [] })
    streamRef.current = ''
    const aiMsg: Msg = { id: uid(), role: 'assistant', content: '', time: new Date().toISOString() }
    // 构建带附件的消息文本 — include file paths so AI can read them
    const attachmentText = currentAttachments.length > 0
      ? currentAttachments.map(a => a.type === 'image' ? `[img:${a.path}]` : `[附件:${a.path}|${a.name}]`).join('\n') + (text ? '\n\n' + text : '')
      : text
    setS(prev => ({ ...prev, msgs: [...prev.msgs, { id: uid(), role: 'user', content: attachmentText, time: new Date().toISOString() }, aiMsg] }))
    const cc: Array<() => void> = []
    // Stream chunk — debounce with requestAnimationFrame for performance
    let rafId: ReturnType<typeof requestAnimationFrame> | null = null
    cc.push(api()!.chat.onStreamChunk(chunk => {
      const cid = (chunk as any).convId || thisConvId
      if (cid !== activeIdRef.current) return
      const textContent = typeof chunk === 'string' ? chunk : ((chunk as any).value ?? (chunk as any).content ?? chunk)
      streamRef.current += textContent
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          rafId = null
          setS(prev => { const m = [...prev.msgs]; if (m.length) m[m.length - 1] = { ...m[m.length - 1], content: streamRef.current }; return { ...prev, msgs: m } })
        })
      }
    }))
    // Tool start
    cc.push(api()!.chat.onToolStart(data => { if ((data as any).convId === activeIdRef.current) { if (!data.names || !Array.isArray(data.names)) return; const steps: ToolStep[] = []; for (let n = 0; n < data.names.length; n++) { steps.push({ name: data.names[n], params: '', status: n === 0 ? 'running' : 'pending' }) }; u({ toolSteps: steps, toolStatus: { active: true, names: data.names, completed: 0, total: data.count, action: '准备中...' } }) } }))
    // Tool progress — use for loop instead of .map() to avoid minification name collisions
    cc.push(api()!.chat.onToolProgress(data => { if ((data as any).convId === activeIdRef.current) setS(prev => {
      if (!prev.toolSteps || prev.toolSteps.length === 0) return prev
      const steps: ToolStep[] = []
      for (let p = 0; p < prev.toolSteps.length; p++) {
        steps.push(p < data.completed ? { ...prev.toolSteps[p], status: 'completed' as const } : p === data.completed ? { ...prev.toolSteps[p], status: 'running' as const } : prev.toolSteps[p])
      }
      return { ...prev, toolStatus: { ...prev.toolStatus, completed: data.completed, total: data.total }, toolSteps: steps, creditUsed: prev.creditUsed + 0.05 }
    }) }))
    // Tool action — same fix: for loop instead of .map()
    cc.push(api()!.chat.onToolAction(data => { if ((data as any).convId === activeIdRef.current) setS(prev => {
      if (!prev.toolSteps || prev.toolSteps.length === 0) return prev
      const steps: ToolStep[] = []
      for (let a = 0; a < prev.toolSteps.length; a++) {
        steps.push(a === data.completed - 1 ? { ...prev.toolSteps[a], status: 'running' as const } : prev.toolSteps[a])
      }
      return { ...prev, toolStatus: { ...prev.toolStatus, action: data.action }, toolSteps: steps }
    }) }))
    // Artifact created
    cc.push(api()!.chat.onArtifact(artifact => { if ((artifact as any).convId === activeIdRef.current) setS(prev => ({ ...prev, artifacts: [...prev.artifacts, artifact] })) }))
    // Stream done
    cc.push(api()!.chat.onStreamDone((data?: StreamDoneData) => {
      sendingRef.current = false
      if ((data as any)?.convId === activeIdRef.current) {
        u({ loading: false, toolStatus: { active: false, names: [], completed: 0, total: 0, action: '' }, toolSteps: [], creditUsed: 0 })
        if (data && data.artifactCount > 0) {
          u({ rightTab: 'artifacts', showRight: true })
        }
      }
      cc.forEach(f => f()); loadConvs()
      // Auto-execute next task in queue
      setTimeout(() => executeNextTaskInQueue(), 100)
    }))
    cc.push(api()!.chat.onStreamError(err => {
      sendingRef.current = false
      const cid = (err as any).convId || thisConvId
      if (cid === activeIdRef.current) {
        const msg = typeof err === 'string' ? err : ((err as any).message || (err as any).error || (err as any).value || JSON.stringify(err))
        streamRef.current += `\n\n错误：${msg}`
        setS(prev => { const m = [...prev.msgs]; if (m.length) m[m.length - 1] = { ...m[m.length - 1], content: streamRef.current }; return { ...prev, msgs: m } })
        u({ loading: false, toolStatus: { active: false, names: [], completed: 0, total: 0, action: '' }, toolSteps: [], creditUsed: 0 })
      }
      cc.forEach(f => f())
      // Auto-execute next task in queue
      setTimeout(() => executeNextTaskInQueue(), 100)
    }))
    // Store for cleanup on unmount
    cleanupRef.current = cc
    // Resolve 'auto' model selection based on task context
    const resolvedModel = resolveAutoModel(s.modelId, currentAttachments, defaultModel)
    const resolvedPerm = detectPermission(text)
    // Start message
    try {
      await api()!.chat.sendMessage(text, resolvedModel, thisConvId, permToNumber(resolvedPerm), s.persona, effectiveScenePrompt || undefined, s.userName || undefined, 'craft', currentAttachments)
    } catch (e: any) {
      sendingRef.current = false
      u({ loading: false })
      streamRef.current += `\n\n发送失败：${e?.message || e}`
      setS(prev => { const m = [...prev.msgs]; if (m.length) m[m.length - 1] = { ...m[m.length - 1], content: streamRef.current }; return { ...prev, msgs: m } })
      cc.forEach(f => f())
      // Auto-execute next task in queue on error too
      setTimeout(() => executeNextTaskInQueue(), 100)
    }
  }

  const keyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }

  /**
   * Auto model selection: picks the best model based on task context.
   * - Image attachments → vision-capable model (deepseek-v4-flash)
   * - Otherwise → default model (from config)
   */
  function resolveAutoModel(
    modelId: string,
    attachments: Array<{ name: string; path: string; type: string; size: number }>,
    fallbackDefault: string
  ): string {
    if (modelId !== 'auto') return modelId
    // Image attachments → image model from autoConfig
    const hasImage = attachments.some(a => a.type === 'image' || /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(a.name))
    if (hasImage) return s.autoConfig.imageModel || 'deepseek-v4-flash'
    // General tasks → default model from autoConfig
    return s.autoConfig.defaultModel || fallbackDefault || 'deepseek-v4-pro'
  }

  /**
   * Auto-detect scene based on user input text.
   * Matches keywords in the input against scene keyword lists.
   * Returns the best-matching scene ID, or null if no match.
   */
  function detectScene(text: string): string | null {
    const lower = text.toLowerCase()
    let bestScore = 0
    let bestId: string | null = null
    for (const scene of sceneData) {
      if (!scene.keywords || scene.keywords.length === 0) continue
      const score = scene.keywords.reduce((sum, kw) => {
        return sum + (lower.includes(kw.toLowerCase()) ? 1 : 0)
      }, 0)
      if (score > bestScore) {
        bestScore = score
        bestId = scene.id
      }
    }
    return bestScore >= 1 ? bestId : null
  }

  /**
   * Execute the next task from the pending task queue.
   * Called automatically after a task completes or errors.
   */
  function executeNextTaskInQueue() {
    // Use a state updater to atomically grab the first task and remove it from queue
    let taskText = ''
    let taskAttachments: Array<{ name: string; path: string; type: string; size: number }> = []
    setS(prev => {
      if (prev.pendingTasks.length === 0) return prev
      const [nextTask, ...rest] = prev.pendingTasks
      taskText = nextTask.text
      taskAttachments = nextTask.attachments
      return { ...prev, pendingTasks: rest }
    })
    // After state update, dispatch the send with the captured task data
    if (taskText) {
      setTimeout(() => { send(undefined, taskText, taskAttachments) }, 50)
    }
  }

  // ============== Data ==============
  const [allModels, setAllModels] = useState<Array<{ id: string; name: string; apiUrl: string; apiKey?: string }>>([])
  const [defaultModel, setDefaultModel] = useState('deepseek-v4-pro')

  useEffect(() => {
    const a = api()
    if (a?.models) a.models.list().then(cfg => {
      if (cfg?.models) { setAllModels(cfg.models); setDefaultModel(cfg.defaultModel || cfg.models[0]?.id || '') }
    }).catch(() => {})
  }, [])
  const perms: Array<{ v: PermissionLevel; l: string; d: string }> = [
    { v: 'default', l: '默认权限', d: '允许文件读写、文档生成、记忆管理' },
    { v: 'full', l: '完全访问', d: '包含系统命令执行、无限制访问' },
  ]
  const currentConv = s.convs.find(c => c.id === s.activeId)
  const rightTabs: Array<{ k: AppState['rightTab']; l: string }> = [{ k: 'artifacts', l: '产物' }, { k: 'files', l: '文件' }, { k: 'changes', l: '变更' }, { k: 'preview', l: '预览' }]

  // Detect permission level based on task content
  function detectPermission(text: string): PermissionLevel {
    const writeKeywords = ['写入', '创建', '生成', '写', '修改', '新建', '删除', '保存', '导出', '编译', '运行', '执行', '打包', '部署', 'install', 'write', 'create', 'delete', 'build', 'compile', 'run', 'exec', 'deploy', 'save']
    const lower = text.toLowerCase()
    for (const kw of writeKeywords) {
      if (lower.includes(kw.toLowerCase())) return 'full'
    }
    return 'default'
  }

  // ============== Login Screen ==============
  if (!s.loggedIn) return (
    <div className="flex flex-col h-screen bg-white">
      {/* Drag region + window controls */}
      <header className="flex items-center justify-between h-9 bg-[#F7F8FA] border-b border-[#F2F3F5] px-3 shrink-0 select-none" style={{ WebkitAppRegion: 'drag' } as any}>
        <div className="flex items-center gap-1.5" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <img src={logoIcon} alt="CoreBuddy" className="w-5 h-5 object-contain shrink-0" />
          <span className="text-[12px] font-medium text-[#4E5969]">CoreBuddy</span>
        </div>
        <div style={{ WebkitAppRegion: 'no-drag' } as any} className="flex items-center gap-0.5">
          <button onClick={() => api()?.window.minimize()} className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#E5E6EB] text-[#86909C] hover:text-[#4E5969] transition-colors" title="最小化">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><path d="M2.5 6h7"/></svg>
          </button>
          <button onClick={() => api()?.window.maximize()} className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#E5E6EB] text-[#86909C] hover:text-[#4E5969] transition-colors" title="最大化">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><rect x="2.5" y="2.5" width="7" height="7" rx="1"/></svg>
          </button>
          <button onClick={() => api()?.window.close()} className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#EC5B56] text-[#86909C] hover:text-white transition-colors" title="关闭">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><path d="M3 3l6 6M9 3l-6 6"/></svg>
          </button>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center">
        <div className="w-[380px]">
          <img src={logoText} alt="CoreBuddy" className="w-36 h-auto mx-auto mb-6" />
          <input id="ln" placeholder="你的名字" className="w-full h-11 px-4 rounded-lg border border-[#E5E6EB] text-[15px] outline-none focus:border-[#165DFF] mb-3 placeholder:text-[#C9CDD4]" />
          <input id="lk" type="password" placeholder="DeepSeek API Key（sk-...）" className="w-full h-11 px-4 rounded-lg border border-[#E5E6EB] text-[15px] outline-none focus:border-[#165DFF] mb-5 placeholder:text-[#C9CDD4]" />
          <button onClick={() => { const n = (document.getElementById('ln') as HTMLInputElement)?.value || ''; const k = (document.getElementById('lk') as HTMLInputElement)?.value || ''; login(n, k) }}
            className="w-full h-11 rounded-lg bg-[#165DFF] text-white text-[15px] font-medium border-none cursor-pointer hover:bg-[#0E4BD8]">开始使用</button>
          <p className="text-xs text-[#C9CDD4] text-center mt-4">数据全部存于本机，不会上传</p>
        </div>
      </div>
    </div>
  )

  // ============== Onboarding Screen ==============
  if (s.showOnboarding) {
    const steps = [
      { title: '身份与行业', fields: [
        { key: 'role', label: '你的职位 / 角色？', placeholder: '如：项目经理、律师、工程师、创业者' },
        { key: 'industry', label: '所在行业？', placeholder: '如：知识产权、互联网、制造业、教育' },
        { key: 'companyScale', label: '公司规模？', placeholder: '个人 / 小团队(<10人) / 中型(10-100人) / 大型(100+)' },
      ]},
      { title: '工作内容', fields: [
        { key: 'dailyTasks', label: '日常最主要做的 3 件事？', placeholder: '如：写申报材料、审合同、做技术方案' },
        { key: 'timeSpent', label: '每周花时间最多的是什么？', placeholder: '如：写文档、开会、数据整理' },
        { key: 'repetitiveWork', label: '有没有重复性的工作流程？', placeholder: '如：每周写周报、定期做数据分析' },
      ]},
      { title: '输出偏好', fields: [
        { key: 'commStyle', label: '喜欢什么样的沟通风格？', placeholder: '直接简洁 / 详细解释 / 分点列出' },
        { key: 'docFormat', label: '默认文件格式偏好？', placeholder: 'Word / PPT / Excel / Markdown' },
        { key: 'fileHabit', label: '工作文件保存习惯？', placeholder: '桌面 / 项目文件夹 / 按日期归档' },
      ]},
      { title: '项目与工具', fields: [
        { key: 'projects', label: '目前在做的项目有哪些？', placeholder: '如：CoreBuddy开发、geo-publisher多平台' },
        { key: 'tools', label: '日常用哪些软件？', placeholder: '微信、飞书、WPS、Office、Chrome、Notion' },
      ]},
      { title: '对 CoreBuddy 的期望', fields: [
        { key: 'topPainPoint', label: '最想让 AI 帮你解决的头号痛点？', placeholder: '如：申报材料写得太慢、文档格式总不对' },
        { key: 'proactiveReminders', label: '希望 CoreBuddy 主动提醒什么？', placeholder: '如：项目截止日、待办事项、每周工作总结' },
      ]},
    ]

    const step = steps[s.onboardingStep]
    // Use a module-level store for form data (avoid useRef in conditional) 
    if (!(window as any).__mb_onboard_data) (window as any).__mb_onboard_data = {}
    const formData = (window as any).__mb_onboard_data as Record<string, string>

    const nextStep = () => {
      // Collect current step's field values
      for (const field of step.fields) {
        const el = document.getElementById(`onboard-${field.key}`) as HTMLInputElement | HTMLTextAreaElement
        if (el) formData[field.key] = el.value
      }
      if (s.onboardingStep < steps.length - 1) {
        u({ onboardingStep: s.onboardingStep + 1 })
      } else {
        // Save preset memory
        const preset = {
          facts: [
            `用户角色: ${formData.role}`,
            `所在行业: ${formData.industry}`,
            `公司规模: ${formData.companyScale}`,
            `日常工作: ${formData.dailyTasks}`,
            `时间消耗: ${formData.timeSpent}`,
            `重复工作: ${formData.repetitiveWork}`,
            `沟通偏好: ${formData.commStyle}`,
            `文件格式偏好: ${formData.docFormat}`,
            `文件保存习惯: ${formData.fileHabit}`,
            `项目: ${formData.projects}`,
            `常用工具: ${formData.tools}`,
            `核心痛点: ${formData.topPainPoint}`,
            `期望提醒: ${formData.proactiveReminders}`,
          ].filter(f => !f.endsWith(': ') && !f.endsWith(':')),
          preferences: [
            `沟通风格: ${formData.commStyle}`,
            `默认文件格式: ${formData.docFormat}`,
            `文件保存: ${formData.fileHabit}`,
          ].filter(p => !p.endsWith(': ') && !p.endsWith(':')),
          projects: formData.projects
            ? formData.projects.split(/[,，、]/).map((p: string) => ({ name: p.trim(), status: '进行中', lastUpdate: new Date().toISOString() })).filter((p: any) => p.name)
            : [],
        }
        api()?.memory.savePreset(preset)
        u({ showOnboarding: false })
      }
    }

    return (
      <div className="flex flex-col h-screen bg-[#F7F8FA] items-center justify-center">
        <div className="w-[520px] bg-white rounded-2xl shadow-lg p-8">
          {/* Progress */}
          <div className="flex gap-1 mb-6">
            {steps.map((_, i) => (
              <div key={i} className={`flex-1 h-1 rounded-full ${i <= s.onboardingStep ? 'bg-[#165DFF]' : 'bg-[#E5E6EB]'}`} />
            ))}
          </div>

          <h2 className="text-lg font-semibold text-[#1D2129] mb-1">{step.title}</h2>
          <p className="text-sm text-[#86909C] mb-5">帮助 CoreBuddy 更了解你 ({s.onboardingStep + 1}/{steps.length})</p>

          <div className="space-y-4">
            {step.fields.map(field => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-[#4E5969] mb-1.5">{field.label}</label>
                <textarea
                  id={`onboard-${field.key}`}
                  placeholder={field.placeholder}
                  rows={2}
                  className="w-full px-4 py-2.5 rounded-lg border border-[#E5E6EB] text-[14px] text-[#1D2129] outline-none focus:border-[#165DFF] resize-none placeholder:text-[#C9CDD4]"
                />
              </div>
            ))}
          </div>

          <div className="flex justify-between mt-6">
            <button
              onClick={() => s.onboardingStep > 0 && u({ onboardingStep: s.onboardingStep - 1 })}
              className={`px-4 py-2 rounded-lg text-sm ${s.onboardingStep > 0 ? 'text-[#4E5969] hover:bg-[#F7F8FA]' : 'text-[#C9CDD4] cursor-default'}`}>
              {s.onboardingStep > 0 ? '上一步' : ''}
            </button>
            <div className="flex gap-2">
              <button onClick={() => u({ showOnboarding: false })} className="px-4 py-2 rounded-lg text-sm text-[#86909C] hover:bg-[#F7F8FA]">跳过</button>
              <button onClick={nextStep}
                className="px-6 py-2 rounded-lg bg-[#165DFF] text-white text-sm font-medium hover:bg-[#0E4BD8] transition-colors">
                {s.onboardingStep < steps.length - 1 ? '下一步' : '完成'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ============== Main App ==============
  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Title Bar */}
      <header className="flex items-center h-9 bg-[#F7F8FA] border-b border-[#F2F3F5] px-3 shrink-0 select-none" style={{ WebkitAppRegion: 'drag' } as any}>
        <div className="flex items-center gap-1.5" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <img src={logoIcon} alt="CoreBuddy" className="w-5 h-5 object-contain shrink-0" />
          <span className="text-[12px] font-medium text-[#4E5969]">CoreBuddy</span>
        </div>
        <span className="flex-1 text-center text-xs text-[#86909C]">{currentConv?.title || '新对话'}</span>
        <div className="flex items-center gap-0.5" style={{ WebkitAppRegion: 'no-drag' } as any}>
          {s.msgs.length > 0 && (
            <button onClick={() => { if (confirm('清除当前对话的所有消息？')) { const cid = s.activeId; if (cid) { api()?.conv.delete(cid); loadConvs(); u({ activeId: null, msgs: [] }) } } }}
              className="px-2 py-1 rounded text-xs text-[#86909C] hover:text-[#EC5B56] hover:bg-[#FCEBEB] transition-colors mr-1">
              清除
            </button>
          )}
          <button onClick={() => u({ showRight: !s.showRight })}
            className={`px-2 py-1 rounded text-xs transition-colors mr-1 ${s.showRight ? 'text-[#165DFF] bg-[#E8F3FF]' : 'text-[#86909C] hover:bg-[#F2F3F5]'}`}>
            面板
          </button>
          <button onClick={() => api()?.window.minimize()} className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#E5E6EB] text-[#86909C] hover:text-[#4E5969] transition-colors" title="最小化">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><path d="M2.5 6h7"/></svg>
          </button>
          <button onClick={() => api()?.window.maximize()} className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#E5E6EB] text-[#86909C] hover:text-[#4E5969] transition-colors" title="最大化">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><rect x="2.5" y="2.5" width="7" height="7" rx="1"/></svg>
          </button>
          <button onClick={() => api()?.window.close()} className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#EC5B56] text-[#86909C] hover:text-white transition-colors" title="关闭">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><path d="M3 3l6 6M9 3l-6 6"/></svg>
          </button>
        </div>
      </header>

      {/* Body: Left Sidebar | Main Chat | Right Panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar — white bg, WorkBuddy style */}
        <aside className="w-[220px] bg-white border-r border-[#F2F3F5] flex flex-col shrink-0">
          {/* Top action */}
          <div className="p-3">
            <button onClick={newConv}
              className="w-full h-9 rounded-lg bg-[#165DFF] hover:bg-[#0E4BD8] text-white text-[13px] font-medium transition-colors flex items-center justify-center gap-1.5">
              新建任务
            </button>
          </div>

          {/* Menu items */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-3 py-1">
              {[
                { label: '助理', icon: 'chat', view: 'chat' as const },
                { label: '连接器', icon: 'connector', view: 'connectors' as const },
                { label: '技能', icon: 'plugin', view: 'skills' as const },
                { label: '专家', icon: 'expert', view: 'experts' as const },
                { label: '自动化', icon: 'clock', view: 'automations' as const },
                { label: '更多', icon: 'more', view: 'more' as const },
              ].map(item => (
                <div key={item.label} onClick={() => u({ view: item.view })}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer text-[13px] transition-colors ${s.view === item.view ? 'bg-[#E8F3FF] text-[#165DFF] font-medium' : 'text-[#4E5969] hover:bg-[#F7F8FA]'}`}>
                  <span className="w-4 h-4 shrink-0 flex items-center justify-center">{iconSVG(item.icon)}</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>

            {/* Task list */}
            <div className="mt-3 px-3">
              <div className="flex items-center justify-between px-3 py-1.5">
                <span className="text-[12px] font-medium text-[#86909C]">任务</span>
                <span className="text-[11px] text-[#C9CDD4] bg-[#F2F3F5] px-1.5 rounded-full">{s.convs.length}</span>
              </div>
              {s.convs.slice(0, 8).map(c => {
                const isLoading = convLoading[c.id]
                return (
                <div key={c.id} onClick={() => switchConv(c.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer text-[13px] transition-colors group ${c.id === s.activeId ? 'bg-[#E8F3FF] text-[#165DFF]' : 'text-[#4E5969] hover:bg-[#F7F8FA]'}`}>
                  {isLoading ? (
                    <svg className="animate-[spin_1.2s_linear_infinite] shrink-0" width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <circle cx="5" cy="5" r="4" stroke="#C9CDD4" strokeWidth="1"/>
                      <path d="M5 1a4 4 0 013.54 2.1" stroke="#61C454" strokeWidth="1" strokeLinecap="round"/>
                    </svg>
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C9CDD4] shrink-0" />
                  )}
                  <span className="truncate flex-1">{c.title || '新对话'}</span>
                  <button onClick={e => { e.stopPropagation(); delConv(c.id) }}
                    className="opacity-0 group-hover:opacity-100 text-[#86909C] hover:text-[#EC5B56] text-xs shrink-0">✕</button>
                </div>
              )})}
            </div>
          </div>

          {/* Bottom — 个人中心 */}
          <div className="border-t border-[#F2F3F5] py-1 px-1">
            <div
              onClick={() => u({ showProfile: !s.showProfile })}
              className={`flex items-center gap-2 px-1 py-1 rounded-md cursor-pointer transition-colors ${s.showProfile ? 'bg-[#E8F3FF]' : 'hover:bg-[#F7F8FA]'}`}>
              <img src={appIcon} alt={s.userName} className="w-12 h-12 rounded-lg object-cover shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-[#1D2129] truncate">{s.userName}</div>
                <div className="text-[11px] text-[#C9CDD4]">体验版</div>
              </div>
              <span className="text-[#C9CDD4] text-xs">{s.showProfile ? '▾' : '▸'}</span>
            </div>
          </div>

          {/* Profile Popover */}
          {s.showProfile && (
            <div className="absolute left-[220px] bottom-0 w-[280px] bg-white border border-[#E5E6EB] rounded-xl shadow-xl z-50 ml-1 mb-1">
              {/* User header */}
              <div className="p-4 border-b border-[#F2F3F5]">
                <div className="flex items-center gap-3">
                  <img src={appIcon} alt={s.userName} className="w-14 h-14 rounded-lg object-cover shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold text-[#1D2129]">{s.userName}</span>
                      <span className="text-[11px] bg-[#165DFF]/10 text-[#165DFF] px-2 py-0.5 rounded-full">体验版</span>
                    </div>
                    <div className="text-[12px] text-[#165DFF] mt-0.5 cursor-pointer hover:underline">升级</div>
                  </div>
                </div>
              </div>

              {/* Buddy 加油站 */}
              <div className="p-4 border-b border-[#F2F3F5]">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-[#1D2129]">Buddy 加油站</span>
                  <span className="text-[13px] text-[#165DFF] cursor-pointer hover:underline">去加油 →</span>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <div className="w-8 h-8 rounded-lg bg-[#FFF7E6] flex items-center justify-center text-base">💰</div>
                  <div>
                    <div className="text-[11px] text-[#C9CDD4]">积分余额</div>
                    <div className="text-[15px] font-semibold text-[#1D2129]">0</div>
                  </div>
                </div>
              </div>

              {/* Menu items */}
              <div className="py-1">
                {[
                  { label: '查看记忆', icon: 'data', onClick: () => { u({ showProfile: false, showMem: true }) } },
                  { label: '设置', icon: 'gear', onClick: () => { u({ showProfile: false, showSet: true }) } },
                  { label: '外观', icon: 'palette' },
                  { label: '帮助与反馈', icon: 'help' },
                  { label: '检查更新', icon: 'update' },
                ].map(item => (
                  <div key={item.label} onClick={item.onClick}
                    className="flex items-center gap-3 px-4 py-2.5 cursor-pointer text-[13px] text-[#4E5969] hover:bg-[#F7F8FA] transition-colors">
                    <span className="w-4 h-4 shrink-0 flex items-center justify-center">{iconSVG(item.icon)}</span>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>

              {/* Logout */}
              <div className="border-t border-[#F2F3F5] py-1">
                <div onClick={() => { api()?.config.set('apiKey', ''); u({ showProfile: false, loggedIn: false }) }}
                  className="flex items-center gap-3 px-4 py-2.5 cursor-pointer text-[13px] text-[#EC5B56] hover:bg-[#F7F8FA] transition-colors">
                  <span className="w-4 h-4 shrink-0 flex items-center justify-center">{iconSVG('logout')}</span>
                  <span>退出登录</span>
                </div>
              </div>
            </div>
          )}

          {/* Backdrop to close profile */}
          {s.showProfile && (
            <div className="fixed inset-0 z-40" onClick={() => u({ showProfile: false })} />
          )}
        </aside>

        {/* Main Area — conditional on view */}
        {s.view === 'chat' ? (
        <main className="flex-1 flex flex-col bg-white min-w-0">
          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto px-5 py-6 flex flex-col gap-5">
            {/* Welcome */}
            {s.msgs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8">
                <img src={logoText} alt="CoreBuddy" className="w-56 h-auto mb-1" />
                <div className="text-xl font-medium text-[#1D2129] mb-1">你好，{s.userName}</div>
                <div className="text-sm text-[#86909C] mb-6">
                  {s.apiKey ? '我是你的私人 AI 秘书。直接开始吧：' : '点击设置 API Key 后开始。'}
                </div>
              </div>
            )}
            {/* Messages — WorkBuddy style: consecutive AI messages merged into one block */}
            {(() => {
              // ----- Phase 1: Build message groups -----
              // Consecutive assistant (+ tool) messages merge into one display block
              interface ParsedAssistant {
                msg: typeof s.msgs[0]
                toolBlocks: Array<{ name: string; params: Record<string, any> }>
                thinkingText: string
                answerText: string
                tools: Array<{ name: string; content: string }>
              }
              const groups: Array<
                | { type: 'user'; key: string; msg: typeof s.msgs[0] }
                | { type: 'assistant'; key: string; msgs: ParsedAssistant[] }
              > = []

              for (let gi = 0; gi < s.msgs.length; ) {
                const m = s.msgs[gi]
                if (m.role === 'boundary') { gi++; continue }

                // User → own group
                if (m.role === 'user') {
                  groups.push({ type: 'user', key: m.id, msg: m })
                  gi++
                  continue
                }

                // Assistant → start assistant group, collect consecutive assistant+tool messages
                if (m.role === 'assistant') {
                  const assistantMsgs: ParsedAssistant[] = []

                  while (gi < s.msgs.length) {
                    const cm = s.msgs[gi]
                    if (cm.role === 'user') break
                    if (cm.role === 'boundary') { gi++; continue }

                    if (cm.role === 'assistant') {
                      // Parse assistant message (same logic as before)
                      const toolBlocks: Array<{ name: string; params: Record<string, any> }> = []
                      const r = /```tool\s*\n?(\{[\s\S]*?\})\s*```/g; let mt
                      while ((mt = r.exec(cm.content)) !== null) {
                        try { const t = JSON.parse(mt[1]); toolBlocks.push({ name: t.action, params: t.params || {} }) } catch {}
                      }

                      let clean = cm.content
                      clean = clean.replace(/```tool[\s\S]*?```/g, '')
                      clean = clean.replace(/\[使用工具:.*?\]\n?/g, '').replace(/\[Hook[^\]]*\]\n?/g, '').replace(/\[警告\].*?\n?/g, '').replace(/^\s*\n/gm, '').trim()

                      // Also strip raw /think markers from clean
                      // (the matched thinking text will be captured below; any leftover markers after removal are stripped)
                      clean = clean.replace(/^\/think\s*\n?/gm, '').trim()

                      let thinkingText = ''
                      let answerText = clean
                      // Support both /think.../think (WorkBuddy style) and [think]...[/think] (legacy)
                      const thinkingMatch = clean.match(/\/think\s*\n?([\s\S]*?)\n?\/think/i) || clean.match(/\[think\]([\s\S]*?)\[\/think\]/i)
                      if (thinkingMatch) {
                        thinkingText = thinkingMatch[1].trim()
                        // Strip both formats from answer
                        answerText = clean.replace(/\/think\s*\n?([\s\S]*?)\n?\/think/gi, '').replace(/\[think\][\s\S]*?\[\/think\]/gi, '').trim()
                        answerText = answerText.replace(/^\n+|\n+$/g, '').replace(/\n{3,}/g, '\n\n')
                      } else if (toolBlocks.length > 0) {
                        const parts = clean.split(/\n(?=我在|已写入|已完成|根据|现在|这是|好的|让我|我来)/i)
                        if (parts.length >= 2) {
                          thinkingText = parts.slice(0, -1).join('\n').trim()
                          answerText = parts.slice(-1).join('\n').trim()
                        } else if (clean.length > 0) {
                          answerText = clean
                        }
                      }

                      if (/<(script|style|html|head|body|meta|link)[^>]*>/i.test(answerText)) {
                        answerText = answerText.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s{2,}/g, '\n').trim()
                      }

                      // Collect tool results for this message
                      const tools: Array<{ name: string; content: string }> = []
                      let ti = gi + 1
                      while (ti < s.msgs.length && s.msgs[ti].role === 'tool') {
                        const tc = s.msgs[ti].content
                        const nm = tc.match(/Tool "(\w+)" result/)
                        tools.push({ name: nm ? nm[1] : 'tool', content: tc.replace(/^Tool "\w+" result:\s*/m, '').trim().slice(0, 1000) })
                        ti++
                      }

                      assistantMsgs.push({ msg: cm, toolBlocks, thinkingText, answerText, tools })
                      gi = ti // Advance past consumed tool messages
                      continue
                    }

                    if (cm.role === 'tool') { gi++; continue }
                    break
                  }

                  if (assistantMsgs.length > 0) {
                    groups.push({ type: 'assistant', key: assistantMsgs[0].msg.id, msgs: assistantMsgs })
                  }
                  continue
                }

                gi++ // Skip orphan tool messages
              }

              // ----- Phase 2: Render groups -----
              const els: React.ReactNode[] = []

              for (let bi = 0; bi < groups.length; bi++) {
                const group = groups[bi]
                const isLastGroup = bi === groups.length - 1

                // ---- User bubble ----
                if (group.type === 'user') {
                  els.push(<div key={group.key} className="ml-auto max-w-[75%]">
                    <div className="bg-[#E8F3FF] text-[15px] text-[#1D2129] px-4 py-2.5 rounded-xl whitespace-pre-wrap break-words">
                      {group.msg.content.split(/(\[img:[^\]]+\]|\[附件:[^\]]+\])/g).map((part, pi) => {
                        const imgMatch = part.match(/^\[img:(.+)\]$/)
                        if (imgMatch) {
                          return <img key={pi} src={`file://${imgMatch[1]}`} className="max-w-[200px] max-h-[200px] rounded-lg object-cover my-1" alt="" />
                        }
                        const attMatch = part.match(/^\[附件:(.+)\|(.+)\]$/)
                        if (attMatch) {
                          return <span key={pi} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/60 text-[12px] text-[#86909C] my-0.5">📄 {attMatch[2]}</span>
                        }
                        return part || null
                      })}
                    </div>
                  </div>)
                  continue
                }

                // ---- Assistant block (merged consecutive messages) ----
                if (group.type === 'assistant') {
                  const parsedMsgs = group.msgs
                  const firstMsg = parsedMsgs[0].msg
                  const lastParsed = parsedMsgs[parsedMsgs.length - 1]
                  const lastMsg = lastParsed.msg

                  const groupIsLoading = isLastGroup && s.loading
                  const lastHasNoAnswer = !lastParsed.answerText && !lastParsed.toolBlocks.length

                  // All tool results across the group
                  const allTools = parsedMsgs.flatMap(p => p.tools)

                  // Combined answer for copy
                  const combinedAnswer = parsedMsgs.map(p => p.answerText).filter(Boolean).join('\n\n---\n\n')

                  els.push(
                    <div key={group.key} className="flex items-start gap-3 max-w-[100%]">
                      {/* Avatar column */}
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <img src={aiAvatar} alt="CoreBuddy" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                        {(s.mode !== 'craft' || s.persona !== 'office') && (
                          <div className="flex flex-col gap-0.5 items-center">
                            <span className="text-[9px] px-1 py-0.5 rounded bg-[#F2F3F5] text-[#86909C] leading-none whitespace-nowrap">
                              {s.persona === 'office' ? '办公' : s.persona === 'code' ? '开发' : '创意'}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Content column — all sub-messages rendered in order */}
                      <div className="flex-1 min-w-0 space-y-3">
                        {/* Tool Execution Timeline — shown during loading */}
                        {groupIsLoading && s.toolSteps.length > 0 && (
                          <div className="border border-[#E5E6EB] rounded-lg overflow-hidden">
                            <div className="flex items-center justify-between px-3 py-2 bg-[#F7F8FA] border-b border-[#E5E6EB]">
                              <div className="flex items-center gap-2">
                                <span className="text-[12px] font-medium text-[#1D2129]">工具执行</span>
                                <span className="text-[11px] text-[#86909C]">
                                  {s.toolStatus.completed}/{s.toolStatus.total} 步
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-[#C9CDD4]">{s.creditUsed.toFixed(2)}</span>
                              </div>
                            </div>
                            <div className="divide-y divide-[#F2F3F5]">
                              {s.toolSteps.map((step, idx) => (
                                <div key={idx} className="flex items-center gap-2.5 px-3 py-2 hover:bg-[#FAFAFA] transition-colors">
                                  {/* Status circle — grey outline only */}
                                  <span className="w-[18px] h-[18px] shrink-0 flex items-center justify-center">
                                    {step.status === 'completed' ? (
                                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                                        <circle cx="9" cy="9" r="8" stroke="#C9CDD4" strokeWidth="1"/>
                                        <path d="M5.5 9l2.5 2.5L12.5 6.5" stroke="#86909C" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                                      </svg>
                                    ) : step.status === 'running' ? (
                                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                                        <circle cx="9" cy="9" r="8" stroke="#C9CDD4" strokeWidth="1"/>
                                        <path d="M9 3v3M9 12v3M5 9H3M14 9h-3" stroke="#86909C" strokeWidth="1" strokeLinecap="round">
                                          <animateTransform attributeName="transform" type="rotate" from="0 9 9" to="360 9 9" dur="1.5s" repeatCount="indefinite"/>
                                        </path>
                                      </svg>
                                    ) : step.status === 'failed' ? (
                                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                                        <circle cx="9" cy="9" r="8" stroke="#C9CDD4" strokeWidth="1"/>
                                        <path d="M6.5 6.5l5 5M11.5 6.5l-5 5" stroke="#86909C" strokeWidth="1" strokeLinecap="round"/>
                                      </svg>
                                    ) : (
                                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                                        <circle cx="9" cy="9" r="8" stroke="#E5E6EB" strokeWidth="1"/>
                                      </svg>
                                    )}
                                  </span>
                                  <span className="text-[12px] text-[#1D2129] font-mono flex-1">{step.name}</span>
                                  <span className="text-[10px] text-[#C9CDD4]">
                                    {step.status === 'completed' ? '完成' :
                                     step.status === 'running' ? '执行中...' :
                                     step.status === 'failed' ? '失败' : '等待中'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Render each sub-message content in order */}
                        {parsedMsgs.map((parsed, pi) => (
                          <React.Fragment key={parsed.msg.id}>
                            {/* Thinking block — collapsed by default (WorkBuddy style), click to expand */}
                            {parsed.thinkingText && (
                              <CollapsibleSection
                                title={parsedMsgs.length > 1 ? `思考过程 (第${pi + 1}轮)` : '思考路径'}
                                defaultOpen={false}>
                                <div className="text-[13px] text-[#4E5969] leading-relaxed whitespace-pre-wrap"><FormattedContent content={parsed.thinkingText} /></div>
                              </CollapsibleSection>
                            )}

                            {/* Answer text */}
                            {parsed.answerText ? (
                              <div>
                                <FormattedContent content={parsed.answerText.replace(/\[choice:[^\]]+?:[^\]]+?\]/g, '')} />
                                {/* Interactive choices — [choice:label:response] format */}
                                {(() => {
                                  const choices: Array<{label: string; text: string}> = []
                                  const regex = /\[choice:([^\]]+?):([^\]]+?)\]/g
                                  let match
                                  while ((match = regex.exec(parsed.answerText)) !== null) {
                                    choices.push({ label: match[1], text: match[2] })
                                  }
                                  if (choices.length === 0) return null
                                  return (
                                    <div className="flex flex-wrap gap-2 mt-3">
                                      {choices.map((c, ci) => (
                                        <button key={ci}
                                          onClick={() => send(undefined, c.text)}
                                          className="px-3.5 py-1.5 rounded-lg border border-[#165DFF] bg-white text-[12px] text-[#165DFF] hover:bg-[#E8F3FF] hover:shadow-sm cursor-pointer transition-all">
                                          {c.label}
                                        </button>
                                      ))}
                                    </div>
                                  )
                                })()}
                              </div>
                            ) : null}
                          </React.Fragment>
                        ))}

                        {/* Loading dots — shown while generating answer */}
                        {groupIsLoading && !lastHasNoAnswer && lastParsed.answerText && (
                          <div className="flex items-center gap-2 text-[12px] text-[#165DFF] animate-pulse">
                            <span className="w-2 h-2 rounded-full bg-[#165DFF] animate-bounce" style={{ animationDelay: '0ms' }}></span>
                            <span className="w-2 h-2 rounded-full bg-[#165DFF] animate-bounce" style={{ animationDelay: '150ms' }}></span>
                            <span className="w-2 h-2 rounded-full bg-[#165DFF] animate-bounce" style={{ animationDelay: '300ms' }}></span>
                            <span className="text-[#86909C] ml-1">AI 正在生成...</span>
                          </div>
                        )}

                        {/* Tool results — always visible as steps */}
                        {!groupIsLoading && allTools.length > 0 && (
                          <div className="border border-[#E5E6EB] rounded-lg overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-2 bg-[#F7F8FA] text-[12px] text-[#4E5969]">
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#86909C" strokeWidth="1"/><path d="M6 3v3l2 1" stroke="#86909C" strokeWidth="1" strokeLinecap="round"/></svg>
                              <span>执行路径 ({allTools.length} 步)</span>
                            </div>
                            <div className="divide-y divide-[#F2F3F5]">
                              {allTools.map((t, ti) => {
                                return (
                                  <details key={ti} className="text-[12px]">
                                    <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[#FAFAFA]">
                                      <span className="w-1.5 h-1.5 rounded-full bg-[#C9CDD4] shrink-0"></span>
                                      <span className="font-mono text-[#1D2129]">{t.name}</span>
                                    </summary>
                                    <pre className="mx-3 mb-2 text-[11px] text-[#86909C] font-mono bg-[#F7F8FA] rounded p-2 whitespace-pre-wrap max-h-40 overflow-y-auto">{t.content}</pre>
                                  </details>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Loading spinner — when waiting for first answer */}
                        {groupIsLoading && lastHasNoAnswer && (
                          <div className="flex flex-col gap-2 py-2">
                            {/* Thinking indicator — grey outline style */}
                            <div className="flex items-center gap-2.5 text-[13px] text-[#86909C]">
                              <div className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#C9CDD4] animate-bounce" style={{ animationDelay: '0ms' }}></span>
                                <span className="w-1.5 h-1.5 rounded-full bg-[#C9CDD4] animate-bounce" style={{ animationDelay: '150ms' }}></span>
                                <span className="w-1.5 h-1.5 rounded-full bg-[#C9CDD4] animate-bounce" style={{ animationDelay: '300ms' }}></span>
                              </div>
                              <span className="font-medium">思考中</span>
                            </div>
                            {/* Tool execution progress — WorkBuddy style steps */}
                            {s.toolStatus.active && s.toolSteps.length > 0 && (
                              <div className="ml-1 space-y-1.5">
                                {s.toolSteps.map((step, si) => (
                                  <div key={si} className="flex items-center gap-2 text-[12px]">
                                    {step.status === 'completed' ? (
                                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#C9CDD4" strokeWidth="1"/><path d="M3.5 6l1.5 1.5L8.5 4" stroke="#C9CDD4" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                    ) : step.status === 'running' ? (
                                      <svg className="animate-spin" width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4.5" stroke="#C9CDD4" strokeWidth="1.2" strokeDasharray="20 30"/></svg>
                                    ) : (
                                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#E5E6EB" strokeWidth="1"/></svg>
                                    )}
                                    <span className={step.status === 'completed' ? 'text-[#86909C]' : step.status === 'running' ? 'text-[#86909C]' : 'text-[#C9CDD4]'}>{step.name}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {s.toolStatus.active && !s.toolSteps.length && (
                              <div className="flex items-center gap-1.5 text-[12px] text-[#86909C]">
                                <svg className="animate-spin" width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" stroke="#C9CDD4" strokeWidth="1.5" strokeDasharray="8 12"/></svg>
                                <span>{s.toolStatus.action || `正在执行 (${s.toolStatus.completed}/${s.toolStatus.total})`}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Tool action status indicators — past actions */}
                        {!groupIsLoading && allTools.length > 0 && combinedAnswer && (
                          <div className="space-y-0.5">
                            {allTools.map((t, ti) => {
                              const isRead = t.name.includes('read') || t.name.includes('list')
                              const isWrite = t.name.includes('write') || t.name.includes('create')
                              const isSearch = t.name.includes('search')
                              const label = isRead ? '已读取' : isWrite ? '已创建' : isSearch ? '已搜索' : '已执行'
                              return (
                                <div key={ti} className="flex items-center gap-1.5 text-[11px] text-[#86909C]">
                                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                    <circle cx="6" cy="6" r="5" stroke="#C9CDD4" strokeWidth="1"/>
                                    <path d="M3.5 6l1.5 1.5L8.5 4" stroke="#C9CDD4" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                  <span className="text-[#86909C]">{label}</span>
                                  <span className="text-[#C9CDD4] truncate max-w-[200px]">{t.name}</span>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {/* Action Bar — copy, like, dislike (bottom of merged block) */}
                        {!groupIsLoading && combinedAnswer && (
                          <div className="mt-2 pt-2 border-t border-[#F2F3F5] flex items-center gap-1 flex-wrap">
                            <button
                              onClick={async () => {
                                try { await navigator.clipboard.writeText(combinedAnswer) } catch {}
                              }}
                              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-[#86909C] hover:bg-[#F2F3F5] hover:text-[#4E5969] transition-colors"
                              title="复制回答">
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="5" width="8" height="9" rx="1"/><path d="M3 11V3.5A1.5 1.5 0 014.5 2h7"/></svg>
                              <span>复制</span>
                            </button>

                            <button
                              onClick={() => {
                                const newState = msgFeedback[lastMsg.id] === 'like' ? null : 'like'
                                setMsgFeedback(prev => ({ ...prev, [lastMsg.id]: newState }))
                                if (newState === 'like') {
                                  api()?.chat.feedback(s.activeId || '', lastMsg.id, 'like', combinedAnswer)
                                }
                              }}
                              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors ${
                                msgFeedback[lastMsg.id] === 'like'
                                  ? 'text-[#165DFF] bg-[#E8F3FF]'
                                  : 'text-[#86909C] hover:bg-[#F2F3F5] hover:text-[#4E5969]'
                              }`}
                              title="赞同回答">
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 6.5h-1a1 1 0 00-1 1v6a1 1 0 001 1h1M4.5 6.5l1.8-4.3a1.6 1.6 0 012.9.6v2.7h3.2a1.5 1.5 0 011.4 1.9l-1.3 5.5a1 1 0 01-1 .6H8.3a4 4 0 01-2-.6L4.5 13"/></svg>
                              <span>赞同</span>
                            </button>

                            <button
                              onClick={() => {
                                const newState = msgFeedback[lastMsg.id] === 'dislike' ? null : 'dislike'
                                setMsgFeedback(prev => ({ ...prev, [lastMsg.id]: newState }))
                                if (newState === 'dislike') {
                                  api()?.chat.feedback(s.activeId || '', lastMsg.id, 'dislike', combinedAnswer)
                                }
                              }}
                              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors ${
                                msgFeedback[lastMsg.id] === 'dislike'
                                  ? 'text-[#EC5B56] bg-[#FFF0F0]'
                                  : 'text-[#86909C] hover:bg-[#F2F3F5] hover:text-[#4E5969]'
                              }`}
                              title="不赞同回答">
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 9.5h1a1 1 0 001-1v-6a1 1 0 00-1-1h-1M11.5 9.5L9.7 13.8a1.6 1.6 0 01-2.9-.6V10.5H3.6a1.5 1.5 0 01-1.4-1.9l1.3-5.5a1 1 0 011-.6h3.2a4 4 0 012 .6l1.8 1.4"/></svg>
                              <span>不赞同</span>
                            </button>

                            <span className="text-[10px] text-[#C9CDD4] ml-auto">
                              共消耗 ~{Math.round(combinedAnswer.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').length / 4)} tokens
                            </span>
                          </div>
                        )}

                        {/* Artifacts produced */}
                        {(() => {
                          const msgArtifacts = s.artifacts.filter(a => {
                            const aTime = new Date(a.time).getTime()
                            const mTime = new Date(firstMsg.time).getTime()
                            return Math.abs(aTime - mTime) < 300000
                          })
                          if (msgArtifacts.length === 0) return null
                          return (
                            <div className="p-2 rounded-lg bg-[#F7F8FA] border border-[#F2F3F5]">
                              <div className="text-[11px] font-medium text-[#4E5969] mb-1">
                                任务产生制品 ({msgArtifacts.length}个):
                              </div>
                              {msgArtifacts.map((a, ai) => (
                                <div key={ai}
                                  onClick={() => api()?.file.open(a.path)}
                                  className="flex items-center gap-1.5 text-[11px] text-[#165DFF] cursor-pointer hover:underline py-0.5 truncate">
                                  {fileIcon(a.type)}
                                  <span className="truncate">{a.path.split(/[/\\]/).pop()}</span>
                                  <span className="text-[#C9CDD4] shrink-0">- {a.type}</span>
                                </div>
                              ))}
                            </div>
                          )
                        })()}

                        {/* File changes summary */}
                        {!groupIsLoading && allTools.length > 0 && combinedAnswer && (
                          <div className="rounded-lg bg-[#F7F8FA] border border-[#F2F3F5] overflow-hidden">
                            <div className="text-[11px] font-medium text-[#4E5969] px-3 py-2 border-b border-[#F2F3F5]">
                              文件变更 ({allTools.length}个):
                            </div>
                            <div className="divide-y divide-[#F2F3F5]">
                              {allTools.map((t, ti) => {
                                const isCreate = t.name.includes('create') || t.name.includes('write')
                                const label = isCreate ? '新建' : '修改'
                                let filePath = ''
                                const pathMatch = t.content.match(/(?:[A-Za-z]:[\\/][^\s]+|(?:\/[^\s]+)+\.\w+|(?:\S+[\\/])+\S+\.\w+)/)
                                if (pathMatch) filePath = pathMatch[0]
                                else filePath = t.name
                                const fileName = filePath.split(/[/\\]/).pop() || filePath
                                const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() || '' : ''
                                return (
                                  <div key={ti} className="flex items-center gap-2 px-3 py-2 text-[11px]">
                                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#C9CDD4]"></span>
                                    <span className="text-[#C9CDD4] font-mono w-3 shrink-0">{isCreate ? '+' : '~'}</span>
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium text-[#86909C] shrink-0">{label}</span>
                                    <span className="text-[#1D2129] truncate font-mono text-[11px]">{fileName}</span>
                                    {ext && <span className="text-[#C9CDD4] text-[10px] shrink-0">.{ext}</span>}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                }
              }
              return els
            })()}
            <div ref={endRef} />
          </div>

          {/* Compacting status bar — WorkBuddy style */}
          {compacting && (
            <div className="flex items-center gap-2 px-5 py-1 text-[11px] text-[#86909C] bg-[#F7F8FA] border-t border-[#F2F3F5] select-none shrink-0">
              <div className="flex items-center gap-1">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <circle cx="5" cy="5" r="4" stroke="#C9CDD4" strokeWidth="1.5" strokeDasharray="8 12">
                    <animateTransform attributeName="transform" type="rotate" from="0 5 5" to="360 5 5" dur="1.5s" repeatCount="indefinite"/>
                  </circle>
                </svg>
                <span>正在压缩上下文</span>
              </div>
              <span className="text-[#C9CDD4]">·</span>
              <span className="text-[#C9CDD4]">优化 token</span>
            </div>
          )}

          {/* Version indicator */}
          <div className="flex items-center justify-end px-5 py-0.5 text-[10px] text-[#C9CDD4] select-none shrink-0 bg-white border-t border-[#F2F3F5]">
            <span>v{APP_VERSION}</span>
            <span className="mx-1">·</span>
            <span className="font-mono">CoreBuddy</span>
          </div>

          {/* Input Area */}
          <div className="px-5 py-3 border-t border-[#F2F3F5] bg-white shrink-0">
            {/* Pending task queue — WorkBuddy style */}
            {s.pendingTasks.length > 0 && (
              <div className="mb-2">
                <details className="group" open>
                  <summary className="flex items-center gap-1.5 text-[11px] text-[#86909C] cursor-pointer hover:text-[#4E5969] select-none mb-1 px-0.5">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="8" cy="8" r="6.5" />
                      <path d="M8 4.5v4l2.5 1.5" />
                    </svg>
                    <span>等待中任务</span>
                    <span className="ml-0.5 text-[10px] text-[#C9CDD4]">{s.pendingTasks.length}</span>
                    <svg className="ml-auto text-[#E5E6EB] group-open:hidden" width="10" height="10" viewBox="0 0 8 8" fill="currentColor"><path d="M0 2h8L4 6z"/></svg>
                    <svg className="ml-auto text-[#E5E6EB] hidden group-open:inline" width="10" height="10" viewBox="0 0 8 8" fill="currentColor"><path d="M2 0v8l4-4z"/></svg>
                  </summary>
                  <div className="space-y-1">
                    {s.pendingTasks.map((task, idx) => (
                      <div key={task.id}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-[#E5E6EB] text-xs text-[#4E5969] group/task">
                        <button onClick={() => {
                          // Move to top
                          const tasks = [...s.pendingTasks]
                          const [item] = tasks.splice(idx, 1)
                          u({ pendingTasks: [item, ...tasks] })
                        }}
                          className="text-[#C9CDD4] hover:text-[#165DFF] cursor-pointer flex-none transition-colors"
                          title="置顶">
                          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2l5 6h-3.5v6h-3V8H3l5-6z"/></svg>
                        </button>
                        <span className="flex-1 truncate">{task.text}</span>
                        {task.attachments.length > 0 && (
                          <span className="text-[10px] text-[#C9CDD4] flex-none">{task.attachments.length}个附件</span>
                        )}
                        <button onClick={() => {
                          u({ pendingTasks: s.pendingTasks.filter(t => t.id !== task.id) })
                        }}
                          className="text-[#C9CDD4] hover:text-[#F53F3F] cursor-pointer flex-none transition-colors"
                          title="删除">
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}
            <div className="bg-[#F7F8FA] border border-[#E5E6EB] rounded-xl px-3 py-2"
              onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
              onDrop={e => {
                e.preventDefault(); e.stopPropagation()
                const files = e.dataTransfer?.files
                if (!files || files.length === 0) return
                Array.from(files).forEach(file => {
                  const reader = new FileReader()
                  reader.onload = async () => {
                    const base64 = (reader.result as string).split(',')[1]
                    const result = await api()!.file.saveTemp(base64, file.name)
                    if (result.success && result.path) {
                      const attachType = file.type.startsWith('image/') ? 'image' : 'document'
                      u({ attachments: [...s.attachments, { name: file.name, path: result.path, type: attachType, size: file.size }] })
                    }
                  }
                  reader.readAsDataURL(file)
                })
              }}>
              <div className="flex items-start gap-2 flex-wrap">
                {/* Attachment cards — inline with text */}
                {s.attachments.length > 0 && (
                  <div className="flex flex-row flex-wrap gap-1.5">
                    {s.attachments.map((att, idx) => (
                      <div key={idx} className="flex-none flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white border border-[#E5E6EB]">
                        <div className="flex-none w-5 h-5 rounded bg-[#165DFF] flex items-center justify-center text-white text-[8px] font-bold overflow-hidden">
                          {att.type === 'image' ? (
                            <img src={`file://${att.path}`} className="w-full h-full rounded object-cover" alt="" />
                          ) : (
                            <span>{att.name.includes('.') ? att.name.split('.').pop()?.slice(0,3).toUpperCase() : '?'}</span>
                          )}
                        </div>
                        {att.type !== 'image' && (
                          <span className="text-[11px] text-[#4E5969] max-w-[60px] truncate">{att.name}</span>
                        )}
                        <button onClick={() => u({ attachments: s.attachments.filter((_, j) => j !== idx) })}
                          className="text-[10px] text-[#C9CDD4] hover:text-[#F53F3F] cursor-pointer leading-none">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <textarea
                  className="flex-1 min-w-[120px] min-h-6 border-none bg-transparent text-[15px] text-[#1D2129] resize-none outline-none p-0 placeholder:text-[#C9CDD4]"
                placeholder={s.apiKey ? '告诉秘书你想做什么... 输入 / 使用快捷命令' : '请先设置 API Key'}
                rows={1} value={s.input}
                onChange={e => u({ input: e.target.value })}
                onKeyDown={keyDown}
                onPaste={e => {
                  const items = e.clipboardData?.items
                  if (!items) return
                  Array.from(items).forEach(item => {
                    if (item.type.startsWith('image/')) {
                      e.preventDefault()
                      const file = item.getAsFile()
                      if (!file) return
                      const reader = new FileReader()
                      reader.onload = async () => {
                        const base64 = (reader.result as string).split(',')[1]
                        const ext = file.name.split('.').pop() || 'png'
                        const fileName = `paste-${Date.now()}.${ext}`
                        const result = await api()!.file.saveTemp(base64, fileName)
                        if (result.success && result.path) {
                          const attachType = file.type.startsWith('image/') ? 'image' : 'document'
                          u({ attachments: [...s.attachments, { name: file.name || fileName, path: result.path, type: attachType, size: file.size }] })
                        }
                      }
                      reader.readAsDataURL(file)
                    }
                  })
                }}
                onInput={e => { const el = e.target as HTMLTextAreaElement; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 200) + 'px' }} />
              </div>
              <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-[#F2F3F5]">
                {/* Slash commands — collapsible, WorkBuddy-style */}
                {s.apiKey && (
                  <div className="relative" ref={skillsRef}>
                    <button onClick={() => setSkillsOpen(!skillsOpen)}
                      className="px-2 py-1 rounded-lg text-xs text-[#86909C] hover:bg-[#F2F3F5] cursor-pointer transition-colors flex items-center gap-1 whitespace-nowrap">
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M8 2v2.5M8 11.5V14M2 8h2.5M11.5 8H14M5 5l1.7 1.7M9.3 9.3L11 11M11 5L9.3 6.7M6.7 9.3L5 11"/><circle cx="8" cy="8" r="1.2"/></svg>
                      <span>技能</span>
                      <svg className={(skillsOpen ? 'rotate-180' : '') + ' transition-transform'} width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M0 2h8L4 6z"/></svg>
                    </button>
                    {skillsOpen && (
                      <div className="absolute bottom-full left-0 mb-1.5 bg-white border border-[#E5E6EB] rounded-xl shadow-lg p-2 z-50 min-w-[180px]">
                        <div className="flex flex-wrap gap-1">
                          {[
                            { key: 'review', label: '审查' },
                            { key: 'explain', label: '解释' },
                            { key: 'fix', label: '修复' },
                            { key: 'optimize', label: '优化' },
                            { key: 'translate', label: '翻译' },
                            { key: 'summarize', label: '总结' },
                          ].map(cmd => (
                            <button key={cmd.key} onClick={() => { setSkillsOpen(false); u({ input: '/' + cmd.key + ' ' }) }}
                              className="px-2 py-1 rounded-lg text-[11px] text-[#4E5969] hover:text-[#165DFF] hover:bg-[#E8F3FF] cursor-pointer transition-colors">
                              /{cmd.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {/* File attachment button */}
                <label className="px-2 py-1 rounded-lg text-xs text-[#86909C] hover:bg-[#F2F3F5] cursor-pointer transition-colors flex items-center gap-1" title="上传文件">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                  <input type="file" multiple hidden
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.md"
                    onChange={async e => {
                      const files = e.target.files
                      if (!files) return
                      Array.from(files).forEach(file => {
                        const reader = new FileReader()
                        reader.onload = async () => {
                          const base64 = (reader.result as string).split(',')[1]
                          const result = await api()!.file.saveTemp(base64, file.name)
                          if (result.success && result.path) {
                            const attachType = file.type.startsWith('image/') ? 'image' : 'document'
                            u({ attachments: [...s.attachments, { name: file.name, path: result.path, type: attachType, size: file.size }] })
                          }
                        }
                        reader.readAsDataURL(file)
                      })
                      // Reset file input so same file can be selected again
                      e.target.value = ''
                    }} />
                </label>
                {/* Model selector — with dynamic font sizing based on name length */}
                <div className="relative" ref={modelDropdownRef}>
                  <button onClick={() => setModelOpen(!modelOpen)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg border border-transparent bg-transparent outline-none cursor-pointer hover:bg-[#F2F3F5] transition-colors">
                    <div className="flex items-center gap-0.5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#86909C" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                      <span className="text-[12px] text-[#86909C] truncate max-w-[130px]">{selectedModelName}</span>
                    </div>
                  </button>
                  {modelOpen && (
                    <div className="absolute bottom-full left-0 mb-1 z-20 bg-white border border-[#E5E6EB] rounded-lg py-1 min-w-[160px] shadow-lg">
                      <button onClick={() => { u({ modelId: 'auto' }); setModelOpen(false) }}
                        className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[#F7F8FA] transition-colors flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${s.modelId === 'auto' ? 'bg-[#1D2129]' : 'bg-transparent border border-[#C9CDD4]'}`}></span>
                        <span className="font-medium text-[#1D2129]">Auto</span>
                      </button>
                      <div className="h-px bg-[#F2F3F5] mx-2 my-1" />
                      {allModels.map(m => (
                        <button key={m.id} onClick={() => { u({ modelId: m.id }); setModelOpen(false) }}
                          className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[#F7F8FA] transition-colors flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full ${s.modelId === m.id ? 'bg-[#1D2129]' : 'bg-transparent border border-[#C9CDD4]'}`}></span>
                          <span className="text-[#4E5969]">{m.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="ml-auto" />
                {s.loading ? (
                  <button onClick={async () => {
                    if (s.activeId) { await api()?.chat.abort(s.activeId) }
                  }}
                    className="w-8 h-8 rounded-full bg-[#1D2129] text-white border-none flex items-center justify-center cursor-pointer hover:bg-[#4E5969] transition-all duration-200"
                    title="终止任务">
                    {/* Stop / square icon */}
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <rect x="3" y="3" width="10" height="10" rx="1.5" />
                    </svg>
                  </button>
                ) : (
                  <button onClick={send} disabled={!s.input.trim()}
                    className="w-8 h-8 rounded-full bg-[#1D2129] text-white border-none flex items-center justify-center disabled:bg-[#E5E6EB] disabled:text-[#C9CDD4] disabled:cursor-not-allowed cursor-pointer hover:bg-[#4E5969] transition-all duration-200"
                    title="发送消息">
                    {/* Paper plane icon (WorkBuddy style) */}
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 10l17-8-5 17-4-8-8-1z" />
                      <path d="M9 11l5-5" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </main>
        ) : (
        <main className="flex-1 flex flex-col bg-white min-w-0 overflow-y-auto">
          {/* Skills / Experts / Automations / More views */}
          {s.view === 'skills' && (
            <SkillsView />
          )}
          {s.view === 'experts' && (
            <ExpertsView />
          )}
          {s.view === 'automations' && (
            <AutomationsView />
          )}
          {s.view === 'more' && (
            <MoreView onOpenSettings={() => u({ showSet: true })} onNav={(v) => u({ view: v as any })} />
          )}
          {s.view === 'connectors' && (
            <ConnectorsView />
          )}
        </main>
        )}

        {/* Right Panel */}
        {s.showRight && (
          <aside className="w-[280px] bg-[#F7F8FA] border-l border-[#F2F3F5] flex flex-col shrink-0">
            <div className="flex border-b border-[#F2F3F5] bg-white">
              {rightTabs.map(t => (
                <button key={t.k} onClick={() => u({ rightTab: t.k })}
                  className={`flex-1 h-9 text-xs transition-colors relative ${s.rightTab === t.k ? 'text-[#165DFF] border-b-2 border-[#165DFF] font-medium' : 'text-[#86909C] border-b-2 border-transparent hover:text-[#4E5969]'}`}>
                  {t.l}
                  {t.k === 'artifacts' && s.artifacts.length > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full bg-[#EC5B56] text-white text-[9px] flex items-center justify-center px-1">{s.artifacts.length}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {s.rightTab === 'artifacts' && (
                <ArtifactsPanel artifacts={s.artifacts} />
              )}
              {s.rightTab === 'files' && (
                <FilesPanel />
              )}
              {s.rightTab === 'changes' && (
                <ChangesPanel msgs={s.msgs} />
              )}
              {s.rightTab === 'preview' && (
                <PreviewPanel msgs={s.msgs} artifacts={s.artifacts} />
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Settings Modal */}
      {s.showSet && <SettingsModal
        apiKey={s.apiKey}
        userName={s.userName}
        perm={s.perm}
        autoConfig={s.autoConfig}
        onApiKeyChange={(v: string) => u({ apiKey: v })}
        onNameChange={(v: string) => { u({ userName: v }); api()?.config.set('userName', v) }}
        onPermChange={(v: PermissionLevel) => u({ perm: v })}
        onAutoConfigChange={(v: { defaultModel: string; imageModel: string }) => u({ autoConfig: v })}
        onClose={() => { api()?.config.set('apiKey', s.apiKey); u({ showSet: false }) }}
        onModelsChange={() => {
          api()?.models.list().then(cfg => {
            if (cfg?.models) setAllModels(cfg.models)
          }).catch(() => {})
        }}
      />}

      {/* Memory Viewer Modal */}
      {s.showMem && <MemoryModal onClose={() => u({ showMem: false })} />}
    </div>
  )
}
