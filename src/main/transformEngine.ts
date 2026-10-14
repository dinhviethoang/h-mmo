import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { spawn, spawnSync } from 'child_process'
import { workspaceDir } from './workspace'
import { ffmpegPath, probeMedia, filterPath, runFfmpeg, pythonExe, engineScript, envWithFfmpeg, pyRun, pipInstall } from './tools'

// Tab "Hiệu chỉnh video": crop/zoom, lật, tốc độ, pitch, màu, viền, chữ, logo,
// đổi tỷ lệ khung hình, âm lượng. Chạy hàng loạt bằng ffmpeg.

export type TransformOptions = {
  zoom: number            // 1 = giữ nguyên, 1.08 = phóng 8% (cắt mép)
  flip: boolean
  speed: number           // 1 = giữ nguyên
  pitch: number           // nửa cung (semitone), 0 = giữ nguyên
  brightness: number      // -0.3..0.3
  contrast: number        // 0.5..1.5
  saturation: number      // 0..2
  hue: number             // độ, -180..180
  aspect: 'keep' | '9:16' | '16:9' | '1:1' | '4:5'
  aspectMode: 'blur' | 'crop' | 'pad'
  border: number          // px, 0 = không viền
  borderColor: string     // #rrggbb
  text: string            // chữ watermark, '' = không
  textPos: Pos
  textOpacity: number     // 0..1
  textSize: number        // % chiều cao khung
  logoPath: string        // '' = không
  logoPos: Pos
  logoSize: number        // % chiều rộng khung
  logoOpacity: number
  volume: number          // 1 = giữ nguyên
  voiceReduce?: number    // 0..1: giảm giọng nhân vật (1 = bỏ hẳn giọng, giữ nhạc nền/tiếng động)
  sepModel?: 'fast' | 'hq'
  exportInstrumental?: boolean // lưu kèm file nhạc nền (đã bỏ giọng) .wav để lồng tiếng
}

export type SepFiles = { vocals: string; inst: string }
type Pos = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'


const ASPECTS: Record<string, [number, number]> = {
  '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1080, 1080], '4:5': [1080, 1350]
}

function probe(file: string): { w: number; h: number; dur: number; hasAudio: boolean; sr: number } {
  const m = probeMedia(file)
  return { ...m, w: m.w || 1080, h: m.h || 1920 }
}

const fpath = filterPath
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)

function placeXY(pos: Pos, m: string, w = 'w', h = 'h', W = 'W', H = 'H'): [string, string] {
  switch (pos) {
    case 'top-left': return [m, m]
    case 'top-right': return [`${W}-${w}-${m}`, m]
    case 'bottom-left': return [m, `${H}-${h}-${m}`]
    case 'center': return [`(${W}-${w})/2`, `(${H}-${h})/2`]
    default: return [`${W}-${w}-${m}`, `${H}-${h}-${m}`]
  }
}

function atempoChain(f: number): string[] {
  const out: string[] = []
  while (f > 2) { out.push('atempo=2'); f /= 2 }
  while (f < 0.5) { out.push('atempo=0.5'); f /= 0.5 }
  if (Math.abs(f - 1) > 1e-3) out.push(`atempo=${f.toFixed(4)}`)
  return out
}

