import React from 'react'
import { iconSVG, fileIcon, api } from './shared'
import type { ArtifactInfo } from '../types/electron'

export function ArtifactsPanel({ artifacts }: { artifacts: ArtifactInfo[] }) {
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
