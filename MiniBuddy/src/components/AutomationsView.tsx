import React, { useState } from 'react'
import { iconSVG } from './shared'

export function AutomationsView() {
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', prompt: '', cwd: '', frequency: 'daily' as 'daily'|'hourly'|'weekly'|'once', hour: '09', minute: '00', weekDay: '1', validFrom: '', validUntil: '', notify: true, tools: 'auto', connector: '' })
  const [items, setItems] = useState<Array<{ id: string; name: string; prompt: string; frequency: string; time: string; active: boolean }>>([])

  const templateCards = [
    { icon: 'sun', title: '每日晨报', desc: '每天早上 8:00 自动汇总新闻、天气和日程', prompt: '帮我汇总今天的：1. 重要新闻；2. 天气；3. 今天的日程安排。生成一份简洁的晨报。', freq: 'daily', time: '08:00' },
    { icon: 'data', title: '项目进度报告', desc: '每周一自动生成上周项目进度汇总', prompt: '分析项目文件变更和任务状态，生成上周的项目进度报告。包括：完成的任务、进行中的任务、风险和阻塞项。', freq: 'weekly', time: '09:00' },
    { icon: 'code', title: '代码审查提醒', desc: '每工作日检查待审查的 PR 并发送提醒', prompt: '检查所有仓库中等待审查的 Pull Request，汇总清单并发送提醒。', freq: 'daily', time: '10:00' },
    { icon: 'mail', title: '邮件摘要', desc: '每小时检查新邮件并生成摘要', prompt: '检查未读邮件，筛选重要邮件，生成一句话摘要列表。', freq: 'hourly', time: '每整点' },
  ]

  const reset = () => setForm({ name: '', prompt: '', cwd: '', frequency: 'daily', hour: '09', minute: '00', weekDay: '1', validFrom: '', validUntil: '', notify: true, tools: 'auto', connector: '' })

  const addItem = () => {
    if (!form.name.trim() || !form.prompt.trim()) return
    const timeStr = form.frequency === 'hourly' ? '每整点' : form.frequency === 'once' ? '单次执行' : form.frequency === 'weekly' ? `每周${['','一','二','三','四','五','六','日'][Number(form.weekDay)]} ${form.hour}:${form.minute}` : `每天 ${form.hour}:${form.minute}`
    setItems(prev => [{ id: Date.now().toString(36), name: form.name, prompt: form.prompt, frequency: form.frequency === 'hourly' ? '每小时' : form.frequency === 'weekly' ? '每周' : form.frequency === 'once' ? '单次' : '每天', time: timeStr, active: true }, ...prev])
    reset(); setShowAdd(false)
  }

  return (
    <div className="p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-[#1D2129]">自动化</h2>
            <p className="text-sm text-[#86909C] mt-0.5">设置定时任务，让 CoreBuddy 按计划自动执行工作。</p>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#165DFF] hover:bg-[#0E4BD8] text-white text-sm font-medium transition-colors">
            {iconSVG('plus')}<span>添加自动化</span>
          </button>
        </div>

        {/* Template Cards */}
        {items.length === 0 && (
          <>
            <div className="text-sm font-medium text-[#4E5969] mb-3">参考案例</div>
            <div className="grid grid-cols-2 gap-3 mb-8">
              {templateCards.map((t, i) => (
                <div key={i} onClick={() => {
                  const isHourly = t.freq === 'hourly'
                  setForm({ ...form, name: t.title, prompt: t.prompt, frequency: t.freq as any,
                    hour: isHourly ? '00' : t.time.split(':')[0],
                    minute: isHourly ? '00' : (t.time.includes(':') ? t.time.split(':')[1] : '00')
                  })
                  setShowAdd(true)
                }}
                  className="border border-[#F2F3F5] rounded-lg p-4 cursor-pointer hover:border-[#165DFF] hover:shadow-sm transition-all group bg-white">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[#F7F8FA] flex items-center justify-center shrink-0 text-[#4E5969] group-hover:text-[#165DFF] group-hover:bg-[#E8F3FF] transition-colors">{iconSVG(t.icon)}</div>
                    <div>
                      <div className="text-sm font-medium text-[#1D2129] mb-0.5">{t.title}</div>
                      <div className="text-xs text-[#86909C] leading-relaxed">{t.desc}</div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F2F3F5] text-[#86909C]">{t.time}</span>
                        <span className="text-[10px] text-[#C9CDD4]">{t.freq === 'weekly' ? '每周' : t.freq === 'hourly' ? '每小时' : '每天'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Existing Items */}
        {items.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-[#4E5969]">我的自动化 ({items.length})</div>
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-1 text-xs text-[#165DFF] hover:underline">
                {iconSVG('plus')}<span>添加</span>
              </button>
            </div>
            {items.map(item => (
              <div key={item.id} className={`flex items-center gap-3 border rounded-lg p-3 bg-white transition-colors ${item.active ? 'border-[#F2F3F5]' : 'border-[#F2F3F5] bg-[#F9FAFB]'}`}>
                <button onClick={() => setItems(prev => prev.map(it => it.id === item.id ? {...it, active: !it.active} : it))}
                  className={`w-8 h-5 rounded-full relative transition-colors shrink-0 ${item.active ? 'bg-[#165DFF]' : 'bg-[#E5E6EB]'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${item.active ? 'left-[14px]' : 'left-[2px]'}`} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[#1D2129]">{item.name}</div>
                  <div className="text-xs text-[#86909C]">{item.frequency} · {item.time}</div>
                </div>
                <button onClick={() => setItems(prev => prev.filter(it => it.id !== item.id))}
                  className="text-[#C9CDD4] hover:text-[#EC5B56] transition-colors p-1">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {items.length === 0 && (
          <div className="text-center py-8 text-sm text-[#C9CDD4]">
            还没有自动化任务，点击上方按钮创建你的第一个自动化
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => { setShowAdd(false); reset() }}>
          <div className="bg-white rounded-xl shadow-2xl w-[540px] max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F2F3F5]">
              <h3 className="text-base font-semibold text-[#1D2129]">添加自动化</h3>
              <button onClick={() => { setShowAdd(false); reset() }}
                className="w-6 h-6 rounded flex items-center justify-center text-[#86909C] hover:bg-[#F2F3F5] hover:text-[#4E5969] transition-colors">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              {/* Name */}
              <div>
                <label className="text-xs font-medium text-[#4E5969] block mb-1.5">名称 <span className="text-[#EC5B56]">*</span></label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                  placeholder="例如：每日晨报"
                  className="w-full h-9 rounded-lg text-sm px-3 border border-[#E5E6EB] outline-none focus:border-[#165DFF] placeholder:text-[#C9CDD4]" />
              </div>

              {/* Workspace (optional) */}
              <div>
                <label className="text-xs font-medium text-[#4E5969] block mb-1.5">工作空间（可选）</label>
                <input value={form.cwd} onChange={e => setForm({...form, cwd: e.target.value})}
                  placeholder="选择工作空间目录"
                  className="w-full h-9 rounded-lg text-sm px-3 border border-[#E5E6EB] outline-none focus:border-[#165DFF] placeholder:text-[#C9CDD4]" />
              </div>

              {/* Prompt */}
              <div>
                <label className="text-xs font-medium text-[#4E5969] block mb-1.5">提示词 <span className="text-[#EC5B56]">*</span></label>
                <textarea value={form.prompt} onChange={e => setForm({...form, prompt: e.target.value})}
                  placeholder="描述让 AI 执行的任务..."
                  rows={3}
                  className="w-full rounded-lg text-sm px-3 py-2 border border-[#E5E6EB] outline-none focus:border-[#165DFF] placeholder:text-[#C9CDD4] resize-none" />
              </div>

              {/* Tool & Expert toggle */}
              <div className="flex items-center gap-2">
                {[
                  { k: 'auto', l: 'Auto', d: '自动选择' },
                  { k: 'skills', l: '技能', d: '指定技能' },
                  { k: 'expert', l: '召唤专家', d: '指定专家' },
                ].map(t => (
                  <button key={t.k} onClick={() => setForm({...form, tools: t.k})}
                    className={`flex-1 h-9 rounded-lg text-xs font-medium border transition-colors ${form.tools === t.k ? 'border-[#165DFF] bg-[#E8F3FF] text-[#165DFF]' : 'border-[#E5E6EB] text-[#4E5969] hover:bg-[#F7F8FA]'}`}>
                    {t.l}
                  </button>
                ))}
              </div>

              {/* Connector */}
              <div>
                <label className="text-xs font-medium text-[#4E5969] block mb-1.5">连接器</label>
                <select value={form.connector} onChange={e => setForm({...form, connector: e.target.value})}
                  className="w-full h-9 rounded-lg text-sm px-3 border border-[#E5E6EB] outline-none focus:border-[#165DFF] bg-white text-[#4E5969]">
                  <option value="">选择连接器</option>
                  <option value="feishu">飞书</option>
                  <option value="github">GitHub</option>
                  <option value="wecom">企业微信</option>
                  <option value="dingtalk">钉钉</option>
                  <option value="tencent-docs">腾讯文档</option>
                </select>
              </div>

              {/* Frequency */}
              <div>
                <label className="text-xs font-medium text-[#4E5969] block mb-1.5">执行频率</label>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {[
                    { k: 'daily', l: '每天' },
                    { k: 'hourly', l: '每小时' },
                    { k: 'weekly', l: '每周' },
                    { k: 'once', l: '单次' },
                  ].map(f => (
                    <button key={f.k} onClick={() => setForm({...form, frequency: f.k as any})}
                      className={`h-8 rounded-lg text-xs font-medium border transition-colors ${form.frequency === f.k ? 'border-[#165DFF] bg-[#E8F3FF] text-[#165DFF]' : 'border-[#E5E6EB] text-[#4E5969] hover:bg-[#F7F8FA]'}`}>
                      {f.l}
                    </button>
                  ))}
                </div>
                {/* Time picker (not for hourly/once) */}
                {form.frequency !== 'hourly' && form.frequency !== 'once' && (
                  <div className="flex items-center gap-2">
                    {form.frequency === 'weekly' && (
                      <select value={form.weekDay} onChange={e => setForm({...form, weekDay: e.target.value})}
                        className="h-8 rounded-lg text-xs px-2 border border-[#E5E6EB] outline-none focus:border-[#165DFF] bg-white text-[#4E5969]">
                        {['一','二','三','四','五','六','日'].map((d,i) => <option key={i} value={String(i+1)}>周{d}</option>)}
                      </select>
                    )}
                    <select value={form.hour} onChange={e => setForm({...form, hour: e.target.value})}
                      className="h-8 rounded-lg text-xs px-2 border border-[#E5E6EB] outline-none focus:border-[#165DFF] bg-white text-[#4E5969]">
                      {Array.from({length:24},(_,i)=>String(i).padStart(2,'0')).map(h=><option key={h} value={h}>{h}:00</option>)}
                    </select>
                    <span className="text-xs text-[#C9CDD4]">:</span>
                    <select value={form.minute} onChange={e => setForm({...form, minute: e.target.value})}
                      className="h-8 rounded-lg text-xs px-2 border border-[#E5E6EB] outline-none focus:border-[#165DFF] bg-white text-[#4E5969]">
                      {['00','15','30','45'].map(m=><option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                )}
                {form.frequency === 'hourly' && (
                  <div className="text-xs text-[#86909C]">每小时整点执行</div>
                )}
                {form.frequency === 'once' && (
                  <div className="text-xs text-[#86909C]">手动触发或指定具体时间执行</div>
                )}
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#4E5969] block mb-1.5">生效日期（可选）</label>
                  <input type="date" value={form.validFrom} onChange={e => setForm({...form, validFrom: e.target.value})}
                    className="w-full h-9 rounded-lg text-xs px-3 border border-[#E5E6EB] outline-none focus:border-[#165DFF] text-[#4E5969]" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#4E5969] block mb-1.5">截止日期（可选）</label>
                  <input type="date" value={form.validUntil} onChange={e => setForm({...form, validUntil: e.target.value})}
                    className="w-full h-9 rounded-lg text-xs px-3 border border-[#E5E6EB] outline-none focus:border-[#165DFF] text-[#4E5969]" />
                </div>
              </div>

              {/* Notify toggle */}
              <div className="flex items-center justify-between py-1">
                <div>
                  <div className="text-xs font-medium text-[#4E5969]">完成推送</div>
                  <div className="text-[10px] text-[#C9CDD4]">执行完成后推送到本设备</div>
                </div>
                <button onClick={() => setForm({...form, notify: !form.notify})}
                  className={`w-8 h-5 rounded-full relative transition-colors shrink-0 ${form.notify ? 'bg-[#165DFF]' : 'bg-[#E5E6EB]'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${form.notify ? 'left-[14px]' : 'left-[2px]'}`} />
                </button>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#F2F3F5]">
              <button onClick={() => { setShowAdd(false); reset() }}
                className="px-4 py-2 rounded-lg text-sm text-[#4E5969] border border-[#E5E6EB] hover:bg-[#F7F8FA] transition-colors">
                取消
              </button>
              <button onClick={addItem}
                disabled={!form.name.trim() || !form.prompt.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#165DFF] hover:bg-[#0E4BD8] disabled:bg-[#C9CDD4] disabled:cursor-not-allowed transition-colors">
                添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