/** Dựng tham số ffmpeg cho 1 file. */
export function buildArgs(input: string, output: string, o: TransformOptions, tmpDir: string, previewSec = 0, sep?: SepFiles): string[] {
  const info = probe(input)
  const args = ['-y', '-hide_banner']
  if (previewSec) args.push('-t', String(previewSec * Math.max(o.speed, 0.1)))
  args.push('-i', input)
  const useLogo = !!o.logoPath && fs.existsSync(o.logoPath)
  if (useLogo) args.push('-i', o.logoPath)
  // giọng & nhạc nền đã tách (nếu bật giảm giọng nhân vật)
  let vocIdx = -1, insIdx = -1
  if (sep) {
    vocIdx = useLogo ? 2 : 1; insIdx = vocIdx + 1
    args.push('-i', sep.vocals, '-i', sep.inst)
  }

  const v: string[] = []
  // 1) zoom (phóng rồi cắt giữa, giữ nguyên kích thước)
  if (o.zoom > 1.001) v.push(`scale=trunc(iw*${o.zoom}/2)*2:trunc(ih*${o.zoom}/2)*2`, `crop=trunc(iw/${o.zoom}/2)*2:trunc(ih/${o.zoom}/2)*2`)
  // 2) lật ngang
  if (o.flip) v.push('hflip')
  // 3) màu
  if (o.brightness || o.contrast !== 1 || o.saturation !== 1)
    v.push(`eq=brightness=${o.brightness}:contrast=${o.contrast}:saturation=${o.saturation}`)
  if (o.hue) v.push(`hue=h=${o.hue}`)
  // 4) tốc độ
  if (Math.abs(o.speed - 1) > 1e-3) v.push(`setpts=PTS/${o.speed}`)

  // 5) tỷ lệ khung hình
  let W = even(info.w), H = even(info.h)
  const graph: string[] = []
  let last = '[0:v]'
  const push = (filters: string[], label: string) => {
    if (!filters.length) return
    graph.push(`${last}${filters.join(',')}[${label}]`)
    last = `[${label}]`
  }
  push(v, 'v1')
  if (o.aspect !== 'keep') {
    ;[W, H] = ASPECTS[o.aspect]
    if (o.aspectMode === 'blur') {
      graph.push(`${last}split=2[bgs][fgs]`)
      graph.push(`[bgs]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=25:3,eq=brightness=-0.08[bg]`)
      graph.push(`[fgs]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg]`)
      graph.push(`[bg][fg]overlay=(W-w)/2:(H-h)/2[v2]`)
      last = '[v2]'
    } else if (o.aspectMode === 'crop') {
      push([`scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`], 'v2')
    } else {
      push([`scale=${W}:${H}:force_original_aspect_ratio=decrease`, `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black`], 'v2')
    }
  } else {
    push([`scale=${W}:${H}`], 'v2')
  }
  // 6) viền: thu nhỏ hình bên trong, giữ nguyên kích thước khung
  if (o.border > 0) {
    const b = Math.round(o.border)
    push([`scale=${even(W - 2 * b)}:${even(H - 2 * b)}`, `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${o.borderColor.replace('#', '0x')}`], 'v3')
  }
  // 7) logo
  if (useLogo) {
    const lw = even((W * o.logoSize) / 100)
    graph.push(`[1:v]scale=${lw}:-2,format=rgba,colorchannelmixer=aa=${o.logoOpacity}[logo]`)
    const [x, y] = placeXY(o.logoPos, String(Math.round(W * 0.03)))
    graph.push(`${last}[logo]overlay=${x}:${y}:eof_action=repeat[v4]`)
    last = '[v4]'
  }
  // 8) chữ watermark (đọc từ file để không lỗi dấu tiếng Việt / ký tự đặc biệt)
  if (o.text.trim()) {
    const tf = path.join(tmpDir, `wm_${Date.now()}.txt`)
    fs.writeFileSync(tf, o.text, 'utf8')
    const font = 'C:/Windows/Fonts/arialbd.ttf'
    const size = Math.round((H * o.textSize) / 100)
    const [x, y] = placeXY(o.textPos, String(Math.round(W * 0.04)), 'tw', 'th', 'w', 'h')
    push([`drawtext=fontfile='${fpath(font)}':textfile='${fpath(tf)}':fontsize=${size}:expansion=none:fontcolor=white@${o.textOpacity}:borderw=2:bordercolor=black@${o.textOpacity * 0.6}:x=${x}:y=${y}`], 'v5')
  }
  if (last === '[0:v]') push(['null'], 'vout')

  // âm thanh
  const a: string[] = []
  if (info.hasAudio) {
    if (o.pitch) {
      const f = Math.pow(2, o.pitch / 12)
      a.push(`asetrate=${Math.round(info.sr * f)}`, `aresample=${info.sr}`, ...atempoChain(1 / f))
    }
    a.push(...atempoChain(o.speed))
    if (Math.abs(o.volume - 1) > 1e-3) a.push(`volume=${o.volume}`)
    let src = '[0:a]'
    if (sep) {
      // nhạc nền giữ nguyên + giọng nhân vật giảm theo voiceReduce
      const k = Math.max(0, 1 - (o.voiceReduce || 0))
      graph.push(`[${vocIdx}:a]volume=${k.toFixed(3)}[voc]`)
      graph.push(`[${insIdx}:a]anull[ins]`)
      graph.push(`[ins][voc]amix=inputs=2:duration=longest:normalize=0[amx]`)
      src = '[amx]'
      if (!a.length) a.push('anull')
    }
    if (a.length) graph.push(`${src}${a.join(',')}[aout]`)
  }

  args.push('-filter_complex', graph.join(';'), '-map', last)
  if (info.hasAudio) args.push('-map', a.length ? '[aout]' : '0:a')
  args.push(
    '-c:v', 'libx264', '-preset', previewSec ? 'ultrafast' : 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-map_metadata', '-1', '-movflags', '+faststart', output
  )
  return args
}

