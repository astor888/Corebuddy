import React, { useState, useRef, useEffect, useCallback } from 'react'
import type { PermissionLevel, ChatMode, SkillInfo, ArtifactInfo, StreamDoneData } from './types/electron'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import logoText from '../assets/logo-text.png'
import logoIcon from '../assets/logo-icon.png'
import appIcon from '../assets/app-icon.jpg'
import aiAvatar from '../assets/ai-avatar-round.png'

// ====== Helper Components ======

function CollapsibleSection({ title, children, defaultOpen = true }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-[#F2F3F5] rounded-md mb-2 bg-transparent">
      <div className="flex items-center px-3 py-1.5 cursor-pointer select-none" onClick={() => setOpen(!open)}>
        <span className="w-1.5 h-1.5 rounded-full bg-[#C9CDD4] mr-2 shrink-0"></span>
        <span className="text-[11px] text-[#86909C] flex-1 truncate">{title}</span>
        <span className="text-[10px] text-[#C9CDD4] shrink-0 ml-2">{open ? '收起' : '展开'}</span>
      </div>
      {open && <div className="px-3 pb-2">{children}</div>}
    </div>
  )
}

// ====== Mermaid Diagram Renderer ======
function MermaidBlock({ chart }: { chart: string }) {
  const [svg, setSvg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancelled = false
    const id = `mermaid-${Math.random().toString(36).slice(2, 8)}`
    import('mermaid').then(m => {
      if (cancelled) return
      m.default.initialize({ startOnLoad: false, theme: 'default' })
      m.default.render(id, chart).then(({ svg: s }) => {
        if (!cancelled) setSvg(s)
      }).catch((e: any) => {
        if (!cancelled) setErr(String(e))
      })
    }).catch(e => {
      if (!cancelled) setErr(String(e))
    })
    return () => { cancelled = true }
  }, [chart])

  if (err) return <div className="my-2 p-3 rounded-lg bg-[#FFF0F0] border border-[#FFE0E0] text-[12px] text-[#EC5B56]">图表渲染失败: {err}</div>
  if (!svg) return <div className="my-2 p-4 rounded-lg bg-[#F7F8FA] text-center text-[12px] text-[#86909C]">渲染图表中...</div>
  return <div className="my-3 flex justify-center overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
}

// ====== Code Block Renderer (with syntax highlighting + copy + language label) ======
function CodeBlockRenderer({ className, children, ...props }: any) {
  const match = /language-(\w+)/.exec(className || '')
  const lang = match ? match[1] : ''
  const text = String(children).replace(/\n$/, '')
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  // Mermaid diagram block
  if (lang === 'mermaid') return <MermaidBlock chart={text} />

  const handleCopy = () => {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopied(false), 2000)
  }

  // Code block (multi-line) — render with header bar + copy button
  if (text.includes('\n') || className) {
    return (
      <div className="relative my-3 rounded-lg border border-[#E5E6EB] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-1.5 bg-[#F7F8FA] border-b border-[#E5E6EB]">
          <span className="text-[11px] text-[#86909C] font-mono font-medium">{lang || 'code'}</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-[11px] text-[#86909C] hover:text-[#165DFF] transition-colors"
          >
            {copied ? (
              <><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6l2 2 5-5" stroke="#61C454" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg><span className="text-[#61C454]">已复制</span></>
            ) : (
              <><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="2" y="2" width="7" height="8" rx="1" stroke="currentColor" strokeWidth="1"/><path d="M3.5 1.5h6a1 1 0 011 1v7" stroke="currentColor" strokeWidth="1"/></svg><span>复制</span></>
            )}
          </button>
        </div>
        <pre className="!bg-[#FAFBFC] !m-0 !p-4 overflow-x-auto text-[13px] leading-relaxed">
          <code className={className} {...props}>{children}</code>
        </pre>
      </div>
    )
  }

  // Inline code
  return <code className="text-[13px] bg-[#F2F3F5] px-1.5 py-0.5 rounded text-[#165DFF] font-mono" {...props}>{children}</code>
}

