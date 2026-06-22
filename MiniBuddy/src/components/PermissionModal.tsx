import React, { useState, useEffect } from 'react'
import type { PermissionLevel } from '../types/electron'

interface PermissionRequest {
  requestId: string
  toolName: string
  toolDesc: string
  toolAction?: string
  toolParams?: Record<string, any>
}

type PermissionAction = 'reject' | 'allow' | 'sessionAllow' | 'alwaysAllow'

export function PermissionModal({
  request,
  onRespond,
  permOverride,
}: {
  request: PermissionRequest | null
  onRespond: (requestId: string, action: PermissionAction) => void
  permOverride: PermissionLevel
}) {
  const [visible, setVisible] = useState(false)
  const [current, setCurrent] = useState<PermissionRequest | null>(null)
  const [animOut, setAnimOut] = useState(false)
  const executingRef = React.useRef(false)
  const hideTimerRef = React.useRef<ReturnType<typeof setTimeout>>()
  const respondTimerRef = React.useRef<ReturnType<typeof setTimeout>>()
  const rafRef = React.useRef<number>()

  // 组件卸载时清理所有定时器
  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    if (respondTimerRef.current) clearTimeout(respondTimerRef.current)
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
  }, [])

  useEffect(() => {
    // 取消旧的 hide 定时器，防止过期后覆盖新 request
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    if (request) {
      setCurrent(request)
      setAnimOut(false)
      rafRef.current = requestAnimationFrame(() => setVisible(true))
    } else {
      setAnimOut(true)
      hideTimerRef.current = setTimeout(() => {
        setVisible(false)
        setCurrent(null)
        setAnimOut(false)
        hideTimerRef.current = undefined
      }, 200)
    }
  }, [request])

  const handleRespond = (action: PermissionAction) => {
    if (!current || executingRef.current) return
    if (respondTimerRef.current) clearTimeout(respondTimerRef.current)
    executingRef.current = true
    const reqId = current.requestId
    setAnimOut(true)
    respondTimerRef.current = setTimeout(() => {
      onRespond(reqId, action)
      executingRef.current = false
      setVisible(false)
      setCurrent(null)
      setAnimOut(false)
      respondTimerRef.current = undefined
    }, 150)
  }

  if (!visible && !current) return null

  const isFullAccess = permOverride === 'all'

  // 构建弹窗标题和描述
  const actionLabel = current?.toolAction || current?.toolName || ''
  const commandPreview = current?.toolParams?.command || ''
  const isRunCommand = current?.toolAction === 'run_command'

  // 根据工具类型生成标题
  const modalTitle = isRunCommand ? '检测到命令行执行请求' : '检测到高风险操作请求'
  const modalDesc = isRunCommand
    ? `工具 "${actionLabel}" 想要执行以下命令：`
    : `工具 "${actionLabel}" 需要更高权限才能执行：`

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: 'rgba(29,33,41,0.3)' }}
    >
      {/* Modal card */}
      <div
        className={`
          bg-white rounded-xl shadow-2xl w-[480px] overflow-hidden
          transition-all duration-200 ease-out
          ${animOut ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}
        `}
        onClick={e => e.stopPropagation()}
      >
        {/* Top accent bar */}
        <div className="h-1 bg-gradient-to-r from-[#165DFF] to-[#4080FF]" />

        {/* Content */}
        <div className="px-6 pt-5 pb-6">
          {/* Icon + Title row */}
          <div className="flex items-start gap-4 mb-4">
            {/* Shield icon */}
            <div className="w-11 h-11 rounded-xl bg-[#FFF1F0] flex items-center justify-center shrink-0">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#EC5B56" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L3 7v5c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z"/>
                <path d="M12 8v4" strokeWidth="2"/>
                <circle cx="12" cy="16" r="0.8" fill="#EC5B56" stroke="none"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-[#1D2129] leading-tight">
                {modalTitle}
              </h3>
              <p className="text-xs text-[#86909C] mt-1">
                {modalDesc}
              </p>
            </div>
          </div>

          {/* Command preview card */}
          <div className="bg-[#F7F8FA] rounded-lg p-4 mb-5 border border-[#E5E6EB]">
            <div className="flex items-center gap-2 mb-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#165DFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6"/>
                <polyline points="8 6 2 12 8 18"/>
              </svg>
              <span className="text-sm font-semibold text-[#1D2129]">{actionLabel}</span>
            </div>
            {commandPreview ? (
              <pre className="text-[11px] text-[#4E5969] bg-white rounded border border-[#E5E6EB] p-2.5 font-mono leading-relaxed whitespace-pre-wrap max-h-28 overflow-y-auto">
                {commandPreview.length > 300 ? commandPreview.slice(0, 300) + '...' : commandPreview}
              </pre>
            ) : current?.toolDesc ? (
              <p className="text-xs text-[#4E5969] leading-relaxed">
                {current.toolDesc}
              </p>
            ) : null}
          </div>

          {/* Warning text */}
          {!isFullAccess && (
            <div className="flex items-start gap-2 mb-5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF7D00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <p className="text-[11px] text-[#86909C] leading-relaxed">
                当前为<strong className="text-[#4E5969]">默认权限模式</strong>，高风险操作需要您手动确认。
              </p>
            </div>
          )}

          {/* Action buttons — 拒绝 | 允许 | 会话始终允许 | 一直允许(持久化) */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => handleRespond('reject')}
              className="flex-1 h-10 rounded-lg border border-[#E5E6EB] text-sm text-[#4E5969] font-medium
                         hover:bg-[#F7F8FA] hover:border-[#C9CDD4] transition-all duration-150"
            >
              拒绝
            </button>
            <button
              onClick={() => handleRespond('allow')}
              className="flex-1 h-10 rounded-lg border border-[#165DFF] text-sm text-[#165DFF] font-medium
                         hover:bg-[#E8F3FF] transition-all duration-150"
            >
              允许
            </button>
            <button
              onClick={() => handleRespond('sessionAllow')}
              className="flex-1 h-10 rounded-lg bg-[#165DFF] text-white text-sm font-medium
                         hover:bg-[#0E4BD8] shadow-sm transition-all duration-150 whitespace-normal px-2 leading-tight"
            >
              <span className="text-[11px]">本次会话</span>
            </button>
            <button
              onClick={() => handleRespond('alwaysAllow')}
              className="flex-1 h-10 rounded-lg bg-gradient-to-r from-[#165DFF] to-[#4080FF] text-white text-sm font-medium
                         hover:from-[#0E4BD8] hover:to-[#3060E0] shadow-sm transition-all duration-150 whitespace-normal px-2 leading-tight"
              title="关闭 CoreBuddy 后仍然生效，之后不再弹窗"
            >
              <span className="text-[11px] font-semibold">一直允许</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