const SEP_MODELS = { fast: 'Kim_Vocal_2.onnx', hq: 'model_bs_roformer_ep_317_sdr_12.9755.ckpt' }

let separatorReady = false
async function ensureSeparator(log: (m: string) => void): Promise<void> {
  if (separatorReady) return
  const check = () => pyRun('import audioread, librosa, soundfile; from audio_separator.separator import Separator')
  let r = await check()
  if (r.code !== 0 && /No module named 'audio_separator'/.test(r.stderr)) {
    await pipInstall(['audio-separator[cpu]', 'audioread'], log, 'Đang cài bộ tách giọng (audio-separator) lần đầu — tải ~300 MB, 3-10 phút...')
    r = await check()
  }
  // Tự cài bù các thư viện phụ còn thiếu (vd. audioread), tối đa 4 lần
  for (let i = 0; i < 4 && r.code !== 0; i++) {
    const m = /No module named '([\w.]+)'/.exec(r.stderr)
    if (!m) break
    const mod = m[1].split('.')[0]
    await pipInstall([mod === 'cv2' ? 'opencv-python-headless' : mod === 'yaml' ? 'pyyaml' : mod], log)
    r = await check()
  }
  if (r.code !== 0) throw new Error('Bộ tách giọng chưa chạy được: ' + r.stderr.trim().split('\n').slice(-2).join(' | '))
  separatorReady = true
}

/** Tách giọng nhân vật / nhạc nền. Có cache theo file + thời lượng + model. */
export async function separateVoice(input: string, o: TransformOptions, tmpDir: string, previewSec: number, log: (m: string) => void): Promise<SepFiles> {
  const model = SEP_MODELS[o.sepModel || 'fast']
  const st = fs.statSync(input)
  const key = require('crypto').createHash('sha1').update(`${input}|${st.size}|${st.mtimeMs}|${previewSec}|${model}|${o.speed}`).digest('hex').slice(0, 16)
  const dir = path.join(tmpDir, 'sep', key)
  const res = { vocals: path.join(dir, 'vocals.wav'), inst: path.join(dir, 'instrumental.wav') }
  if (fs.existsSync(res.vocals) && fs.existsSync(res.inst)) { log('Dùng lại kết quả tách giọng đã có.'); return res }
  await ensureSeparator(log)
  fs.mkdirSync(dir, { recursive: true })
  const src = path.join(dir, 'source.wav')
  const cut = previewSec ? ['-t', String(previewSec * Math.max(o.speed, 0.1))] : []
  const r = spawnSync(ffmpegPath(), ['-y', ...cut, '-i', input, '-vn', '-ac', '2', '-ar', '44100', src], { windowsHide: true })
  if (r.status !== 0) throw new Error('Không tách được âm thanh khỏi video.')
  const runSep = () => new Promise<void>((resolve, reject) => {
    const p = spawn(pythonExe(), [engineScript('separate_vocals.py'), '--input', src, '--outdir', dir,
      '--model', model, '--models-dir', path.join(app.getPath('userData'), 'sep-models')], {
      windowsHide: true,
      // audio-separator gọi lệnh ffmpeg/ffprobe -> đưa thư mục ffmpeg có sẵn của app vào PATH
      env: { ...envWithFfmpeg(), Path: undefined as any }
    })
    let err = '', buf = ''
    p.stdout.on('data', (d: Buffer) => {
      buf += d.toString('utf8'); const lines = buf.split(/\r?\n/); buf = lines.pop() || ''
      for (const l of lines) { if (l.startsWith('STATUS ')) log(l.slice(7)); else if (l.startsWith('ERROR ')) err = l.slice(6) }
    })
    p.stderr.on('data', (d: Buffer) => { const t = d.toString(); if (/Error|Traceback/.test(t)) err = err || t.slice(-400) })
    p.on('close', (c) => (c === 0 && fs.existsSync(res.vocals) ? resolve() : reject(new Error('Tách giọng lỗi: ' + (err || 'mã ' + c)))))
  })
  try {
    await runSep()
  } catch (e: any) {
    const m = /No module named '([\w.]+)'/.exec(String(e?.message || ''))
    if (!m) throw e
    await pipInstall([m[1].split('.')[0]], log) // cài bù thư viện thiếu rồi chạy lại 1 lần
    await runSep()
  }
  log('Đã tách xong giọng nhân vật và nhạc nền.')
  return res
}

