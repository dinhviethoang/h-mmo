import { app } from 'electron'
import path from 'path'
import { spawn, spawnSync } from 'child_process'

// Đường dẫn công cụ + tiện ích ffmpeg dùng chung cho mọi engine của H-MMO.
// (Trước đây mỗi file tự khai báo lại ffmpegPath/ffprobePath/pythonExe/probe/runFfmpeg.)

/** File nằm trong node_modules bị đóng gói asar -> trỏ sang bản giải nén. */
export const unpacked = (p: string): string => p.replace('app.asar', 'app.asar.unpacked')

export const ffmpegPath = (): string => unpacked(require('ffmpeg-static'))
export const ffprobePath = (): string => unpacked(require('ffprobe-static').path)
export const ytdlpPath = (): string =>
  unpacked(path.join(path.dirname(require.resolve('youtube-dl-exec/package.json')), 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'))

/** Thư mục gốc chứa engines/ và .venv-hmmo: thư mục dự án khi chạy dev, thư mục resources khi đã đóng gói. */
export const appRoot = (): string => (app.isPackaged ? process.resourcesPath : app.getAppPath())
export const pythonExe = (): string =>
  path.join(appRoot(), '.venv-hmmo', process.platform === 'win32' ? path.join('Scripts', 'python.exe') : path.join('bin', 'python'))
export const engineScript = (name: string): string => path.join(appRoot(), 'engines', name)

/** PATH có thư mục ffmpeg/ffprobe của app (cho thư viện Python gọi lệnh "ffmpeg"). */
export function envWithFfmpeg(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const dirs = [path.dirname(ffmpegPath()), path.dirname(ffprobePath())]
  return { ...process.env, PATH: [...dirs, process.env.PATH || ''].join(path.delimiter), PYTHONIOENCODING: 'utf-8', ...extra }
}

export type MediaInfo = { w: number; h: number; dur: number; hasAudio: boolean; sr: number }

/** Kích thước (đã xét xoay dọc), thời lượng, có tiếng hay không. */
export function probeMedia(file: string): MediaInfo {
  try {
    const r = spawnSync(ffprobePath(), ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { windowsHide: true })
    const j = JSON.parse(String(r.stdout || '{}'))
    const v = (j.streams || []).find((s: any) => s.codec_type === 'video') || {}
    const a = (j.streams || []).find((s: any) => s.codec_type === 'audio')
    let w = v.width || 0, h = v.height || 0
    const rot = Math.abs(Number(v.tags?.rotate || v.side_data_list?.[0]?.rotation || 0))
    if (rot === 90 || rot === 270) [w, h] = [h, w]
    return { w, h, dur: Number(j.format?.duration || v.duration || 0), hasAudio: !!a, sr: Number(a?.sample_rate || 44100) }
  } catch {
    return { w: 0, h: 0, dur: 0, hasAudio: false, sr: 44100 }
  }
}

/** Đường dẫn dùng bên trong chuỗi bộ lọc ffmpeg (C:\a\b -> C\:/a/b). */
export const filterPath = (p: string): string => p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")

/** Chạy ffmpeg, báo % theo thời lượng dự kiến; lỗi trả về 3 dòng cuối của ffmpeg. */
export function runFfmpeg(args: string[], durSec: number, onPct: (p: number) => void = () => {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath(), args, { windowsHide: true })
    let tail = ''
    p.stderr.on('data', (d: Buffer) => {
      const s = d.toString()
      tail = (tail + s).slice(-3000)
      const m = s.match(/time=(\d+):(\d+):(\d+\.?\d*)/)
      if (m && durSec > 0) onPct(Math.min(99, ((+m[1] * 3600 + +m[2] * 60 + +m[3]) / durSec) * 100))
    })
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(tail.split('\n').filter(Boolean).slice(-3).join(' | ')))))
  })
}

/** Gán ffmpeg/ffprobe của app cho fluent-ffmpeg (dùng chung toàn app, gọi 1 lần khi khởi động). */
export function configureFluentFfmpeg(): void {
  const ff = require('fluent-ffmpeg')
  ff.setFfmpegPath(ffmpegPath())
  ff.setFfprobePath(ffprobePath())
}

// ---------- Python (.venv-hmmo) ----------
// Chạy bất đồng bộ để không đứng giao diện (trước đây dùng spawnSync, "import vieneu" có thể treo app vài giây).

export function runCapture(cmd: string, args: string[], timeoutMs = 120000): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = '', stderr = ''
    let p: ReturnType<typeof spawn>
    try { p = spawn(cmd, args, { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }) }
    catch (e: any) { return resolve({ code: -1, stdout: '', stderr: String(e?.message || e) }) }
    const t = setTimeout(() => { try { p.kill() } catch { /* bỏ qua */ } }, timeoutMs)
    p.stdout?.on('data', (d: Buffer) => (stdout += d.toString('utf8')))
    p.stderr?.on('data', (d: Buffer) => (stderr += d.toString('utf8')))
    p.on('error', (e) => { clearTimeout(t); resolve({ code: -1, stdout, stderr: stderr || String(e.message) }) })
    p.on('close', (code) => { clearTimeout(t); resolve({ code, stdout, stderr }) })
  })
}

export function requirePython(): string {
  const py = pythonExe()
  if (!require('fs').existsSync(py)) throw new Error('Chưa cài Python cho H-MMO. Chạy Cai-Python-H-MMO.bat trên Desktop trước.')
  return py
}

/** Chạy đoạn mã Python ngắn (vd. kiểm tra import); trả về kết quả để đọc lỗi "No module named". */
export const pyRun = (code: string, timeoutMs = 120000) => runCapture(requirePython(), ['-c', code], timeoutMs)

export async function pipInstall(pkgs: string[], log: (m: string) => void, note = ''): Promise<void> {
  log(note || `Đang cài: ${pkgs.join(', ')} ...`)
  const r = await runCapture(requirePython(), ['-m', 'pip', 'install', ...pkgs], 30 * 60 * 1000)
  if (r.code !== 0) throw new Error(`Cài ${pkgs.join(', ')} thất bại: ` + r.stderr.slice(-400))
}

/** Bảo đảm import được `check`; thiếu thì cài `pkgs` (lần đầu). Kết quả được nhớ trong phiên. */
const ready = new Set<string>()
export async function ensurePython(check: string, pkgs: string[], log: (m: string) => void, note = ''): Promise<void> {
  if (ready.has(check)) return
  if ((await pyRun(check)).code !== 0) {
    await pipInstall(pkgs, log, note)
    const r = await pyRun(check)
    if (r.code !== 0) throw new Error('Thư viện Python chưa chạy được: ' + r.stderr.trim().split('\n').slice(-2).join(' | '))
  }
  ready.add(check)
}
