import React, { useState, useRef, useEffect } from 'react'
import { uid } from './shared'

interface Shot {
  id: string
  name: string
  duration: string
  type: 'text2video' | 'image2video' | 'motion'
  description: string
  prompt: string
  imageHint: string
  status: 'pending' | 'generating' | 'done' | 'failed'
  videoUrl?: string
}

interface Storyboard {
  productName: string
  totalDuration: string
  style: string
  shots: Shot[]
}

interface ActorDef {
  id: string
  name: string
  role: string
  gender: string
  ageRange: string
  style: string
  description: string
}

interface UploadedImage {
  id: string
  data: string
  label: string
}

interface WizardState {
  step: number
  // Step 0 — 产品信息
  productName: string
  productDesc: string
  uploadedImages: UploadedImage[]
  // Step 1 — AI 提问（风格/目标）
  videoGoal: string
  videoVibe: string
  platform: string
  totalDuration: number
  extraReqs: string
  // Step 2 — AI 总结
  aiSummary: string
  // Step 3 — 分镜
  storyboard: Storyboard | null
  // Step 4 — 人物
  needActors: boolean
  actors: ActorDef[]
  // Step 5 — 逐镜确认
  currentShotPage: number
  // Step 6 — 生成
  generating: boolean
  genMode: 'single' | 'batch'
  genProgress: { completed: number; total: number }
  genResults: Shot[]
  // Step 7 — 合成
  synthesizing: boolean
  finalVideoUrl: string
  // Meta
  planning: boolean
  error: string
}

const stepLabels = ['产品信息', '风格定位', 'AI 总结', '生成分镜', '人物设定', '分镜确认', '生成视频', 'AI 合成']

const vibes = [
  { k: 'tech', label: '科技感', emoji: '◈' },
  { k: 'luxury', label: '高端奢华', emoji: '◆' },
  { k: 'natural', label: '温馨自然', emoji: '◉' },
  { k: 'sport', label: '活力运动', emoji: '◎' },
  { k: 'minimal', label: '简约清新', emoji: '○' },
  { k: 'dark', label: '暗黑酷炫', emoji: '◉' },
  { k: 'fun', label: '活泼趣味', emoji: '◈' },
  { k: 'retro', label: '复古怀旧', emoji: '◎' },
]

const goals = [
  { k: 'product_promo', label: '产品宣传片', desc: '突出产品卖点和质感' },
  { k: 'brand_story', label: '品牌故事', desc: '传达品牌理念和价值观' },
  { k: 'social_media', label: '社交媒体短视频', desc: '快节奏、抓眼球' },
  { k: 'tutorial', label: '使用教程', desc: '展示产品使用方法和场景' },
  { k: 'launch', label: '新品发布', desc: '制造期待感和惊喜感' },
]

const platforms = [
  { k: 'douyin', label: '抖音 (竖屏)' },
  { k: 'bilibili', label: 'B站 (横屏)' },
  { k: 'universal', label: '通用 (横屏)' },
  { k: 'xiaohongshu', label: '小红书 (竖屏)' },
]

const durations = [
  { k: 15, label: '15秒', shots: '3~4个镜头' },
  { k: 30, label: '30秒', shots: '5个镜头' },
  { k: 60, label: '60秒', shots: '7~8个镜头' },
]

const shotDurationMap: Record<number, { count: number; perShot: number }> = {
  15: { count: 4, perShot: 4 },
  30: { count: 5, perShot: 6 },
  60: { count: 8, perShot: 8 },
}

export function VideoGenWizard({ onClose }: { onClose: () => void }) {
  // Error boundary — catch render errors
  const [renderError, setRenderError] = useState<string | null>(null)

  if (renderError) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 360, background: '#FFFFFF', borderRadius: 16, padding: 32, textAlign: 'center', boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
          <p style={{ fontSize: 14, color: '#E24B4A', margin: '0 0 12px 0' }}>视频生成向导遇到错误</p>
          <p style={{ fontSize: 12, color: '#86909C', margin: '0 0 20px 0' }}>{renderError}</p>
          <button onClick={handleClose} className="wiz-btn-primary">关闭</button>
        </div>
      </div>
    )
  }

  // Wrap render in try/catch
  try {
    return <WizardContent onClose={onClose} setRenderError={setRenderError} />
  } catch (e: any) {
    setRenderError(e?.message || '未知渲染错误')
    return null
  }
}

