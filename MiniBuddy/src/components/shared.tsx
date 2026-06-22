import React, { useState } from 'react'
import type { PermissionLevel } from '../types/electron'

// ====== Collapsible Section ======

export const CollapsibleSection = React.memo(function CollapsibleSection({ title, children, defaultOpen = true }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-[#E5E6EB] rounded-lg overflow-hidden mb-2 bg-transparent transition-shadow hover:shadow-sm">
      <div className="flex items-center gap-2 px-3 py-1.5 cursor-pointer select-none group hover:bg-[#FAFAFA] transition-colors" onClick={() => setOpen(!open)}>
        <span className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M3 2l4 3-4 3" stroke="#C9CDD4" strokeWidth="1.3" strokeLinecap="round" fill="none"/>
          </svg>
        </span>
        <span className="text-[12px] text-[#4E5969] flex-1 truncate font-medium">{title}</span>
        <span className="text-[10px] text-[#C9CDD4] group-hover:text-[#86909C] shrink-0 ml-2 transition-colors">{open ? '收起' : '点击展开'}</span>
      </div>
      <div className={`transition-all duration-200 overflow-hidden ${open ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="px-3 pb-3 pt-1.5 border-t border-[#F2F3F5]">{children}</div>
      </div>
    </div>
  )
})

// ====== Outline SVG Icons ======

export function iconSVG(name: string) {
  const icons: Record<string, JSX.Element> = {
    chat: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3.5A1.5 1.5 0 013.5 2h9A1.5 1.5 0 0114 3.5v7a1.5 1.5 0 01-1.5 1.5H5.5L3 13.5v-10z"/><path d="M5 6h6M5 8.5h4"/></svg>,
    plugin: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M8 2v2.5M8 11.5V14M2 8h2.5M11.5 8H14M5 5l1.7 1.7M9.3 9.3L11 11M11 5L9.3 6.7M6.7 9.3L5 11"/><circle cx="8" cy="8" r="1.2"/></svg>,
    expert: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"><path d="M8 2l1.5 4.5H14l-3.5 2.8 1.2 4.2L8 10.8 4.3 13.5l1.2-4.2L2 6.5h4.5L8 2z"/></svg>,
    auto: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M3 8h1.5M11.5 8H13M8 3v1.5M8 11.5V13M4.5 4.5l1 1M10.5 10.5l1 1M4.5 11.5l1-1M10.5 5.5l1-1"/><circle cx="8" cy="8" r="3"/><circle cx="8" cy="8" r="1.2"/></svg>,
    more: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><circle cx="4" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="12" cy="8" r="1"/></svg>,
    plus: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M8 3.5v9M3.5 8h9"/></svg>,
    gear: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><circle cx="8" cy="8" r="2.5"/><path d="M8 1.5v1.2M8 13.3v1.2M2.5 3l1.2.6M12.3 12.4l1.2.6M1.5 8h1.2M13.3 8h1.2M2.5 13l1.2-.6M12.3 3.6l1.2-.6"/></svg>,
    chart: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><rect x="2" y="9" width="3" height="5.5" rx="0.5"/><rect x="6.5" y="5.5" width="3" height="9" rx="0.5"/><rect x="11" y="2.5" width="3" height="12" rx="0.5"/></svg>,
    palette: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><circle cx="8" cy="8" r="6.5"/><circle cx="6" cy="6.5" r="1.2"/><circle cx="10.5" cy="8" r="1"/><circle cx="6" cy="10.5" r="1"/></svg>,
    help: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><circle cx="8" cy="8" r="6.5"/><path d="M6.5 6a1.5 1.5 0 012.8-.3M8 11v.01"/></svg>,
    update: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 8a5.5 5.5 0 019.8-3.5V3M13.5 8a5.5 5.5 0 01-9.8 3.5V13"/><polyline points="11,3.5 14,2 14,6"/><polyline points="2,14 5,12 1,12"/></svg>,
    logout: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2.5H3.5a1 1 0 00-1 1v9a1 1 0 001 1H6M11 8H5.5M9.5 5.5L13 8l-3.5 2.5"/></svg>,
    user: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><circle cx="8" cy="5.5" r="2.5"/><path d="M3 13.5c0-2 2.2-3.5 5-3.5s5 1.5 5 3.5"/></svg>,
    money: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="3.5" width="13" height="9" rx="1.5"/><circle cx="8" cy="8" r="2.5"/><path d="M3 6v4M13 6v4" strokeDasharray="1 2"/></svg>,
    rocket: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"><path d="M8 2l-2 3H3L4.5 8l-1.5 3h3l2 3 2-3h3l-1.5-3L13 5H10L8 2z"/><circle cx="8" cy="8" r="1"/></svg>,
    skill: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="1.5" width="4.5" height="4.5" rx="1"/><rect x="10" y="1.5" width="4.5" height="4.5" rx="1"/><rect x="1.5" y="10" width="4.5" height="4.5" rx="1"/><rect x="10" y="10" width="4.5" height="4.5" rx="1"/></svg>,
    clock: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 5v3.5L10.5 10"/></svg>,
    doc: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2h6l4 4v8.5a.5.5 0 01-.5.5h-9A.5.5 0 013 14.5V2.5A.5.5 0 013.5 2z"/><path d="M9 2v4h4"/></svg>,
    connector: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="5" r="2"/><circle cx="11" cy="11" r="2"/><path d="M6.5 6.5l3 3"/></svg>,
    bell: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2a4 4 0 00-4 4v2.5L2.5 10v1.5h11V10L12 8.5V6a4 4 0 00-4-4z"/><path d="M6.5 13A1.5 1.5 0 008 14.5 1.5 1.5 0 009.5 13"/></svg>,
    sun: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1M8 13.5v1M2.5 3l.7.7M12.8 12.3l.7.7M1.5 8h1M13.5 8h1M2.5 13l.7-.7M12.8 3.7l.7-.7"/></svg>,
    code: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 5L2 8l3 3M11 5l3 3-3 3M9.5 2.5l-3 11"/></svg>,
    mail: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="3" width="13" height="10" rx="1"/><path d="M1.5 3.5L8 9l6.5-5.5"/></svg>,
    data: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><rect x="2" y="9" width="3" height="5.5" rx="0.5"/><rect x="6.5" y="5.5" width="3" height="9" rx="0.5"/><rect x="11" y="2" width="3" height="12.5" rx="0.5"/></svg>,
  }
  return icons[name] || null
}

// ====== File Icon ======

export function fileIcon(ext: string): JSX.Element {
  const s = { stroke: 'currentColor', strokeWidth: '1.2', fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' as 'round' }
  if (['.html', '.htm'].includes(ext)) return <svg width="14" height="14" viewBox="0 0 14 14" {...s}><path d="M2.5 1.5h5L11 5v7.5a.5.5 0 01-.5.5h-8a.5.5 0 01-.5-.5v-11z"/><path d="M7.5 1.5v4h4"/><path d="M4 9l1 2 1-4 1 3 1-3"/></svg>
  if (['.md'].includes(ext)) return <svg width="14" height="14" viewBox="0 0 14 14" {...s}><path d="M2.5 1.5h5L11 5v7.5a.5.5 0 01-.5.5h-8a.5.5 0 01-.5-.5v-11z"/><path d="M7.5 1.5v4h4"/><path d="M5 8h4M5 10h3"/></svg>
  if (['.docx'].includes(ext)) return <svg width="14" height="14" viewBox="0 0 14 14" {...s}><path d="M2.5 1.5h5L11 5v7.5a.5.5 0 01-.5.5h-8a.5.5 0 01-.5-.5v-11z"/><path d="M7.5 1.5v4h4"/><path d="M5 8h4M5 10h3"/></svg>
  if (['.pptx'].includes(ext)) return <svg width="14" height="14" viewBox="0 0 14 14" {...s}><path d="M2.5 1.5h5L11 5v7.5a.5.5 0 01-.5.5h-8a.5.5 0 01-.5-.5v-11z"/><path d="M7.5 1.5v4h4"/><rect x="5" y="8" width="4" height="3" rx="0.5"/></svg>
  if (['.csv', '.xlsx'].includes(ext)) return <svg width="14" height="14" viewBox="0 0 14 14" {...s}><path d="M2.5 1.5h5L11 5v7.5a.5.5 0 01-.5.5h-8a.5.5 0 01-.5-.5v-11z"/><path d="M7.5 1.5v4h4"/><rect x="4" y="7.5" width="6" height="4.5" rx="0.5"/></svg>
  if (['.txt'].includes(ext)) return <svg width="14" height="14" viewBox="0 0 14 14" {...s}><path d="M2.5 1.5h5L11 5v7.5a.5.5 0 01-.5.5h-8a.5.5 0 01-.5-.5v-11z"/><path d="M7.5 1.5v4h4"/><path d="M5 8h4M5 10h2"/></svg>
  return <svg width="14" height="14" viewBox="0 0 14 14" {...s}><path d="M2.5 1.5h5L11 5v7.5a.5.5 0 01-.5.5h-8a.5.5 0 01-.5-.5v-11z"/><path d="M7.5 1.5v4h4"/></svg>
}

// ====== Utilities ======

export function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

export const api = () => window.electronAPI

export function permToNumber(perm: PermissionLevel): number {
  return perm === 'full' ? 5 : 3  // default=L3, full=L5 (all tools)
}
