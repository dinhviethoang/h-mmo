import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { spawnSync } from 'child_process'
import { GoogleGenAI } from '@google/genai'
import { findAndCallModel } from './subtitleEngine'
import { ffmpegPath, probeMedia } from './tools'

// Tab "Chấm chất lượng": tách khung hình -> ghép contact sheet có mốc thời gian -> AI (Gemini vision) chấm 6 tiêu chí,
// liệt kê lỗi theo mức độ + đoạn dùng được -> điểm tổng, xếp loại, gợi ý sửa.
// Chuyển thể từ module review của FlowKit (contact_sheets.py),
// Copyright (c) 2026 tuannguyenhoangit-droid, giấy phép MIT — xem licenses/LICENSE_FlowKit_MIT.txt.
// Khác bản gốc: dùng ffmpeg-static; chép file thay vì symlink (Windows không cho symlink nếu không có quyền admin);
// drawtext dùng font Windows; tự giảm fps với video dài để không tách hàng nghìn khung; chuẩn hoá tên trường/giá trị
// trong JSON của model; gợi ý sửa viết lại cho quy trình biên tập của H-MMO.


export const REVIEW_FPS_LIGHT = 4
export const REVIEW_FPS_DEEP = 8
export const REVIEW_MAX_FRAMES = 64
export const SHEET_COLS = 3
export const SHEET_ROWS = 3

export const WEIGHTS: Record<string, number> = {
  character_consistency: 0.25,
  prompt_adherence: 0.2,
  motion_quality: 0.2,
  visual_fidelity: 0.15,
  temporal_coherence: 0.1,
  composition: 0.1
}
export const DIM_LABELS: Record<string, string> = {
  character_consistency: 'Nhất quán nhân vật',
  prompt_adherence: 'Đúng nội dung mong muốn',
  motion_quality: 'Chất lượng chuyển động',
  visual_fidelity: 'Độ nét / sạch hình',
  temporal_coherence: 'Liền mạch ánh sáng, bối cảnh',
  composition: 'Bố cục khung hình'
}

export type ReviewError = { severity: 'CRITICAL' | 'HIGH' | 'MINOR'; time_range: string; description: string; start?: number; end?: number }
export type ReviewSegment = { time_range: string; score: number; start?: number; end?: number }
export type ReviewScores = { dimensions: Record<string, number>; errors: ReviewError[]; usable_segments: ReviewSegment[] }

export function computeOverall(dims: Record<string, number>): number {
  return Math.round(Object.entries(WEIGHTS).reduce((a, [k, w]) => a + (dims[k] ?? 0) * w, 0) * 100) / 100
}

export function verdict(score: number): string {
  if (score >= 9) return 'excellent'
  if (score >= 7.5) return 'good'
  if (score >= 6) return 'acceptable'
  if (score >= 4) return 'poor'
  return 'unusable'
}
export const VERDICT_VI: Record<string, string> = {
  excellent: 'Xuất sắc — đăng được ngay', good: 'Tốt — dùng được', acceptable: 'Tạm được — nên cắt bỏ đoạn lỗi',
  poor: 'Kém — cần làm lại phần lớn', unusable: 'Không dùng được'
}

