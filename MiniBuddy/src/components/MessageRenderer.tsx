import React, { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'

// ====== Visual Guide Component (Roadmap-style) ======
// Format: each line is stage_name | description
function VisualGuide({ stages: raw }: { stages: string }) {
  const stages = raw.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const [name, ...descParts] = line.split('|')
    return { name: name?.trim() || '', desc: descParts.join('|').trim() }
  })
  if (stages.length === 0) return null
  return (
    <div className="my-4 w-full overflow-x-auto">
      <div className="flex items-start gap-0 min-w-max">
        {stages.map((stage, i) => (
          <React.Fragment key={i}>
            {/* Stage card */}
            <div className="flex flex-col items-center gap-2" style={{ width: 160 }}>
              <div className="w-12 h-12 rounded-full bg-[#165DFF] text-white flex items-center justify-center text-sm font-bold shadow-md shrink-0">
                {i + 1}
              </div>
              <div className="text-center px-2 py-1.5 rounded-lg bg-white border border-[#E5E6EB] shadow-sm min-h-[60px] flex flex-col justify-center" style={{ width: 140 }}>
                <div className="text-[12px] font-semibold text-[#1D2129] leading-tight">{stage.name}</div>
                {stage.desc && <div className="text-[10px] text-[#86909C] mt-0.5 leading-tight">{stage.desc}</div>}
              </div>
            </div>
            {/* Arrow connector */}
            {i < stages.length - 1 && (
              <div className="flex items-center pt-5 shrink-0 px-0">
                <svg width="24" height="4" viewBox="0 0 24 4" fill="none">
                  <line x1="0" y1="2" x2="20" y2="2" stroke="#C9CDD4" strokeWidth="1.5" strokeDasharray="4 2"/>
                  <path d="M20 0l4 2-4 2z" fill="#C9CDD4"/>
                </svg>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

// ====== Mermaid Diagram Renderer ======
const MermaidBlock = React.memo(function MermaidBlock({ chart }: { chart: string }) {
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
      }).catch((e: unknown) => {
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
})

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

  // Visual guide block (roadmap)
  if (lang === 'guide') return <VisualGuide stages={text} />

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
              <><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 7.5l3 3 7-7" stroke="#61C454" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg><span className="text-[#61C454]">已复制</span></>
            ) : (
              <><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="5" width="8" height="9" rx="1"/><path d="M3 11V3.5A1.5 1.5 0 014.5 2h7"/></svg><span>复制</span></>
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
export const FormattedContent = React.memo(function FormattedContent({ content }: { content: string }) {
  if (!content.trim()) return <span className="text-[#C9CDD4]">(空)</span>

  // Preprocess: convert <thinking> blocks to collapsible details sections (WorkBuddy style)
  const processed = content.replace(
    /<thinking>([\s\S]*?)<\/thinking>/g,
    (_, inner) => `<details class="thinking-block"><summary class="thinking-summary cursor-pointer select-none hover:bg-[#FAFAFA] rounded px-2 py-1 text-[12px] text-[#86909C] font-medium transition-colors">思考过程</summary>\n\n${inner.trim()}\n\n</details>`
  )

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
        // Table wrapper — WorkBuddy minimal style
        table({ children }: any) {
          return <div className="overflow-x-auto my-2"><table className="w-full text-[13px] border-collapse">{children}</table></div>
        },
        thead({ children }: any) {
          return <thead className="bg-[#F7F8FA] border-b border-[#E5E6EB]">{children}</thead>
        },
        th({ children }: any) {
          return <th className="px-3 py-1.5 text-left font-medium text-[#86909C] text-[12px] border-b border-[#F2F3F5]">{children}</th>
        },
        td({ children }: any) {
          return <td className="px-3 py-1.5 text-[#4E5969] border-b border-[#F2F3F5] last:border-b-0">{children}</td>
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
      {processed}
    </ReactMarkdown>
  )
})
