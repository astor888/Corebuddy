import path from 'path'
import fs from 'fs'
import { app } from 'electron'

const DB_DIR = () => path.join(app.getPath('userData'), 'corebuddy-data')
const CFG = () => path.join(app.getPath('userData'), 'minibuddy-config.json')
const CONV = () => path.join(DB_DIR(), 'conversations.json')
const CONTEXT_DIR = () => path.join(DB_DIR(), 'context')
const MSG = (id: string) => path.join(CONTEXT_DIR(), `${id}.json`)

// Atomic write: write to temp file then rename — prevents corruption on crash
function atomicWriteSync(filePath: string, data: string) {
  const tmp = filePath + '.tmp'
  fs.writeFileSync(tmp, data, 'utf-8')
  fs.renameSync(tmp, filePath)
}

export function init() {
  fs.mkdirSync(CONTEXT_DIR(), { recursive: true })
  if (!fs.existsSync(CONV())) fs.writeFileSync(CONV(), '[]')
  if (!fs.existsSync(CFG())) fs.writeFileSync(CFG(), '{}')
}

export function configGet(key: string): string {
  try { const c = JSON.parse(fs.readFileSync(CFG(), 'utf-8')); return c[key] || '' } catch { return '' }
}
export function configSet(key: string, value: string) {
  let c: any = {}; try { c = JSON.parse(fs.readFileSync(CFG(), 'utf-8')) } catch {}
  c[key] = value; atomicWriteSync(CFG(), JSON.stringify(c, null, 2))
}

export function allConvs(): any[] {
  try { return JSON.parse(fs.readFileSync(CONV(), 'utf-8')) } catch { return [] }
}
export function oneConv(id: string): any {
  return allConvs().find((c: any) => c.id === id) || null
}
export function saveConv(conv: any) {
  const all = allConvs(); const i = all.findIndex((c: any) => c.id === conv.id)
  if (i >= 0) { all[i] = { ...all[i], ...conv } } else { all.push(conv) }
  atomicWriteSync(CONV(), JSON.stringify(all, null, 2))
}
export function delConv(id: string) {
  atomicWriteSync(CONV(), JSON.stringify(allConvs().filter((c: any) => c.id !== id), null, 2))
  const p = MSG(id); if (fs.existsSync(p)) fs.unlinkSync(p)
}

export function loadMsgs(convId: string): any[] {
  const p = MSG(convId)
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return [] }
}
export function saveMsgs(convId: string, msgs: any[]) {
  fs.mkdirSync(path.dirname(MSG(convId)), { recursive: true })
  atomicWriteSync(MSG(convId), JSON.stringify(msgs, null, 2))
}
export function appendMsg(convId: string, msg: any) {
  const msgs = loadMsgs(convId); msgs.push(msg); saveMsgs(convId, msgs)
}
