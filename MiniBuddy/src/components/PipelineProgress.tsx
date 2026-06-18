import React from 'react'

/** Pipeline stage info from backend */
export interface PipelineStageInfo {
  id: string
  name: string
  description: string
  agentRole: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  error?: string
}

export interface PipelineProgressState {
  active: boolean
  pipelineName: string
  stages: PipelineStageInfo[]
  totalStages: number
}

const roleIcons: Record<string, string> = {
  planner: '📋',
  researcher: '🔍',
  writer: '✍️',
  executor: '⚡',
  reviewer: '✅',
  collector: '📂',
  translator: '🌐',
}

const roleColors: Record<string, string> = {
  planner: '#EEEDFE',
  researcher: '#E6F1FB',
  writer: '#EAF3DE',
  executor: '#FAEEDA',
  reviewer: '#FBEAF0',
  collector: '#E1F5EE',
  translator: '#FAECE7',
}

const roleTextColors: Record<string, string> = {
  planner: '#534AB7',
  researcher: '#185FA5',
  writer: '#3B6D11',
  executor: '#854F0B',
  reviewer: '#993556',
  collector: '#0F6E56',
  translator: '#993C1D',
}

export function PipelineProgress({ state }: { state: PipelineProgressState }) {
  if (!state.active || state.stages.length === 0) return null

  return (
    <div className="mx-4 mt-1 mb-2 p-3 rounded-xl bg-[#FAFAFA] border border-[#E5E6EB]">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="4" width="4" height="6" rx="1" fill="#7F77DD" />
            <rect x="5" y="2" width="4" height="10" rx="1" fill="#7F77DD" opacity="0.6" />
            <rect x="9" y="5" width="4" height="4" rx="1" fill="#7F77DD" opacity="0.3" />
          </svg>
          <span className="text-[12px] font-medium text-[#4E5969]">
            Pipeline: {state.pipelineName}
          </span>
        </div>
        <span className="text-[11px] text-[#86909C]">
          {state.stages.filter(s => s.status === 'completed').length}/{state.totalStages} 阶段
        </span>
      </div>

      {/* Stage list */}
      <div className="space-y-1">
        {state.stages.map((stage, idx) => {
          const isLast = idx === state.stages.length - 1

          return (
            <div key={stage.id} className="relative flex items-start gap-2.5">
              {/* Timeline line */}
              {!isLast && (
                <div className="absolute left-[11px] top-[22px] w-[1.5px] h-[calc(100%+2px)] bg-[#E5E6EB]" />
              )}

              {/* Status icon */}
              <div className="mt-0.5 flex-shrink-0">
                {stage.status === 'completed' ? (
                  <div className="w-[22px] h-[22px] rounded-full bg-[#EAF3DE] flex items-center justify-center">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5.5l2 2L8 3" stroke="#3B6D11" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                ) : stage.status === 'running' ? (
                  <div className="w-[22px] h-[22px] rounded-full bg-[#EEEDFE] flex items-center justify-center">
                    <svg className="animate-spin" width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <circle cx="5" cy="5" r="4" stroke="#7F77DD" strokeWidth="1.5" strokeDasharray="8 12" />
                    </svg>
                  </div>
                ) : stage.status === 'failed' ? (
                  <div className="w-[22px] h-[22px] rounded-full bg-[#FCEBEB] flex items-center justify-center">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 2l6 6M8 2l-6 6" stroke="#A32D2D" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </div>
                ) : (
                  <div className="w-[22px] h-[22px] rounded-full bg-[#F1EFE8] flex items-center justify-center">
                    <div className="w-[6px] h-[6px] rounded-full bg-[#C9CDD4]" />
                  </div>
                )}
              </div>

              {/* Stage content */}
              <div className="flex-1 min-w-0 pb-2">
                <div className="flex items-center gap-1.5">
                  {/* Role badge */}
                  <span
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{
                      backgroundColor: roleColors[stage.agentRole] || '#F1EFE8',
                      color: roleTextColors[stage.agentRole] || '#4E5969',
                    }}
                  >
                    {roleIcons[stage.agentRole] || '🔧'} {stage.agentRole}
                  </span>
                  {/* Stage name */}
                  <span className="text-[12px] text-[#4E5969] font-medium truncate">
                    {stage.name}
                  </span>
                </div>
                <p className="text-[11px] text-[#86909C] mt-0.5 truncate">
                  {stage.description}
                </p>
                {stage.status === 'failed' && stage.error && (
                  <p className="text-[11px] text-[#A32D2D] mt-0.5 truncate">
                    {stage.error.slice(0, 80)}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
