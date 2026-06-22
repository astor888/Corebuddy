import React, { useState } from 'react'
import { iconSVG, api } from './shared'

const APP_VERSION = '1.9.6'

export function MoreView({ onOpenSettings, onNav }: { onOpenSettings: () => void; onNav: (v: string) => void }) {
  const [showShortcuts, setShowShortcuts] = useState(false)

  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-lg font-semibold text-[#1D2129] mb-4">更多</h2>
        <div className="space-y-1">
          {[
            { icon: 'gear', label: '设置', desc: 'API Key、模型、权限等配置', onClick: onOpenSettings },
            { icon: 'connector', label: '连接器', desc: '管理外部服务连接（飞书、GitHub 等）', onClick: () => onNav('connectors') },
            { icon: 'doc', label: '快捷键', desc: '查看键盘快捷键', onClick: () => setShowShortcuts(!showShortcuts) },
            { icon: 'help', label: '帮助文档', desc: '使用指南和常见问题', onClick: () => {
              api()?.openExternal('https://www.codebuddy.cn/docs')
            } },
            { icon: 'update', label: '检查更新', desc: `当前版本 v${APP_VERSION}`, onClick: () => {
              api()?.openExternal('https://github.com/user/corebuddy/releases')
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

        {showShortcuts && (
          <div className="mt-4 p-4 bg-[#F7F8FA] rounded-xl border border-[#F2F3F5]">
            <h3 className="text-sm font-medium text-[#1D2129] mb-3">键盘快捷键</h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2">
              {[
                ['Enter', '发送消息'],
                ['Shift + Enter', '换行'],
                ['Ctrl + N', '新建对话'],
                ['Ctrl + W', '关闭当前对话'],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center gap-3 text-xs">
                  <kbd className="px-2 py-0.5 bg-white border border-[#E5E6EB] rounded text-[#4E5969] font-mono text-[11px] min-w-[60px] text-center">{key}</kbd>
                  <span className="text-[#86909C]">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
