import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { workspaceDir } from './workspace'
import { probeMedia, runFfmpeg } from './tools'

// Tab "Ghép video": cắt từng clip, chuẩn hoá (khung hình/fps/âm thanh), ghép nối, lồng lời dẫn, thêm nhạc nền.
// Chuyển thể từ module editing của FlowKit (ffmpeg_ops.py + assemble_vertical.py),
// Copyright (c) 2026 tuannguyenhoangit-droid, giấy phép MIT — xem licenses/LICENSE_FlowKit_MIT.txt.
// Khác bản gốc: chạy bằng ffmpeg-static của H-MMO (không cần ffmpeg trên PATH), gộp chuẩn hoá + cắt + ghép
// + lời dẫn + nhạc vào 1 lần chạy ffmpeg; trộn âm bằng amix (bản gốc dùng amerge+pan, lỗi khi lời dẫn là mono);
// nhạc ngắn hơn video được lặp lại thay vì cắt cụt video.


export type ClipInfo = { w: number; h: number; dur: number; hasAudio: boolean }
export type AssembleClip = { path: string; start?: number | null; end?: number | null }
export type AudioLayer = { path: string; volume: number; fadeIn: number; fadeOut: number }
export type AssembleOptions = {
  size: 'keep' | '1080x1920' | '1920x1080' | '1080x1080' | '1080x1350'
  fit: 'pad' | 'crop' | 'blur'
  fps: number
  origVolume: number // âm lượng tiếng gốc của các clip (0..2)
  narration?: AudioLayer | null
  music?: (AudioLayer & { loop: boolean }) | null
  outName?: string
}

export function probeClip(file: string): ClipInfo {
  const { w, h, dur, hasAudio } = probeMedia(file)
  return { w, h, dur, hasAudio }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(+v) ? +v : lo))
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)
const AFMT = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo'

/** Dựng toàn bộ tham số ffmpeg (xuất ra để kiểm thử được). */
export function buildAssembleArgs(clips: (AssembleClip & { info: ClipInfo })[], o: AssembleOptions, out: string): { args: string[]; total: number } {
  if (!clips.length) throw new Error('Chưa có clip nào.')
  let W: number, H: number
  if (o.size === 'keep') { W = even(clips[0].info.w || 1080); H = even(clips[0].info.h || 1920) }
  else [W, H] = o.size.split('x').map(Number)
  const fps = clamp(o.fps || 30, 10, 60)

  const args = ['-y', '-hide_banner']
  const graph: string[] = []
  const parts: string[] = []
  let total = 0
  clips.forEach((c, i) => {
    const s = c.start != null && c.start > 0 ? Math.min(c.start, Math.max(0, c.info.dur - 0.1)) : 0
    const e = c.end != null && c.end > s ? Math.min(c.end, c.info.dur || c.end) : c.info.dur
    const d = Math.max(0.1, e - s)
    total += d
    if (s > 0) args.push('-ss', s.toFixed(3))
    args.push('-t', d.toFixed(3), '-i', c.path)
    const base = `[${i}:v]setpts=PTS-STARTPTS,`
    const tail = `setsar=1,fps=${fps},format=yuv420p[v${i}]`
    if (o.fit === 'crop') {
      graph.push(`${base}scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},${tail}`)
    } else if (o.fit === 'blur') {
      graph.push(`${base}split=2[bg${i}][fg${i}]`)
      graph.push(`[bg${i}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=25:3,eq=brightness=-0.08[bgb${i}]`)
      graph.push(`[fg${i}]scale=${W}:${H}:force_original_aspect_ratio=decrease[fgs${i}]`)
      graph.push(`[bgb${i}][fgs${i}]overlay=(W-w)/2:(H-h)/2,${tail}`)
    } else {
      graph.push(`${base}scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,${tail}`)
    }
    // clip không có tiếng -> chèn im lặng đúng độ dài để ghép không lệch
    if (c.info.hasAudio) graph.push(`[${i}:a]asetpts=PTS-STARTPTS,${AFMT},apad,atrim=0:${d.toFixed(3)}[a${i}]`)
    else graph.push(`anullsrc=r=48000:cl=stereo,atrim=0:${d.toFixed(3)},aformat=sample_fmts=fltp[a${i}]`)
    parts.push(`[v${i}][a${i}]`)
  })
  graph.push(`${parts.join('')}concat=n=${clips.length}:v=1:a=1[vcat][acat]`)

  const mixIn: string[] = []
  const ov = clamp(o.origVolume ?? 1, 0, 2)
  graph.push(`[acat]volume=${ov.toFixed(3)}[orig]`)
  mixIn.push('[orig]')
  let n = clips.length
  const fades = (l: AudioLayer) => {
    const fi = clamp(l.fadeIn, 0, 10), fo = clamp(l.fadeOut, 0, 10)
    let f = ''
    if (fi > 0) f += `,afade=t=in:st=0:d=${fi.toFixed(2)}`
    if (fo > 0) f += `,afade=t=out:st=${Math.max(0, total - fo).toFixed(2)}:d=${fo.toFixed(2)}`
    return f
  }
  if (o.narration?.path) {
    args.push('-i', o.narration.path)
    graph.push(`[${n}:a]${AFMT},volume=${clamp(o.narration.volume, 0, 3).toFixed(3)},atrim=0:${total.toFixed(3)}${fades(o.narration)}[nar]`)
    mixIn.push('[nar]')
    n++
  }
  if (o.music?.path) {
    if (o.music.loop) args.push('-stream_loop', '-1')
    args.push('-i', o.music.path)
    graph.push(`[${n}:a]${AFMT},volume=${clamp(o.music.volume, 0, 2).toFixed(3)},atrim=0:${total.toFixed(3)},asetpts=PTS-STARTPTS${fades(o.music)}[mus]`)
    mixIn.push('[mus]')
    n++
  }
  if (mixIn.length > 1) graph.push(`${mixIn.join('')}amix=inputs=${mixIn.length}:duration=first:normalize=0,alimiter=limit=0.95[aout]`)
  else graph.push(`[orig]anull[aout]`)

  args.push('-filter_complex', graph.join(';'), '-map', '[vcat]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-t', total.toFixed(3), out)
  return { args, total }
}