/** Gợi ý sửa: ưu tiên theo nhóm lỗi nghiêm trọng, nếu không có thì theo tiêu chí điểm thấp nhất. */
export function fixGuide(dims: Record<string, number>, errors: ReviewError[]): string {
  const types = new Set<string>()
  for (const e of errors) {
    const d = (e.description || '').toLowerCase()
    if (e.severity === 'CRITICAL') {
      if (/drift|morph|limb|breed/.test(d)) types.add('drift')
      if (/swap|wrong character/.test(d)) types.add('swap')
      if (/count|number of character/.test(d)) types.add('count')
      if (/logo|brand|watermark/.test(d)) types.add('logo')
      if (/role|wrong action/.test(d)) types.add('role')
    } else if (e.severity === 'HIGH') {
      if (/reverse/.test(d)) types.add('reverse')
      if (/watermark|logo/.test(d)) types.add('logo')
      if (/subtitle|caption|text/.test(d)) types.add('subtitle')
    }
  }
  if (types.size) {
    const hints: string[] = []
    if (types.has('drift')) hints.push('cắt bỏ đoạn nhân vật bị biến dạng (giữ các "đoạn dùng được"); nếu là video AI: đơn giản hoá prompt, thêm "steady camera, minimal movement"')
    if (types.has('swap')) hints.push('nhân vật bị lẫn: cắt đoạn đó hoặc tạo lại với màu sắc nhân vật tương phản hơn')
    if (types.has('count')) hints.push('sai số lượng nhân vật: cắt đoạn đó; khi tạo lại cho 1 nhân vật nổi bật, còn lại ở hậu cảnh')
    if (types.has('logo')) hints.push('còn logo/watermark: dùng "Vùng che" ở tab Biên tập video hoặc "Chèn logo" ở tab Hiệu chỉnh video để che')
    if (types.has('role')) hints.push('sai vai trò hành động: cắt đoạn đó hoặc viết lại prompt nói rõ ai làm gì')
    if (types.has('reverse')) hints.push('chuyển động ngược: cắt đoạn đó (lỗi ngẫu nhiên, tạo lại thường hết)')
    if (types.has('subtitle')) hints.push('phụ đề lỗi/tràn: bật "Tự ngắt dòng, tối đa 2 dòng" ở tab Biên tập video rồi xuất lại')
    return hints.join('; ')
  }
  const keys = Object.keys(WEIGHTS)
  const lowest = keys.reduce((a, k) => ((dims[k] ?? 10) < (dims[a] ?? 10) ? k : a), keys[0])
  const g: Record<string, string> = {
    character_consistency: 'Nhân vật chưa ổn định: giữ các đoạn dùng được, bỏ đoạn nhân vật thay đổi',
    prompt_adherence: 'Nội dung chưa khớp mong muốn: chọn lại clip nguồn hoặc viết prompt cụ thể hơn',
    motion_quality: 'Chuyển động giật: cắt bỏ đoạn giật, hoặc thử giữ tốc độ gốc (không đổi tốc độ) ở tab Hiệu chỉnh',
    visual_fidelity: 'Hình chưa nét/sạch: dùng nguồn chất lượng cao hơn (tải "Cao nhất"), tránh phóng to quá nhiều',
    temporal_coherence: 'Ánh sáng/bối cảnh nhảy: tránh ghép các clip quá khác màu, chỉnh màu đồng bộ ở tab Hiệu chỉnh',
    composition: 'Bố cục chưa đẹp: thử khung "Lấp đầy (cắt)" hoặc "Nền mờ" khi ghép, hoặc crop/zoom ở tab Hiệu chỉnh'
  }
  return g[lowest]
}

// ---------- tách khung + contact sheet ----------
const probeDur = (file: string): number => probeMedia(file).dur

function frameFilter(fps: number, drawtext: boolean): string {
  let chain = `fps=${fps},scale=320:-2`
  if (drawtext) {
    const font = process.platform === 'win32' ? "fontfile='C\\:/Windows/Fonts/arial.ttf':" : ''
    chain += `,drawtext=${font}text='%{pts\\:hms}':x=5:y=5:fontsize=14:fontcolor=white:borderw=1:bordercolor=black`
  }
  return chain
}

