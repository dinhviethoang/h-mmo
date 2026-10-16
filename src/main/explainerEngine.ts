import { app, BrowserWindow, ipcMain, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { spawn, ChildProcess } from 'child_process'
import { engineScript, ffmpegPath, ffprobePath, unpacked } from './tools'
import { makeGoiSachAudio, cancelGoiSach } from './goiSachEngine'

// Dây chuyền "Video vẽ tay" (whiteboard explainer): giọng đọc → phân cảnh → hình → layout + compose.
// Các script Python ở engines/wb-explainer, chạy bằng python venv srt-whiteboard.
export type ExplainerSettings = { scriptDir: string; videoRoot: string; imageDir: string; python: string; voice: string; receiverPort: number }
export type ExplainerStep = 'audio' | 'storyboard' | 'images' | 'render-long' | 'short-storyboard' | 'render-short'

const defaults: ExplainerSettings = {
  scriptDir: 'C:/Users/HOANGDV/Projects/GoiSach/kich-ban',
  videoRoot: 'C:/Users/HOANGDV/Videos/H-MMO/GoiSach',
  imageDir: 'C:/Users/HOANGDV/Videos/H-MMO/GoiSach/hinh',
  python: 'C:/Users/HOANGDV/tools/srt-whiteboard-animation/.venv/Scripts/python.exe',
  voice: 'vieneu:default',
  receiverPort: 8765
}
const settingsFile = () => path.join(app.getPath('userData'), 'explainer-settings.json')
export function loadSettings(): ExplainerSettings {
  try { return { ...defaults, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) } } catch { return { ...defaults } }
}
function saveSettings(s: Partial<ExplainerSettings>) {
  const next = { ...loadSettings(), ...s }
  fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2), 'utf8')
  return next
}

const engineDir = () => engineScript('wb-explainer')
const vidOf = (script: string) => 'v' + (path.basename(script).match(/\d{2}/)?.[0] || '00')
function paths(script: string, s = loadSettings()) {
  const name = path.basename(script, path.extname(script)), vid = vidOf(script), work = path.join(s.videoRoot, name), sb = path.join(work, 'storyboard')
  return {
    vid, name, audio: path.join(work, 'audio'),
    storyboard: path.join(sb, `${vid}.json`), layout: path.join(sb, `${vid}-layout.json`),
    short: path.join(sb, `${vid}-short.json`), shortLayout: path.join(sb, `${vid}-short-layout.json`),
    outLong: path.join(s.videoRoot, `explainer-${vid}`), outShort: path.join(s.videoRoot, `short-${vid}`)
  }
}

function pyEnv(s: ExplainerSettings): NodeJS.ProcessEnv {
  const dirs = [path.dirname(ffmpegPath()), path.dirname(ffprobePath())]
  return {
    ...process.env, PATH: [process.env.PATH || '', ...dirs].join(path.delimiter), PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8',
    WB_IMAGE_DIR: s.imageDir, WB_SRT_PY: s.python, WB_RECEIVER_PORT: String(s.receiverPort),
    WB_HAND: unpacked(path.join(app.getAppPath(), 'resources', 'goisach', 'hand-goisach.png'))
  }
}

let active: ChildProcess | null = null, receiver: ChildProcess | null = null, busy = false, cancelled = false
const killTree = (p: ChildProcess | null) => { if (p?.pid) spawn('taskkill', ['/PID', String(p.pid), '/T', '/F'], { windowsHide: true }) }

