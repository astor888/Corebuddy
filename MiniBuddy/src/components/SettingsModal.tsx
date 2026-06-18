import React, { useState, useEffect } from 'react'
import type { PermissionLevel } from '../types/electron'

export function SettingsModal({ apiKey, userName, perm, autoConfig, onApiKeyChange, onNameChange, onPermChange, onAutoConfigChange, onClose, onModelsChange }: {
  apiKey: string; userName: string; perm: PermissionLevel
  autoConfig: { defaultModel: string; imageModel: string }
  onApiKeyChange: (v: string) => void; onNameChange: (v: string) => void
  onPermChange: (v: PermissionLevel) => void; onAutoConfigChange: (v: { defaultModel: string; imageModel: string }) => void
  onClose: () => void
  onModelsChange: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [newModel, setNewModel] = useState({ id: '', name: '', apiUrl: '', apiKey: '' })
  const [modelList, setModelList] = useState<Array<{ id: string; name: string; apiUrl: string; apiKey?: string }>>([])

  useEffect(() => {
    const a = window.electronAPI as any
    if (a?.models) a.models.list().then((cfg: any) => {
      if (cfg?.models) setModelList(cfg.models)
    }).catch(() => {})
  }, [])

  const addModel = async () => {
    try {
      const a = window.electronAPI as any
      if (!newModel.id || !newModel.name || !newModel.apiUrl) return
      const r = await a.models.add(newModel)
      if (r?.success) {
        setNewModel({ id: '', name: '', apiUrl: '', apiKey: '' })
        setAdding(false)
        const cfg = await a.models.list()
        if (cfg?.models) setModelList(cfg.models)
        onModelsChange()
      } else {
        alert(r?.error || '添加失败')
      }
    } catch (e: any) {
      alert('添加失败: ' + (e?.message || '未知错误'))
    }
  }

  const removeModel = async (id: string) => {
    try {
      const a = window.electronAPI as any
      await a.models.remove(id)
      const cfg = await a.models.list()
      if (cfg?.models) setModelList(cfg.models)
      onModelsChange()
    } catch (e: any) {
      alert('删除失败: ' + (e?.message || '未知错误'))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl p-6 w-[480px] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-[#1D2129] mb-5">设置</h2>

        <label className="text-sm text-[#4E5969] block mb-1.5">名字</label>
        <input value={userName} onChange={e => onNameChange(e.target.value)}
          className="w-full h-10 rounded-lg text-sm px-3 border border-[#E5E6EB] outline-none focus:border-[#165DFF] mb-4" />

        <label className="text-sm text-[#4E5969] block mb-1.5">API Key</label>
        <input type="password" value={apiKey} onChange={e => onApiKeyChange(e.target.value)} placeholder="sk-..."
          className="w-full h-10 rounded-lg text-sm px-3 border border-[#E5E6EB] outline-none focus:border-[#165DFF] mb-4" />

        <label className="text-sm text-[#4E5969] block mb-1.5">权限级别</label>
        <select value={perm} onChange={e => onPermChange(e.target.value as PermissionLevel)}
          className="w-full h-10 rounded-lg text-sm px-3 border border-[#E5E6EB] outline-none focus:border-[#165DFF] mb-4 bg-white">
          <option value="default">默认权限</option>
          <option value="full">完全访问</option>
        </select>

        {/* Model Management */}
        <div className="border-t border-[#F2F3F5] pt-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-[#4E5969]">模型管理</span>
            <button onClick={() => setAdding(!adding)}
              className="text-xs px-2 py-1 rounded bg-[#E8F3FF] text-[#165DFF] hover:bg-[#165DFF] hover:text-white transition-colors">
              {adding ? '取消' : '+ 添加'}
            </button>
          </div>

          {adding && (
            <div className="bg-[#F7F8FA] rounded-lg p-3 mb-3 space-y-2">
              <input value={newModel.name} onChange={e => setNewModel(prev => ({ ...prev, name: e.target.value }))}
                placeholder="显示名称（如: OpenAI GPT-4）" className="w-full h-9 rounded text-xs px-2.5 border border-[#E5E6EB] outline-none focus:border-[#165DFF]" />
              <input value={newModel.id} onChange={e => setNewModel(prev => ({ ...prev, id: e.target.value }))}
                placeholder="模型 ID（如: gpt-4o）" className="w-full h-9 rounded text-xs px-2.5 border border-[#E5E6EB] outline-none focus:border-[#165DFF]" />
              <input value={newModel.apiUrl} onChange={e => setNewModel(prev => ({ ...prev, apiUrl: e.target.value }))}
                placeholder="API 端点（如: https://api.openai.com/v1）" className="w-full h-9 rounded text-xs px-2.5 border border-[#E5E6EB] outline-none focus:border-[#165DFF]" />
              <input value={newModel.apiKey} onChange={e => setNewModel(prev => ({ ...prev, apiKey: e.target.value }))}
                type="password"
                placeholder="API Key（可选，留空则使用全局 Key）" className="w-full h-9 rounded text-xs px-2.5 border border-[#E5E6EB] outline-none focus:border-[#165DFF]" />
              <button onClick={addModel}
                className="w-full h-9 rounded bg-[#165DFF] text-white text-xs font-medium hover:bg-[#0E4BD8]">确认添加</button>
            </div>
          )}

          <div className="space-y-1">
            {modelList.map(m => (
              <div key={m.id} className="flex items-center justify-between py-2 px-2 rounded hover:bg-[#F7F8FA] text-[13px]">
                <div className="flex-1 min-w-0">
                  <span className="text-[#1D2129]">{m.name}</span>
                  <span className="text-[10px] text-[#C9CDD4] ml-2">{m.id}</span>
                  {m.apiKey && <span className="text-[10px] text-[#61C454] ml-2" title="已配置独立 API Key">🔑</span>}
                </div>
                <button onClick={() => removeModel(m.id)}
                  className="text-[10px] text-[#C9CDD4] hover:text-[#EC5B56] px-1">删除</button>
              </div>
            ))}
          </div>
        </div>

        {/* Auto Mode Config */}
        <div className="border-t border-[#F2F3F5] pt-4 mt-4">
          <div className="text-sm font-medium text-[#4E5969] mb-3">🤖 Auto 智能选择</div>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-[#86909C] block mb-1">默认模型（通用任务）</label>
              <select value={autoConfig.defaultModel} onChange={e => onAutoConfigChange({ ...autoConfig, defaultModel: e.target.value })}
                className="w-full h-9 rounded-lg text-xs px-2.5 border border-[#E5E6EB] outline-none focus:border-[#165DFF] bg-white">
                {modelList.map(m => <option key={m.id} value={m.id}>{m.name} ({m.id})</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#86909C] block mb-1">图片分析首选模型</label>
              <select value={autoConfig.imageModel} onChange={e => onAutoConfigChange({ ...autoConfig, imageModel: e.target.value })}
                className="w-full h-9 rounded-lg text-xs px-2.5 border border-[#E5E6EB] outline-none focus:border-[#165DFF] bg-white">
                {modelList.map(m => <option key={m.id} value={m.id}>{m.name} ({m.id})</option>)}
              </select>
            </div>
            <p className="text-[10px] text-[#C9CDD4] leading-relaxed">
              Auto 模式下，发送图片时自动切换到图片分析模型；其他任务使用默认模型。
              你可以在后期随时修改这两项配置。
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose}
            className="px-5 py-2 rounded-lg text-sm text-[#4E5969] border border-[#E5E6EB] hover:bg-[#F7F8FA]">关闭</button>
        </div>
      </div>
    </div>
  )
}