export function createContactSheets(video: string, fpsWanted: number, outDir: string): { sheets: string[]; nFrames: number; fps: number; timestamped: boolean; duration: number } {
  const duration = probeDur(video)
  // video dài: giảm fps để chỉ tách khoảng REVIEW_MAX_FRAMES khung (bản gốc tách hết rồi mới lọc)
  const fps = duration > 0 ? Math.max(0.05, Math.min(fpsWanted, REVIEW_MAX_FRAMES / duration)) : fpsWanted
  const fpsStr = fps.toFixed(4)
  const framesDir = path.join(outDir, 'frames')
  fs.rmSync(outDir, { recursive: true, force: true })
  fs.mkdirSync(framesDir, { recursive: true })
  const extract = (dt: boolean) => spawnSync(ffmpegPath(), ['-y', '-i', video, '-vf', frameFilter(+fpsStr, dt), '-q:v', '2', path.join(framesDir, 'frame_%04d.jpg')], { windowsHide: true, encoding: 'utf8' })
  let timestamped = true
  let r = extract(true)
  if (r.status !== 0) { timestamped = false; r = extract(false) } // không có font/drawtext -> bỏ mốc thời gian
  if (r.status !== 0) throw new Error('Tách khung hình lỗi: ' + String(r.stderr || '').slice(-300))
  let frames = fs.readdirSync(framesDir).filter((f) => /^frame_\d+\.jpg$/.test(f)).sort().map((f) => path.join(framesDir, f))
  if (!frames.length) throw new Error('Không tách được khung hình nào.')
  if (frames.length > REVIEW_MAX_FRAMES) {
    const step = frames.length / REVIEW_MAX_FRAMES
    frames = Array.from({ length: REVIEW_MAX_FRAMES }, (_, i) => frames[Math.floor(i * step)])
  }
  const per = SHEET_COLS * SHEET_ROWS
  const sheets: string[] = []
  for (let si = 0, st = 0; st < frames.length; si++, st += per) {
    const chunk = frames.slice(st, st + per)
    const cdir = path.join(outDir, `_chunk_${String(si).padStart(2, '0')}`)
    fs.mkdirSync(cdir, { recursive: true })
    chunk.forEach((f, i) => fs.copyFileSync(f, path.join(cdir, `f_${String(i + 1).padStart(4, '0')}.jpg`)))
    // số cột = ước lớn nhất của số khung (≤ SHEET_COLS) để lưới kín, không có ô trống (model hay đọc ô trống thành lỗi)
    let cols = 1
    for (let c = 1; c <= SHEET_COLS; c++) if (chunk.length % c === 0) cols = c
    const rows = chunk.length / cols
    const out = path.join(outDir, `sheet_${String(si).padStart(2, '0')}.jpg`)
    const t = spawnSync(ffmpegPath(), ['-y', '-i', path.join(cdir, 'f_%04d.jpg'), '-vf', `tile=${cols}x${rows}:nb_frames=${chunk.length}`, '-frames:v', '1', '-q:v', '2', out], { windowsHide: true, encoding: 'utf8' })
    if (t.status !== 0) throw new Error('Ghép contact sheet lỗi: ' + String(t.stderr || '').slice(-300))
    sheets.push(out)
  }
  return { sheets, nFrames: frames.length, fps: +fpsStr, timestamped, duration }
}

// ---------- prompt cho model vision ----------
export function buildPrompt(o: { nFrames: number; fps: number; nSheets: number; duration: number; timestamped: boolean; context: string; characters: string; aiGenerated: boolean }): string {
  const sheetNote = o.nSheets > 1
    ? ` The frames are provided across ${o.nSheets} sequential contact sheets (each fully packed, up to ${SHEET_COLS}x${SHEET_ROWS} cells — the last sheet may use a different grid shape to fit its frame count exactly, in chronological order — sheet 1 is earliest, sheet ${o.nSheets} is latest).`
    : ''
  const tsNote = o.timestamped
    ? ' Each frame has its timestamp (h:mm:ss) burned in at the top-left.'
    : ` Frames carry no timestamps; frame k (counting from 1 across all sheets, left-to-right, top-to-bottom) is at about ${(1 / o.fps).toFixed(2)}*(k-1) seconds.`
  const kind = o.aiGenerated ? 'AI-generated' : 'edited / re-uploaded'
  return `You are an expert video quality reviewer analyzing ${o.nFrames} frames sampled at ${o.fps.toFixed(2)}fps from a ${o.duration.toFixed(1)}-second ${kind} video.${sheetNote}${tsNote}

EXPECTED CONTENT: ${o.context || 'not specified (judge prompt_adherence as overall coherence and watchability)'}
EXPECTED CHARACTERS: ${o.characters || 'none specified'}

== SCORING DIMENSIONS (0.0-10.0 each) ==
1. character_consistency - Do characters stay the same person/species/clothing? Stable limb count?
2. prompt_adherence - Does the video match the expected content?
3. motion_quality - Smooth motion? No jitter/reverse motion/teleportation/frozen frames?
4. visual_fidelity - Clear resolution? No artifacts/blur/brand logos/leftover watermarks?
5. temporal_coherence - Consistent lighting/shadows/background/scale across frames?
6. composition - Good framing, nothing important cut off, subtitles readable and inside the frame?

== ERROR DETECTION RUBRIC ==
CRITICAL (auto-score affected dimension 0-3):
1. Character Drift -- character morphs mid-video (extra limbs, face/species changes).
2. Character Swap -- similar characters get swapped or the wrong character appears in a role.
3. Role Reversal -- the wrong character performs the action.
4. Brand Logo / Watermark -- real brand logos or another channel's watermark/username clearly visible (legal & copyright risk).
5. Character Count -- rendered count differs from what is expected.

HIGH (score affected dimension 4-6):
6. Camera Drift -- sudden unwanted zoom, rotation, or angle shift.
7. Object Morph -- held items change shape.
8. Reverse Motion -- action is done then undone.
9. Human Hands -- animal/stylised characters get human hands or fingers.
10. Scale Break -- characters suddenly giant or tiny relative to environment.
11. Subtitle Problem -- burned-in subtitles overflow the frame, overlap, cover faces, or show garbled text.
12. Black/Frozen Frames -- black, blank or frozen frames in the middle of the video.

MINOR (score affected dimension 7-8, still acceptable):
13. Prop Count -- small props change count.
14. Clothing Detail -- texture shift.
15. Background Text -- signage becomes garbled.
16. Accessory Change -- small accessories appear/disappear.

== INSTRUCTIONS ==
- For each error found, include: severity, time_range in seconds (e.g. "3s-5s"), and a short description in English.
- Identify usable_segments: continuous segments free of CRITICAL or HIGH errors, with a score.
- If ANY CRITICAL error is present, the affected dimension must be 3.0 or below.

Return ONLY valid JSON (no markdown):
{
  "dimensions": {"character_consistency": N, "prompt_adherence": N, "motion_quality": N, "visual_fidelity": N, "temporal_coherence": N, "composition": N},
  "errors": [{"severity": "CRITICAL|HIGH|MINOR", "time_range": "Xs-Ys", "description": "what happened"}],
  "usable_segments": [{"time_range": "Xs-Ys", "score": N}]
}`
}