function runPy(win: BrowserWindow, args: string[], step: string): Promise<string> {
  const s = loadSettings()
  if (!fs.existsSync(s.python)) return Promise.reject(new Error(`Không tìm thấy Python: ${s.python}`))
  return new Promise((resolve, reject) => {
    const p = spawn(s.python, args, { cwd: engineDir(), env: pyEnv(s), windowsHide: true }); active = p
    let out = '', tail = '', buf = ''
    const onLine = (line: string) => {
      const m = line.match(/^\[\[PROGRESS\]\]\s+(\d+)\/(\d+)\s*(.*)$/)
      if (m) win.webContents.send('explainer:progress', { step, done: +m[1], total: +m[2], message: m[3] })
      else win.webContents.send('explainer:log', line)
    }
    const feed = (d: Buffer) => { const t = d.toString('utf8'); out += t; tail = (tail + t).slice(-1500); buf += t; const lines = buf.split(/\r?\n/); buf = lines.pop() || ''; lines.forEach(onLine) }
    p.stdout?.on('data', feed); p.stderr?.on('data', feed)
    p.on('error', e => { active = null; reject(e) })
    p.on('close', c => { if (buf) onLine(buf); active = null; c === 0 ? resolve(out) : reject(new Error(cancelled ? 'Đã dừng.' : tail.trim().slice(-700) || `python thoát mã ${c}`)) })
  })
}

function checkImages(win: BrowserWindow | null, storyboard: string): Promise<{ total: number; present: string[]; missing: { name: string; desc: string; scene: number }[] } | null> {
  const s = loadSettings()
  if (!fs.existsSync(storyboard) || !fs.existsSync(s.python)) return Promise.resolve(null)
  return new Promise(resolve => {
    const p = spawn(s.python, ['check_images.py', storyboard], { cwd: engineDir(), env: pyEnv(s), windowsHide: true })
    let out = ''; p.stdout.on('data', d => out += d)
    p.on('error', () => resolve(null))
    p.on('close', () => { try { resolve(JSON.parse(out.trim().split(/\r?\n/).pop() || '')) } catch { win?.webContents.send('explainer:log', 'Không đọc được trạng thái ảnh'); resolve(null) } })
  })
}

export function listScripts() {
  const dir = loadSettings().scriptDir
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile() && e.name.endsWith('.md')).map(e => ({ file: path.join(dir, e.name), name: e.name, vid: vidOf(e.name) }))
}

const countFiles = (dir: string, re: RegExp) => fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => re.test(f)).length : 0
const sceneCount = (file: string) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')).scenes.length as number } catch { return 0 } }
const fileOrNull = (f: string) => fs.existsSync(f) ? f : null

export async function getStatus(win: BrowserWindow | null, script: string) {
  const p = paths(script)
  return {
    ...p,
    audioLong: countFiles(p.audio, /^long-\d+\.mp3$/), audioShort: countFiles(p.audio, /^short-\d+\.mp3$/),
    storyboardScenes: sceneCount(p.storyboard), shortScenes: sceneCount(p.short),
    images: await checkImages(win, p.storyboard),
    hasLayout: fs.existsSync(p.layout), hasShortLayout: fs.existsSync(p.shortLayout),
    videoLong: fileOrNull(path.join(p.outLong, 'explainer-logo.mp4')) || fileOrNull(path.join(p.outLong, 'explainer.mp4')),
    videoShort: fileOrNull(path.join(p.outShort, 'explainer-logo.mp4')) || fileOrNull(path.join(p.outShort, 'explainer.mp4')),
    receiverRunning: !!receiver, busy
  }
}

