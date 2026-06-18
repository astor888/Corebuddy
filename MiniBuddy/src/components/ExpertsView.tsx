import React from 'react'
import { iconSVG } from './shared'

export function ExpertsView() {
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
