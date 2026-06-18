import React from 'react'

export function MemoryModal({ onClose }: { onClose: () => void }) {
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