function WizardContent({ onClose, setRenderError }: { onClose: () => void; setRenderError: (e: string | null) => void }) {
  const [s, setS] = useState<WizardState>({
    step: 0,
    productName: '', productDesc: '', uploadedImages: [],
    videoGoal: '', videoVibe: '', platform: '', totalDuration: 30, extraReqs: '',
    aiSummary: '',
    storyboard: null, currentShotPage: 0,
    needActors: false, actors: [],
    generating: false, genMode: 'batch',
    genProgress: { completed: 0, total: 0 }, genResults: [],
    synthesizing: false, finalVideoUrl: '',
    planning: false, error: '',
  })

  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', h)
    return () => {
      mountedRef.current = false
      window.removeEventListener('keydown', h)
      // Abort any in-flight requests on unmount
      abortRef.current?.abort()
    }
  }, [onClose])

  // ── helpers ──

  const handleClose = () => {
    // Abort any in-flight generation requests
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    onClose()
  }

  const readFile = (f: File): Promise<string> => new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(new Error('文件读取失败'))
    r.readAsDataURL(f)
  })

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    try {
      const urls = await Promise.all(Array.from(files).map(readFile))
      const newImgs = urls.map(data => ({ id: uid(), data, label: '' }))
      setS(prev => ({ ...prev, uploadedImages: [...prev.uploadedImages, ...newImgs] }))
    } catch {
      setS(prev => ({ ...prev, error: '图片读取失败，请重试' }))
    }
    // Reset input so same file can be re-selected
    e.target.value = ''
  }

  const updateImageLabel = (id: string, label: string) => {
    setS(prev => ({
      ...prev,
      uploadedImages: prev.uploadedImages.map(img => img.id === id ? { ...img, label } : img),
    }))
  }

  const removeImage = (id: string) => {
    setS(prev => ({ ...prev, uploadedImages: prev.uploadedImages.filter(img => img.id !== id) }))
  }

  // ── calls to LLM ──

  const callStoryboardIPC = async (prompt: string): Promise<{ data: any; error?: string } | null> => {
    try {
      const result = await (window as any).electronAPI?.storyboard?.generate(prompt)
      if (result?.success && result?.data) return { data: result.data }
      if (result?.error) return { data: null, error: result.error }
      return null
    } catch (e: any) {
      return { data: null, error: e?.message || '网络请求失败' }
    }
  }

  // Step 2 → 3: generate storyboard from confirmed brief
  const handleGenStoryboard = async () => {
    setS(prev => ({ ...prev, planning: true, error: '' }))
    const { productName, productDesc, videoGoal, videoVibe, platform, totalDuration, extraReqs, aiSummary, uploadedImages } = s
    const sd = shotDurationMap[totalDuration] || { count: 5, perShot: 6 }

    const imagesInfo = uploadedImages.map(img => `- ${img.label || '未标注'}（已上传）`).join('\n')
    const imageSection = uploadedImages.length > 0 ? `\n已上传素材：\n${imagesInfo}\n请根据素材标签合理分配每个镜头需要的图片。` : ''

    const safeName = (productName || '产品').replace(/"/g, '\\"').slice(0, 80)
    const safeDesc = (productDesc || '').slice(0, 500)

    const prompt = `你是一个专业的视频制作导演。根据以下创意简报，生成${sd.count}个镜头的分镜脚本，每个镜头${sd.perShot}秒。
---
产品：${safeName}
描述：${safeDesc}
目标：${goals.find(g => g.k === videoGoal)?.label || videoGoal}
风格：${vibes.find(v => v.k === videoVibe)?.label || videoVibe}
平台：${platforms.find(p => p.k === platform)?.label || platform}
总时长：${totalDuration}秒
额外要求：${extraReqs || '无'}
AI 总结：${aiSummary}${imageSection}
---
返回纯JSON，格式：
{
  "productName": "${safeName}",
  "totalDuration": "${totalDuration}秒",
  "style": "风格简述",
  "shots": [{
    "name": "镜名",
    "duration": "起止秒数",
    "type": "image2video|text2video|motion",
    "description": "中文画面描述",
    "prompt": "英文AI提示词（主体+运动+光线+运镜+画质）",
    "imageHint": "需要准备什么素材（参考已上传的素材标签）"
  }]
}
要求：prompt必须用英文写，每个shot构成完整叙事线，只返回JSON。`

    const res = await callStoryboardIPC(prompt)
    if (res?.data && Array.isArray((res.data as Storyboard)?.shots)) {
      const sb = res.data as Storyboard
      sb.shots = sb.shots.map(sh => ({ ...sh, id: uid(), status: 'pending' as const }))
      setS(prev => ({ ...prev, step: 3, storyboard: sb, planning: false }))
    } else {
      // If the LLM returned raw text but no JSON, retry with a more forceful prompt
      const errMsg = res?.error || (res?.raw ? 'AI 返回的不是 JSON 格式，请重试' : 'AI 生成失败')
      if (!res?.error && res?.raw) {
        // Retry once with a stricter prompt
        const retryPrompt = `你之前没有返回有效的 JSON。请严格只返回 JSON，不要有任何额外文字：\n\n${prompt}`
        const retryRes = await callStoryboardIPC(retryPrompt)
        if (retryRes?.data && Array.isArray((retryRes.data as Storyboard)?.shots)) {
          const sb = retryRes.data as Storyboard
          sb.shots = sb.shots.map(sh => ({ ...sh, id: uid(), status: 'pending' as const }))
          setS(prev => ({ ...prev, step: 3, storyboard: sb, planning: false }))
          return
        }
      }
      setS(prev => ({ ...prev, planning: false, error: errMsg }))
    }
  }

  // Step 0 → 1: validate and go to style questions
  const handleGoToStyle = () => {
    if (!s.productName.trim() && !s.productDesc.trim()) {
      setS(prev => ({ ...prev, error: '请至少输入产品名称或描述' }))
      return
    }
    setS(prev => ({ ...prev, error: '', step: 1 }))
  }

  // Step 1 → 2: generate AI summary
  const handleGenSummary = async () => {
    setS(prev => ({ ...prev, planning: true, error: '' }))
    const { productName, productDesc, videoGoal, videoVibe, platform, totalDuration, extraReqs, uploadedImages } = s
    const imagesSection = uploadedImages.length > 0 ? `\n已上传${uploadedImages.length}张素材：${uploadedImages.map(i => i.label || '未标注').join('、')}` : ''
    const prompt = `你是一个视频创意导演。用户提供了以下信息，请用中文写一段200字以内的创意简报总结，描述"要做一条什么样的视频"。
- 产品：${productName}
- 描述：${productDesc}
- 目标：${goals.find(g => g.k === videoGoal)?.label || '未选'}
- 风格：${vibes.find(v => v.k === videoVibe)?.label || '未选'}
- 平台：${platforms.find(p => p.k === platform)?.label || '未选'}
- 时长：${totalDuration}秒
- 额外要求：${extraReqs || '无'}${imagesSection}
直接返回文案，不要JSON，不要标题。`

    try {
      const result = await (window as any).electronAPI?.storyboard?.generate(prompt)
      if (result?.success && result?.raw) {
        setS(prev => ({ ...prev, step: 2, aiSummary: result.raw.trim(), planning: false }))
      } else if (result?.success && result?.data) {
        setS(prev => ({ ...prev, step: 2, aiSummary: typeof result.data === 'string' ? result.data : JSON.stringify(result.data), planning: false }))
      } else {
        // fallback summary
        const summary = `你将制作一条${totalDuration}秒的${vibes.find(v => v.k === videoVibe)?.label || ''}风格${goals.find(g => g.k === videoGoal)?.label || '产品'}视频，用于${platforms.find(p => p.k === platform)?.label || '多平台发布'}。视频聚焦${productName}的核心卖点，通过精心编排的镜头语言展现产品质感与使用场景。`
        setS(prev => ({ ...prev, step: 2, aiSummary: summary, planning: false }))
      }
    } catch {
      const summary = `你将制作一条${totalDuration}秒的视频，聚焦「${productName}」的核心卖点。风格偏向${vibes.find(v => v.k === videoVibe)?.label || '现代简约'}，适用于${platforms.find(p => p.k === platform)?.label || '多平台'}发布。`
      setS(prev => ({ ...prev, step: 2, aiSummary: summary, planning: false }))
    }
  }

  // Step 4 → 5: go to review
  const handleToReview = () => {
    setS(prev => ({ ...prev, step: 5, currentShotPage: 0 }))
  }

  // Step 5 → 6: start generation
  const handleStartGen = (mode: 'single' | 'batch') => {
    if (!s.storyboard) return
    const results = s.storyboard.shots.map(sh => ({ ...sh, status: 'pending' as const }))
    setS(prev => ({ ...prev, step: 6, genMode: mode, generating: mode === 'batch', error: '',
      genProgress: { completed: 0, total: results.length }, genResults: results,
    }))
  }

  // Per-shot generate (real API call, with abort support)
  const handleGenOne = async (shotId: string) => {
    setS(prev => {
      const r = prev.genResults.map(x => x.id === shotId ? { ...x, status: 'generating' as const } : x)
      return { ...prev, genResults: r }
    })

    // Read prompt from genResults (consistent with current state)
    const genShot = s.genResults.find(sh => sh.id === shotId)
    if (!genShot) return

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const result = await (window as any).electronAPI?.videoGen?.generate(genShot.prompt)
      if (controller.signal.aborted || !mountedRef.current) return
      const isSuccess = result?.success && result?.videoUrl
      setS(prev => {
        const r = prev.genResults.map(x => x.id === shotId ? { ...x, status: isSuccess ? 'done' as const : 'failed' as const, videoUrl: result?.videoUrl } : x)
        const done = r.filter(x => x.status === 'done').length
        return { ...prev, genResults: r, genProgress: { completed: done, total: prev.genProgress.total }, generating: done < prev.genProgress.total, step: done === prev.genProgress.total ? 7 : prev.step, error: isSuccess ? '' : (result?.error || '视频生成失败') }
      })
    } catch (e: any) {
      if (controller.signal.aborted || !mountedRef.current) return
      setS(prev => {
        const r = prev.genResults.map(x => x.id === shotId ? { ...x, status: 'failed' as const } : x)
        return { ...prev, genResults: r, error: e?.message || '网络错误', generating: false }
      })
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  // Batch generate — sequential with rate limiting and abort support
  useEffect(() => {
    if (s.step !== 6 || s.genMode !== 'batch' || !s.generating || !s.storyboard) return

    const shots = s.storyboard.shots
    const controller = new AbortController()
    abortRef.current = controller
    let stopped = false

    const runSequential = async () => {
      for (let i = 0; i < shots.length; i++) {
        if (controller.signal.aborted || !mountedRef.current) break

        const shot = shots[i]
        // Rate limiting: stagger starts to avoid API rate limits
        if (i > 0) {
          await new Promise<void>(r => {
            const t = setTimeout(r, 2000) // 2s between shots
            controller.signal.addEventListener('abort', () => { clearTimeout(t); r() })
          })
          if (controller.signal.aborted || !mountedRef.current) break
        }

        setS(prev => {
          const r = prev.genResults.map(x => x.id === shot.id ? { ...x, status: 'generating' as const } : x)
          return { ...prev, genResults: r }
        })

        try {
          const result = await (window as any).electronAPI?.videoGen?.generate(shot.prompt)
          if (controller.signal.aborted || !mountedRef.current) break
          setS(prev => {
            const status = result?.success ? 'done' as const : 'failed' as const
            const r = prev.genResults.map(x => x.id === shot.id ? { ...x, status, videoUrl: result?.videoUrl } : x)
            const done = r.filter(x => x.status === 'done').length
            const allDone = done === prev.genProgress.total
            const lastErr = result?.success ? prev.error : (result?.error || '部分镜头生成失败')
            return { ...prev, genResults: r, genProgress: { completed: done, total: prev.genProgress.total }, generating: !allDone, step: allDone ? 7 : prev.step, error: lastErr }
          })
        } catch (e: any) {
          if (controller.signal.aborted || !mountedRef.current) break
          setS(prev => {
            const r = prev.genResults.map(x => x.id === shot.id ? { ...x, status: 'failed' as const } : x)
            const done = r.filter(x => x.status === 'done').length
            return { ...prev, genResults: r, genProgress: { completed: done, total: prev.genProgress.total }, error: e?.message || '网络错误' }
          })
        }
      }
      if (abortRef.current === controller) abortRef.current = null
    }

    runSequential()

    return () => {
      stopped = true
      controller.abort()
    }
  }, [s.step, s.genMode, s.generating])

  const handleSynthesize = async () => {
    const doneVideos = s.genResults.filter(r => r.status === 'done' && r.videoUrl)
    if (doneVideos.length === 0) {
      const doneShots = s.genResults.filter(r => r.status === 'done')
      if (doneShots.length > 0) {
        setS(prev => ({ ...prev, error: `${doneShots.length} 个分镜显示生成成功，但未获取到视频地址。请检查视频模型 API Key 是否正确配置，或在设置中添加 agnes-video-v2.0 模型。` }))
      } else {
        const failedShots = s.genResults.filter(r => r.status === 'failed')
        setS(prev => ({ ...prev, error: `没有可合成的视频分镜${failedShots.length > 0 ? `（${failedShots.length} 个分镜生成失败，请返回上一步重新生成）` : ''}` }))
      }
      return
    }
    setS(prev => ({ ...prev, synthesizing: true, error: '' }))
    try {
      const result = await (window as any).electronAPI?.videoGen?.synthesize(
        doneVideos.map(v => ({ name: v.name, videoUrl: v.videoUrl! }))
      )
      if (!mountedRef.current) return
      if (result?.success && result?.finalVideoUrl) {
        setS(prev => ({ ...prev, synthesizing: false, finalVideoUrl: result.finalVideoUrl }))
      } else {
        setS(prev => ({ ...prev, synthesizing: false, error: result?.error || 'AI 合成失败，请重试' }))
      }
    } catch (e: any) {
      if (!mountedRef.current) return
      setS(prev => ({ ...prev, synthesizing: false, error: e?.message || '网络错误' }))
    }
  }

  // ── edit storyboard shot fields ──
  const updateStoryboardShot = (shotId: string, field: string, value: string) => {
    setS(prev => {
      if (!prev.storyboard) return prev
      return {
        ...prev,
        storyboard: {
          ...prev.storyboard,
          shots: prev.storyboard.shots.map(sh => sh.id === shotId ? { ...sh, [field]: value } : sh),
        },
      }
    })
  }

  // ── misc helpers ──

  const typeLabel = (t: string) => ({ image2video: '图生视频', text2video: '文生视频', motion: '动作控制' } as any)[t] || t
  const typeColor = (t: string) => {
    if (t === 'image2video') return { bg: '#E6F1FB', color: '#185FA5' }
    if (t === 'text2video') return { bg: '#FAECE7', color: '#993C1D' }
    if (t === 'motion') return { bg: '#EAF3DE', color: '#3B6D11' }
    return { bg: '#F1EFE8', color: '#5F5E5A' }
  }
  const statusIcon = (st: string) => {
    if (st === 'done') return <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#639922"/><path d="M5 8l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
    if (st === 'generating') return <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #378ADD', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
    if (st === 'failed') return <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#E24B4A"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/></svg>
    return <div style={{ width: 16, height: 16, borderRadius: '50%', border: '1.5px solid #D3D1C7' }} />
  }

  // ── renders ──

  const renderStep0 = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}>
      <div>
        <label className="wiz-label">产品名称 <span style={{ color: '#E24B4A' }}>*</span></label>
        <input className="wiz-input" placeholder="例如：XWatch Pro 智能手表" value={s.productName} onChange={e => setS(prev => ({ ...prev, productName: e.target.value }))} />
      </div>
      <div>
        <label className="wiz-label">产品描述 / 核心卖点 <span style={{ color: '#E24B4A' }}>*</span></label>
        <textarea className="wiz-textarea" placeholder="描述你的产品特点、想要展示的卖点、核心技术……&#10;例如：钛合金机身、AMOLED屏幕、心率监测、7天续航" value={s.productDesc} onChange={e => setS(prev => ({ ...prev, productDesc: e.target.value }))} rows={4} />
      </div>
      <div>
        <label className="wiz-label">上传素材图片（Logo、产品图、分解图等，可选）</label>
        <p style={{ fontSize: 11, color: '#86909C', margin: '0 0 8px 0' }}>支持多张上传。每张图可标注用途，帮助 AI 准确匹配到对应镜头。</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {s.uploadedImages.map(img => (
            <div key={img.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 88 }}>
              <div style={{ position: 'relative', width: 88, height: 66, borderRadius: 8, overflow: 'hidden', border: '0.5px solid #D3D1C7' }}>
                <img src={img.data} alt={img.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button onClick={() => removeImage(img.id)} className="img-del-btn">×</button>
              </div>
              <input
                placeholder={img.label || '标注用途...'}
                value={img.label}
                onChange={e => updateImageLabel(img.id, e.target.value)}
                style={{
                  width: '100%', padding: '4px 6px', borderRadius: 4, border: '0.5px solid #D3D1C7',
                  fontSize: 10, background: '#FFFFFF', color: '#4E5969',
                  outline: 'none', boxSizing: 'border-box', textAlign: 'center',
                }}
              />
            </div>
          ))}
          <button onClick={() => fileInputRef.current?.click()} className="upload-btn" style={{ width: 88, height: 66 }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M10 5v10M5 10h10"/></svg>
            <span style={{ fontSize: 10 }}>点击上传</span>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileUpload} style={{ display: 'none' }} />
        </div>
      </div>
      {s.error && <div style={{ padding: '8px 12px', background: '#FCEBEB', borderRadius: 8, fontSize: 12, color: '#A32D2D' }}>{s.error}</div>}
    </div>
  )

  const renderStep1 = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}>
      <div>
        <label className="wiz-label">你要做什么类型的视频？</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {goals.map(g => (
            <button key={g.k} onClick={() => setS(prev => ({ ...prev, videoGoal: g.k }))}
              style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 12px', borderRadius: 10, border: s.videoGoal === g.k ? '1.5px solid #534AB7' : '0.5px solid #D3D1C7', background: s.videoGoal === g.k ? '#EEEDFE' : '#FFFFFF', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#1D2129' }}>{g.label}</span>
              <span style={{ fontSize: 11, color: '#86909C' }}>{g.desc}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="wiz-label">你希望视频是什么风格？</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {vibes.map(v => (
            <button key={v.k} onClick={() => setS(prev => ({ ...prev, videoVibe: v.k }))}
              style={{ padding: '8px 14px', borderRadius: 20, border: s.videoVibe === v.k ? '1.5px solid #534AB7' : '0.5px solid #D3D1C7', background: s.videoVibe === v.k ? '#EEEDFE' : 'transparent', fontSize: 12, color: s.videoVibe === v.k ? '#534AB7' : '#4E5969', cursor: 'pointer' }}>
              {v.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="wiz-label">主要发布平台？</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {platforms.map(p => (
            <button key={p.k} onClick={() => setS(prev => ({ ...prev, platform: p.k }))}
              style={{ flex: 1, padding: '10px', borderRadius: 10, border: s.platform === p.k ? '1.5px solid #534AB7' : '0.5px solid #D3D1C7', background: s.platform === p.k ? '#EEEDFE' : 'transparent', fontSize: 12, color: s.platform === p.k ? '#534AB7' : '#4E5969', cursor: 'pointer', textAlign: 'center' }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="wiz-label">视频总时长？</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {durations.map(d => (
            <button key={d.k} onClick={() => setS(prev => ({ ...prev, totalDuration: d.k }))}
              style={{ flex: 1, padding: '10px', borderRadius: 10, border: s.totalDuration === d.k ? '1.5px solid #534AB7' : '0.5px solid #D3D1C7', background: s.totalDuration === d.k ? '#EEEDFE' : 'transparent', fontSize: 13, fontWeight: 500, color: s.totalDuration === d.k ? '#534AB7' : '#1D2129', cursor: 'pointer', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>{d.label}</span>
              <span style={{ fontSize: 10, color: '#86909C', fontWeight: 400 }}>{d.shots}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="wiz-label">还有什么特殊要求？（可选）</label>
        <textarea className="wiz-textarea" placeholder="比如：需要真人模特、必须有配音、Logo放在左下角、不要出现竞品logo……" value={s.extraReqs} onChange={e => setS(prev => ({ ...prev, extraReqs: e.target.value }))} rows={3} />
      </div>
    </div>
  )

  const renderStep2 = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        {[{ k: 'target', v: goals.find(g => g.k === s.videoGoal)?.label }, { k: 'style', v: vibes.find(v => v.k === s.videoVibe)?.label }, { k: 'platform', v: platforms.find(p => p.k === s.platform)?.label }, { k: 'duration', v: s.totalDuration + '秒' }].filter(t => t.v).map(t => (
          <span key={t.k} style={{ padding: '4px 10px', borderRadius: 6, background: '#FAFAFA', fontSize: 11, color: '#4E5969' }}>{t.v}</span>
        ))}
      </div>
      <p style={{ fontSize: 12, fontWeight: 500, color: '#1D2129', margin: 0 }}>AI 理解的需求（可以直接修改）：</p>
      <textarea
        className="wiz-textarea"
        value={s.aiSummary}
        onChange={e => setS(prev => ({ ...prev, aiSummary: e.target.value }))}
        rows={6}
        style={{ fontSize: 13, lineHeight: 1.8, borderRadius: 12 }}
      />
      <p style={{ fontSize: 12, color: '#86909C', margin: 0 }}>可以随时修改上方文案，确认无误后点击「确认，生成分镜」。</p>
    </div>
  )

  const renderStep3 = () => {
    if (!s.storyboard) return null
    const sb = s.storyboard
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflow: 'auto' }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 4 }}>
          {[{ l: '产品', v: sb.productName }, { l: '时长', v: sb.totalDuration }, { l: '风格', v: (sb.style || '').slice(0, 12) }].map(t => (
            <div key={t.l} style={{ flex: 1, background: '#FAFAFA', borderRadius: 8, padding: '10px 12px' }}>
              <p style={{ fontSize: 10, color: '#86909C', margin: '0 0 2px 0' }}>{t.l}</p>
              <p style={{ fontSize: 13, fontWeight: 500, color: '#1D2129', margin: 0 }}>{t.v}</p>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: '#1D2129', margin: 0 }}>分镜列表（共{sb.shots.length}镜）</p>
          <button onClick={handleGenStoryboard} disabled={s.planning}
            style={{ padding: '4px 10px', borderRadius: 6, border: '0.5px solid #B4B2A9', fontSize: 10, background: 'transparent', cursor: s.planning ? 'not-allowed' : 'pointer', color: '#4E5969', opacity: s.planning ? 0.5 : 1 }}>
            {s.planning ? '重新生成中...' : '全部重新生成'}
          </button>
        </div>
        {sb.shots.map((shot, i) => {
          const c = typeColor(shot.type)
          return (
            <div key={shot.id} style={{ padding: '10px 12px', border: '0.5px solid #D3D1C7', borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ width: 20, height: 20, borderRadius: '50%', background: c.color, color: '#fff', fontSize: 10, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                <input
                  value={shot.name}
                  onChange={e => updateStoryboardShot(shot.id, 'name', e.target.value)}
                  style={{ fontSize: 13, fontWeight: 500, color: '#1D2129', border: 'none', background: 'transparent', outline: 'none', flex: 1, padding: 0, minWidth: 0 }}
                />
                <input
                  value={shot.duration}
                  onChange={e => updateStoryboardShot(shot.id, 'duration', e.target.value)}
                  style={{ fontSize: 10, color: '#86909C', border: '0.5px solid transparent', background: 'transparent', outline: 'none', width: 70, padding: '2px 4px', borderRadius: 4, textAlign: 'right' }}
                  onFocus={e => { e.target.style.borderColor = '#534AB7'; e.target.style.background = '#FAFAFA' }}
                  onBlur={e => { e.target.style.borderColor = 'transparent'; e.target.style.background = 'transparent' }}
                />
                <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 500, background: c.bg, color: c.color, marginLeft: 4 }}>{typeLabel(shot.type)}</span>
              </div>
              <textarea
                value={shot.description}
                onChange={e => updateStoryboardShot(shot.id, 'description', e.target.value)}
                rows={2}
                style={{ width: '100%', border: '0.5px solid #D3D1C7', borderRadius: 6, padding: '6px 8px', fontSize: 11, color: '#4E5969', fontFamily: 'inherit', lineHeight: 1.5, resize: 'vertical', background: '#FFFFFF', outline: 'none', boxSizing: 'border-box', marginBottom: 6 }}
              />
              <textarea
                value={shot.prompt}
                onChange={e => updateStoryboardShot(shot.id, 'prompt', e.target.value)}
                rows={3}
                style={{ width: '100%', border: '0.5px solid #D3D1C7', borderRadius: 6, padding: '6px 8px', fontSize: 10, color: '#4E5969', fontFamily: 'Consolas,Menlo,monospace', lineHeight: 1.4, resize: 'vertical', background: '#FAFAFA', outline: 'none', boxSizing: 'border-box', marginBottom: 4 }}
              />
              <input
                value={shot.imageHint}
                onChange={e => updateStoryboardShot(shot.id, 'imageHint', e.target.value)}
                placeholder="素材说明..."
                style={{ width: '100%', border: '0.5px solid transparent', borderRadius: 4, padding: '3px 6px', fontSize: 10, color: '#86909C', background: 'transparent', outline: 'none', boxSizing: 'border-box' }}
                onFocus={e => { e.target.style.borderColor = '#534AB7'; e.target.style.background = '#FAFAFA' }}
                onBlur={e => { e.target.style.borderColor = 'transparent'; e.target.style.background = 'transparent' }}
              />
            </div>
          )
        })}
      </div>
    )
  }

  const renderStep4 = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
      <p style={{ fontSize: 13, color: '#4E5969', margin: 0, lineHeight: 1.7 }}>
        你的视频中需要真人出镜或人物角色吗？如果需要，AI 可以帮忙生成角色设定（性别、年龄区间、风格描述），后续用动作控制功能驱动角色。
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setS(prev => ({ ...prev, needActors: false }))} style={{ flex: 1, padding: '14px', borderRadius: 10, border: s.needActors === false ? '1.5px solid #534AB7' : '0.5px solid #D3D1C7', background: s.needActors === false ? '#EEEDFE' : 'transparent', fontSize: 13, color: s.needActors === false ? '#534AB7' : '#4E5969', cursor: 'pointer' }}>不需要，纯产品展示</button>
        <button onClick={() => setS(prev => ({ ...prev, needActors: true }))} style={{ flex: 1, padding: '14px', borderRadius: 10, border: s.needActors === true ? '1.5px solid #534AB7' : '0.5px solid #D3D1C7', background: s.needActors === true ? '#EEEDFE' : 'transparent', fontSize: 13, color: s.needActors === true ? '#534AB7' : '#4E5969', cursor: 'pointer' }}>需要，有模特/角色</button>
      </div>
      {s.needActors && <p style={{ fontSize: 12, color: '#86909C', margin: 0 }}>后续可用可灵的「动作控制」功能上传真人参考视频驱动角色。（当前版本跳过具体角色设定）</p>}
    </div>
  )

  const renderStep5 = () => {
    if (!s.storyboard || s.storyboard.shots.length === 0) return null
    const shots = s.storyboard.shots
    const shot = shots[s.currentShotPage]
    const c = typeColor(shot.type)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: '#86909C' }}>{s.currentShotPage + 1} / {shots.length}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {shots.map((_, i) => <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: i === s.currentShotPage ? '#534AB7' : '#D3D1C7' }} />)}
          </div>
        </div>
        <div style={{ padding: '14px', border: '0.5px solid #D3D1C7', borderRadius: 12, flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 24, height: 24, borderRadius: '50%', background: c.color, color: '#fff', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.currentShotPage + 1}</span>
            <span style={{ fontSize: 14, fontWeight: 500, color: '#1D2129' }}>{shot.name}</span>
            <span style={{ fontSize: 11, color: '#86909C', marginLeft: 'auto' }}>{shot.duration}</span>
          </div>
          <div>
            <p style={{ fontSize: 11, fontWeight: 500, color: '#1D2129', margin: '0 0 4px 0' }}>画面描述</p>
            <textarea
              value={shot.description}
              onChange={e => updateStoryboardShot(shot.id, 'description', e.target.value)}
              rows={2}
              style={{ width: '100%', border: '0.5px solid #D3D1C7', borderRadius: 6, padding: '6px 8px', fontSize: 12, color: '#4E5969', fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical', background: '#FFFFFF', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <p style={{ fontSize: 11, fontWeight: 500, color: '#1D2129', margin: '0 0 4px 0' }}>AI 提示词（可直接修改）</p>
            <textarea
              value={shot.prompt}
              onChange={e => updateStoryboardShot(shot.id, 'prompt', e.target.value)}
              rows={4}
              style={{ width: '100%', border: '0.5px solid #D3D1C7', borderRadius: 6, padding: '8px 10px', fontSize: 10, color: '#4E5969', fontFamily: 'Consolas,Menlo,monospace', lineHeight: 1.4, resize: 'vertical', background: '#FAFAFA', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <p style={{ fontSize: 11, fontWeight: 500, color: '#1D2129', margin: '0 0 4px 0' }}>需要准备的素材</p>
            <p style={{ fontSize: 11, color: '#86909C', margin: 0 }}>{shot.imageHint}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button onClick={() => setS(prev => ({ ...prev, currentShotPage: Math.max(0, prev.currentShotPage - 1) }))} disabled={s.currentShotPage === 0}
            style={{ padding: '7px 14px', borderRadius: 8, border: '0.5px solid #B4B2A9', fontSize: 12, background: 'transparent', cursor: s.currentShotPage === 0 ? 'not-allowed' : 'pointer', color: '#4E5969', opacity: s.currentShotPage === 0 ? 0.35 : 1 }}>上一页</button>
          <button onClick={() => setS(prev => ({ ...prev, currentShotPage: Math.min(shots.length - 1, prev.currentShotPage + 1) }))} disabled={s.currentShotPage === shots.length - 1}
            style={{ padding: '7px 14px', borderRadius: 8, border: '0.5px solid #B4B2A9', fontSize: 12, background: 'transparent', cursor: s.currentShotPage === shots.length - 1 ? 'not-allowed' : 'pointer', color: '#4E5969', opacity: s.currentShotPage === shots.length - 1 ? 0.35 : 1 }}>下一页</button>
        </div>
      </div>
    )
  }

  const renderStep6 = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: s.genProgress.completed === s.genProgress.total ? '#EAF3DE' : '#E6F1FB', borderRadius: 8 }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: s.genProgress.completed === s.genProgress.total ? '#3B6D11' : '#185FA5', margin: '0 0 2px 0' }}>{s.genProgress.completed === s.genProgress.total ? '全部生成完成' : '生成中...'}</p>
          <p style={{ fontSize: 10, color: '#86909C', margin: 0 }}>{s.genProgress.completed} / {s.genProgress.total}</p>
        </div>
        <div style={{ width: 72, height: 4, background: '#D3D1C7', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${s.genProgress.total > 0 ? (s.genProgress.completed / s.genProgress.total) * 100 : 0}%`, background: s.genProgress.completed === s.genProgress.total ? '#639922' : '#378ADD', borderRadius: 2, transition: 'width 0.4s' }} />
        </div>
      </div>
      {s.genResults.map(shot => (
        <div key={shot.id} style={{ padding: '10px 12px', border: '0.5px solid #D3D1C7', borderRadius: 10 }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: shot.status === 'done' && shot.videoUrl ? 8 : 4 }}>
            {statusIcon(shot.status)}
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 12, fontWeight: 500, color: '#1D2129', margin: '0 0 2px 0' }}>{shot.name}</p>
              <p style={{ fontSize: 10, color: '#86909C', margin: 0 }}>{shot.status === 'pending' ? '等待中' : shot.status === 'generating' ? '生成中...' : shot.status === 'failed' ? '失败' : shot.videoUrl ? '完成' : '已返回（无视频）'}</p>
            </div>
            {shot.status === 'pending' && s.genMode === 'single' && <button onClick={() => handleGenOne(shot.id)} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: '#534AB7', color: '#fff', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>生成</button>}
            {(shot.status === 'done' || shot.status === 'failed') && <button onClick={() => handleGenOne(shot.id)} style={{ padding: '5px 12px', borderRadius: 6, border: '0.5px solid #B4B2A9', background: 'transparent', color: '#4E5969', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>重新生成</button>}
          </div>

          {/* Keyword / prompt badge — always visible */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
            <span style={{ fontSize: 9, color: '#86909C', flexShrink: 0, marginTop: 1 }}>关键词:</span>
            <span style={{ flex: 1, fontSize: 10, color: '#4E5969', lineHeight: 1.4, fontFamily: 'Consolas,Menlo,monospace', wordBreak: 'break-all' }}>
              {shot.prompt?.slice(0, 120)}{(shot.prompt?.length || 0) > 120 ? '…' : ''}
            </span>
          </div>

          {/* Video preview */}
          {shot.status === 'done' && shot.videoUrl && (
            <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', background: '#000', marginTop: 8 }}>
              <video
                src={shot.videoUrl}
                controls
                preload="metadata"
                style={{ width: '100%', maxHeight: 200, display: 'block' }}
                onError={(e) => { (e.target as HTMLVideoElement).style.display = 'none' }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )

  const renderStep7 = () => {
    const doneShots = s.genResults.filter(r => r.status === 'done')
    const failedShots = s.genResults.filter(r => r.status === 'failed')
    const hasFinal = !!s.finalVideoUrl

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1, overflow: 'auto' }}>
        {/* Stats summary */}
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, background: '#EAF3DE', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="18" height="18" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#639922"/><path d="M5 8l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <div>
              <p style={{ fontSize: 15, fontWeight: 500, color: '#3B6D11', margin: 0 }}>{doneShots.length}</p>
              <p style={{ fontSize: 10, color: '#5B8E24', margin: 0 }}>生成成功</p>
            </div>
          </div>
          {failedShots.length > 0 && (
            <div style={{ flex: 1, background: '#FCEBEB', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="18" height="18" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#E24B4A"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/></svg>
              <div>
                <p style={{ fontSize: 15, fontWeight: 500, color: '#A32D2D', margin: 0 }}>{failedShots.length}</p>
                <p style={{ fontSize: 10, color: '#C04A4A', margin: 0 }}>失败</p>
              </div>
            </div>
          )}
        </div>

        {/* Video gallery — each done shot has an embedded player */}
        {doneShots.length > 0 && (
          <div>
            <p style={{ fontSize: 12, fontWeight: 500, color: '#1D2129', margin: '0 0 8px 0' }}>分镜预览（共{doneShots.length}个）</p>
            {doneShots.some(s => s.videoUrl) ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {doneShots.filter(s => s.videoUrl).map(shot => (
                  <div key={shot.id} style={{ borderRadius: 10, overflow: 'hidden', border: '0.5px solid #D3D1C7', background: '#FAFAFA' }}>
                    <div style={{ background: '#000' }}>
                      <video src={shot.videoUrl} controls preload="metadata" style={{ width: '100%', maxHeight: 140, display: 'block' }} />
                    </div>
                    <div style={{ padding: '6px 8px' }}>
                      <p style={{ fontSize: 11, fontWeight: 500, color: '#1D2129', margin: '0 0 2px 0' }}>{shot.name}</p>
                      <p style={{ fontSize: 9, color: '#86909C', margin: '0 0 3px 0' }}>{shot.duration}</p>
                      <p style={{ fontSize: 9, color: '#86909C', margin: 0, lineHeight: 1.3, fontFamily: 'Consolas,Menlo,monospace', wordBreak: 'break-all', opacity: 0.7 }}>
                        {shot.prompt?.slice(0, 60)}{(shot.prompt?.length || 0) > 60 ? '…' : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '16px', background: '#FFF8E8', borderRadius: 8, border: '0.5px solid #F0D070' }}>
                <p style={{ fontSize: 12, color: '#8B6914', margin: 0 }}>
                  分镜状态显示为"完成"，但未返回视频地址。请确认视频模型（agnes-video-v2.0）API Key 已正确配置。
                </p>
                <p style={{ fontSize: 10, color: '#A68A30', margin: '4px 0 0 0' }}>
                  前往设置 → 模型管理 → 添加 agnes-video-v2.0 并填入正确的 API Key 和接口地址。
                </p>
              </div>
            )}

            {/* Show done shots without videoUrl as cards */}
            {doneShots.some(s => !s.videoUrl) && (
              <div style={{ marginTop: 8 }}>
                <p style={{ fontSize: 10, color: '#86909C', margin: '0 0 6px 0' }}>以下分镜无视频预览（API 返回成功但无视频地址）：</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {doneShots.filter(s => !s.videoUrl).map(shot => (
                    <span key={shot.id} style={{ padding: '3px 8px', borderRadius: 4, background: '#FAFAFA', fontSize: 10, color: '#86909C', border: '0.5px solid #D3D1C7' }}>{shot.name}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Final video result */}
        {hasFinal && (
          <div style={{ border: '2px solid #639922', borderRadius: 12, padding: 12, background: '#F7FCF3' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <svg width="18" height="18" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#639922"/><path d="M5 8l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#3B6D11' }}>成片已生成</span>
            </div>
            <div style={{ borderRadius: 8, overflow: 'hidden', background: '#000' }}>
              <video src={s.finalVideoUrl} controls style={{ width: '100%', maxHeight: 280, display: 'block' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <a href={s.finalVideoUrl} download target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: '#534AB7', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer', textDecoration: 'none', textAlign: 'center' }}>下载成片</a>
            </div>
          </div>
        )}

        {/* Synthesizing state */}
        {s.synthesizing && (
          <div style={{ padding: '12px 16px', background: '#E6F1FB', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid #378ADD', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
            <div>
              <p style={{ fontSize: 12, fontWeight: 500, color: '#185FA5', margin: 0 }}>AI 正在合成视频...</p>
              <p style={{ fontSize: 10, color: '#4E8FCC', margin: 0 }}>正在将{doneShots.length}个分镜合并为完整成片（5秒交叉过渡），预计需要30-60秒</p>
            </div>
          </div>
        )}

        {/* Synthesis action */}
        {!hasFinal && !s.synthesizing && doneShots.length > 0 && (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <p style={{ fontSize: 12, color: '#4E5969', margin: '0 0 12px 0', lineHeight: 1.7 }}>
              所有分镜已生成完毕。AI 将自动合成完整视频，分镜之间使用 5 秒交叉过渡效果。
            </p>
          </div>
        )}

        {/* No done shots */}
        {doneShots.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p style={{ fontSize: 13, color: '#E24B4A', margin: 0 }}>没有生成成功的分镜</p>
            <p style={{ fontSize: 11, color: '#86909C', margin: '4px 0 0 0' }}>请返回上一步重新生成失败的分镜</p>
          </div>
        )}
      </div>
    )
  }

  // ── footer buttons ──

  const footerBtns = () => {
    const prevFn = (stepOverride?: number) => {
      const target = stepOverride ?? s.step - 1
      setS(p => {
        const updates: Partial<WizardState> = { step: target, error: '' }
        // Clean up generation state when leaving step 6 (not from step 7 — preserve genResults for re-generation)
        if (p.step === 6) {
          updates.generating = false
          updates.genMode = 'batch'
        }
        // Clean up synthesis state when leaving step 7
        if (p.step === 7) {
          updates.synthesizing = false
        }
        // When going back to step 6, recalculate progress
        if (target === 6 && p.genResults.length > 0) {
          const done = p.genResults.filter(r => r.status === 'done').length
          updates.genProgress = { completed: done, total: p.genResults.length }
        }
        return { ...p, ...updates }
      })
    }
    const prevBtn = <button onClick={() => prevFn()} className="wiz-btn-outline">上一步</button>
    const next = (label: string, action: () => void, disabled = false, loading = false) => (
      <button onClick={action} disabled={disabled || loading} className="wiz-btn-primary" style={{ opacity: disabled || loading ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
        {loading && <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.6s linear infinite' }} />}
        {label}
      </button>
    )

    switch (s.step) {
      case 0: return <><div />{next('下一步：选择风格', handleGoToStyle)}</>
      case 1: return <>{prevBtn}<div />{next('AI 总结我的需求', handleGenSummary, false, s.planning)}</>
      case 2: return <>{prevBtn}<div />{next('确认，生成分镜', handleGenStoryboard, false, s.planning)}</>
      case 3: return <>{prevBtn}<div />{next('下一步：人物设定', () => setS(p => ({ ...p, step: 4 })))}</>
      case 4: return <>{prevBtn}<div />{next('下一步：分镜确认', handleToReview)}</>
      case 5: return <>{prevBtn}<div style={{ display: 'flex', gap: 8 }}><button onClick={() => handleStartGen('single')} className="wiz-btn-outline">逐个生成</button>{next('批量生成全部', () => handleStartGen('batch'))}</div></>
      case 6: {
        if (s.genProgress.completed === s.genProgress.total) {
          return <>{prevBtn}<div />{next('查看结果', () => setS(p => ({ ...p, step: 7 })))}</>
        }
        return <>{prevBtn}<div /></>
      }
      case 7: {
        const hasFinal = !!s.finalVideoUrl
        const hasDoneShot = s.genResults.some(r => r.status === 'done')
        return (
          <>
            {prevBtn}
            <div style={{ display: 'flex', gap: 8 }}>
              {!hasFinal && !s.synthesizing && hasDoneShot && next('AI 合成视频', handleSynthesize)}
              {s.synthesizing && (
                <button disabled className="wiz-btn-primary" style={{ opacity: 0.6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.6s linear infinite' }} />
                  合成中...
                </button>
              )}
              {hasFinal && next('下载成片', () => {
                if (s.finalVideoUrl) {
                  const a = document.createElement('a')
                  a.href = s.finalVideoUrl
                  a.download = `${s.productName || '成片'}_合成视频.mp4`
                  a.click()
                }
              })}
              <button onClick={handleClose} className="wiz-btn-outline">完成</button>
            </div>
          </>
        )
      }
      default: return null
    }
  }

  // ── main ──

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>
      <div style={{ width: 620, maxHeight: '88vh', background: '#FFFFFF', borderRadius: 16, border: '0.5px solid #D3D1C7', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}
        onClick={e => e.stopPropagation()}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '0.5px solid #D3D1C7' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#534AB7" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="2" width="14" height="14" rx="2"/><circle cx="9" cy="9" r="3"/><path d="M9 3v12M3 9h12"/></svg>
            <span style={{ fontSize: 14, fontWeight: 500, color: '#1D2129' }}>AI 视频生成向导</span>
            <span style={{ fontSize: 11, color: '#86909C' }}>{stepLabels[s.step]}</span>
          </div>
          <button onClick={() => {
            const hasActive = s.generating || s.genResults.some(r => r.status === 'generating')
            if (hasActive && !confirm('视频正在生成中，确定要关闭吗？')) return
            handleClose()
          }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#86909C' }}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>
        </div>

        {/* step dots */}
        <div style={{ display: 'flex', padding: '10px 18px', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          {stepLabels.map((l, i) => (
            <React.Fragment key={i}>
              {i > 0 && <div style={{ width: 16, height: 1, background: i <= s.step ? '#534AB7' : '#D3D1C7' }} />}
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: i < s.step ? '#534AB7' : i === s.step ? '#534AB7' : '#D3D1C7', color: '#fff', fontSize: 10, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {i < s.step ? '✓' : i + 1}
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px' }}>
          {s.error && (
            <div style={{ padding: '10px 14px', background: '#FCEBEB', borderRadius: 8, fontSize: 12, color: '#A32D2D', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="8" cy="8" r="6.5"/><path d="M8 5v3M8 11v.01"/></svg>
              {s.error}
              <button onClick={() => setS(prev => ({ ...prev, error: '' }))} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#A32D2D', fontSize: 14 }}>✕</button>
            </div>
          )}
          {s.step === 0 && renderStep0()}
          {s.step === 1 && renderStep1()}
          {s.step === 2 && renderStep2()}
          {s.step === 3 && renderStep3()}
          {s.step === 4 && renderStep4()}
          {s.step === 5 && renderStep5()}
          {s.step === 6 && renderStep6()}
          {s.step === 7 && renderStep7()}
        </div>

        {/* footer */}
        <div style={{ padding: '12px 18px', borderTop: '0.5px solid #D3D1C7', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          {footerBtns()}
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .wiz-label { font-size: 12px; font-weight: 500; color: #1D2129; display: block; margin-bottom: 6px; }
        .wiz-input { width: 100%; padding: 9px 12px; border-radius: 8px; border: 0.5px solid #D3D1C7; font-size: 13px; background: #FFFFFF; color: #1D2129; outline: none; box-sizing: border-box; }
        .wiz-textarea { width: 100%; padding: 9px 12px; border-radius: 8px; border: 0.5px solid #D3D1C7; font-size: 13px; background: #FFFFFF; color: #1D2129; outline: none; resize: vertical; font-family: inherit; line-height: 1.6; box-sizing: border-box; }
        .wiz-btn-primary { padding: 9px 20px; border-radius: 8px; border: none; background: #534AB7; color: #fff; font-size: 13px; font-weight: 500; cursor: pointer; }
        .wiz-btn-outline { padding: 9px 18px; border-radius: 8px; border: 0.5px solid #B4B2A9; font-size: 13px; background: transparent; cursor: pointer; color: #4E5969; }
        .upload-btn { border-radius: 8px; border: 0.5px dashed #D3D1C7; background: #FAFAFA; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 2px; color: #86909C; }
        .img-del-btn { position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; border-radius: 50%; background: rgba(0,0,0,0.5); border: none; color: #fff; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; line-height: 1; padding: 0; }
      `}</style>
    </div>
  )
}