// ====== Rich Markdown Renderer (react-markdown + GFM + syntax highlighting) ======
function FormattedContent({ content }: { content: string }) {
  if (!content.trim()) return <span className="text-[#C9CDD4]">(空)</span>

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight, rehypeRaw]}
      components={{
        // Override pre to let code renderer control the wrapper
        pre({ children }: any) {
          return <>{children}</>
        },
        code: CodeBlockRenderer,
        // Blockquote
        blockquote({ children }: any) {
          return <blockquote className="border-l-[3px] border-[#165DFF] bg-[#F7F8FA] pl-4 pr-3 py-2 my-2 rounded-r text-[14px] text-[#4E5969] leading-relaxed">{children}</blockquote>
        },
        // Table wrapper
        table({ children }: any) {
          return <div className="overflow-x-auto my-2 border border-[#E5E6EB] rounded-lg"><table className="w-full text-[13px]">{children}</table></div>
        },
        thead({ children }: any) {
          return <thead className="bg-[#F7F8FA]">{children}</thead>
        },
        th({ children }: any) {
          return <th className="px-3 py-1.5 text-left font-medium text-[#4E5969] border-b border-[#E5E6EB]">{children}</th>
        },
        td({ children }: any) {
          return <td className="px-3 py-1.5 text-[#1D2129] border-b border-[#E5E6EB]">{children}</td>
        },
        // Links open in new tab
        a({ children, href }: any) {
          return <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#165DFF] underline">{children}</a>
        },
        // Images
        img({ src, alt }: any) {
          return <img src={src} alt={alt} className="max-w-full rounded-lg my-2" />
        },
        // Paragraphs
        p({ children }: any) {
          return <p className="text-[14px] text-[#1D2129] leading-relaxed my-1.5 whitespace-pre-wrap">{children}</p>
        },
        // Headings
        h1({ children }: any) {
          return <h1 className="text-[18px] font-semibold text-[#1D2129] mt-4 mb-2">{children}</h1>
        },
        h2({ children }: any) {
          return <h2 className="text-[16px] font-semibold text-[#1D2129] mt-3 mb-1.5">{children}</h2>
        },
        h3({ children }: any) {
          return <h3 className="text-[15px] font-semibold text-[#1D2129] mt-3 mb-1">{children}</h3>
        },
        // Lists
        ul({ children }: any) {
          return <ul className="list-disc list-inside text-[14px] text-[#1D2129] leading-relaxed my-1.5 space-y-0.5">{children}</ul>
        },
        ol({ children }: any) {
          return <ol className="list-decimal list-inside text-[14px] text-[#1D2129] leading-relaxed my-1.5 space-y-0.5">{children}</ol>
        },
        li({ children }: any) {
          return <li className="text-[14px] text-[#1D2129] leading-relaxed">{children}</li>
        },
        // Strong / Emphasis
        strong({ children }: any) {
          return <strong className="font-semibold text-[#1D2129]">{children}</strong>
        },
        // Horizontal rule
        hr() {
          return <hr className="my-3 border-[#E5E6EB]" />
        },
        // Strikethrough
        del({ children }: any) {
          return <del className="text-[#C9CDD4]">{children}</del>
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

// Outline SVG icons — WorkBuddy style, 16x16, stroke only (no fill)
function iconSVG(name: string) {
  const icons: Record<string, JSX.Element> = {
    chat: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3.5A1.5 1.5 0 013.5 2h9A1.5 1.5 0 0114 3.5v7a1.5 1.5 0 01-1.5 1.5H5.5L3 13.5v-10z"/><path d="M5 6h6M5 8.5h4"/></svg>,
    plugin: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M8 2v2.5M8 11.5V14M2 8h2.5M11.5 8H14M5 5l1.7 1.7M9.3 9.3L11 11M11 5L9.3 6.7M6.7 9.3L5 11"/><circle cx="8" cy="8" r="1.2"/></svg>,
    expert: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"><path d="M8 2l1.5 4.5H14l-3.5 2.8 1.2 4.2L8 10.8 4.3 13.5l1.2-4.2L2 6.5h4.5L8 2z"/></svg>,
    auto: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M3 8h1.5M11.5 8H13M8 3v1.5M8 11.5V13M4.5 4.5l1 1M10.5 10.5l1 1M4.5 11.5l1-1M10.5 5.5l1-1"/><circle cx="8" cy="8" r="3"/><circle cx="8" cy="8" r="1.2"/></svg>,
    more: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><circle cx="4" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="12" cy="8" r="1"/></svg>,
    plus: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 3.5v9M3.5 8h9"/></svg>,
    gear: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><circle cx="8" cy="8" r="2.5"/><path d="M8 1.5v1.2M8 13.3v1.2M2.5 3l1.2.6M12.3 12.4l1.2.6M1.5 8h1.2M13.3 8h1.2M2.5 13l1.2-.6M12.3 3.6l1.2-.6"/></svg>,
    chart: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><rect x="2" y="9" width="3" height="5.5" rx="0.5"/><rect x="6.5" y="5.5" width="3" height="9" rx="0.5"/><rect x="11" y="2.5" width="3" height="12" rx="0.5"/></svg>,
    palette: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><circle cx="8" cy="8" r="6.5"/><circle cx="6" cy="6.5" r="1.2"/><circle cx="10.5" cy="8" r="1"/><circle cx="6" cy="10.5" r="1"/></svg>,
    help: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><circle cx="8" cy="8" r="6.5"/><path d="M6.5 6a1.5 1.5 0 012.8-.3M8 11v.01"/></svg>,
    update: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 8a5.5 5.5 0 019.8-3.5V3M13.5 8a5.5 5.5 0 01-9.8 3.5V13"/><polyline points="11,3.5 14,2 14,6"/><polyline points="2,14 5,12 1,12"/></svg>,
    logout: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2.5H3.5a1 1 0 00-1 1v9a1 1 0 001 1H6M11 8H5.5M9.5 5.5L13 8l-3.5 2.5"/></svg>,
    user: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><circle cx="8" cy="5.5" r="2.5"/><path d="M3 13.5c0-2 2.2-3.5 5-3.5s5 1.5 5 3.5"/></svg>,
    money: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="3.5" width="13" height="9" rx="1.5"/><circle cx="8" cy="8" r="2.5"/><path d="M3 6v4M13 6v4" strokeDasharray="1 2"/></svg>,
    rocket: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"><path d="M8 2l-2 3H3L4.5 8l-1.5 3h3l2 3 2-3h3l-1.5-3L13 5H10L8 2z"/><circle cx="8" cy="8" r="1"/></svg>,
    skill: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="1.5" y="1.5" width="4.5" height="4.5" rx="1"/><rect x="10" y="1.5" width="4.5" height="4.5" rx="1"/><rect x="1.5" y="10" width="4.5" height="4.5" rx="1"/><rect x="10" y="10" width="4.5" height="4.5" rx="1"/></svg>,
    clock: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 5v3.5L10.5 10"/></svg>,
    doc: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2h6l4 4v8.5a.5.5 0 01-.5.5h-9A.5.5 0 013 14.5V2.5A.5.5 0 013.5 2z"/><path d="M9 2v4h4"/></svg>,
    connector: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="5" cy="5" r="2"/><circle cx="11" cy="11" r="2"/><path d="M6.5 6.5l3 3"/></svg>,
    bell: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2a4 4 0 00-4 4v2.5L2.5 10v1.5h11V10L12 8.5V6a4 4 0 00-4-4z"/><path d="M6.5 13A1.5 1.5 0 008 14.5 1.5 1.5 0 009.5 13"/></svg>,
    sun: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1M8 13.5v1M2.5 3l.7.7M12.8 12.3l.7.7M1.5 8h1M13.5 8h1M2.5 13l.7-.7M12.8 3.7l.7-.7"/></svg>,
    code: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 5L2 8l3 3M11 5l3 3-3 3M9.5 2.5l-3 11"/></svg>,
    mail: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="3" width="13" height="10" rx="1"/><path d="M1.5 3.5L8 9l6.5-5.5"/></svg>,
    data: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><rect x="2" y="9" width="3" height="5.5" rx="0.5"/><rect x="6.5" y="5.5" width="3" height="9" rx="0.5"/><rect x="11" y="2" width="3" height="12.5" rx="0.5"/></svg>,
  }
  return icons[name] || null
}

// ====== Main App ======

interface Msg { id: string; role: string; content: string; time: string }
interface Conv { id: string; title: string; updatedAt: string }
interface ScenePrompt { label: string; text: string }
interface SceneItem { id: string; name: string; icon: string; desc: string; color: string; systemPrompt: string; prompts: ScenePrompt[] }
interface AppState {
  loggedIn: boolean; userName: string; apiKey: string
  convs: Conv[]; activeId: string | null; msgs: Msg[]
  search: string; input: string; loading: boolean
  view: 'chat' | 'skills' | 'experts' | 'automations' | 'more' | 'connectors'; modelId: string
  perm: PermissionLevel; mode: ChatMode; persona: 'office' | 'creative'; showSet: boolean; showRight: boolean; showMem: boolean
  rightTab: 'artifacts' | 'files' | 'changes' | 'preview'
  thinking: boolean
  showProfile: boolean
  showOnboarding: boolean
  onboardingStep: number
  artifacts: ArtifactInfo[]
  toolStatus: { active: boolean; names: string[]; completed: number; total: number; action: string }
  activeScene: string | null
}

// ====== Scene Data (可后台自定义，当前为模拟数据) ======
const sceneData: SceneItem[] = [
  { id: 'ppt', name: '幻灯片', icon: 'doc', color: '#F53F3F', desc: '生成演示文稿',
    systemPrompt: '【场景：幻灯片制作】你是一个PPT制作专家。先和用户确认：页数、风格（简洁/商务/创意）、配色偏好、是否需要图表。确认后使用 create_pptx 工具生成。生成后将文件路径告知用户。',
    prompts: [
      { label: '生成公司介绍PPT', text: '帮我生成一份10页的公司介绍PPT，包含公司概况、业务范围、核心优势、团队介绍、发展规划。风格简洁专业。' },
      { label: '项目汇报幻灯片', text: '帮我制作项目进展汇报PPT，包含项目背景、当前进度、关键成果、风险与对策、下阶段计划。' },
      { label: '产品发布演示', text: '创建一份产品发布会PPT，包含产品亮点、功能演示、市场分析、定价策略、上市路线图。' },
    ]},
  { id: 'code', name: '程序员', icon: 'code', color: '#165DFF', desc: '写代码、调试、架构',
    systemPrompt: '【场景：编程开发】你是一个资深全栈工程师。先理解用户的需求，确认技术栈和关键设计点后再动手。使用 write_file 工具创建代码文件，文件默认保存到输出目录。',
    prompts: [
      { label: '写一个新功能', text: '帮我用TypeScript实现一个LRU缓存类，要求O(1)时间复杂度的get和put操作，支持泛型。' },
      { label: '代码审查', text: '请审查以下代码，关注安全性、性能、可维护性，给出具体改进建议。' },
      { label: '架构设计', text: '帮我设计一个微服务架构的系统，包括用户服务、订单服务、支付服务，画出架构图并说明技术选型。' },
    ]},
  { id: 'write', name: '内容创作', icon: 'palette', color: '#FF7D00', desc: '写文章、文案、报告',
    systemPrompt: '【场景：内容创作】你是一个专业内容创作者。先和用户确认文章的角色定位、篇幅和风格，再开始写作。输出较长内容时使用 create_markdown 工具保存为文件。',
    prompts: [
      { label: '写一篇公众号文章', text: '帮我写一篇关于"AI如何改变中小企业工作方式"的公众号文章，1500字左右，面向企业管理者。' },
      { label: '项目申报材料', text: '帮我撰写一份高新企业认定申报材料，包含企业基本情况、核心技术与知识产权、研发团队介绍。' },
      { label: '产品文案', text: '为一款面向程序员的AI编程助手写产品介绍文案，突出提高效率、降低错误率等核心卖点。' },
    ]},
  { id: 'legal', name: '法律/合同', icon: 'data', color: '#7B61FF', desc: '法律分析、合同审查',
    systemPrompt: '【场景：法律/合同】你是一个法律顾问。先了解具体场景和关注点，再给出分析。生成合同文档时使用 create_doc 工具保存为 Word 文件。',
    prompts: [
      { label: '审查合同条款', text: '请帮我审查这份合同的关键条款，重点关注：违约责任、知识产权归属、保密条款、争议解决方式。' },
      { label: '生成保密协议', text: '帮我生成一份员工保密协议，包含保密范围、保密期限、违约责任、竞业限制条款。' },
      { label: '法律风险分析', text: '分析以下商业行为可能存在的法律风险，并给出合规建议。' },
    ]},
  { id: 'research', name: '深度研究', icon: 'chart', color: '#00B42A', desc: '数据分析、市场调研',
    systemPrompt: '【场景：深度研究分析】你是一个市场研究分析师。先确认范围、维度、输出格式，再做分析。生成报告时使用 create_markdown 或 create_doc 工具保存文件。',
    prompts: [
      { label: '市场调研报告', text: '帮我做一份关于中国AI办公软件市场的调研报告，包含市场规模、主要玩家、用户需求、发展趋势。' },
      { label: '竞品分析', text: '分析飞书、钉钉、企业微信三款产品的功能差异、定价策略和用户口碑，用表格呈现。' },
      { label: '行业趋势分析', text: '分析2026年企业数字化转型的5大趋势，每个趋势给出具体数据和案例支撑。' },
    ]},
  { id: 'ops', name: '运营/策划', icon: 'rocket', color: '#F77234', desc: '活动策划、用户运营',
    systemPrompt: '【场景：运营策划】你是一个资深运营策划。先了解预算、目标人群和核心KPI，再输出方案。使用 create_markdown 保存为文档。',
    prompts: [
      { label: '活动策划方案', text: '帮我在微信私域策划一场用户裂变活动，包含活动目标、玩法设计、奖品设置、推广节奏、预期效果。' },
      { label: '社群运营规划', text: '制定一份知识付费社群3个月的运营计划，包括内容排期、互动玩法、转化路径。' },
      { label: '营销文案', text: '为我即将举办的线上直播写推广文案，主题是"中小企业数字化转型实战"，目标吸引500人报名。' },
    ]},
  { id: 'finance', name: '财务/投资', icon: 'money', color: '#E8652D', desc: '财务分析、投资研究',
    systemPrompt: '【场景：财务投资分析】你是一个财务分析师。先确认分析维度，再给出结论。生成报告时创建 .md 或 .docx 文件。',
    prompts: [
      { label: '财务报表分析', text: '帮我分析以下财务数据，重点关注：营收增长率、毛利率趋势、现金流状况、资产负债率。给出投资建议。' },
      { label: '投资分析报告', text: '对某家上市公司做基本面分析，包括行业地位、财务指标、估值分析、风险提示。' },
      { label: '税务筹划建议', text: '针对一家年营收5000万的中小企业，给出合理的税务筹划方案，重点考虑研发费用加计扣除。' },
    ]},
  { id: 'personal', name: '生活助手', icon: 'sun', color: '#0FC6C2', desc: '个人生活、学习规划',
    systemPrompt: '【场景：生活学习助手】你是一个贴心的个人生活顾问。回复要实用、具体、可执行。',
    prompts: [
      { label: '制定学习计划', text: '帮我制定一门Python数据分析的学习计划，每周8小时，12周完成，包括学习内容和实践项目。' },
      { label: '旅行攻略', text: '帮我制定一个5天4夜的成都旅行攻略，包括景点推荐、美食打卡、交通建议、住宿选择。' },
      { label: '健康饮食建议', text: '根据久坐办公族的身体状况，给我一个一周的健康饮食计划，包含早中晚餐和加餐。' },
    ]},
]

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }
const api = () => window.electronAPI

function permToNumber(perm: PermissionLevel): number {
  return perm === 'full' ? 5 : 3  // default=L3, full=L5 (all tools)
}

// ====== Right Panel Components ======

// Outline file type icons — stroke only, no fill
function fileIcon(ext: string): JSX.Element {
  const s = { stroke: 'currentColor', strokeWidth: '1.2', fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' as 'round' }
  if (['.html', '.htm'].includes(ext)) return <svg width="14" height="14" viewBox="0 0 14 14" {...s}><path d="M2.5 1.5h5L11 5v7.5a.5.5 0 01-.5.5h-8a.5.5 0 01-.5-.5v-11z"/><path d="M7.5 1.5v4h4"/><path d="M4 9l1 2 1-4 1 3 1-3"/></svg>
  if (['.md'].includes(ext)) return <svg width="14" height="14" viewBox="0 0 14 14" {...s}><path d="M2.5 1.5h5L11 5v7.5a.5.5 0 01-.5.5h-8a.5.5 0 01-.5-.5v-11z"/><path d="M7.5 1.5v4h4"/><path d="M5 8h4M5 10h3"/></svg>
  if (['.docx'].includes(ext)) return <svg width="14" height="14" viewBox="0 0 14 14" {...s}><path d="M2.5 1.5h5L11 5v7.5a.5.5 0 01-.5.5h-8a.5.5 0 01-.5-.5v-11z"/><path d="M7.5 1.5v4h4"/><path d="M5 8h4M5 10h3"/></svg>
  if (['.pptx'].includes(ext)) return <svg width="14" height="14" viewBox="0 0 14 14" {...s}><path d="M2.5 1.5h5L11 5v7.5a.5.5 0 01-.5.5h-8a.5.5 0 01-.5-.5v-11z"/><path d="M7.5 1.5v4h4"/><rect x="5" y="8" width="4" height="3" rx="0.5"/></svg>
  if (['.csv', '.xlsx'].includes(ext)) return <svg width="14" height="14" viewBox="0 0 14 14" {...s}><path d="M2.5 1.5h5L11 5v7.5a.5.5 0 01-.5.5h-8a.5.5 0 01-.5-.5v-11z"/><path d="M7.5 1.5v4h4"/><rect x="4" y="7.5" width="6" height="4.5" rx="0.5"/></svg>
  if (['.txt'].includes(ext)) return <svg width="14" height="14" viewBox="0 0 14 14" {...s}><path d="M2.5 1.5h5L11 5v7.5a.5.5 0 01-.5.5h-8a.5.5 0 01-.5-.5v-11z"/><path d="M7.5 1.5v4h4"/><path d="M5 8h4M5 10h2"/></svg>
  return <svg width="14" height="14" viewBox="0 0 14 14" {...s}><path d="M2.5 1.5h5L11 5v7.5a.5.5 0 01-.5.5h-8a.5.5 0 01-.5-.5v-11z"/><path d="M7.5 1.5v4h4"/></svg>
}

function ArtifactsPanel({ artifacts }: { artifacts: ArtifactInfo[] }) {
  return (
    <div className="text-xs text-[#4E5969]">
      <div className="font-medium text-[#1D2129] mb-2">对话产物</div>
      {artifacts.length === 0 ? (
        <div className="text-[#C9CDD4] text-center py-8">
          <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-[#F2F3F5] flex items-center justify-center">{iconSVG('doc')}</div>
          开始对话后，AI 生成的产物将显示在此处
        </div>
      ) : (
        <div className="space-y-2">
          {artifacts.map((a, i) => (
            <div key={i}
              onClick={() => api()?.file.open(a.path)}
              className="bg-white rounded-lg border border-[#E5E6EB] p-2.5 cursor-pointer hover:border-[#165DFF] hover:shadow-sm transition-all group">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="shrink-0">{fileIcon(a.type)}</span>
                <span className="text-[11px] font-medium text-[#1D2129] truncate group-hover:text-[#165DFF]">{a.path.split(/[/\\]/).pop()}</span>
                <span className="shrink-0 ml-auto opacity-0 group-hover:opacity-100 text-[#165DFF] text-[10px]">打开 →</span>
              </div>
              <div className="text-[10px] text-[#C9CDD4] mb-0.5 flex items-center gap-2">
                <span>{new Date(a.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="uppercase text-[#165DFF] bg-[#E8F3FF] px-1 py-0.5 rounded text-[9px]">{a.type}</span>
                <span className="bg-[#F2F3F5] px-1 py-0.5 rounded text-[9px]">{a.tool}</span>
              </div>
              <div className="text-[10px] text-[#86909C] truncate font-mono">{a.path}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FilesPanel() {
  const [files, setFiles] = useState<Array<{ name: string; path: string; size: number; time: string; ext: string }>>([])
  const [dir, setDir] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const a = api()
    if (a?.file) {
      a.file.listOutputs().then(r => {
        if (r.success && r.files) { setFiles(r.files); setDir(r.dir || '') }
        setLoading(false)
      }).catch(() => setLoading(false))
    } else {
      setLoading(false)
    }
    // Refresh every 5 seconds (only if API is available)
    if (a?.file) {
      const iv = setInterval(() => {
        a.file.listOutputs().then(r => {
          if (r.success && r.files) setFiles(r.files)
        }).catch(() => {})
      }, 5000)
      return () => clearInterval(iv)
    }
  }, [])

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div className="text-xs text-[#4E5969]">
      <div className="font-medium text-[#1D2129] mb-2">工作区文件</div>
      {loading ? (
        <div className="text-[#C9CDD4] text-center py-4">加载中...</div>
      ) : files.length === 0 ? (
        <div className="text-[#C9CDD4] text-center py-8">
          <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-[#F2F3F5] flex items-center justify-center">{iconSVG('data')}</div>
          暂无生成的文件
          {dir && <div className="mt-1 text-[10px] text-[#C9CDD4]">{dir}</div>}
        </div>
      ) : (
        <div>
          {dir && <div className="text-[10px] text-[#C9CDD4] mb-2 truncate font-mono" title={dir}>📁 {dir}</div>}
          <div className="space-y-1">
            {files.map((f, i) => (
              <div key={i}
                onClick={() => api()?.file.open(f.path)}
                className="bg-white rounded-lg border border-[#E5E6EB] p-2 cursor-pointer hover:border-[#165DFF] hover:shadow-sm transition-all group">
                <div className="flex items-center gap-2">
                  <span className="shrink-0">{fileIcon(f.ext)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium text-[#1D2129] truncate group-hover:text-[#165DFF]">{f.name}</div>
                    <div className="text-[10px] text-[#C9CDD4] flex gap-1.5">
                      <span>{formatSize(f.size)}</span>
                      <span>{new Date(f.time).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}</span>
                    </div>
                  </div>
                  <span className="shrink-0 opacity-0 group-hover:opacity-100 text-[#165DFF] text-[10px]">打开</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ChangesPanel({ msgs }: { msgs: Array<{ id: string; role: string; content: string; time: string }> }) {
  const toolMsgs = msgs.filter(m => m.role === 'tool')
  return (
    <div className="text-xs text-[#4E5969]">
      <div className="font-medium text-[#1D2129] mb-2">操作历史</div>
      {toolMsgs.length === 0 ? (
        <div className="text-[#C9CDD4] text-center py-8">
          <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-[#F2F3F5] flex items-center justify-center">{iconSVG('clock')}</div>
          工具操作将在此显示
        </div>
      ) : (
        <div className="space-y-1.5">
          {toolMsgs.map((m, i) => {
            const nm = m.content.match(/Tool "(\w+)" result/)
            const toolName = nm ? nm[1] : 'tool'
            const isError = m.content.includes('失败') || m.content.includes('错误')
            const content = m.content.replace(/^Tool "\w+" result:\s*/m, '').trim()
            const shortContent = content.length > 80 ? content.slice(0, 80) + '...' : content
            const isFileCreate = /(?:已写入|已创建|已生成)/.test(content)
            return (
              <div key={i} className="bg-white rounded-lg border border-[#E5E6EB] p-2">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isError ? 'bg-[#EC5B56]' : isFileCreate ? 'bg-[#165DFF]' : 'bg-[#61C454]'}`}></span>
                  <span className="text-[11px] font-medium text-[#1D2129] truncate">{toolName}</span>
                  <span className="text-[10px] text-[#C9CDD4] ml-auto shrink-0">
                    {new Date(m.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
                <div className={`text-[10px] leading-relaxed mt-0.5 ${isError ? 'text-[#EC5B56]' : isFileCreate ? 'text-[#165DFF]' : 'text-[#86909C]'}`}>
                  {shortContent}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PreviewPanel({ msgs, artifacts }: { msgs: Array<{ id: string; role: string; content: string; time: string }>; artifacts: ArtifactInfo[] }) {
  const [previewContent, setPreviewContent] = useState<string>('')
  const [previewType, setPreviewType] = useState<string>('')
  const [previewTitle, setPreviewTitle] = useState<string>('')

  // Find previewable content: 1) HTML in messages 2) Latest HTML/MD artifact
  useEffect(() => {
    // Check messages for HTML
    const lastAssistant = [...msgs].reverse().find(m => m.role === 'assistant')
    if (lastAssistant) {
      // Check for HTML in code blocks
      const htmlMatch = lastAssistant.content.match(/```(?:html)?\s*([\s\S]*?)```/)
      if (htmlMatch && /<html|<body|<div|<head|<!DOCTYPE/i.test(htmlMatch[1])) {
        setPreviewContent(htmlMatch[1])
        setPreviewType('html')
        setPreviewTitle('对话 HTML')
        return
      }
      // Check for raw HTML in message
      if (lastAssistant.content.includes('<html') || lastAssistant.content.includes('<!DOCTYPE html')) {
        const start = lastAssistant.content.indexOf('<')
        setPreviewContent(lastAssistant.content.slice(start))
        setPreviewType('html')
        setPreviewTitle('对话 HTML')
        return
      }
    }

    // Check latest HTML artifact
    const htmlArtifact = [...artifacts].reverse().find(a => a.type === 'html')
    if (htmlArtifact) {
      // Try to read the file
      const a = api()
      if (a?.file) {
        a.file.read(htmlArtifact.path).then(r => {
          if (r.success && r.content) {
            setPreviewContent(r.content)
            setPreviewType('html')
            setPreviewTitle(htmlArtifact.path.split(/[/\\]/).pop() || 'Preview')
          }
        }).catch(() => {})
        return
      }
    }

    // Check latest MD artifact
    const mdArtifact = [...artifacts].reverse().find(a => a.type === 'md')
    if (mdArtifact) {
      const a = api()
      if (a?.file) {
        a.file.read(mdArtifact.path).then(r => {
          if (r.success && r.content) {
            setPreviewContent(r.content)
            setPreviewType('markdown')
            setPreviewTitle(mdArtifact.path.split(/[/\\]/).pop() || 'Preview')
          }
        }).catch(() => {})
        return
      }
    }

    // Nothing to preview
    setPreviewContent('')
    setPreviewType('')
    setPreviewTitle('')
  }, [msgs, artifacts])

  if (!previewContent) {
    return (
      <div className="text-xs h-full flex flex-col">
        <div className="font-medium text-[#1D2129] mb-2 shrink-0">预览</div>
        <div className="flex-1 flex items-center justify-center text-[#C9CDD4] text-center">
          <div>
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-[#F2F3F5] flex items-center justify-center">{iconSVG('chart')}</div>
            <div className="mb-1">生成 HTML 或 Markdown 文件后可在此预览</div>
            <div className="text-[10px]">对话中创建的网页和文档会自动显示</div>
          </div>
        </div>
      </div>
    )
  }

  if (previewType === 'html') {
    return (
      <div className="text-xs h-full flex flex-col">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <div className="font-medium text-[#1D2129] truncate flex-1">{previewTitle}</div>
          <button onClick={() => setPreviewContent('')}
            className="text-[10px] text-[#86909C] hover:text-[#EC5B56] shrink-0 ml-2">✕</button>
        </div>
        <iframe srcDoc={previewContent}
          className="flex-1 w-full border border-[#E5E6EB] rounded-lg bg-white"
          sandbox="allow-scripts allow-same-origin" title="Preview" />
      </div>
    )
  }

  if (previewType === 'markdown') {
    return (
      <div className="text-xs h-full flex flex-col">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <div className="font-medium text-[#1D2129] truncate flex-1">{previewTitle}</div>
          <button onClick={() => setPreviewContent('')}
            className="text-[10px] text-[#86909C] hover:text-[#EC5B56] shrink-0 ml-2">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto bg-white border border-[#E5E6EB] rounded-lg p-3">
          <FormattedContent content={previewContent} />
        </div>
      </div>
    )
  }

  // Text preview
  return (
    <div className="text-xs h-full flex flex-col">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="font-medium text-[#1D2129] truncate flex-1">{previewTitle}</div>
        <button onClick={() => setPreviewContent('')}
          className="text-[10px] text-[#86909C] hover:text-[#EC5B56] shrink-0 ml-2">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto bg-white border border-[#E5E6EB] rounded-lg p-3">
        <pre className="text-[11px] text-[#4E5969] font-mono whitespace-pre-wrap">{previewContent.slice(0, 5000)}</pre>
      </div>
    </div>
  )
}

// ====== View Panels ======

function SkillsView() {
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const a = api()
    if (a?.skills) {
      a.skills.list().then(list => { setSkills(list); setLoading(false) }).catch(() => setLoading(false))
    } else {
      // Dev mode / no Electron: show sample data
      setSkills([
        { name: 'code-review-checklist', description: '系统性代码审查检查清单，逐项排查常见但容易被遗漏的 bug', type: 'skill', triggers: ['检查代码', '代码审查', 'review'] },
        { name: 'idea', description: '想法完善引导，通过顾问式提问帮助将模糊想法变成可执行方案文档', type: 'skill', triggers: ['想法', 'idea', '规划'] },
        { name: 'fullstack-dev', description: '全栈后端架构和前后端集成指南，REST API + 前端', type: 'skill' },
        { name: 'agent-browser', description: '浏览器自动化操作：网页截图、表单填写、数据抓取', type: 'skill', triggers: ['浏览器', '截图', '抓取'] },
        { name: 'hello_world', description: '一个示例插件，返回问候语', type: 'tool' },
      ])
      setLoading(false)
    }
  }, [])

  const handleSkillClick = (skill: SkillInfo) => {
    // In full Electron, this would trigger the skill via IPC
    // For now, navigate and suggest in chat
    const a = api()
    if (!a) return
    // TODO: implement skill invocation
  }

  if (loading) {
    return <div className="p-6"><div className="max-w-4xl mx-auto text-center py-12 text-sm text-[#C9CDD4]">加载中...</div></div>
  }

  return (
    <div className="p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-[#1D2129]">技能</h2>
            <p className="text-sm text-[#86909C] mt-0.5">已安装的技能和工具，点击启动。</p>
          </div>
          <button
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#E5E6EB] text-sm text-[#4E5969] hover:bg-[#F7F8FA] transition-colors">
            {iconSVG('plus')}<span>安装技能</span>
          </button>
        </div>

        {skills.length === 0 ? (
          <div className="text-center py-12 text-sm text-[#C9CDD4]">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#F7F8FA] flex items-center justify-center">{iconSVG('plugin')}</div>
            还没有安装技能，点击"安装技能"添加你的第一个技能
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {skills.map((skill, i) => (
              <div key={i} onClick={() => handleSkillClick(skill)}
                className="border border-[#F2F3F5] rounded-lg p-4 cursor-pointer hover:border-[#165DFF] hover:shadow-sm transition-all group bg-white">
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${skill.type === 'tool' ? 'bg-[#FFF7E6] text-[#D4A017]' : 'bg-[#F7F8FA] text-[#4E5969] group-hover:bg-[#E8F3FF] group-hover:text-[#165DFF]'}`}>
                    {skill.type === 'tool' ? iconSVG('gear') : iconSVG('doc')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#1D2129] mb-0.5 truncate">{skill.name}</div>
                    <div className="text-xs text-[#86909C] leading-relaxed line-clamp-2">{skill.description}</div>
                    {skill.triggers && skill.triggers.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {skill.triggers.map(t => (
                          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-[#F2F3F5] text-[#86909C]">{t}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${skill.type === 'tool' ? 'bg-[#FFF7E6] text-[#D4A017]' : 'bg-[#E8F3FF] text-[#165DFF]'}`}>
                        {skill.type === 'tool' ? '工具' : '技能'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ConnectorsView() {
  const [statusMap, setStatusMap] = useState<Record<string, string>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [connecting, setConnecting] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [savedConfigs, setSavedConfigs] = useState<Set<string>>(new Set())
  const [showAdvanced, setShowAdvanced] = useState(false)

  interface PresetConnector {
    id: string; name: string; desc: string; icon: string; color: string
    cmd?: string; args?: string
    builtin?: boolean
    authLabel?: string; authPlaceholder?: string; authHelp?: string; authUrl?: string
    authFields?: Array<{ key: string; label: string; placeholder: string; type?: string }>
    envKey?: string
  }

  const presetConnectors: PresetConnector[] = [
    { id: 'local-system', name: '本地系统', desc: '系统诊断与管理', icon: 'gear', color: '#165DFF', builtin: true },
    { id: 'github', name: 'GitHub', desc: '管理仓库、Issue、PR', icon: 'code', color: '#24292F', cmd: 'node', args: 'github-mcp-server.js',
      envKey: 'GITHUB_PERSONAL_ACCESS_TOKEN', authLabel: 'Personal Access Token', authPlaceholder: 'ghp_xxxxxxxxxx',
      authHelp: 'github.com → Settings → Developer settings → Personal access tokens → Generate new token (classic) → 勾选 repo、workflow',
      authUrl: 'https://github.com/settings/tokens/new?scopes=repo,workflow&description=CoreBuddy' },
    { id: 'feishu', name: '飞书', desc: '文档、消息、日历、审批', icon: 'connector', color: '#3370FF', cmd: 'node', args: 'feishu-mcp-server.js',
      authFields: [
        { key: 'FEISHU_APP_ID', label: 'App ID', placeholder: 'cli_xxxxxxxxxxxx' },
        { key: 'FEISHU_APP_SECRET', label: 'App Secret', placeholder: '••••••••••••', type: 'password' },
      ],
      authHelp: '打开 open.feishu.cn → 创建企业自建应用 → 凭证与基础信息', authUrl: 'https://open.feishu.cn/app' },
    { id: 'wecom', name: '企业微信', desc: '消息收发、机器人推送', icon: 'chat', color: '#07C160', cmd: 'uvx', args: 'wecom-bot-mcp-server',
      envKey: 'WECOM_WEBHOOK_URL', authLabel: 'Webhook 地址', authPlaceholder: 'https://qyapi.weixin.qq.com/...',
      authHelp: '企业微信群 → 群机器人 → 复制 Webhook 地址' },
    { id: 'tencent-docs', name: '腾讯文档', desc: '在线文档和表格', icon: 'doc', color: '#165DFF', cmd: 'npx', args: '-y @anthropic/mcp-server-tencent-docs',
      envKey: 'TENCENT_DOCS_COOKIE', authLabel: 'Cookie', authPlaceholder: '从浏览器控制台复制',
      authHelp: '登录 docs.qq.com → F12 → Application → Cookies → 复制 Cookie', authUrl: 'https://docs.qq.com' },
    { id: 'dingtalk', name: '钉钉', desc: '消息通知、审批、考勤', icon: 'bell', color: '#0089FF', cmd: 'npx', args: '-y @anthropic/mcp-server-dingtalk',
      authFields: [
        { key: 'DINGTALK_APP_KEY', label: 'AppKey', placeholder: 'dingxxxxxxxxxxxx' },
        { key: 'DINGTALK_APP_SECRET', label: 'AppSecret', placeholder: '••••••••••••', type: 'password' },
      ],
      authHelp: 'open.dingtalk.com → 创建应用 → 复制 AppKey/AppSecret', authUrl: 'https://open.dingtalk.com' },
    { id: 'qq-mail', name: 'QQ邮箱', desc: '收发邮件、搜索', icon: 'mail', color: '#FE6F41', cmd: 'npx', args: '-y @anthropic/mcp-server-qqmail',
      authFields: [
        { key: 'QQMAIL_ACCOUNT', label: '邮箱账号', placeholder: 'xxx@qq.com' },
        { key: 'QQMAIL_AUTH_CODE', label: '授权码', placeholder: '16位授权码', type: 'password' },
      ],
      authHelp: 'QQ邮箱 → 设置 → 账户 → POP3/IMAP/SMTP → 生成授权码', authUrl: 'https://mail.qq.com' },
    { id: 'netease-mail', name: '网易邮箱', desc: '163/126 邮箱收发', icon: 'mail', color: '#D32F2F', cmd: 'npx', args: '-y @anthropic/mcp-server-netease-mail',
      authFields: [
        { key: 'NETEASE_ACCOUNT', label: '邮箱账号', placeholder: 'xxx@163.com' },
        { key: 'NETEASE_AUTH_CODE', label: '授权码', placeholder: '16位授权码', type: 'password' },
      ],
      authHelp: '网易邮箱 → 设置 → POP3/SMTP/IMAP → 新增授权码', authUrl: 'https://mail.163.com' },
  ]

  const refresh = () => {
    const a = api()
    if (!a?.mcp) return
    a.mcp.status().then(s => setStatusMap(s as any)).catch(() => {})
    a.mcp.list().then(cfg => {
      if (cfg?.servers) setSavedConfigs(new Set(Object.keys(cfg.servers)))
    }).catch(() => {})
  }

  useEffect(() => { refresh() }, [])

  // ── Inline form connect ──
  const handleInlineConnect = async (c: PresetConnector) => {
    const a = api()
    if (!a?.mcp) return
    setConnecting(c.id)

    const env: Record<string, string> = {}
    if (c.authFields) {
      for (const f of c.authFields) {
        if (formValues[f.key]) env[f.key] = formValues[f.key]
      }
    } else if (c.envKey) {
      env[c.envKey] = formValues['_token'] || ''
    }

    try {
      await a.mcp.save(c.id, {
        command: c.cmd || '',
        args: c.args ? c.args.split(/\s+/) : [],
        env: Object.keys(env).length ? env : undefined,
        enabled: true,
        connect: true,
      })
      setExpandedId(null)
      setFormValues({})
      // Keep spinner visible at least 600ms
      await new Promise(r => setTimeout(r, 600))
      setConnecting(null)
      setTimeout(refresh, 2000)
    } catch (e: any) {
      setConnecting(null)
      setErrors(prev => ({ ...prev, [c.id]: e?.message || '连接失败，请检查密钥' }))
      setTimeout(() => setErrors(prev => { const n = { ...prev }; delete n[c.id]; return n }), 5000)
    }
  }

  const handleConnectClick = (c: PresetConnector) => {
    if (c.builtin) return
    setExpandedId(prev => prev === c.id ? null : c.id)
    setFormValues({})
  }

  const handleDisconnect = async (id: string) => {
    const a = api()
    if (!a?.mcp) return
    try {
      await a.mcp.disconnect(id)
      setStatusMap(prev => ({ ...prev, [id]: 'disconnected' }))
    } catch (e: any) {
      setErrors(prev => ({ ...prev, [id]: e?.message || '断开失败' }))
      setTimeout(() => setErrors(prev => { const n = { ...prev }; delete n[id]; return n }), 5000)
    }
    // Config stays saved — keys preserved
  }

  const handleReconnect = async (c: PresetConnector) => {
    const a = api()
    if (!a?.mcp) return
    setConnecting(c.id)
    try {
      await a.mcp.reconnect(c.id)
      // Keep spinner visible at least 600ms so user sees feedback
      await new Promise(r => setTimeout(r, 600))
      setConnecting(null)
      setTimeout(refresh, 2000)
    } catch (e: any) {
      setConnecting(null)
      setErrors(prev => ({ ...prev, [c.id]: e?.message || '重连失败' }))
      setTimeout(() => setErrors(prev => { const n = { ...prev }; delete n[c.id]; return n }), 5000)
    }
  }

  const hasSaved = (c: PresetConnector) => savedConfigs.has(c.id)

  const isConnected = (c: PresetConnector) => c.builtin || statusMap[c.id] === 'connected' || statusMap[c.id] === 'builtin'

  return (
    <div className="p-8 overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-[#1D2129] mb-1">连接器</h2>
            <p className="text-sm text-[#86909C]">连接外部服务，扩展 CoreBuddy 的能力。</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={async () => {
              if (!confirm('导出文件将包含密钥，请妥善保管。确定导出？')) return
              try {
                const r = await api()?.mcp?.exportConfig()
                if (r?.success) alert('配置已导出')
              } catch (e: any) { alert('导出失败: ' + (e?.message || '未知错误')) }
            }}
              className="text-xs px-3 py-1.5 rounded-lg border border-[#E5E6EB] text-[#4E5969] hover:bg-[#F7F8FA] transition-colors">
              导出配置
            </button>
            <button onClick={async () => {
              if (!confirm('导入将覆盖当前连接器配置，确定继续？')) return
              try {
                const r = await api()?.mcp?.importConfig()
                if (r?.success) { alert('配置已导入，正在连接...'); setTimeout(refresh, 2000) }
                else if (r?.error) alert(r.error)
              } catch (e: any) { alert('导入失败: ' + (e?.message || '未知错误')) }
            }}
              className="text-xs px-3 py-1.5 rounded-lg bg-[#165DFF] text-white hover:bg-[#0E4BD8] transition-colors font-medium">
              导入配置
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {presetConnectors.map(c => {
            const connected = isConnected(c)
            const expanded = expandedId === c.id
            const isConnecting = connecting === c.id
            return (
            <div key={c.id}
              className={`rounded-xl border p-5 bg-white transition-all ${connected ? 'border-[#DCECDB]' : 'border-[#E5E6EB]'} ${expanded ? 'shadow-md' : ''}`}>
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${c.color}14` }}>
                  <span style={{ color: c.color }}>{iconSVG(c.icon)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#1D2129]">{c.name}</span>
                    {connected && <span className="w-1.5 h-1.5 rounded-full bg-[#61C454] shrink-0" />}
                    {!connected && !c.builtin && <span className="w-1.5 h-1.5 rounded-full bg-[#E5E6EB] shrink-0" />}
                  </div>
                  <div className="text-xs text-[#86909C] mt-0.5 leading-relaxed">{c.desc}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {c.builtin ? (
                  <span className="text-xs px-3 py-1.5 rounded-lg border border-[#DCECDB] text-[#61C454] cursor-default">
                    已就绪
                  </span>
                ) : connected ? (
                  <>
                    {/* Toggle switch */}
                    <button onClick={() => handleDisconnect(c.id)}
                      className="relative w-9 h-5 rounded-full transition-colors bg-[#61C454]"
                      title="点击关闭连接">
                      <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all" />
                    </button>
                    <button onClick={() => handleDisconnect(c.id)}
                      className="text-xs px-2 py-1 rounded-lg text-[#86909C] hover:text-[#EC5B56] hover:bg-[#FCEBEB] transition-colors">
                      断开
                    </button>
                  </>
                ) : hasSaved(c) ? (
                  <>
                    <button onClick={() => handleReconnect(c)} disabled={isConnecting}
                      className="text-xs px-3 py-1.5 rounded-lg bg-[#165DFF] text-white hover:bg-[#0E4BD8] transition-colors font-medium disabled:opacity-50 flex items-center gap-1.5">
                      {isConnecting ? <><svg className="animate-spin" width="12" height="12" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5"/><path d="M7 1.5a5.5 5.5 0 014.89 3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>连接中...</> : '重新连接'}
                    </button>
                    <span className="text-[11px] text-[#C9CDD4]">密钥已保存</span>
                  </>
                ) : (
                  <>
                    <button onClick={() => handleConnectClick(c)} disabled={isConnecting}
                      className="text-xs px-3 py-1.5 rounded-lg bg-[#165DFF] text-white hover:bg-[#0E4BD8] transition-colors font-medium disabled:opacity-50 flex items-center gap-1.5">
                      {isConnecting ? <><svg className="animate-spin" width="12" height="12" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5"/><path d="M7 1.5a5.5 5.5 0 014.89 3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>连接中...</> : '连接'}
                    </button>
                    {c.authUrl && (
                      <button onClick={() => api()?.openExternal(c.authUrl!)}
                        className="text-xs px-2 py-1.5 rounded-lg text-[#86909C] hover:text-[#165DFF] hover:bg-[#F2F3F5] transition-colors">
                        获取密钥 ↗
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Error display */}
              {errors[c.id] && (
                <div className="mt-3 text-xs text-[#E24B4A] bg-[#FCEBEB] rounded-lg px-3 py-2">
                  {errors[c.id]}
                </div>
              )}

              {/* Inline form — slides open when user clicks "连接" */}
              {expanded && !connected && (
                <div className="mt-4 pt-4 border-t border-[#F2F3F5] space-y-3">
                  {c.authHelp && (
                    <div className="text-[11px] text-[#86909C] leading-relaxed bg-[#F7F8FA] rounded-lg p-2.5">
                      {c.authHelp}
                    </div>
                  )}

                  {c.authFields ? (
                    c.authFields.map(f => (
                      <div key={f.key}>
                        <label className="text-[11px] font-medium text-[#4E5969] mb-1 block">{f.label}</label>
                        <input type={f.type || 'text'} placeholder={f.placeholder}
                          value={formValues[f.key] || ''}
                          onChange={e => setFormValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') handleInlineConnect(c) }}
                          autoFocus={c.authFields.indexOf(f) === 0}
                          className="w-full h-9 px-3 rounded-lg border border-[#E5E6EB] text-[13px] outline-none focus:border-[#165DFF] placeholder:text-[#C9CDD4]" />
                      </div>
                    ))
                  ) : (
                    <div>
                      <label className="text-[11px] font-medium text-[#4E5969] mb-1 block">{c.authLabel || '密钥'}</label>
                      <input type="password" placeholder={c.authPlaceholder}
                        value={formValues['_token'] || ''}
                        onChange={e => setFormValues(prev => ({ ...prev, _token: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') handleInlineConnect(c) }}
                        autoFocus
                        className="w-full h-9 px-3 rounded-lg border border-[#E5E6EB] text-[13px] outline-none focus:border-[#165DFF] placeholder:text-[#C9CDD4]" />
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <button onClick={() => setExpandedId(null)}
                      className="flex-1 h-9 rounded-lg border border-[#E5E6EB] text-[12px] text-[#86909C] hover:bg-[#F7F8FA] transition-colors">取消</button>
                    <button onClick={() => handleInlineConnect(c)} disabled={isConnecting}
                      className="flex-1 h-9 rounded-lg bg-[#165DFF] text-white text-[12px] font-medium hover:bg-[#0E4BD8] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                      {isConnecting ? <><svg className="animate-spin" width="12" height="12" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5"/><path d="M7 1.5a5.5 5.5 0 014.89 3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>连接中...</> : '确认连接'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )})}
        </div>

        {/* Advanced MCP Config */}
        <div className="mt-6">
          <button onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-xs text-[#C9CDD4] hover:text-[#86909C] transition-colors">
            <span>{showAdvanced ? '▾' : '▸'}</span> 高级 MCP 配置
          </button>
          {showAdvanced && (
            <div className="mt-3 p-4 rounded-xl bg-[#F7F8FA] border border-[#F2F3F5]">
              <p className="text-xs text-[#86909C] mb-3">
                配置文件路径：<code className="text-[#165DFF] bg-[#E8F3FF] px-1.5 py-0.5 rounded text-[11px]">corebuddy-mcp.json</code>
              </p>
              <pre className="text-[11px] text-[#4E5969] bg-white border border-[#E5E6EB] rounded-lg p-3 overflow-x-auto">
{`{
  "servers": {
    "my-server": {
      "command": "node",
      "args": ["path/to/server.js"],
      "env": { "API_KEY": "your-key" },
      "enabled": true
    }
  }
}`}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ExpertsView() {
  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-lg font-semibold text-[#1D2129] mb-1">专家中心</h2>
        <p className="text-sm text-[#86909C] mb-6">为不同领域的任务选择专业 AI 专家，获得更精准的帮助。</p>
        <div className="text-center py-12 text-sm text-[#C9CDD4]">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#F7F8FA] flex items-center justify-center">{iconSVG('expert')}</div>
          专家中心即将上线，敬请期待
        </div>
      </div>
    </div>
  )
}

function AutomationsView() {
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', prompt: '', cwd: '', frequency: 'daily' as 'daily'|'hourly'|'weekly'|'once', hour: '09', minute: '00', weekDay: '1', validFrom: '', validUntil: '', notify: true, tools: 'auto', connector: '' })
  const [items, setItems] = useState<Array<{ id: string; name: string; prompt: string; frequency: string; time: string; active: boolean }>>([])

  const templateCards = [
    { icon: 'sun', title: '每日晨报', desc: '每天早上 8:00 自动汇总新闻、天气和日程', prompt: '帮我汇总今天的：1. 重要新闻；2. 天气；3. 今天的日程安排。生成一份简洁的晨报。', freq: 'daily', time: '08:00' },
    { icon: 'data', title: '项目进度报告', desc: '每周一自动生成上周项目进度汇总', prompt: '分析项目文件变更和任务状态，生成上周的项目进度报告。包括：完成的任务、进行中的任务、风险和阻塞项。', freq: 'weekly', time: '09:00' },
    { icon: 'code', title: '代码审查提醒', desc: '每工作日检查待审查的 PR 并发送提醒', prompt: '检查所有仓库中等待审查的 Pull Request，汇总清单并发送提醒。', freq: 'daily', time: '10:00' },
    { icon: 'mail', title: '邮件摘要', desc: '每小时检查新邮件并生成摘要', prompt: '检查未读邮件，筛选重要邮件，生成一句话摘要列表。', freq: 'hourly', time: '每整点' },
  ]

  const reset = () => setForm({ name: '', prompt: '', cwd: '', frequency: 'daily', hour: '09', minute: '00', weekDay: '1', validFrom: '', validUntil: '', notify: true, tools: 'auto', connector: '' })

  const addItem = () => {
    if (!form.name.trim() || !form.prompt.trim()) return
    const timeStr = form.frequency === 'hourly' ? '每整点' : form.frequency === 'once' ? '单次执行' : form.frequency === 'weekly' ? `每周${['','一','二','三','四','五','六','日'][Number(form.weekDay)]} ${form.hour}:${form.minute}` : `每天 ${form.hour}:${form.minute}`
    setItems(prev => [{ id: Date.now().toString(36), name: form.name, prompt: form.prompt, frequency: form.frequency === 'hourly' ? '每小时' : form.frequency === 'weekly' ? '每周' : form.frequency === 'once' ? '单次' : '每天', time: timeStr, active: true }, ...prev])
    reset(); setShowAdd(false)
  }

  return (
    <div className="p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-[#1D2129]">自动化</h2>
            <p className="text-sm text-[#86909C] mt-0.5">设置定时任务，让 CoreBuddy 按计划自动执行工作。</p>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#165DFF] hover:bg-[#0E4BD8] text-white text-sm font-medium transition-colors">
            {iconSVG('plus')}<span>添加自动化</span>
          </button>
        </div>

        {/* Template Cards */}
        {items.length === 0 && (
          <>
            <div className="text-sm font-medium text-[#4E5969] mb-3">参考案例</div>
            <div className="grid grid-cols-2 gap-3 mb-8">
              {templateCards.map((t, i) => (
                <div key={i} onClick={() => {
                  const isHourly = t.freq === 'hourly'
                  setForm({ ...form, name: t.title, prompt: t.prompt, frequency: t.freq as any,
                    hour: isHourly ? '00' : t.time.split(':')[0],
                    minute: isHourly ? '00' : (t.time.includes(':') ? t.time.split(':')[1] : '00')
                  })
                  setShowAdd(true)
                }}
                  className="border border-[#F2F3F5] rounded-lg p-4 cursor-pointer hover:border-[#165DFF] hover:shadow-sm transition-all group bg-white">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[#F7F8FA] flex items-center justify-center shrink-0 text-[#4E5969] group-hover:text-[#165DFF] group-hover:bg-[#E8F3FF] transition-colors">{iconSVG(t.icon)}</div>
                    <div>
                      <div className="text-sm font-medium text-[#1D2129] mb-0.5">{t.title}</div>
                      <div className="text-xs text-[#86909C] leading-relaxed">{t.desc}</div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F2F3F5] text-[#86909C]">{t.time}</span>
                        <span className="text-[10px] text-[#C9CDD4]">{t.freq === 'weekly' ? '每周' : t.freq === 'hourly' ? '每小时' : '每天'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Existing Items */}
        {items.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-[#4E5969]">我的自动化 ({items.length})</div>
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-1 text-xs text-[#165DFF] hover:underline">
                {iconSVG('plus')}<span>添加</span>
              </button>
            </div>
            {items.map(item => (
              <div key={item.id} className={`flex items-center gap-3 border rounded-lg p-3 bg-white transition-colors ${item.active ? 'border-[#F2F3F5]' : 'border-[#F2F3F5] bg-[#F9FAFB]'}`}>
                <button onClick={() => setItems(prev => prev.map(it => it.id === item.id ? {...it, active: !it.active} : it))}
                  className={`w-8 h-5 rounded-full relative transition-colors shrink-0 ${item.active ? 'bg-[#165DFF]' : 'bg-[#E5E6EB]'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${item.active ? 'left-[14px]' : 'left-[2px]'}`} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[#1D2129]">{item.name}</div>
                  <div className="text-xs text-[#86909C]">{item.frequency} · {item.time}</div>
                </div>
                <button onClick={() => setItems(prev => prev.filter(it => it.id !== item.id))}
                  className="text-[#C9CDD4] hover:text-[#EC5B56] transition-colors p-1">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {items.length === 0 && (
          <div className="text-center py-8 text-sm text-[#C9CDD4]">
            还没有自动化任务，点击上方按钮创建你的第一个自动化
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => { setShowAdd(false); reset() }}>
          <div className="bg-white rounded-xl shadow-2xl w-[540px] max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F2F3F5]">
              <h3 className="text-base font-semibold text-[#1D2129]">添加自动化</h3>
              <button onClick={() => { setShowAdd(false); reset() }}
                className="w-6 h-6 rounded flex items-center justify-center text-[#86909C] hover:bg-[#F2F3F5] hover:text-[#4E5969] transition-colors">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              {/* Name */}
              <div>
                <label className="text-xs font-medium text-[#4E5969] block mb-1.5">名称 <span className="text-[#EC5B56]">*</span></label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                  placeholder="例如：每日晨报"
                  className="w-full h-9 rounded-lg text-sm px-3 border border-[#E5E6EB] outline-none focus:border-[#165DFF] placeholder:text-[#C9CDD4]" />
              </div>

              {/* Workspace (optional) */}
              <div>
                <label className="text-xs font-medium text-[#4E5969] block mb-1.5">工作空间（可选）</label>
                <input value={form.cwd} onChange={e => setForm({...form, cwd: e.target.value})}
                  placeholder="选择工作空间目录"
                  className="w-full h-9 rounded-lg text-sm px-3 border border-[#E5E6EB] outline-none focus:border-[#165DFF] placeholder:text-[#C9CDD4]" />
              </div>

              {/* Prompt */}
              <div>
                <label className="text-xs font-medium text-[#4E5969] block mb-1.5">提示词 <span className="text-[#EC5B56]">*</span></label>
                <textarea value={form.prompt} onChange={e => setForm({...form, prompt: e.target.value})}
                  placeholder="描述让 AI 执行的任务..."
                  rows={3}
                  className="w-full rounded-lg text-sm px-3 py-2 border border-[#E5E6EB] outline-none focus:border-[#165DFF] placeholder:text-[#C9CDD4] resize-none" />
              </div>

              {/* Tool & Expert toggle */}
              <div className="flex items-center gap-2">
                {[
                  { k: 'auto', l: 'Auto', d: '自动选择' },
                  { k: 'skills', l: '技能', d: '指定技能' },
                  { k: 'expert', l: '召唤专家', d: '指定专家' },
                ].map(t => (
                  <button key={t.k} onClick={() => setForm({...form, tools: t.k})}
                    className={`flex-1 h-9 rounded-lg text-xs font-medium border transition-colors ${form.tools === t.k ? 'border-[#165DFF] bg-[#E8F3FF] text-[#165DFF]' : 'border-[#E5E6EB] text-[#4E5969] hover:bg-[#F7F8FA]'}`}>
                    {t.l}
                  </button>
                ))}
              </div>

              {/* Connector */}
              <div>
                <label className="text-xs font-medium text-[#4E5969] block mb-1.5">连接器</label>
                <select value={form.connector} onChange={e => setForm({...form, connector: e.target.value})}
                  className="w-full h-9 rounded-lg text-sm px-3 border border-[#E5E6EB] outline-none focus:border-[#165DFF] bg-white text-[#4E5969]">
                  <option value="">选择连接器</option>
                  <option value="feishu">飞书</option>
                  <option value="github">GitHub</option>
                  <option value="wecom">企业微信</option>
                  <option value="dingtalk">钉钉</option>
                  <option value="tencent-docs">腾讯文档</option>
                </select>
              </div>

              {/* Frequency */}
              <div>
                <label className="text-xs font-medium text-[#4E5969] block mb-1.5">执行频率</label>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {[
                    { k: 'daily', l: '每天' },
                    { k: 'hourly', l: '每小时' },
                    { k: 'weekly', l: '每周' },
                    { k: 'once', l: '单次' },
                  ].map(f => (
                    <button key={f.k} onClick={() => setForm({...form, frequency: f.k as any})}
                      className={`h-8 rounded-lg text-xs font-medium border transition-colors ${form.frequency === f.k ? 'border-[#165DFF] bg-[#E8F3FF] text-[#165DFF]' : 'border-[#E5E6EB] text-[#4E5969] hover:bg-[#F7F8FA]'}`}>
                      {f.l}
                    </button>
                  ))}
                </div>
                {/* Time picker (not for hourly/once) */}
                {form.frequency !== 'hourly' && form.frequency !== 'once' && (
                  <div className="flex items-center gap-2">
                    {form.frequency === 'weekly' && (
                      <select value={form.weekDay} onChange={e => setForm({...form, weekDay: e.target.value})}
                        className="h-8 rounded-lg text-xs px-2 border border-[#E5E6EB] outline-none focus:border-[#165DFF] bg-white text-[#4E5969]">
                        {['一','二','三','四','五','六','日'].map((d,i) => <option key={i} value={String(i+1)}>周{d}</option>)}
                      </select>
                    )}
                    <select value={form.hour} onChange={e => setForm({...form, hour: e.target.value})}
                      className="h-8 rounded-lg text-xs px-2 border border-[#E5E6EB] outline-none focus:border-[#165DFF] bg-white text-[#4E5969]">
                      {Array.from({length:24},(_,i)=>String(i).padStart(2,'0')).map(h=><option key={h} value={h}>{h}:00</option>)}
                    </select>
                    <span className="text-xs text-[#C9CDD4]">:</span>
                    <select value={form.minute} onChange={e => setForm({...form, minute: e.target.value})}
                      className="h-8 rounded-lg text-xs px-2 border border-[#E5E6EB] outline-none focus:border-[#165DFF] bg-white text-[#4E5969]">
                      {['00','15','30','45'].map(m=><option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                )}
                {form.frequency === 'hourly' && (
                  <div className="text-xs text-[#86909C]">每小时整点执行</div>
                )}
                {form.frequency === 'once' && (
                  <div className="text-xs text-[#86909C]">手动触发或指定具体时间执行</div>
                )}
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#4E5969] block mb-1.5">生效日期（可选）</label>
                  <input type="date" value={form.validFrom} onChange={e => setForm({...form, validFrom: e.target.value})}
                    className="w-full h-9 rounded-lg text-xs px-3 border border-[#E5E6EB] outline-none focus:border-[#165DFF] text-[#4E5969]" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#4E5969] block mb-1.5">截止日期（可选）</label>
                  <input type="date" value={form.validUntil} onChange={e => setForm({...form, validUntil: e.target.value})}
                    className="w-full h-9 rounded-lg text-xs px-3 border border-[#E5E6EB] outline-none focus:border-[#165DFF] text-[#4E5969]" />
                </div>
              </div>

              {/* Notify toggle */}
              <div className="flex items-center justify-between py-1">
                <div>
                  <div className="text-xs font-medium text-[#4E5969]">完成推送</div>
                  <div className="text-[10px] text-[#C9CDD4]">执行完成后推送到本设备</div>
                </div>
                <button onClick={() => setForm({...form, notify: !form.notify})}
                  className={`w-8 h-5 rounded-full relative transition-colors shrink-0 ${form.notify ? 'bg-[#165DFF]' : 'bg-[#E5E6EB]'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${form.notify ? 'left-[14px]' : 'left-[2px]'}`} />
                </button>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#F2F3F5]">
              <button onClick={() => { setShowAdd(false); reset() }}
                className="px-4 py-2 rounded-lg text-sm text-[#4E5969] border border-[#E5E6EB] hover:bg-[#F7F8FA] transition-colors">
                取消
              </button>
              <button onClick={addItem}
                disabled={!form.name.trim() || !form.prompt.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#165DFF] hover:bg-[#0E4BD8] disabled:bg-[#C9CDD4] disabled:cursor-not-allowed transition-colors">
                添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MoreView({ onOpenSettings, onNav }: { onOpenSettings: () => void; onNav: (v: string) => void }) {
  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-lg font-semibold text-[#1D2129] mb-4">更多</h2>
        <div className="space-y-1">
          {[
            { icon: 'gear', label: '设置', desc: 'API Key、模型、权限等配置', onClick: onOpenSettings },
            { icon: 'connector', label: '连接器', desc: '管理外部服务连接（飞书、GitHub 等）', onClick: () => onNav('connectors') },
            { icon: 'doc', label: '快捷键', desc: '查看键盘快捷键', onClick: () => {
              alert('快捷键:\n\nEnter — 发送消息\nShift+Enter — 换行\nCtrl+N — 新建对话\nCtrl+W — 关闭当前对话')
            } },
            { icon: 'help', label: '帮助文档', desc: '使用指南和常见问题', onClick: () => {
              api()?.openExternal('https://github.com')
            } },
            { icon: 'update', label: '检查更新', desc: '当前版本 v1.4.1', onClick: () => {
              alert('已是最新版本 v1.4.0')
            } },
          ].map(item => (
            <div key={item.label} onClick={item.onClick}
              className="flex items-center gap-4 px-4 py-3 rounded-lg cursor-pointer text-sm hover:bg-[#F7F8FA] transition-colors border border-transparent hover:border-[#F2F3F5]">
              <span className="w-5 h-5 shrink-0 flex items-center justify-center text-[#86909C]">{iconSVG(item.icon)}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[#1D2129] font-medium">{item.label}</div>
                <div className="text-xs text-[#86909C]">{item.desc}</div>
              </div>
              <span className="text-[#C9CDD4] text-xs">→</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function App() {
  const [s, setS] = useState<AppState>({
    loggedIn: false, userName: '', apiKey: '', convs: [], activeId: null, msgs: [],
    search: '', input: '', loading: false, view: 'chat', modelId: 'deepseek-v4-pro',
    perm: 'default', mode: 'chat', persona: 'office', showSet: false, showRight: false, showMem: false,
    rightTab: 'artifacts', thinking: false, showProfile: false,
    showOnboarding: false, onboardingStep: 0,
    artifacts: [],
    toolStatus: { active: false, names: [], completed: 0, total: 0, action: '' },
    activeScene: null,
  })
  const endRef = useRef<HTMLDivElement>(null)
  const streamRef = useRef('')
  const sendingRef = useRef(false)
  const activeIdRef = useRef<string | null>(null)
  const cleanupRef = useRef<Array<() => void>>([])
  const [ready, setReady] = useState(false)
  const [convLoading, setConvLoading] = useState<Record<string, boolean>>({})
  const [msgFeedback, setMsgFeedback] = useState<Record<string, 'like' | 'dislike' | null>>({})

  const u = useCallback((p: Partial<AppState>) => setS(prev => ({ ...prev, ...p })), [])

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

  const send = async (scenePrompt?: string, presetText?: string) => {
    const text = presetText || s.input.trim()
    if (!text || !api()) return
    if (!s.apiKey) { u({ showSet: true }); return }
    if (sendingRef.current) return // prevent concurrent sends

    // Auto-create conversation if none selected
    let thisConvId = s.activeId
    if (!thisConvId) {
      thisConvId = uid()
      await api()!.conv.create(thisConvId)
      u({ activeId: thisConvId, convs: [{ id: thisConvId, title: text.slice(0, 30), updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() }, ...s.convs] })
    }

    sendingRef.current = true
    u({ input: '', loading: true, toolStatus: { active: false, names: [], completed: 0, total: 0, action: '' } })
    streamRef.current = ''
    const aiMsg: Msg = { id: uid(), role: 'assistant', content: '', time: new Date().toISOString() }
    setS(prev => ({ ...prev, msgs: [...prev.msgs, { id: uid(), role: 'user', content: text, time: new Date().toISOString() }, aiMsg] }))
    const cc: Array<() => void> = []
    // Stream chunk — filter by convId for background loading
    cc.push(api()!.chat.onStreamChunk(chunk => {
      const cid = (chunk as any).convId || thisConvId
      if (cid !== activeIdRef.current) return
      const textContent = typeof chunk === 'string' ? chunk : ((chunk as any).value ?? (chunk as any).content ?? chunk)
      streamRef.current += textContent
      setS(prev => { const m = [...prev.msgs]; if (m.length) m[m.length - 1] = { ...m[m.length - 1], content: streamRef.current }; return { ...prev, msgs: m } })
    }))
    // Tool start
    cc.push(api()!.chat.onToolStart(data => { if ((data as any).convId === activeIdRef.current) u({ toolStatus: { active: true, names: data.names, completed: 0, total: data.count, action: '准备中...' } }) }))
    // Tool progress
    cc.push(api()!.chat.onToolProgress(data => { if ((data as any).convId === activeIdRef.current) setS(prev => ({ ...prev, toolStatus: { ...prev.toolStatus, completed: data.completed, total: data.total } })) }))
    // Tool action
    cc.push(api()!.chat.onToolAction(data => { if ((data as any).convId === activeIdRef.current) setS(prev => ({ ...prev, toolStatus: { ...prev.toolStatus, action: data.action } })) }))
    // Artifact created
    cc.push(api()!.chat.onArtifact(artifact => { if ((artifact as any).convId === activeIdRef.current) setS(prev => ({ ...prev, artifacts: [...prev.artifacts, artifact] })) }))
    // Stream done
    cc.push(api()!.chat.onStreamDone((data?: StreamDoneData) => {
      sendingRef.current = false
      if ((data as any)?.convId === activeIdRef.current) {
        u({ loading: false, toolStatus: { active: false, names: [], completed: 0, total: 0, action: '' } })
        if (data && data.artifactCount > 0) {
          u({ rightTab: 'artifacts', showRight: true })
        }
      }
      cc.forEach(f => f()); loadConvs()
    }))
    cc.push(api()!.chat.onStreamError(err => {
      sendingRef.current = false
      const cid = (err as any).convId || thisConvId
      if (cid === activeIdRef.current) {
        const msg = typeof err === 'string' ? err : ((err as any).message || (err as any).error || (err as any).value || JSON.stringify(err))
        streamRef.current += `\n\n错误：${msg}`
        setS(prev => { const m = [...prev.msgs]; if (m.length) m[m.length - 1] = { ...m[m.length - 1], content: streamRef.current }; return { ...prev, msgs: m } })
        u({ loading: false, toolStatus: { active: false, names: [], completed: 0, total: 0, action: '' } })
      }
      cc.forEach(f => f())
    }))
    // Store for cleanup on unmount
    cleanupRef.current = cc
    // Start message
    try {
      await api()!.chat.sendMessage(text, s.modelId, thisConvId, permToNumber(s.perm), s.persona, scenePrompt || undefined, s.userName || undefined)
    } catch (e: any) {
      sendingRef.current = false
      u({ loading: false })
      streamRef.current += `\n\n发送失败：${e?.message || e}`
      setS(prev => { const m = [...prev.msgs]; if (m.length) m[m.length - 1] = { ...m[m.length - 1], content: streamRef.current }; return { ...prev, msgs: m } })
      cc.forEach(f => f())
    }
  }

  const keyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }

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
                  {s.apiKey ? '我是你的私人 AI 秘书。选择场景快速开始：' : '点击设置 API Key 后开始。'}
                </div>
                {/* Scene Selector */}
                {s.apiKey && (
                  <div className="flex flex-wrap gap-2 justify-center max-w-2xl">
                    {sceneData.map(scene => (
                      <button key={scene.id}
                        onClick={() => u({ activeScene: s.activeScene === scene.id ? null : scene.id })}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs cursor-pointer transition-all
                          ${s.activeScene === scene.id
                            ? 'border-current bg-white shadow-sm'
                            : 'border-[#E5E6EB] bg-white text-[#86909C] hover:border-[#165DFF] hover:text-[#165DFF]'}`}
                        style={s.activeScene === scene.id ? { color: scene.color, borderColor: scene.color } : {}}>
                        <span className="w-3.5 h-3.5 shrink-0 flex items-center justify-center" style={s.activeScene === scene.id ? { color: scene.color } : {}}>
                          {iconSVG(scene.icon)}
                        </span>
                        <span>{scene.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Prompt Cards — shown when a scene is selected */}
            {s.msgs.length === 0 && s.activeScene && s.apiKey && (() => {
              const scene = sceneData.find(sc => sc.id === s.activeScene)
              if (!scene) return null
              return (
                <div className="max-w-2xl mx-auto w-full">
                  <div className="text-xs text-[#86909C] mb-2 ml-1">{scene.desc} · 选择具体任务：</div>
                  <div className="space-y-1.5">
                    {scene.prompts.map((p, i) => (
                      <div key={i}
                        onClick={() => { const sp = scene.systemPrompt; u({ activeScene: null }); send(sp, p.text) }}
                        className="px-4 py-2.5 rounded-lg border border-[#E5E6EB] bg-white cursor-pointer hover:border-[#165DFF] hover:shadow-sm transition-all group">
                        <div className="text-[13px] text-[#1D2129] group-hover:text-[#165DFF] font-medium">{p.label}</div>
                        <div className="text-[11px] text-[#C9CDD4] mt-0.5 truncate">{p.text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Messages — WorkBuddy style: Thinking → Tools → Answer */}
            {(() => {
              const els: React.ReactNode[] = []
              for (let i = 0; i < s.msgs.length; i++) {
                const m = s.msgs[i]
                if (m.role === 'boundary') continue

                // User — right-aligned blue bubble
                if (m.role === 'user') {
                  els.push(<div key={m.id} className="ml-auto max-w-[75%]"><div className="bg-[#E8F3FF] text-[15px] text-[#1D2129] px-4 py-2.5 rounded-xl whitespace-pre-wrap">{m.content}</div></div>)
                  continue
                }

                if (m.role === 'tool') continue

                // Assistant — parse into: thinking + tool calls + answer
                if (m.role === 'assistant') {
                  // 1. Extract tool calls
                  const toolBlocks: Array<{ name: string; params: Record<string, any> }> = []
                  const r = /```tool\s*\n?(\{[\s\S]*?\})\s*```/g; let mt
                  while ((mt = r.exec(m.content)) !== null) {
                    try { const t = JSON.parse(mt[1]); toolBlocks.push({ name: t.action, params: t.params || {} }) } catch {}
                  }

                  // 2. Split content: thinking text (before first tool) → tool blocks → answer text (after last tool)
                  const toolBlockTexts: string[] = []
                  let clean = m.content
                  const tbRegex = /```tool[\s\S]*?```/g
                  let tbMatch
                  while ((tbMatch = tbRegex.exec(m.content)) !== null) {
                    toolBlockTexts.push(tbMatch[0])
                  }
                  // Remove tool blocks from content
                  clean = clean.replace(/```tool[\s\S]*?```/g, '')
                  // Remove noise
                  clean = clean.replace(/\[使用工具:.*?\]\n?/g, '').replace(/\[Hook[^\]]*\]\n?/g, '').replace(/\[警告\].*?\n?/g, '').replace(/^\s*\n/gm, '').trim()

                  // 3. Split clean into thinking + answer
                  // Thinking = everything before "现在" pattern, or just the analysis text
                  let thinkingText = ''
                  let answerText = clean
                  // If tool blocks exist, separate thinking (before tools) from answer (after tools)
                  if (toolBlocks.length > 0) {
                    const parts = clean.split(/\n(?=我在|已写入|已完成|根据|现在|这是|好的|让我|我来)/i)
                    if (parts.length >= 2) {
                      thinkingText = parts.slice(0, -1).join('\n').trim()
                      answerText = parts.slice(-1).join('\n').trim()
                    } else if (clean.length > 0) {
                      answerText = clean
                    }
                  }

                  // HTML filter for answer
                  if (/<(script|style|html|head|body|meta|link)[^>]*>/i.test(answerText)) {
                    answerText = answerText.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s{2,}/g, '\n').trim()
                  }

                  // 4. Collect tool results
                  const tools: Array<{ name: string; content: string }> = []
                  let j = i + 1
                  while (j < s.msgs.length && s.msgs[j].role === 'tool') {
                    const tc = s.msgs[j].content
                    const nm = tc.match(/Tool "(\w+)" result/)
                    tools.push({ name: nm ? nm[1] : 'tool', content: tc.replace(/^Tool "\w+" result:\s*/m, '').trim().slice(0, 1000) })
                    j++
                  }
                  i = j - 1

                  // 5. Render — WorkBuddy style cards
                  const isLast = i === s.msgs.length - 1 || (j > s.msgs.length - 1)
                  const hasNoAnswer = !answerText && !toolBlocks.length
                  els.push(
                    <div key={m.id} className="flex items-start gap-3 max-w-[100%]">
                      <img src={aiAvatar} alt="CoreBuddy" className="w-8 h-8 rounded-lg object-cover shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0 space-y-3">
                      {/* Thinking phase */}
                      {(thinkingText || toolBlocks.length > 0) && (
                        <CollapsibleSection title={toolBlocks.length > 0 ? `分析 & 计划 (${toolBlocks.length} 步)` : '思考过程'} defaultOpen={false}>
                          {thinkingText && <div className="text-[13px] text-[#4E5969] leading-relaxed whitespace-pre-wrap"><FormattedContent content={thinkingText} /></div>}
                          {/* Tool execution plan */}
                          {toolBlocks.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {toolBlocks.map((tb, ti) => (
                                <div key={ti} className="flex items-center gap-2 text-[12px]">
                                  <span className="w-4 h-4 rounded-full bg-[#F2F3F5] flex items-center justify-center text-[10px] text-[#86909C] shrink-0">{ti + 1}</span>
                                  <span className="text-[#86909C] font-mono text-[11px]">{tb.name}</span>
                                  <span className="text-[#C9CDD4] text-[10px]">
                                    {Object.entries(tb.params).slice(0, 3).map(([k, v]) => `${k}=${String(v).slice(0, 20)}`).join(' ')}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Tool results */}
                          {tools.length > 0 && (
                            <div className="mt-2 border-t border-[#F2F3F5] pt-2">
                              <div className="text-[11px] font-medium text-[#4E5969] mb-1">执行结果</div>
                              <div className="space-y-1.5">
                                {tools.map((t, ti) => {
                                  const isFileCreation = t.content.includes('已写入') || t.content.includes('已创建') || t.content.includes('已生成')
                                  return (
                                    <details key={ti} className="text-[11px]" open={isFileCreation}>
                                      <summary className={`cursor-pointer hover:text-[#4E5969] flex items-center gap-1.5 ${isFileCreation ? 'text-[#165DFF] font-medium' : 'text-[#86909C]'}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${isFileCreation ? 'bg-[#61C454]' : 'bg-[#C9CDD4]'}`}></span>
                                        {t.name}
                                        {isFileCreation && <span className="text-[10px] text-[#61C454]">✓ 产物生成</span>}
                                      </summary>
                                      <pre className="mt-1 text-[11px] text-[#86909C] font-mono bg-[#F7F8FA] rounded p-2 whitespace-pre-wrap max-h-40 overflow-y-auto">{t.content}</pre>
                                    </details>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </CollapsibleSection>
                      )}

                      {/* Answer */}
                      {answerText ? (
                        <div>
                          <FormattedContent content={answerText} />

                          {/* Message Action Bar — copy, like, dislike */}
                          <div className="mt-2 pt-2 border-t border-[#F2F3F5] flex items-center gap-1 flex-wrap">
                            {/* Copy button */}
                            <button
                              onClick={async () => {
                                try { await navigator.clipboard.writeText(answerText) } catch {}
                              }}
                              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-[#86909C] hover:bg-[#F2F3F5] hover:text-[#4E5969] transition-colors"
                              title="复制回答">
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="2" y="2" width="7" height="8" rx="1" stroke="currentColor" strokeWidth="1"/><path d="M3.5 1.5h6a1 1 0 011 1v7" stroke="currentColor" strokeWidth="1"/></svg>
                              <span>复制</span>
                            </button>

                            {/* Like button */}
                            <button
                              onClick={() => {
                                const newState = msgFeedback[m.id] === 'like' ? null : 'like'
                                setMsgFeedback(prev => ({ ...prev, [m.id]: newState }))
                                if (newState === 'like') {
                                  api()?.chat.feedback(s.activeId || '', m.id, 'like', answerText)
                                }
                              }}
                              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors ${
                                msgFeedback[m.id] === 'like'
                                  ? 'text-[#165DFF] bg-[#E8F3FF]'
                                  : 'text-[#86909C] hover:bg-[#F2F3F5] hover:text-[#4E5969]'
                              }`}
                              title="赞同回答">
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path d="M3.5 5l1.5 3L8.5 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              <span>赞同</span>
                            </button>

                            {/* Dislike button */}
                            <button
                              onClick={() => {
                                const newState = msgFeedback[m.id] === 'dislike' ? null : 'dislike'
                                setMsgFeedback(prev => ({ ...prev, [m.id]: newState }))
                                if (newState === 'dislike') {
                                  api()?.chat.feedback(s.activeId || '', m.id, 'dislike', answerText)
                                }
                              }}
                              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors ${
                                msgFeedback[m.id] === 'dislike'
                                  ? 'text-[#EC5B56] bg-[#FFF0F0]'
                                  : 'text-[#86909C] hover:bg-[#F2F3F5] hover:text-[#4E5969]'
                              }`}
                              title="不赞同回答">
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path d="M3.5 3l1.5 3L8.5 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              <span>不赞同</span>
                            </button>

                            {/* Credits / Tokens info */}
                            <span className="text-[10px] text-[#C9CDD4] ml-auto">
                              共消耗 ~{Math.round(answerText.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').length / 4)} tokens
                            </span>
                          </div>

                          {/* Artifacts produced in this message */}
                          {(() => {
                            const msgArtifacts = s.artifacts.filter(a => {
                              // Match artifacts to this message by time proximity
                              const aTime = new Date(a.time).getTime()
                              const mTime = new Date(m.time).getTime()
                              return Math.abs(aTime - mTime) < 300000 // within 5 minutes
                            })
                            if (msgArtifacts.length === 0) return null
                            return (
                              <div className="mt-2 p-2 rounded-lg bg-[#F7F8FA] border border-[#F2F3F5]">
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

                          {/* File changes summary — upgraded with file icons and diff-style cards */}
                          {tools.length > 0 && (
                            <div className="mt-2 rounded-lg bg-[#F7F8FA] border border-[#F2F3F5] overflow-hidden">
                              <div className="text-[11px] font-medium text-[#4E5969] px-3 py-2 border-b border-[#F2F3F5]">
                                文件变更 ({tools.length}个):
                              </div>
                              <div className="divide-y divide-[#F2F3F5]">
                                {tools.map((t, ti) => {
                                  const isCreate = t.name.includes('create') || t.name.includes('write')
                                  const isSuccess = !t.content.includes('失败') && !t.content.includes('错误')
                                  const label = isCreate ? '新建' : isSuccess ? '修改' : '失败'
                                  const labelBg = isCreate ? 'bg-[#E8FFE8] text-[#52C41A]' : isSuccess ? 'bg-[#E8F3FF] text-[#165DFF]' : 'bg-[#FFF0F0] text-[#EC5B56]'
                                  const dotColor = isCreate ? 'bg-[#61C454]' : isSuccess ? 'bg-[#165DFF]' : 'bg-[#EC5B56]'
                                  const icon = isCreate ? '+' : isSuccess ? '~' : '✕'

                                  // Extract file path from tool content
                                  let filePath = ''
                                  const pathMatch = t.content.match(/(?:[A-Za-z]:[\\/][^\s]+|(?:\/[^\s]+)+\.\w+|(?:\S+[\\/])+\S+\.\w+)/)
                                  if (pathMatch) filePath = pathMatch[0]
                                  else filePath = t.name

                                  const fileName = filePath.split(/[/\\]/).pop() || filePath
                                  const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() || '' : ''

                                  return (
                                    <div key={ti} className="flex items-center gap-2 px-3 py-2 text-[11px]">
                                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`}></span>
                                      <span className="text-[#C9CDD4] font-mono w-3 shrink-0">{icon}</span>
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${labelBg} shrink-0`}>{label}</span>
                                      <span className="text-[#1D2129] truncate font-mono text-[11px]">{fileName}</span>
                                      {ext && <span className="text-[#C9CDD4] text-[10px] shrink-0">.{ext}</span>}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : null}

                      {/* Loading indicator — WorkBuddy style: hollow spinner + action text */}
                      {isLast && s.loading && hasNoAnswer && (
                        <div className="flex items-center gap-2 py-1.5 text-[13px] text-[#86909C]">
                          {/* Hollow circle spinner with arc fill animation */}
                          <svg className="animate-[spin_1.2s_linear_infinite]" width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <circle cx="7" cy="7" r="5.5" stroke="#E5E6EB" strokeWidth="1.5" />
                            <path d="M7 1.5a5.5 5.5 0 014.89 3.2" stroke="#86909C" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                          {s.toolStatus.active ? (
                            <span>
                              {s.toolStatus.action || `正在执行工具 (${s.toolStatus.completed}/${s.toolStatus.total})`}
                            </span>
                          ) : (
                            <span>生成回复中...</span>
                          )}
                          {s.toolStatus.active && s.toolStatus.total > 0 && (
                            <span className="text-[11px] text-[#C9CDD4] ml-1">
                              <span className="inline-block w-[3px] h-[3px] rounded-full bg-[#86909C] mx-1 align-middle" />
                              {s.toolStatus.completed}/{s.toolStatus.total} 步
                            </span>
                          )}
                        </div>
                      )}

                      {/* Tool action status indicators (past actions shown as completed) */}
                      {isLast && !s.loading && tools.length > 0 && answerText && (
                        <div className="mt-1 space-y-0.5">
                          {tools.map((t, ti) => {
                            const isRead = t.name.includes('read') || t.name.includes('list')
                            const isWrite = t.name.includes('write') || t.name.includes('create')
                            const isSearch = t.name.includes('search')
                            const isSuccess = !t.content.includes('失败') && !t.content.includes('错误')
                            const icon = isSuccess ? (
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#61C454" strokeWidth="1"/><path d="M3.5 6l1.5 1.5L8.5 4" stroke="#61C454" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            ) : (
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#EC5B56" strokeWidth="1"/><path d="M4.5 4.5l3 3M7.5 4.5l-3 3" stroke="#EC5B56" strokeWidth="1" strokeLinecap="round"/></svg>
                            )
                            const label = isRead ? '已读取' : isWrite ? '已创建' : isSearch ? '已搜索' : '已执行'
                            return (
                              <div key={ti} className="flex items-center gap-1.5 text-[11px] text-[#86909C]">
                                {icon}
                                <span className={isSuccess ? 'text-[#86909C]' : 'text-[#EC5B56]'}>{label}</span>
                                <span className="text-[#C9CDD4] truncate max-w-[200px]">{t.name}</span>
                              </div>
                            )
                          })}
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

          {/* Input Area */}
          <div className="px-5 py-3 border-t border-[#F2F3F5] bg-white shrink-0">
            {/* Scene Prompt Cards (when scene selected) */}
            {s.activeScene && s.apiKey && (() => {
              const scene = sceneData.find(sc => sc.id === s.activeScene)
              if (!scene) return null
              return (
                <div className="mb-2">
                  <div className="flex flex-wrap gap-1.5 items-center">
                    {scene.prompts.map((p, i) => (
                      <button key={i}
                        onClick={() => { u({ activeScene: null }); send(scene.systemPrompt, p.text) }}
                        className="px-3 py-1 rounded-full border border-[#E5E6EB] text-[11px] text-[#4E5969] bg-white hover:border-[#165DFF] hover:text-[#165DFF] cursor-pointer transition-colors">
                        {p.label}
                      </button>
                    ))}
                    <button onClick={() => u({ activeScene: null })}
                      className="px-2 py-1 rounded-full text-[11px] text-[#C9CDD4] hover:text-[#86909C] cursor-pointer">
                      ✕
                    </button>
                  </div>
                </div>
              )
            })()}
            {/* Mini Scene Selector — only in conversation, not welcome */}
            {!s.activeScene && s.apiKey && s.msgs.length > 0 && (
              <div className="mb-2 flex items-center gap-1 overflow-x-auto scrollbar-none">
                <span className="text-[10px] text-[#C9CDD4] mr-1 shrink-0">场景：</span>
                {sceneData.map(scene => (
                  <button key={scene.id}
                    onClick={() => u({ activeScene: scene.id })}
                    className="px-2 py-0.5 rounded-full border border-[#F2F3F5] text-[10px] text-[#86909C] bg-white hover:border-[#C9CDD4] hover:text-[#4E5969] cursor-pointer transition-colors whitespace-nowrap">
                    {scene.name}
                  </button>
                ))}
              </div>
            )}
            <div className="bg-[#F7F8FA] border border-[#E5E6EB] rounded-xl p-3">
              <textarea
                className="w-full min-h-6 border-none bg-transparent text-[15px] text-[#1D2129] resize-none outline-none p-0 placeholder:text-[#C9CDD4]"
                placeholder={s.apiKey ? '告诉秘书你想做什么... 输入 / 使用快捷命令' : '请先设置 API Key'}
                rows={1} value={s.input}
                onChange={e => u({ input: e.target.value })}
                onKeyDown={keyDown}
                onInput={e => { const el = e.target as HTMLTextAreaElement; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 200) + 'px' }} />
              {/* Slash command hints — Chinese labels, English commands */}
              {s.apiKey && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {[
                    { key: 'review', label: '审查' },
                    { key: 'explain', label: '解释' },
                    { key: 'fix', label: '修复' },
                    { key: 'optimize', label: '优化' },
                    { key: 'translate', label: '翻译' },
                    { key: 'summarize', label: '总结' },
                  ].map(cmd => (
                    <button key={cmd.key} onClick={() => u({ input: '/' + cmd.key + ' ' })}
                      className="px-1.5 py-0.5 rounded text-[10px] text-[#C9CDD4] hover:text-[#165DFF] hover:bg-[#E8F3FF] cursor-pointer transition-colors">
                      /{cmd.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-[#F2F3F5]">
                <select value={s.modelId} onChange={e => u({ modelId: e.target.value })}
                  className="px-2.5 py-1 rounded-lg border border-transparent bg-transparent text-xs text-[#86909C] outline-none cursor-pointer hover:bg-[#F2F3F5]">
                  {allModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <select value={s.perm} onChange={e => u({ perm: e.target.value as PermissionLevel })}
                  className="px-2.5 py-1 rounded-lg border border-transparent bg-transparent text-xs text-[#86909C] outline-none cursor-pointer hover:bg-[#F2F3F5]">
                  {perms.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
                </select>
                <select value={s.persona} onChange={e => u({ persona: e.target.value as any })}
                  className="px-2.5 py-1 rounded-lg border border-transparent bg-transparent text-xs text-[#86909C] outline-none cursor-pointer hover:bg-[#F2F3F5]">
                  <option value="office">日常办公</option>
                  <option value="creative">设计创意</option>
                </select>
                <button onClick={() => u({ thinking: !s.thinking })}
                  className={`px-2.5 py-1 rounded-lg border text-xs cursor-pointer transition-colors ${s.thinking ? 'border-[#165DFF] bg-[#E8F3FF] text-[#165DFF]' : 'border-transparent bg-transparent text-[#86909C] hover:bg-[#F2F3F5]'}`}>
                  深度思考
                </button>
                <div className="ml-auto" />
                <button onClick={send} disabled={s.loading || !s.input.trim()}
                  className="w-8 h-8 rounded-lg bg-[#165DFF] text-white border-none flex items-center justify-center text-base disabled:bg-[#C9CDD4] disabled:cursor-not-allowed cursor-pointer hover:bg-[#0E4BD8] transition-colors">
                  ↑
                </button>
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
        onApiKeyChange={(v: string) => u({ apiKey: v })}
        onNameChange={(v: string) => { u({ userName: v }); api()?.config.set('userName', v) }}
        onPermChange={(v: PermissionLevel) => u({ perm: v })}
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

function SettingsModal({ apiKey, userName, perm, onApiKeyChange, onNameChange, onPermChange, onClose, onModelsChange }: {
  apiKey: string; userName: string; perm: PermissionLevel
  onApiKeyChange: (v: string) => void; onNameChange: (v: string) => void
  onPermChange: (v: PermissionLevel) => void; onClose: () => void
  onModelsChange: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [newModel, setNewModel] = useState({ id: '', name: '', apiUrl: '', apiKey: '' })
  const [modelList, setModelList] = useState<Array<{ id: string; name: string; apiUrl: string; apiKey?: string }>>([])

  useEffect(() => {
    const a = window.electronAPI as any
    if (a?.models) a.models.list().then((cfg: any) => {
      if (cfg?.models) setModelList(cfg.models)
    }).catch(() => {})
  }, [])

  const addModel = async () => {
    try {
      const a = window.electronAPI as any
      if (!newModel.id || !newModel.name || !newModel.apiUrl) return
      const r = await a.models.add(newModel)
      if (r?.success) {
        setNewModel({ id: '', name: '', apiUrl: '', apiKey: '' })
        setAdding(false)
        const cfg = await a.models.list()
        if (cfg?.models) setModelList(cfg.models)
        onModelsChange()
      } else {
        alert(r?.error || '添加失败')
      }
    } catch (e: any) {
      alert('添加失败: ' + (e?.message || '未知错误'))
    }
  }

  const removeModel = async (id: string) => {
    try {
      const a = window.electronAPI as any
      await a.models.remove(id)
      const cfg = await a.models.list()
      if (cfg?.models) setModelList(cfg.models)
      onModelsChange()
    } catch (e: any) {
      alert('删除失败: ' + (e?.message || '未知错误'))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl p-6 w-[480px] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-[#1D2129] mb-5">设置</h2>

        <label className="text-sm text-[#4E5969] block mb-1.5">名字</label>
        <input value={userName} onChange={e => onNameChange(e.target.value)}
          className="w-full h-10 rounded-lg text-sm px-3 border border-[#E5E6EB] outline-none focus:border-[#165DFF] mb-4" />

        <label className="text-sm text-[#4E5969] block mb-1.5">API Key</label>
        <input type="password" value={apiKey} onChange={e => onApiKeyChange(e.target.value)} placeholder="sk-..."
          className="w-full h-10 rounded-lg text-sm px-3 border border-[#E5E6EB] outline-none focus:border-[#165DFF] mb-4" />

        <label className="text-sm text-[#4E5969] block mb-1.5">权限级别</label>
        <select value={perm} onChange={e => onPermChange(e.target.value as PermissionLevel)}
          className="w-full h-10 rounded-lg text-sm px-3 border border-[#E5E6EB] outline-none focus:border-[#165DFF] mb-4 bg-white">
          <option value="default">默认权限</option>
          <option value="full">完全访问</option>
        </select>

        {/* Model Management */}
        <div className="border-t border-[#F2F3F5] pt-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-[#4E5969]">模型管理</span>
            <button onClick={() => setAdding(!adding)}
              className="text-xs px-2 py-1 rounded bg-[#E8F3FF] text-[#165DFF] hover:bg-[#165DFF] hover:text-white transition-colors">
              {adding ? '取消' : '+ 添加'}
            </button>
          </div>

          {adding && (
            <div className="bg-[#F7F8FA] rounded-lg p-3 mb-3 space-y-2">
              <input value={newModel.name} onChange={e => setNewModel(prev => ({ ...prev, name: e.target.value }))}
                placeholder="显示名称（如: OpenAI GPT-4）" className="w-full h-9 rounded text-xs px-2.5 border border-[#E5E6EB] outline-none focus:border-[#165DFF]" />
              <input value={newModel.id} onChange={e => setNewModel(prev => ({ ...prev, id: e.target.value }))}
                placeholder="模型 ID（如: gpt-4o）" className="w-full h-9 rounded text-xs px-2.5 border border-[#E5E6EB] outline-none focus:border-[#165DFF]" />
              <input value={newModel.apiUrl} onChange={e => setNewModel(prev => ({ ...prev, apiUrl: e.target.value }))}
                placeholder="API 端点（如: https://api.openai.com/v1）" className="w-full h-9 rounded text-xs px-2.5 border border-[#E5E6EB] outline-none focus:border-[#165DFF]" />
              <input value={newModel.apiKey} onChange={e => setNewModel(prev => ({ ...prev, apiKey: e.target.value }))}
                type="password"
                placeholder="API Key（可选，留空则使用全局 Key）" className="w-full h-9 rounded text-xs px-2.5 border border-[#E5E6EB] outline-none focus:border-[#165DFF]" />
              <button onClick={addModel}
                className="w-full h-9 rounded bg-[#165DFF] text-white text-xs font-medium hover:bg-[#0E4BD8]">确认添加</button>
            </div>
          )}

          <div className="space-y-1">
            {modelList.map(m => (
              <div key={m.id} className="flex items-center justify-between py-2 px-2 rounded hover:bg-[#F7F8FA] text-[13px]">
                <div className="flex-1 min-w-0">
                  <span className="text-[#1D2129]">{m.name}</span>
                  <span className="text-[10px] text-[#C9CDD4] ml-2">{m.id}</span>
                  {m.apiKey && <span className="text-[10px] text-[#61C454] ml-2" title="已配置独立 API Key">🔑</span>}
                </div>
                <button onClick={() => removeModel(m.id)}
                  className="text-[10px] text-[#C9CDD4] hover:text-[#EC5B56] px-1">删除</button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose}
            className="px-5 py-2 rounded-lg text-sm text-[#4E5969] border border-[#E5E6EB] hover:bg-[#F7F8FA]">关闭</button>
        </div>
      </div>
    </div>
  )
}

function MemoryModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = React.useState<{ factsCount: number; prefsCount: number; projects: any[]; todos: any[] } | null>(null)
  React.useEffect(() => {
    const a = window.electronAPI
    if (a?.progress) a.progress.get().then((d: any) => setData(d)).catch(() => {})
  }, [])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[420px] max-h-[70vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-[#1D2129]">CoreBuddy 的记忆</h3>
          <button onClick={onClose} className="w-6 h-6 rounded flex items-center justify-center text-[#C9CDD4] hover:text-[#4E5969] hover:bg-[#F7F8FA]">✕</button>
        </div>
        {!data ? (
          <p className="text-sm text-[#86909C]">加载中...</p>
        ) : (
          <div className="space-y-4">
            <div className="bg-[#F7F8FA] rounded-lg p-3">
              <div className="text-xs text-[#86909C] mb-1">已记住</div>
              <div className="flex gap-4">
                <div><span className="text-lg font-semibold text-[#165DFF]">{data.factsCount}</span><span className="text-xs text-[#C9CDD4] ml-1">条事实</span></div>
                <div><span className="text-lg font-semibold text-[#165DFF]">{data.prefsCount}</span><span className="text-xs text-[#C9CDD4] ml-1">条偏好</span></div>
              </div>
            </div>
            {data.projects?.length > 0 && (
              <div>
                <div className="text-xs font-medium text-[#4E5969] mb-1">项目</div>
                {data.projects.map((p: any, i: number) => (
                  <div key={i} className="flex justify-between py-1.5 border-b border-[#F2F3F5] text-[13px]">
                    <span className="text-[#1D2129]">{p.name}</span>
                    <span className="text-xs text-[#86909C]">{p.status}</span>
                  </div>
                ))}
              </div>
            )}
            {data.todos?.length > 0 && (
              <div>
                <div className="text-xs font-medium text-[#4E5969] mb-1">待办</div>
                {data.todos.filter((t: any) => !t.done).map((t: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 py-1 text-[13px] text-[#1D2129]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C9CDD4] shrink-0" />
                    <span>{t.text}</span>
                  </div>
                ))}
              </div>
            )}
            {data.factsCount === 0 && data.prefsCount === 0 && (
              <p className="text-sm text-[#C9CDD4] text-center py-4">还没有记忆。用久了就有了。</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