export function setupAssembleEngine(win: BrowserWindow): void {
  const log = (m: string) => win.webContents.send('assemble:log', m)

  ipcMain.handle('assemble:pickClips', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'] }] })
    return r.canceled ? [] : r.filePaths.map((p) => ({ path: p, info: probeClip(p) }))
  })
  ipcMain.handle('assemble:pickAudio', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Âm thanh', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'] }] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('assemble:probe', (_e, p: string) => (p && fs.existsSync(p) ? probeClip(p) : null))
  ipcMain.handle('assemble:reveal', (_e, f: string) => { if (f && fs.existsSync(f)) shell.showItemInFolder(f); return true })

  ipcMain.handle('assemble:run', async (_e, clips: AssembleClip[], o: AssembleOptions) => {
    const list = (clips || []).filter((c) => c?.path && fs.existsSync(c.path)).map((c) => ({ ...c, info: probeClip(c.path) }))
    if (!list.length) throw new Error('Chưa có clip hợp lệ.')
    for (const c of list) if (!c.info.w) throw new Error(`Không đọc được video: ${path.basename(c.path)}`)
    for (const l of [o.narration, o.music]) if (l?.path && !fs.existsSync(l.path)) throw new Error(`Không thấy file âm thanh: ${l.path}`)
    const base = (o.outName || '').trim().replace(/[\\/:*?"<>|]+/g, '_') || `ghep_${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}`
    const out = path.join(workspaceDir('hoanthanh'), base.endsWith('.mp4') ? base : `${base}.mp4`)
    const { args, total } = buildAssembleArgs(list, o, out)
    log(`Ghép ${list.length} clip → ${o.size === 'keep' ? 'giữ khung clip đầu' : o.size}, ${o.fps}fps, tổng ${total.toFixed(1)}s${o.narration?.path ? ' + lời dẫn' : ''}${o.music?.path ? ' + nhạc nền' : ''}`)
    let last = -10
    await runFfmpeg(args, total, (p) => { if (p - last >= 5) { last = p; log(`Đang xuất: ${Math.round(p)}%`) } })
    log(`====== XONG: ${out} ======`)
    return { out, total }
  })
}
