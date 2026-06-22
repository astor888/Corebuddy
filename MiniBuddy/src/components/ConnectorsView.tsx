import React, { useState, useEffect, useCallback } from 'react'
import { iconSVG, api } from './shared'
import type { ConnectorConfig } from '../types/electron'

export function ConnectorsView() {
  const [connectors, setConnectors] = useState<ConnectorConfig[]>([])
  const [statusMap, setStatusMap] = useState<Record<string, string>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [formValues, setFormValues] = useState<Record<string, Record<string, string>>>({})
  const [connecting, setConnecting] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [searchText, setSearchText] = useState('')
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    const a = api()
    if (!a?.connectors) return
    a.connectors.list().then(list => { setConnectors(list); setLoading(false) }).catch(() => setLoading(false))
    a.connectors.status().then(s => setStatusMap(s)).catch(() => {})
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Listen for status changes from IPC
  useEffect(() => {
    const a = api()
    if (!a?.connectors) return
    const iv = setInterval(() => {
      a.connectors.status().then(s => setStatusMap(s)).catch(() => {})
    }, 3000)
    return () => clearInterval(iv)
  }, [])

  const getStatus = (id: string): ConnectorConfig['status'] => {
    const s = statusMap[id]
    if (s === 'connected') return 'connected'
    if (s === 'connecting') return 'connecting'
    if (s === 'error') return 'error'
    return 'disconnected'
  }

  const handleConnectClick = (id: string) => {
    setExpandedId(prev => prev === id ? null : id)
    if (!formValues[id]) setFormValues(prev => ({ ...prev, [id]: {} }))
  }

  const handleInlineConnect = async (c: ConnectorConfig) => {
    const a = api()
    if (!a?.connectors) return
    setConnecting(c.id)
    setErrors(prev => { const n = { ...prev }; delete n[c.id]; return n })

    try {
      const config = formValues[c.id] || {}
      const result = await a.connectors.connect(c.id, config)
      if (result.success) {
        setExpandedId(null)
        setStatusMap(prev => ({ ...prev, [c.id]: 'connected' }))
      } else {
        setErrors(prev => ({ ...prev, [c.id]: result.error || '连接失败' }))
        setTimeout(() => setErrors(prev => { const n = { ...prev }; delete n[c.id]; return n }), 5000)
      }
    } catch (e: any) {
      setErrors(prev => ({ ...prev, [c.id]: e?.message || '连接失败，请检查配置' }))
      setTimeout(() => setErrors(prev => { const n = { ...prev }; delete n[c.id]; return n }), 5000)
    }
    setConnecting(null)
  }

  const handleDisconnect = async (id: string) => {
    const a = api()
    if (!a?.connectors) return
    try {
      await a.connectors.disconnect(id)
      setStatusMap(prev => ({ ...prev, [id]: 'disconnected' }))
    } catch (e: any) {
      setErrors(prev => ({ ...prev, [id]: e?.message || '断开失败' }))
      setTimeout(() => setErrors(prev => { const n = { ...prev }; delete n[id]; return n }), 5000)
    }
  }

  const statusDot = (status: ConnectorConfig['status']) => {
    const colors: Record<string, string> = {
      connected: 'bg-[#61C454]',
      disconnected: 'bg-[#E5E6EB]',
      connecting: 'bg-[#165DFF] animate-pulse',
      error: 'bg-[#EC5B56]',
    }
    return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${colors[status] || 'bg-[#E5E6EB]'}`} />
  }

  // ── Search & Category Grouping ──
  const filtered = connectors.filter(c => {
    if (!searchText.trim()) return true
    const q = searchText.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.description.includes(q) || c.category.includes(q)
  })

  const categories: Record<string, ConnectorConfig[]> = {}
  for (const c of filtered) {
    if (!categories[c.category]) categories[c.category] = []
    categories[c.category].push(c)
  }

  const categoryOrder = ['开发', '办公协作', '数据查询', '云服务', '邮箱', '项目管理']
  const sortedCategories = Object.keys(categories).sort(
    (a, b) => {
      const ia = categoryOrder.indexOf(a)
      const ib = categoryOrder.indexOf(b)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    }
  )

  if (loading) {
    return <div className="p-6"><div className="max-w-5xl mx-auto text-center py-12 text-sm text-[#C9CDD4]">加载中...</div></div>
  }

  return (
    <div className="p-6 overflow-y-auto">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-[#1D2129]">连接器</h2>
            <p className="text-sm text-[#86909C] mt-0.5">连接外部服务，扩展 CoreBuddy 的能力。</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
            placeholder="搜索连接器名称、描述或类别..."
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-[#E5E6EB] text-[13px] outline-none focus:border-[#165DFF] placeholder:text-[#C9CDD4]" />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#C9CDD4]">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><circle cx="6" cy="6" r="4"/><path d="M9.5 9.5L13 13"/></svg>
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-sm text-[#C9CDD4]">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#F7F8FA] flex items-center justify-center">{iconSVG('connector')}</div>
            没有找到匹配的连接器
          </div>
        ) : (
          <div className="space-y-5">
            {sortedCategories.map(cat => (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-semibold text-[#1D2129]">{cat}</span>
                  <span className="text-[11px] text-[#C9CDD4] bg-[#F2F3F5] px-1.5 rounded-full">{categories[cat].length}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {categories[cat].map(c => {
                    const status = getStatus(c.id)
                    const expanded = expandedId === c.id
                    const isConnecting = connecting === c.id
                    const isConnected = status === 'connected'
                    return (
                      <div key={c.id}
                        className={`rounded-xl border p-4 bg-white transition-all ${isConnected ? 'border-[#DCECDB]' : 'border-[#E5E6EB]'} ${expanded ? 'shadow-md' : 'hover:shadow-sm'}`}>
                        {/* Header row */}
                        <div className="flex items-start gap-3 mb-3">
                          <div className="w-10 h-10 rounded-xl bg-[#F7F8FA] flex items-center justify-center shrink-0 text-lg">
                            {c.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-[#1D2129]">{c.name}</span>
                              {statusDot(status)}
                            </div>
                            <div className="text-xs text-[#86909C] mt-0.5 leading-relaxed line-clamp-2">{c.description}</div>
                          </div>
                        </div>

                        {/* Action row */}
                        <div className="flex items-center gap-2">
                          {isConnected ? (
                            <>
                              <button onClick={() => handleDisconnect(c.id)}
                                className="text-xs px-3 py-1.5 rounded-lg border border-[#E5E6EB] text-[#86909C] hover:text-[#EC5B56] hover:border-[#EC5B56] transition-colors">
                                断开
                              </button>
                              <span className="text-[11px] text-[#61C454]">已连接</span>
                            </>
                          ) : (
                            <>
                              <button onClick={() => handleConnectClick(c.id)} disabled={isConnecting}
                                className="text-xs px-3 py-1.5 rounded-lg bg-[#165DFF] text-white hover:bg-[#0E4BD8] transition-colors font-medium disabled:opacity-50 flex items-center gap-1.5">
                                {isConnecting ? <><svg className="animate-spin" width="12" height="12" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5"/><path d="M7 1.5a5.5 5.5 0 014.89 3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>连接中...</> : '连接'}
                              </button>
                              {c.helpUrl && (
                                <button onClick={() => api()?.openExternal(c.helpUrl!)}
                                  className="text-xs px-2 py-1.5 rounded-lg text-[#86909C] hover:text-[#165DFF] hover:bg-[#F2F3F5] transition-colors">
                                  获取配置 ↗
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

                        {/* Inline config form */}
                        {expanded && !isConnected && (
                          <div className="mt-4 pt-4 border-t border-[#F2F3F5] space-y-3">
                            {c.configSchema.map(f => (
                              <div key={f.key}>
                                <label className="text-[11px] font-medium text-[#4E5969] mb-1 block">{f.label}</label>
                                <input type={f.type || 'text'} placeholder={f.placeholder}
                                  value={formValues[c.id]?.[f.key] || ''}
                                  onChange={e => setFormValues(prev => ({
                                    ...prev,
                                    [c.id]: { ...(prev[c.id] || {}), [f.key]: e.target.value }
                                  }))}
                                  onKeyDown={e => { if (e.key === 'Enter') handleInlineConnect(c) }}
                                  autoFocus={c.configSchema.indexOf(f) === 0}
                                  className="w-full h-9 px-3 rounded-lg border border-[#E5E6EB] text-[13px] outline-none focus:border-[#165DFF] placeholder:text-[#C9CDD4]" />
                              </div>
                            ))}
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
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
