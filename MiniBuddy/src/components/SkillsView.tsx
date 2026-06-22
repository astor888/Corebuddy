import React, { useState, useEffect, useCallback } from 'react'
import { iconSVG, api } from './shared'
import type { SkillInfo, MarketplaceSkill } from '../types/electron'

export function SkillsView() {
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [marketSkills, setMarketSkills] = useState<MarketplaceSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'installed' | 'market'>('installed')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSkill, setSelectedSkill] = useState<MarketplaceSkill | null>(null)
  const [installing, setInstalling] = useState<string | null>(null)
  const [notify, setNotify] = useState<string | null>(null)

  useEffect(() => {
    const a = api()
    if (a?.skills) {
      a.skills.list().then(list => { setSkills(list); setLoading(false) }).catch(() => setLoading(false))
    } else {
      // Dev mode / no Electron
      setSkills([
        { name: 'code-review-checklist', description: '系统性代码审查检查清单，逐项排查常见但容易被遗漏的 bug', type: 'skill', triggers: ['检查代码', '代码审查', 'review'] },
        { name: 'idea', description: '想法完善引导，通过顾问式提问帮助将模糊想法变成可执行方案文档', type: 'skill', triggers: ['想法', 'idea', '规划'] },
        { name: 'fullstack-dev', description: '全栈后端架构和前后端集成指南，REST API + 前端', type: 'skill' },
        { name: 'agent-browser', description: '浏览器自动化操作：网页截图、表单填写、数据抓取', type: 'skill', triggers: ['浏览器', '截图', '抓取'] },
        { name: 'hello_world', description: '一个示例插件，返回问候语', type: 'tool' },
      ])
      setLoading(false)
    }
  }, [])

  const loadMarketplace = useCallback(() => {
    const a = api()
    if (a?.skills) {
      a.skills.marketplace().then(list => setMarketSkills(list)).catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (tab === 'market') {
      loadMarketplace()
    }
  }, [tab, loadMarketplace])

  // Filter market skills by search
  const filteredMarketSkills = searchQuery.trim()
    ? marketSkills.filter(s =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.triggers?.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : marketSkills

  // Group by category
  const groupedByCategory = filteredMarketSkills.reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = []
    acc[s.category].push(s)
    return acc
  }, {} as Record<string, MarketplaceSkill[]>)

  const handleInstall = async (id: string) => {
    setInstalling(id)
    const a = api()
    if (!a?.skills) return
    try {
      const result = await a.skills.install(id)
      if (result.success) {
        setNotify('安装成功')
        loadMarketplace()
        // Refresh installed list
        a.skills.list().then(list => setSkills(list)).catch(() => {})
        setSelectedSkill(null)
      } else {
        setNotify(result.error || '安装失败')
      }
    } catch {
      setNotify('安装失败')
    } finally {
      setInstalling(null)
      setTimeout(() => setNotify(null), 3000)
    }
  }

  const handleUninstall = async (id: string) => {
    const a = api()
    if (!a?.skills) return
    setInstalling(id)
    try {
      const ok = await a.skills.uninstall(id)
      if (ok) {
        setNotify('卸载成功')
        loadMarketplace()
        a.skills.list().then(list => setSkills(list)).catch(() => {})
        setSelectedSkill(null)
      } else {
        setNotify('卸载失败')
      }
    } catch {
      setNotify('卸载失败')
    } finally {
      setInstalling(null)
      setTimeout(() => setNotify(null), 3000)
    }
  }

  if (loading) {
    return <div className="p-6"><div className="max-w-4xl mx-auto text-center py-12 text-sm text-[#C9CDD4]">加载中...</div></div>
  }

  return (
    <div className="p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-[#1D2129]">技能</h2>
            <p className="text-sm text-[#86909C] mt-0.5">管理和安装技能。</p>
          </div>
        </div>

        {/* Notification */}
        {notify && (
          <div className="mb-4 px-4 py-2 rounded-lg bg-[#E8F3FF] text-[#165DFF] text-sm flex items-center gap-2">
            {iconSVG('skill')}<span>{notify}</span>
          </div>
        )}

        {/* Tab Buttons */}
        <div className="flex gap-1 mb-5 p-1 bg-[#F7F8FA] rounded-lg w-fit">
          <button onClick={() => setTab('installed')}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${tab === 'installed' ? 'bg-white text-[#1D2129] shadow-sm' : 'text-[#4E5969] hover:text-[#1D2129]'}`}>
            已安装 ({skills.length})
          </button>
          <button onClick={() => setTab('market')}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${tab === 'market' ? 'bg-white text-[#1D2129] shadow-sm' : 'text-[#4E5969] hover:text-[#1D2129]'}`}>
            市场
          </button>
        </div>

        {/* Tab Content */}
        {tab === 'installed' ? (
          skills.length === 0 ? (
            <div className="text-center py-12 text-sm text-[#C9CDD4]">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#F7F8FA] flex items-center justify-center">{iconSVG('plugin')}</div>
              还没有安装技能，前往"市场"安装你的第一个技能
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {skills.map((skill, i) => (
                <div key={i}
                  className="border border-[#F2F3F5] rounded-lg p-4 bg-white">
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${skill.type === 'tool' ? 'bg-[#FFF7E6] text-[#D4A017]' : 'bg-[#F7F8FA] text-[#4E5969]'}`}>
                      {skill.type === 'tool' ? iconSVG('gear') : iconSVG('doc')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[#1D2129] mb-0.5 truncate">{skill.name}</div>
                      <div className="text-xs text-[#86909C] leading-relaxed line-clamp-2">{skill.description}</div>
                      {skill.triggers && skill.triggers.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {skill.triggers.map(t => (
                            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-[#F2F3F5] text-[#86909C]">{t}</span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${skill.type === 'tool' ? 'bg-[#FFF7E6] text-[#D4A017]' : 'bg-[#E8F3FF] text-[#165DFF]'}`}>
                          {skill.type === 'tool' ? '工具' : '技能'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div>
            {/* Search */}
            <div className="relative mb-4">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#C9CDD4]">{iconSVG('skill')}</span>
              <input type="text" value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setSelectedSkill(null) }}
                placeholder="搜索技能..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-[#E5E6EB] rounded-lg bg-white text-[#1D2129] placeholder-[#C9CDD4] focus:outline-none focus:border-[#165DFF] transition-colors" />
            </div>

            {/* Selected Skill Detail */}
            {selectedSkill ? (
              <div className="border border-[#F2F3F5] rounded-lg bg-white mb-4">
                <div className="flex items-start justify-between p-4 border-b border-[#F2F3F5]">
                  <div>
                    <div className="text-sm font-medium text-[#1D2129]">{selectedSkill.name}</div>
                    <div className="text-xs text-[#86909C] mt-0.5">{selectedSkill.description}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F2F3F5] text-[#86909C]">{selectedSkill.category}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F2F3F5] text-[#86909C]">v{selectedSkill.version}</span>
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-4 mb-3 text-xs text-[#86909C]">
                    <span>作者: {selectedSkill.author}</span>
                    {selectedSkill.triggers && selectedSkill.triggers.length > 0 && (
                      <span>触发词: {selectedSkill.triggers.slice(0, 5).join(', ')}</span>
                    )}
                  </div>
                  <div className="bg-[#F7F8FA] rounded-lg p-3 mb-4 max-h-60 overflow-y-auto">
                    <pre className="text-[11px] text-[#4E5969] whitespace-pre-wrap font-mono leading-relaxed">{selectedSkill.skillMd.slice(0, 2000)}{selectedSkill.skillMd.length > 2000 ? '\n...(内容已截断)' : ''}</pre>
                  </div>
                  <div className="flex gap-2">
                    {selectedSkill.installed ? (
                      <button onClick={() => handleUninstall(selectedSkill.id)} disabled={installing === selectedSkill.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5E6EB] text-sm text-[#F53F3F] hover:bg-[#FFF0F0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        {iconSVG('logout')}<span>{installing === selectedSkill.id ? '卸载中...' : '卸载'}</span>
                      </button>
                    ) : (
                      <button onClick={() => handleInstall(selectedSkill.id)} disabled={installing === selectedSkill.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#165DFF] text-sm text-white hover:bg-[#0E42D2] disabled:opacity-50 transition-colors">
                        {installing === selectedSkill.id ? <span>安装中...</span> : <><span>{iconSVG('plus')}</span><span>安装</span></>}
                      </button>
                    )}
                    <button onClick={() => setSelectedSkill(null)}
                      className="px-3 py-1.5 rounded-lg border border-[#E5E6EB] text-sm text-[#4E5969] hover:bg-[#F7F8FA] transition-colors">
                      返回
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Grouped Skills by Category */}
            {(searchQuery.trim() && filteredMarketSkills.length === 0) ? (
              <div className="text-center py-12 text-sm text-[#C9CDD4]">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#F7F8FA] flex items-center justify-center">{iconSVG('skill')}</div>
                没有找到匹配的技能
              </div>
            ) : (
              Object.entries(groupedByCategory).map(([category, skills]) => (
                <div key={category} className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-medium text-[#4E5969] bg-[#F7F8FA] px-2 py-0.5 rounded">{category}</span>
                    <span className="text-[10px] text-[#C9CDD4]">{skills.length} 个技能</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {skills.map((skill, i) => (
                      <div key={i}
                        onClick={() => setSelectedSkill(selectedSkill?.id === skill.id ? null : skill)}
                        className={`border rounded-lg p-4 cursor-pointer transition-all bg-white ${selectedSkill?.id === skill.id ? 'border-[#165DFF] shadow-sm' : 'border-[#F2F3F5] hover:border-[#165DFF] hover:shadow-sm'}`}>
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-lg bg-[#F7F8FA] flex items-center justify-center shrink-0 text-[#4E5969]">
                            {iconSVG('skill')}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-medium text-[#1D2129] truncate">{skill.name}</div>
                              {skill.installed ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#E8F3FF] text-[#165DFF] shrink-0">已安装</span>
                              ) : null}
                            </div>
                            <div className="text-xs text-[#86909C] leading-relaxed line-clamp-2 mt-0.5">{skill.description}</div>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F2F3F5] text-[#86909C]">{skill.category}</span>
                              {skill.triggers && skill.triggers.length > 0 && (
                                <span className="text-[10px] text-[#C9CDD4]">{skill.triggers.slice(0, 2).join(', ')}{skill.triggers.length > 2 ? '...' : ''}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
