import { BrowserWindow, ipcMain, net, clipboard } from 'electron'
import fs from 'fs'
import crypto from 'crypto'
import { ffmpegPath, pythonExe, ytdlpPath, runCapture } from './tools'
import { workspaceRoot } from './workspace'

// Tab "Hệ thống": trạng thái công cụ, cập nhật yt-dlp, nhật ký lỗi gom từ mọi tab.

type LogLine = { t: number; ch: string; msg: string }
const LOGS: LogLine[] = []
const MAX_LOGS = 3000

/** Gom mọi dòng log mà các tab gửi lên giao diện (kênh *:log, download-progress) vào 1 chỗ. */
export function hookLogs(win: BrowserWindow): void {
  const orig = win.webContents.send.bind(win.webContents)
  ;(win.webContents as any).send = (channel: string, ...args: any[]) => {
    if ((channel.endsWith(':log') || channel === 'download-progress') && typeof args[0] === 'string') {
      const line = { t: Date.now(), ch: channel.replace(/:log$/, ''), msg: args[0] }
      LOGS.push(line)
      if (LOGS.length > MAX_LOGS) LOGS.splice(0, LOGS.length - MAX_LOGS)
      orig('logs:new', line)
    }
    return orig(channel, ...args)
  }
}


// Chạy bất đồng bộ + song song: trước đây spawnSync làm đứng cả app tới ~1 phút khi mở tab Hệ thống.
async function firstLine(cmd: string, args: string[]): Promise<string> {
  const r = await runCapture(cmd, args, 15000)
  if (r.code !== 0) return ''
  return (r.stdout || r.stderr).split(/\r?\n/)[0].trim()
}

async function pythonStatus(): Promise<{ python: string; modules: Record<string, string | null> }> {
  const py = pythonExe()
  if (!fs.existsSync(py)) return { python: '', modules: {} }
  const code = [
    'import json, importlib',
    'out = {}',
    "for m in ['faster_whisper', 'rapidocr_onnxruntime', 'vieneu', 'audio_separator']:",
    '    try:',
    '        mod = importlib.import_module(m); out[m] = getattr(mod, "__version__", "có")',
    '    except Exception:',
    '        out[m] = None',
    'print(json.dumps(out))'
  ].join('\n')
  const [python, r] = await Promise.all([firstLine(py, ['--version']), runCapture(py, ['-c', code], 60000)])
  let modules: Record<string, string | null> = {}
  try { modules = JSON.parse(r.stdout.trim().split('\n').pop() || '{}') } catch { /* bỏ qua */ }
  return { python, modules }
}

async function status() {
  const [ytdlp, ffmpeg, py] = await Promise.all([firstLine(ytdlpPath(), ['--version']), firstLine(ffmpegPath(), ['-version']), pythonStatus()])
  return {
    app: { electron: process.versions.electron, node: process.versions.node, workspace: workspaceRoot() },
    ytdlp,
    ffmpeg: ffmpeg.replace(/Copyright.*$/, '').trim(),
    python: py.python,
    modules: py.modules
  }
}

async function updateYtdlp(log: (m: string) => void): Promise<string> {
  const base = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/'
  const name = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
  log('Đang lấy mã kiểm tra SHA-256 từ GitHub...')
  const sums = await (await net.fetch(base + 'SHA2-256SUMS')).text()
  const line = sums.split('\n').find((l) => l.trim().endsWith(' ' + name))
  if (!line) throw new Error('Không tìm thấy mã kiểm tra cho ' + name)
  const expected = line.split(/\s+/)[0].toLowerCase()
  log('Đang tải yt-dlp mới nhất (~18 MB)...')
  const r = await net.fetch(base + name)
  if (!r.ok) throw new Error('Tải yt-dlp lỗi HTTP ' + r.status)
  const buf = Buffer.from(await r.arrayBuffer())
  const got = crypto.createHash('sha256').update(buf).digest('hex')
  if (got !== expected) throw new Error('File tải về không khớp mã SHA-256, đã huỷ.')
  const target = ytdlpPath()
  const tmp = target + '.new'
  fs.writeFileSync(tmp, buf)
  if (fs.existsSync(target)) fs.copyFileSync(target, target + '.bak')
  fs.renameSync(tmp, target)
  const v = firstLine(target, ['--version'])
  log(`Đã cập nhật yt-dlp: ${v} (đã kiểm tra SHA-256).`)
  return v
}

export function setupSystemEngine(win: BrowserWindow): void {
  const log = (m: string) => win.webContents.send('system:log', m)
  ipcMain.handle('system:status', () => status())
  ipcMain.handle('system:updateYtdlp', () => updateYtdlp(log))
  ipcMain.handle('logs:get', () => LOGS)
  ipcMain.handle('logs:clear', () => { LOGS.length = 0; return true })
  ipcMain.handle('logs:copy', (_e, text: string) => { clipboard.writeText(text); return true })
}
