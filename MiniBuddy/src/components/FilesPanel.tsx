import React, { useState, useEffect } from 'react'
import { iconSVG, fileIcon, api } from './shared'

export function FilesPanel() {
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
