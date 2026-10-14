import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'

// Ghép phụ đề có kiểu chữ: dựng file .ass từ các câu đã được ngắt dòng theo độ rộng thật (đo ở giao diện),
// hiệu ứng tô sáng / hiện từng từ, và thư viện font riêng của H-MMO (thêm font từ máy).

export type BurnWord = { w: string; s: number; e: number; n?: boolean } // ms; n = dính liền từ trước (chữ Trung/Nhật)
export type BurnCue = { start: number; end: number; lines: BurnWord[][] }
export type BurnStyle = {
  font: string
  size: number // đơn vị ASS (điểm ảnh của video)
  color: string
  outlineColor: string
  border: number // điểm ảnh của video
  addBg: boolean
  highlightColor: string
  mode: 'sentence' | 'word' | 'highlight'
  bounce: boolean
  position: 'bottom' | 'center' | 'top'
  marginV: number // điểm ảnh của video
}

export const fontsDir = () => path.join(app.getPath('userData'), 'hmmo-fonts')

const assColor = (hex: string, alpha = '00') => {
  const c = (hex || '#ffffff').replace('#', '')
  if (c.length !== 6) return `&H${alpha}FFFFFF`
  return `&H${alpha}${c.slice(4, 6)}${c.slice(2, 4)}${c.slice(0, 2)}`.toUpperCase()
}
const assTime = (ms: number) => {
  const cs = Math.max(0, Math.round(ms / 10))
  const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), s = Math.floor((cs % 6000) / 100)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`
}
const sp = (l: BurnWord[], i: number) => (i > 0 && !l[i].n ? ' ' : '')
const esc = (t: string) => t.replace(/\\/g, '＼').replace(/\{/g, '（').replace(/\}/g, '）')

export function buildAss(cues: BurnCue[], st: BurnStyle, VW: number, VH: number): string {
  const align = st.position === 'top' ? 8 : st.position === 'center' ? 5 : 2
  const primary = assColor(st.color)
  const hl = assColor(st.highlightColor)
  const outline = st.addBg ? assColor('#000000', '60') : assColor(st.outlineColor)
  const bord = st.addBg ? Math.max(4, Math.round(st.size * 0.25)) : Math.max(0, Math.round(st.border))
  const font = (st.font || 'Arial').split(',')[0].replace(/["']/g, '').trim()
  const head = [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${VW}`, `PlayResY: ${VH}`, 'WrapStyle: 2', 'ScaledBorderAndShadow: yes', 'YCbCr Matrix: TV.709', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${font},${Math.round(st.size)},${primary},${primary},${outline},&H80000000,-1,0,0,0,100,100,0,0,${st.addBg ? 3 : 1},${bord},0,${align},${Math.round(VW * 0.05)},${Math.round(VW * 0.05)},${st.position === 'center' ? 0 : Math.round(st.marginV)},1`,
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ]
  const ev: string[] = []
  const dlg = (s: number, e: number, text: string) => { if (e > s) ev.push(`Dialogue: 0,${assTime(s)},${assTime(e)},Default,,0,0,0,,${text}`) }

  for (const c of cues) {
    const lines = c.lines.filter((l) => l.length)
    if (!lines.length) continue
    if (st.mode === 'sentence') {
      dlg(c.start, c.end, lines.map((l) => l.map((w, i) => sp(l, i) + esc(w.w)).join('')).join('\\N'))
      continue
    }
    const flat = lines.flat()
    flat.forEach((_, k) => {
      const s = k === 0 ? c.start : flat[k].s
      const e = k === flat.length - 1 ? c.end : flat[k + 1].s
      let idx = 0
      const text = lines.map((l) => l.map((w, wi) => {
        const i = idx++
        const pre = sp(l, wi)
        const word = esc(w.w)
        if (i === k) {
          const pulse = st.bounce && !st.addBg ? `\\t(0,90,\\bord${bord + Math.max(2, Math.round(st.size * 0.06))})\\t(90,180,\\bord${bord})` : ''
          return `${pre}{\\alpha&H00&\\c${hl}&${pulse}}${word}{\\c${primary}&\\bord${bord}}`
        }
        if (st.mode === 'word' && i > k) return `${pre}{\\alpha&HFF&}${word}`
        return `${pre}{\\alpha&H00&}${word}`
      }).join('')).join('\\N')
      dlg(s, e, text)
    })
  }
  return [...head, ...ev, ''].join('\r\n')
}

/** Đọc tên họ font (name ID 1) từ file .ttf/.otf để libass và trình duyệt gọi đúng tên. */
export function fontFamilyOf(file: string): string {
  try {
    const b = fs.readFileSync(file)
    let base = 0
    if (b.toString('latin1', 0, 4) === 'ttcf') base = b.readUInt32BE(12)
    const n = b.readUInt16BE(base + 4)
    for (let i = 0; i < n; i++) {
      const r = base + 12 + i * 16
      if (b.toString('latin1', r, r + 4) !== 'name') continue
      const t = b.readUInt32BE(r + 8)
      const count = b.readUInt16BE(t + 2), strOff = t + b.readUInt16BE(t + 4)
      let best: { score: number; v: string } | null = null
      for (let j = 0; j < count; j++) {
        const q = t + 6 + j * 12
        const pid = b.readUInt16BE(q), lang = b.readUInt16BE(q + 4), nid = b.readUInt16BE(q + 6)
        const len = b.readUInt16BE(q + 8), off = strOff + b.readUInt16BE(q + 10)
        if (nid !== 1) continue
        let v = ''
        if (pid === 3 || pid === 0) { for (let k = 0; k + 1 < len; k += 2) v += String.fromCharCode(b.readUInt16BE(off + k)) }
        else if (pid === 1) v = b.toString('latin1', off, off + len)
        const score = (pid === 3 ? 2 : 1) + (lang === 0x409 || lang === 0 ? 1 : 0)
        if (v.trim() && (!best || score > best.score)) best = { score, v: v.trim() }
      }
      if (best) return best.v
    }
  } catch { /* bỏ qua */ }
  return path.parse(file).name
}

export function listFonts(): { family: string; file: string }[] {
  const dir = fontsDir()
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((f) => /\.(ttf|otf|ttc)$/i.test(f)).map((f) => {
    const file = path.join(dir, f)
    return { family: fontFamilyOf(file), file }
  })
}

export function setupFontLibrary(win: BrowserWindow): void {
  ipcMain.handle('fonts:list', () => listFonts())
  ipcMain.handle('fonts:data', (_e, f: string) => {
    const file = path.resolve(String(f || ''))
    if (!file.startsWith(path.resolve(fontsDir())) || !fs.existsSync(file)) return null
    return fs.readFileSync(file)
  })
  ipcMain.handle('fonts:add', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Font', extensions: ['ttf', 'otf', 'ttc'] }] })
    if (!r.canceled) {
      fs.mkdirSync(fontsDir(), { recursive: true })
      for (const f of r.filePaths) fs.copyFileSync(f, path.join(fontsDir(), path.basename(f)))
    }
    return listFonts()
  })
}
