import React, { useEffect, useState } from 'react'

interface ExpertInfo {
  id: string
  name: string
  displayName: string
  description: string
  category: string
  icon: string
  tags: string[]
  quickPrompts: string[]
  builtin: boolean
}

interface Props {
  onCreateConv?: () => Promise<string | null>
  onActivateExpert?: (convId: string, expert: ExpertInfo) => void
  onOpenVideoGen?: () => void
}

export function ExpertsView({ onCreateConv, onActivateExpert, onOpenVideoGen }: Props) {
  const [experts, setExperts] = useState<ExpertInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [activating, setActivating] = useState<string | null>(null)
  const [activeExpertId, setActiveExpertId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('全部')

  useEffect(() => {
    loadExperts()
  }, [])

  async function loadExperts() {
    try {
      setLoading(true)
      const list = await (window as any).electronAPI?.experts?.list()
      if (list && Array.isArray(list)) {
        setExperts(list)
      }
      const active = await (window as any).electronAPI?.experts?.active()
      if (active) setActiveExpertId(active.id)
    } catch (e) {
      console.error('Failed to load experts:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleActivate(expert: ExpertInfo) {
    try {
      setActivating(expert.id)
      // Create new conversation first
      let convId: string | null = null
      if (onCreateConv) {
        convId = await onCreateConv()
      }
      if (!convId) {
        convId = `conv-${Date.now()}`
      }
      // Activate expert
      await (window as any).electronAPI?.experts?.activate(expert.id)
      setActiveExpertId(expert.id)
      // Notify parent
      if (onActivateExpert) {
        onActivateExpert(convId, expert)
      }
    } catch (e: any) {
      console.error('Failed to activate expert:', e)
    } finally {
      setActivating(null)
    }
  }

  async function handleDeactivate() {
    try {
      await (window as any).electronAPI?.experts?.deactivate()
      setActiveExpertId(null)
    } catch (e) {
      console.error('Failed to deactivate expert:', e)
    }
  }

  // Extract unique categories
  const categories = ['全部', ...Array.from(new Set(experts.map(e => e.category)))]
  
  const filtered = experts.filter(e => {
    const matchSearch = !search || 
      e.displayName.includes(search) || 
      e.description.includes(search) ||
      e.tags.some(t => t.includes(search))
    const matchCategory = categoryFilter === '全部' || e.category === categoryFilter
    return matchSearch && matchCategory
  })

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-[#1D2129]">专家中心</h2>
          {activeExpertId && (
            <button
              onClick={handleDeactivate}
              style={{
                padding: '4px 12px', fontSize: 12, borderRadius: 6,
                border: '0.5px solid var(--color-border-tertiary)',
                background: 'var(--color-background-primary)', cursor: 'pointer',
                color: 'var(--color-text-secondary)',
              }}
            >
              退出专家模式
            </button>
          )}
        </div>
        <p className="text-sm text-[#86909C] mb-4">召唤专业 AI 专家，获得更精准的帮助</p>

        {/* Search + Category filter */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
              width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#86909C" strokeWidth="1.3" strokeLinecap="round">
              <circle cx="7" cy="7" r="4.5"/>
              <path d="M10.5 10.5L14 14"/>
            </svg>
            <input
              type="text"
              placeholder="搜索专家..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '7px 10px 7px 30px', fontSize: 13,
                borderRadius: 8, border: '0.5px solid var(--color-border-tertiary)',
                background: 'var(--color-background-primary)',
                color: 'var(--color-text-primary)',
                outline: 'none',
              }}
            />
          </div>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            style={{
              padding: '7px 10px', fontSize: 13, borderRadius: 8,
              border: '0.5px solid var(--color-border-tertiary)',
              background: 'var(--color-background-primary)',
              color: 'var(--color-text-primary)',
              cursor: 'pointer', outline: 'none',
            }}
          >
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            加载专家列表...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            {search ? '没有找到匹配的专家' : '暂无可用专家'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {filtered.map(expert => {
              const isActive = expert.id === activeExpertId
              const isCurrentActivating = activating === expert.id
              return (
                <div
                  key={expert.id}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 10, padding: '16px',
                    borderRadius: 12, border: isActive ? '1.5px solid #534AB7' : '0.5px solid var(--color-border-tertiary)',
                    background: isActive ? '#F8F7FF' : 'var(--color-background-primary)',
                    transition: 'border-color 0.2s, background 0.2s',
                  }}
                >
                  {/* Header: icon + name + badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10, background: '#EEEDFE',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 20,
                    }}>
                      {expert.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', margin: 0 }}>
                          {expert.displayName}
                        </p>
                        {expert.builtin && (
                          <span style={{
                            fontSize: 10, padding: '1px 6px', borderRadius: 4,
                            background: '#E8F3FF', color: '#165DFF',
                          }}>
                            内置
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: 0, lineHeight: 1.5 }}>
                    {expert.description}
                  </p>

                  {/* Tags */}
                  {expert.tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {expert.tags.map(tag => (
                        <span key={tag} style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 4,
                          background: 'var(--color-background-secondary)',
                          color: 'var(--color-text-secondary)',
                        }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Activate button */}
                  <button
                    onClick={() => isActive ? handleDeactivate() : handleActivate(expert)}
                    disabled={isCurrentActivating}
                    style={{
                      marginTop: 4, padding: '8px 16px', fontSize: 13, fontWeight: 500,
                      borderRadius: 8, border: isActive ? '1px solid #534AB7' : 'none',
                      background: isActive ? 'transparent' : '#534AB7',
                      color: isActive ? '#534AB7' : '#FFFFFF',
                      cursor: isCurrentActivating ? 'not-allowed' : 'pointer',
                      opacity: isCurrentActivating ? 0.6 : 1,
                      transition: 'all 0.2s',
                    }}
                  >
                    {isCurrentActivating ? '召唤中...' : isActive ? '已召唤' : '召唤'}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* App entries */}
        <div style={{ marginTop: 24, paddingTop: 20, borderTop: '0.5px solid var(--color-border-tertiary)' }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 10 }}>应用工具</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {/* AI 视频生成 */}
            <button
              onClick={() => onOpenVideoGen?.()}
              style={{
                display: 'flex', flexDirection: 'column', gap: 10, padding: '16px',
                borderRadius: 12, border: '0.5px solid var(--color-border-tertiary)',
                background: 'var(--color-background-primary)', cursor: 'pointer',
                textAlign: 'left', transition: 'border-color 0.2s',
              }}
              onMouseEnter={e => {(e.currentTarget as HTMLElement).style.borderColor = '#534AB7'}}
              onMouseLeave={e => {(e.currentTarget as HTMLElement).style.borderColor = ''}}
            >
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EEEDFE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#534AB7" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2.5" y="5" width="15" height="10" rx="1.5"/>
                  <path d="M2.5 8.5h15M7.5 5V2.5M12.5 5V2.5"/>
                  <circle cx="10" cy="10" r="2" fill="#534AB7" fillOpacity="0.15"/>
                  <path d="M10 7v3l2 1.5"/>
                </svg>
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', margin: '0 0 4px 0' }}>
                  AI 视频生成向导
                </p>
                <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: 0, lineHeight: 1.5 }}>
                  上传产品图/输入想法，AI 自动生成分镜并批量生成视频
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