export function setupTransformEngine(win: BrowserWindow): void {
  const log = (m: string) => win.webContents.send('transform:log', m)
  const tmpDir = path.join(app.getPath('temp'), 'hmmo-transform')
  fs.mkdirSync(tmpDir, { recursive: true })

  ipcMain.handle('transform:pickVideos', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Video', extensions: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'flv'] }] })
    return r.canceled ? [] : r.filePaths
  })
  ipcMain.handle('transform:pickImage', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Ảnh', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('transform:pickDir', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('transform:reveal', (_e, file: string) => {
    if (file && fs.existsSync(file)) shell.showItemInFolder(file)
    return true
  })

  ipcMain.handle('transform:preview', async (_e, input: string, o: TransformOptions) => {
    const out = path.join(tmpDir, `preview_${Date.now()}.mp4`)
    log('Đang tạo bản xem trước 6 giây...')
    const sep = (o.voiceReduce || 0) > 0 && probe(input).hasAudio ? await separateVoice(input, o, tmpDir, 6, log) : undefined
    await runFfmpeg(buildArgs(input, out, o, tmpDir, 6, sep), 6, () => {})
    log('Xong bản xem trước.')
    return out
  })

  ipcMain.handle('transform:run', async (_e, inputs: string[], o: TransformOptions, outDir: string, suffix: string) => {
    const done: string[] = []
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i]
      const p = path.parse(input)
      const dir = outDir || workspaceDir('hieuchinh')
      fs.mkdirSync(dir, { recursive: true })
      const out = path.join(dir, `${p.name}${suffix || '_edit'}.mp4`)
      const dur = probe(input).dur / Math.max(o.speed, 0.1)
      log(`[${i + 1}/${inputs.length}] Đang xử lý: ${p.base}`)
      let lastShown = -10
      try {
        const sep = (o.voiceReduce || 0) > 0 && probe(input).hasAudio ? await separateVoice(input, o, tmpDir, 0, log) : undefined
        if (sep && o.exportInstrumental) {
          const bg = path.join(dir, `${p.name}${suffix || '_edit'}_nhacnen.wav`)
          const f: string[] = []
          if (o.pitch) { const k = Math.pow(2, o.pitch / 12); f.push(`asetrate=${Math.round(44100 * k)}`, 'aresample=44100', ...atempoChain(1 / k)) }
          f.push(...atempoChain(o.speed))
          spawnSync(ffmpegPath(), ['-y', '-i', sep.inst, ...(f.length ? ['-af', f.join(',')] : []), bg], { windowsHide: true })
          log(`[${i + 1}/${inputs.length}] Đã lưu nhạc nền (không giọng): ${bg}`)
        }
        await runFfmpeg(buildArgs(input, out, o, tmpDir, 0, sep), dur, (pct) => {
          if (pct - lastShown >= 10) { lastShown = pct; log(`[${i + 1}/${inputs.length}] ${Math.floor(pct)}%`) }
        })
        log(`[${i + 1}/${inputs.length}] ✓ ${out}`)
        done.push(out)
      } catch (e: any) {
        log(`[${i + 1}/${inputs.length}] [LỖI] ${e.message}`)
      }
    }
    log(`====== XONG ${done.length}/${inputs.length} video ======`)
    return done
  })
}
