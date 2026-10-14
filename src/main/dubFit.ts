import { app, BrowserWindow, ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import { GoogleGenAI } from '@google/genai'
import { workspaceDir } from './workspace'
import { findAndCallModel, cleanMarkdown } from './subtitleEngine'

// "Khớp thời gian" cho lồng tiếng (H-MMO tự viết, ý tưởng tham khảo cách làm phổ biến):
//  1. Ước lượng trước khi đọc: câu nào vừa / hơi chật / không thể vừa khung thời gian.
//  2. Khi lồng tiếng: mượn khoảng lặng phía sau, tăng tốc giữ cao độ (atempo) trong giới hạn, phần thừa mới cắt.
//  3. Rút gọn câu quá dài bằng Gemini (giữ nghĩa), lưu thành file SRT mới.
//  Tốc độ đọc tự hiệu chỉnh theo từng giọng sau mỗi lần lồng tiếng.

export type SrtCue = { startSec: number; endSec: number; text: string }
export type FitOptions = { maxRate: number; borrowGap: boolean }
export type FitPlan = { slot: number; need: number; rate: number; overflow: number }

export const DEFAULT_CPS = 15 // ký tự/giây khi đọc tiếng Việt tự nhiên (ước lượng an toàn)
const GAP_GUARD = 0.06 // chừa khoảng trước câu kế tiếp (giây)
const SOFT_RATE = 1.15 // tăng tốc dưới mức này gần như không nghe ra

export function parseSrt(content: string): SrtCue[] {
  const cues: SrtCue[] = []
  for (const block of content.replace(/^﻿/, '').replace(/\r/g, '').trim().split(/\n\s*\n/)) {
    const lines = block.split('\n')
    const ti = lines.findIndex((l) => l.includes('-->'))
    if (ti < 0) continue
    const m = lines[ti].match(/(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/)
    if (!m) continue
    const t = (h: string, mi: string, s: string, ms: string) => +h * 3600 + +mi * 60 + +s + +ms.padEnd(3, '0').slice(0, 3) / 1000
    const text = lines.slice(ti + 1).join(' ').replace(/<[^>]+>/g, '').trim()
    if (text) cues.push({ startSec: t(m[1], m[2], m[3], m[4]), endSec: t(m[5], m[6], m[7], m[8]), text })
  }
  return cues
}

export function buildSrt(cues: SrtCue[]): string {
  const f = (s: number) => {
    const ms = Math.max(0, Math.round(s * 1000))
    const p = (n: number, l = 2) => String(n).padStart(l, '0')
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`
  }
  return cues.map((c, i) => `${i + 1}\n${f(c.startSec)} --> ${f(c.endSec)}\n${c.text}\n`).join('\n')
}

/** Khung thời gian dùng được của câu i: tới đầu câu kế tiếp (nếu mượn khoảng lặng) hoặc tới hết câu. */
export function slotOf(cues: SrtCue[], i: number, total: number, borrowGap: boolean): number {
  const c = cues[i]
  const hard = i + 1 < cues.length ? cues[i + 1].startSec - GAP_GUARD : total
  const end = borrowGap ? Math.max(c.endSec, hard) : Math.min(c.endSec, hard)
  return Math.max(0.2, end - c.startSec)
}

/** Kế hoạch cho 1 câu khi đã biết thời lượng đọc tự nhiên. */
export function planCue(naturalDur: number, slot: number, maxRate: number): FitPlan {
  const need = naturalDur / slot
  if (need <= 1) return { slot, need, rate: 1, overflow: 0 }
  const rate = Math.min(need, Math.max(1, maxRate))
  return { slot, need, rate, overflow: Math.max(0, naturalDur / rate - slot) }
}

// ---------- hiệu chỉnh tốc độ đọc theo giọng ----------
const calibFile = () => path.join(app.getPath('userData'), 'dub-calibration.json')
export function getCps(voiceId: string): number {
  try { return JSON.parse(fs.readFileSync(calibFile(), 'utf8'))[voiceId]?.cps || DEFAULT_CPS } catch { return DEFAULT_CPS }
}
/** Lưu trung vị ký tự/giây đo được của 1 lần lồng tiếng. */
export function saveCalibration(voiceId: string, samples: { chars: number; dur: number }[]): number | null {
  const v = samples.filter((s) => s.dur > 0.6 && s.chars >= 8).map((s) => s.chars / s.dur).sort((a, b) => a - b)
  if (v.length < 3) return null
  const cps = v[Math.floor(v.length / 2)]
  let all: any = {}
  try { all = JSON.parse(fs.readFileSync(calibFile(), 'utf8')) } catch { /* mới */ }
  all[voiceId] = { cps: Math.round(cps * 100) / 100, samples: v.length, at: new Date().toISOString() }
  fs.writeFileSync(calibFile(), JSON.stringify(all, null, 2))
  return cps
}

const charsOf = (t: string) => t.replace(/\s+/g, ' ').trim().length

export function analyze(cues: SrtCue[], total: number, voiceId: string, o: FitOptions) {
  const cps = getCps(voiceId)
  const rows = cues.map((c, i) => {
    const slot = slotOf(cues, i, total, o.borrowGap)
    const est = charsOf(c.text) / cps
    const need = est / slot
    const verdict = need <= SOFT_RATE ? 'fits' : need <= o.maxRate ? 'tight' : 'impossible'
    return { i, start: c.startSec, end: c.endSec, slot, text: c.text, est, need, verdict, maxChars: Math.floor(slot * cps * Math.min(o.maxRate, 1.25)) }
  })
  return { cps, calibrated: cps !== DEFAULT_CPS, rows }
}

export function setupDubFit(win: BrowserWindow): void {
  const log = (m: string) => win.webContents.send('dubbing:log', m)

  ipcMain.handle('dubfit:analyze', (_e, a: { srtPath: string; voiceId: string; maxRate: number; borrowGap: boolean; total?: number }) => {
    const cues = parseSrt(fs.readFileSync(a.srtPath, 'utf8'))
    const total = a.total || (cues.length ? cues[cues.length - 1].endSec + 2 : 0)
    return analyze(cues, total, a.voiceId, { maxRate: a.maxRate, borrowGap: a.borrowGap })
  })

  // Lưu bản SRT đã sửa/rút gọn thành file mới "<tên>_fit.srt" trong thư mục Phụ đề (không ghi đè file gốc)
  ipcMain.handle('dubfit:save', (_e, a: { srtPath: string; edits: Record<number, string> }) => {
    const cues = parseSrt(fs.readFileSync(a.srtPath, 'utf8'))
    for (const [k, v] of Object.entries(a.edits || {})) if (cues[+k] && String(v).trim()) cues[+k].text = String(v).trim()
    const name = path.parse(a.srtPath).name.replace(/_fit$/, '')
    const out = path.join(workspaceDir('phude'), `${name}_fit.srt`)
    fs.writeFileSync(out, buildSrt(cues), 'utf8')
    return out
  })

  // Nhờ Gemini viết lại ngắn hơn cho các câu không vừa (giữ nghĩa, không vượt số ký tự cho phép)
  ipcMain.handle('dubfit:shorten', async (_e, a: { items: { i: number; text: string; maxChars: number }[]; apiKey: string }) => {
    if (!a.apiKey) throw new Error('Chưa có API Key Gemini (nhập ở tab Tạo phụ đề).')
    if (!a.items?.length) return {}
    log(`Đang nhờ Gemini rút gọn ${a.items.length} câu quá dài...`)
    const prompt = `You shorten Vietnamese dubbing lines so they can be spoken within a time limit.
For each item, rewrite "text" in natural spoken Vietnamese, keeping the original meaning, tone and any names,
using AT MOST "maxChars" characters (count spaces). Do not add explanations.
Return ONLY a JSON array: [{"i": <same i>, "text": "<shortened>"}].

${JSON.stringify(a.items.map((x) => ({ i: x.i, maxChars: x.maxChars, text: x.text })))}`
    const ai = new GoogleGenAI({ apiKey: a.apiKey })
    const raw = cleanMarkdown(await findAndCallModel(ai, a.apiKey, prompt, log, 'Rút gọn câu lồng tiếng'))
    const m = raw.match(/\[[\s\S]*\]/)
    if (!m) throw new Error('Gemini trả về không đúng định dạng, thử lại.')
    const out: Record<number, string> = {}
    const orig = new Map(a.items.map((x) => [x.i, x]))
    for (const r of JSON.parse(m[0]) as { i: number; text: string }[]) {
      const src = orig.get(Number(r.i))
      const t = String(r.text || '').trim()
      // chỉ nhận bản thật sự ngắn hơn và không rỗng
      if (src && t && charsOf(t) < charsOf(src.text)) out[src.i] = t
    }
    log(`Gemini đã rút gọn ${Object.keys(out).length}/${a.items.length} câu.`)
    return out
  })
}
