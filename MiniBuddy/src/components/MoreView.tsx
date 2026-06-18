import React from 'react'
import { iconSVG, api } from './shared'

export function MoreView({ onOpenSettings, onNav }: { onOpenSettings: () => void; onNav: (v: string) => void }) {
  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-lg font-semibold text-[#1D2129] mb-4">更多</h2>
        <div className="space-y-1">
          {[
            { icon: 'gear', label: '设置', desc: 'API Key、模型、权限等配置', onClick: onOpenSettings },
            { icon: 'connector', label: '连接器', desc: '管理外部服务连接（飞书、GitHub 等）', onClick: () => onNav('connectors') },
            { icon: 'doc', label: '快捷键', desc: '查看键盘快捷键', onClick: () => {
              alert('快捷键:\n\nEnter — 发送消息\nShift+Enter — 换行\nCtrl+N — 新建对话\nCtrl+W — 关闭当前对话')
            } },
            { icon: 'help', label: '帮助文档', desc: '使用指南和常见问题', onClick: () => {
              api()?.openExternal('https://github.com')
            } },
            { icon: 'update', label: '检查更新', desc: '当前版本 v1.4.1', onClick: () => {
              alert('已是最新版本 v1.4.0')
            } },
          ].map(item => (
            <div key={item.label} onClick={item.onClick}
              className="flex items-center gap-4 px-4 py-3 rounded-lg cursor-pointer text-sm hover:bg-[#F7F8FA] transition-colors border border-transparent hover:border-[#F2F3F5]">
              <span className="w-5 h-5 shrink-0 flex items-center justify-center text-[#86909C]">{iconSVG(item.icon)}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[#1D2129] font-medium">{item.label}</div>
                <div className="text-xs text-[#86909C]">{item.desc}</div>
              </div>
              <span className="text-[#C9CDD4] text-xs">→</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