// ---------- đọc & chuẩn hoá JSON của model ----------
const ERR_ALIASES: Record<string, string> = { timerange: 'time_range', time: 'time_range', desc: 'description', level: 'severity' }
const SEG_ALIASES: Record<string, string> = { timerange: 'time_range', time: 'time_range' }

export function parseJsonResponse(raw: string): any {
  let s = String(raw || '').trim()
  if (s.startsWith('```')) { s = s.split('```')[1] || ''; if (s.startsWith('json')) s = s.slice(4) }
  s = s.trim()
  const a = s.indexOf('{'), b = s.lastIndexOf('}')
  if (a < 0 || b <= a) throw new Error('Model không trả về JSON.')
  return JSON.parse(s.slice(a, b + 1))
}

const CANON = ['time_range', 'description', 'severity', 'score', 'start', 'end']
const alias = (o: any, map: Record<string, string>) => {
  const r: any = {}
  for (const [k, v] of Object.entries(o || {})) {
    const kk = k.replace(/_/g, '').toLowerCase()
    r[map[kk] || CANON.find((c) => c.replace(/_/g, '') === kk) || k] = v
  }
  return r
}
/** "3s-5s", "3-5", "0:03-0:05" -> [3, 5] */
export function parseRange(t: string): [number, number] | null {
  const toS = (x: string) => {
    const p = x.trim().replace(/s$/i, '').split(':').map(Number)
    return p.some((n) => !Number.isFinite(n)) ? NaN : p.reduce((a, n) => a * 60 + n, 0)
  }
  const m = String(t || '').split(/\s*(?:-|–|to)\s*/)
  if (m.length < 2) return null
  const a = toS(m[0]), b = toS(m[1])
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? [a, b] : null
}

export function normalizeScores(j: any): ReviewScores {
  const dimsIn: Record<string, any> = {}
  for (const [k, v] of Object.entries(j?.dimensions || j?.scores || {})) dimsIn[k.toLowerCase().replace(/[\s-]+/g, '_')] = v
  const dimensions: Record<string, number> = {}
  const vals: number[] = []
  for (const k of Object.keys(WEIGHTS)) {
    const v = Number(dimsIn[k])
    if (Number.isFinite(v)) { dimensions[k] = Math.max(0, Math.min(10, v)); vals.push(dimensions[k]) }
  }
  if (!vals.length) throw new Error('Kết quả chấm không có điểm các tiêu chí.')
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  for (const k of Object.keys(WEIGHTS)) if (dimensions[k] == null) dimensions[k] = Math.round(mean * 10) / 10 // thiếu tiêu chí -> lấy trung bình
  const errors: ReviewError[] = (Array.isArray(j?.errors) ? j.errors : []).map((e: any) => {
    if (typeof e === 'string') { const m = e.match(/^\[(CRITICAL|HIGH|MINOR)\]\s*(.*)$/i); return { severity: (m?.[1] || 'MINOR').toUpperCase(), time_range: '', description: m?.[2] || e } }
    const x = alias(e, ERR_ALIASES)
    const sev = String(x.severity || 'MINOR').toUpperCase()
    return { severity: (['CRITICAL', 'HIGH', 'MINOR'].includes(sev) ? sev : 'MINOR') as ReviewError['severity'], time_range: String(x.time_range || ''), description: String(x.description || '') }
  }).map((e: ReviewError) => { const r = parseRange(e.time_range); return r ? { ...e, start: r[0], end: r[1] } : e })
  const usable_segments: ReviewSegment[] = (Array.isArray(j?.usable_segments) ? j.usable_segments : []).map((s: any) => {
    const x = alias(s, SEG_ALIASES)
    const tr = String(x.time_range || (x.start != null && x.end != null ? `${x.start}-${x.end}` : ''))
    const r = parseRange(tr)
    return { time_range: tr, score: Number(x.score) || 0, ...(r ? { start: r[0], end: r[1] } : {}) }
  }).filter((s: ReviewSegment) => s.start != null)
  // quy tắc: có lỗi CRITICAL -> nhất quán nhân vật tối đa 3.0
  if (errors.some((e) => e.severity === 'CRITICAL')) dimensions.character_consistency = Math.min(3, dimensions.character_consistency)
  return { dimensions, errors, usable_segments }
}

