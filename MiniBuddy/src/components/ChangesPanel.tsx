import React from 'react'
import { iconSVG } from './shared'

export function ChangesPanel({ msgs }: { msgs: Array<{ id: string; role: string; content: string; time: string }> }) {
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
