import React, { useState, useEffect } from 'react'
import { FormattedContent } from './MessageRenderer'
import { iconSVG, api } from './shared'
import type { ArtifactInfo } from '../types/electron'

export function PreviewPanel({ msgs, artifacts }: { msgs: Array<{ id: string; role: string; content: string; time: string }>; artifacts: ArtifactInfo[] }) {
  const [previewContent, setPreviewContent] = useState<string>('')
  const [previewType, setPreviewType] = useState<string>('')
  const [previewTitle, setPreviewTitle] = useState<string>('')

  // Find previewable content: 1) HTML in messages 2) Latest HTML/MD artifact
  useEffect(() => {
    // Check messages for HTML
    const msgsArr = msgs || []
    const artsArr = artifacts || []
    const lastAssistant = [...msgsArr].reverse().find(m => m.role === 'assistant')
    if (lastAssistant?.content) {
      // Check for HTML in code blocks
      const htmlMatch = lastAssistant.content.match(/```(?:html)?\s*([\s\S]*?)```/)
      if (htmlMatch && /<html|<body|<div|<head|<!DOCTYPE/i.test(htmlMatch[1])) {
        setPreviewContent(htmlMatch[1])
        setPreviewType('html')
        setPreviewTitle('对话 HTML')
        return
      }
      // Check for raw HTML in message
      if (lastAssistant.content.includes('<html') || lastAssistant.content.includes('<!DOCTYPE html')) {
        const start = lastAssistant.content.indexOf('<')
        setPreviewContent(lastAssistant.content.slice(start))
        setPreviewType('html')
        setPreviewTitle('对话 HTML')
        return
      }
    }

    // Check latest HTML artifact
    const htmlArtifact = [...artsArr].reverse().find(a => a.type === 'html')
    if (htmlArtifact?.path) {
      const a = api()
      if (a?.file) {
        a.file.read(htmlArtifact.path).then(r => {
          if (r.success && r.content) {
            setPreviewContent(r.content)
            setPreviewType('html')
            setPreviewTitle(htmlArtifact.path?.split(/[/\\]/).pop() || 'Preview')
          }
        }).catch(() => {})
        return
      }
    }

    // Check latest MD artifact
    const mdArtifact = [...artsArr].reverse().find(a => a.type === 'md')
    if (mdArtifact?.path) {
      const a = api()
      if (a?.file) {
        a.file.read(mdArtifact.path).then(r => {
          if (r.success && r.content) {
            setPreviewContent(r.content)
            setPreviewType('markdown')
            setPreviewTitle(mdArtifact.path?.split(/[/\\]/).pop() || 'Preview')
          }
        }).catch(() => {})
        return
      }
    }

    // Nothing to preview
    setPreviewContent('')
    setPreviewType('')
    setPreviewTitle('')
  }, [msgs, artifacts])

  if (!previewContent) {
    return (
      <div className="text-xs h-full flex flex-col">
        <div className="font-medium text-[#1D2129] mb-2 shrink-0">预览</div>
        <div className="flex-1 flex items-center justify-center text-[#C9CDD4] text-center">
          <div>
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-[#F2F3F5] flex items-center justify-center">{iconSVG('chart')}</div>
            <div className="mb-1">生成 HTML 或 Markdown 文件后可在此预览</div>
            <div className="text-[10px]">对话中创建的网页和文档会自动显示</div>
          </div>
        </div>
      </div>
    )
  }

  if (previewType === 'html') {
    return (
      <div className="text-xs h-full flex flex-col">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <div className="font-medium text-[#1D2129] truncate flex-1">{previewTitle}</div>
          <button onClick={() => setPreviewContent('')}
            className="text-[10px] text-[#86909C] hover:text-[#EC5B56] shrink-0 ml-2">✕</button>
        </div>
        <iframe srcDoc={previewContent}
          className="flex-1 w-full border border-[#E5E6EB] rounded-lg bg-white"
          sandbox="allow-scripts allow-same-origin" title="Preview" />
      </div>
    )
  }

  if (previewType === 'markdown') {
    return (
      <div className="text-xs h-full flex flex-col">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <div className="font-medium text-[#1D2129] truncate flex-1">{previewTitle}</div>
          <button onClick={() => setPreviewContent('')}
            className="text-[10px] text-[#86909C] hover:text-[#EC5B56] shrink-0 ml-2">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto bg-white border border-[#E5E6EB] rounded-lg p-3">
          <FormattedContent content={previewContent} />
        </div>
      </div>
    )
  }

  // Text preview
  return (
    <div className="text-xs h-full flex flex-col">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="font-medium text-[#1D2129] truncate flex-1">{previewTitle}</div>
        <button onClick={() => setPreviewContent('')}
          className="text-[10px] text-[#86909C] hover:text-[#EC5B56] shrink-0 ml-2">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto bg-white border border-[#E5E6EB] rounded-lg p-3">
        <pre className="text-[11px] text-[#4E5969] font-mono whitespace-pre-wrap">{previewContent.slice(0, 5000)}</pre>
      </div>
    </div>
  )
}