export function setupReviewEngine(win: BrowserWindow): void {
  const log = (m: string) => win.webContents.send('review:log', m)
  ipcMain.handle('review:pickVideos', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'] }] })
    return r.canceled ? [] : r.filePaths
  })
  ipcMain.handle('review:reveal', (_e, f: string) => { if (f && fs.existsSync(f)) shell.showItemInFolder(f); return true })

  ipcMain.handle('review:run', async (_e, o: { video: string; mode: 'light' | 'deep'; context?: string; characters?: string; aiGenerated?: boolean; apiKey: string }) => {
    if (!o.apiKey) throw new Error('Chưa có API Key Gemini (nhập ở tab Tạo phụ đề).')
    if (!fs.existsSync(o.video)) throw new Error('Không thấy video: ' + o.video)
    const key = crypto.createHash('sha1').update(o.video + fs.statSync(o.video).mtimeMs + o.mode).digest('hex').slice(0, 12)
    const outDir = path.join(app.getPath('temp'), 'hmmo-review', key)
    log(`Chấm: ${path.basename(o.video)} (chế độ ${o.mode === 'deep' ? 'kỹ' : 'nhanh'})`)
    log('Đang tách khung hình và ghép contact sheet...')
    const cs = createContactSheets(o.video, o.mode === 'deep' ? REVIEW_FPS_DEEP : REVIEW_FPS_LIGHT, outDir)
    log(`${cs.nFrames} khung → ${cs.sheets.length} contact sheet${cs.timestamped ? '' : ' (không có mốc giờ trên hình)'}`)
    const prompt = buildPrompt({ ...cs, nSheets: cs.sheets.length, context: o.context || '', characters: o.characters || '', aiGenerated: !!o.aiGenerated })
    const contents = [{ role: 'user', parts: [{ text: prompt }, ...cs.sheets.map((f) => ({ inlineData: { mimeType: 'image/jpeg', data: fs.readFileSync(f).toString('base64') } }))] }]
    const ai = new GoogleGenAI({ apiKey: o.apiKey })
    const raw = await findAndCallModel(ai, o.apiKey, contents, log, 'Chấm chất lượng video')
    const scores = normalizeScores(parseJsonResponse(raw))
    let overall = computeOverall(scores.dimensions)
    // có lỗi CRITICAL -> xếp loại tối đa "kém" (0–3.9) dù các tiêu chí khác cao
    if (scores.errors.some((e) => e.severity === 'CRITICAL')) overall = Math.min(overall, 3.9)
    const v = verdict(overall)
    const result = {
      video: o.video, overall, verdict: v, verdictText: VERDICT_VI[v], ...scores,
      dimLabels: DIM_LABELS, weights: WEIGHTS, fixGuide: fixGuide(scores.dimensions, scores.errors),
      sheets: cs.sheets, nFrames: cs.nFrames, fps: cs.fps, duration: cs.duration, at: new Date().toISOString()
    }
    fs.writeFileSync(path.join(outDir, 'review.json'), JSON.stringify(result, null, 2))
    log(`Điểm tổng ${overall.toFixed(2)}/10 — ${VERDICT_VI[v]}`)
    return result
  })
}