export async function runStep(win: BrowserWindow, script: string, step: ExplainerStep) {
  if (busy) throw new Error('Đang chạy một bước khác, hãy đợi hoặc bấm Dừng.')
  busy = true; cancelled = false
  const s = loadSettings(), p = paths(script, s)
  const need = (f: string, msg: string) => { if (!fs.existsSync(f)) throw new Error(msg) }
  try {
    if (step === 'audio') {
      await makeGoiSachAudio(script, s.videoRoot, s.voice, (pct, m) => win.webContents.send('explainer:progress', { step, done: pct, total: 100, message: m }))
    } else if (step === 'storyboard') {
      await runPy(win, ['make_storyboard.py', script, p.vid, p.storyboard], step)
    } else if (step === 'images') {
      need(p.storyboard, 'Chưa có phân cảnh — chạy bước 2 trước.')
      await runPy(win, ['genbatch.py', p.storyboard], step)
    } else if (step === 'render-long') {
      need(p.storyboard, 'Chưa có phân cảnh — chạy bước 2 trước.')
      if (!countFiles(p.audio, /^long-\d+\.mp3$/)) throw new Error('Chưa có giọng đọc — chạy bước 1 trước.')
      await runPy(win, ['layout.py', p.storyboard, p.audio, p.layout], step)
      await runPy(win, ['compose.py', p.layout, p.outLong], step)
    } else if (step === 'short-storyboard') {
      need(p.storyboard, 'Chưa có phân cảnh bản dài — chạy bước 2 trước (Short dùng lại hình của bản dài).')
      await runPy(win, ['make_short_storyboard.py', script, p.storyboard, p.short], step)
      // phân cảnh mới -> cảnh đã dựng cũ không còn đúng; cất thư mục cũ (không xoá) để lần dựng sau làm lại từ đầu
      if (fs.existsSync(p.outShort)) {
        const stamp = new Date().toISOString().slice(0, 16).replace(/\D/g, '')
        fs.renameSync(p.outShort, `${p.outShort}-cu-${stamp}`)
        win.webContents.send('explainer:log', `Đã cất video Short cũ vào ${path.basename(p.outShort)}-cu-${stamp}`)
      }
    } else if (step === 'render-short') {
      if (!fs.existsSync(p.short)) {  // chưa có phân cảnh Short thì tự viết trước
        need(p.storyboard, 'Chưa có phân cảnh bản dài — chạy bước 2 trước (Short dùng lại hình của bản dài).')
        await runPy(win, ['make_short_storyboard.py', script, p.storyboard, p.short], step)
      }
      if (!countFiles(p.audio, /^short-\d+\.mp3$/)) throw new Error('Chưa có giọng đọc Short — chạy bước 1 trước.')
      await runPy(win, ['short_layout.py', p.short, p.audio, p.shortLayout], step)
      await runPy(win, ['compose.py', p.shortLayout, p.outShort], step)
    }
  } finally { busy = false }
  return getStatus(win, script)
}

function startReceiver(win: BrowserWindow) {
  if (receiver) return true
  const s = loadSettings()
  if (!fs.existsSync(s.python)) throw new Error(`Không tìm thấy Python: ${s.python}`)
  const p = spawn(s.python, ['receiver.py'], { cwd: engineDir(), env: pyEnv(s), windowsHide: true }); receiver = p
  const log = (d: Buffer) => d.toString('utf8').split(/\r?\n/).filter(Boolean).forEach(l => win.webContents.send('explainer:log', `[Muse] ${l}`))
  p.stdout?.on('data', log); p.stderr?.on('data', log)
  p.on('close', () => { if (receiver === p) receiver = null; win.webContents.send('explainer:receiver', false) })
  return true
}
function stopReceiver() { killTree(receiver); receiver = null; return false }

export function setupExplainerEngine(win: BrowserWindow) {
  ipcMain.handle('explainer:settings', () => loadSettings())
  ipcMain.handle('explainer:saveSettings', (_e, s: Partial<ExplainerSettings>) => saveSettings(s))
  ipcMain.handle('explainer:listScripts', () => listScripts())
  ipcMain.handle('explainer:status', (_e, script: string) => getStatus(win, script))
  ipcMain.handle('explainer:run', (_e, script: string, step: ExplainerStep) => runStep(win, script, step))
  ipcMain.handle('explainer:cancel', () => { cancelled = true; killTree(active); active = null; cancelGoiSach(); return true })
  ipcMain.handle('explainer:receiver', (_e, on: boolean) => on ? startReceiver(win) : stopReceiver())
  ipcMain.handle('explainer:open', (_e, target: string) => shell.openPath(target))
  app.on('before-quit', () => { killTree(receiver); killTree(active) })
}
