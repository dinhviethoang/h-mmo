import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import { spawn, spawnSync } from 'child_process'
import { ffmpegPath, pythonExe, engineScript, ensurePython } from './tools'

// Giọng đọc VieNeu-TTS (Apache-2.0, chạy CPU) + thư viện giọng clone.
// voiceId dùng trong app:
//   'vieneu:preset:<mã giọng>'  -> giọng có sẵn
//   'vieneu:clone:<tên>'        -> giọng clone, mẫu lưu tại userData/hmmo-voices/<tên>.wav

const ttsScript = () => engineScript('tts_vieneu.py')
export const cloneDir = () => path.join(app.getPath('userData'), 'hmmo-voices')
const presetCache = () => path.join(app.getPath('userData'), 'vieneu-presets.json')
const previewDir = () => path.join(app.getPath('temp'), 'hmmo-voice-preview')

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 60)
}

type Log = (msg: string) => void

/** Cài VieNeu vào .venv-hmmo nếu chưa có (chỉ lần đầu). */
const ensureVieneu = (log: Log) => ensurePython('import vieneu', ['-U', 'vieneu'], log, 'Đang cài VieNeu-TTS lần đầu (1-3 phút)...')

/** Chạy tts_vieneu.py, đọc các dòng STATUS/PROGRESS/ITEM/VOICES/DONE/ERROR. */
function runTts(args: string[], log: Log, onLine?: (kind: string, value: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(pythonExe(), [ttsScript(), ...args], {
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    })
    let buf = ''
    let done = ''
    let err = ''
    p.stdout.on('data', (d: Buffer) => {
      buf += d.toString('utf8')
      const lines = buf.split(/\r?\n/)
      buf = lines.pop() || ''
      for (const line of lines) {
        const i = line.indexOf(' ')
        const kind = i < 0 ? line : line.slice(0, i)
        const value = i < 0 ? '' : line.slice(i + 1)
        if (kind === 'STATUS') log(value)
        else if (kind === 'DONE') done = value
        else if (kind === 'ERROR') err = value
        onLine?.(kind, value)
      }
    })
    p.stderr.on('data', (d: Buffer) => {
      const t = d.toString('utf8')
      if (/Error|Traceback/.test(t)) err = err || t.trim().slice(-500)
    })
    p.on('error', reject)
    p.on('close', (code) => (code === 0 && done ? resolve(done) : reject(new Error(err || `TTS thoát với mã ${code}`))))
  })
}

/** Chuyển voiceId -> tham số dòng lệnh cho tts_vieneu.py */
function voiceArgs(voiceId: string): string[] {
  if (voiceId.startsWith('vieneu:clone:')) {
    const wav = path.join(cloneDir(), safeName(voiceId.slice('vieneu:clone:'.length)) + '.wav')
    if (!fs.existsSync(wav)) throw new Error('Không tìm thấy mẫu giọng clone: ' + wav)
    return ['--ref', wav]
  }
  if (voiceId.startsWith('vieneu:preset:')) return ['--voice', voiceId.slice('vieneu:preset:'.length)]
  return []
}

/** Tạo giọng cho nhiều câu, mỗi câu 1 file 0001.wav, 0002.wav... trong outDir. Dùng cho lồng tiếng. */
export async function vieneuBatch(texts: string[], voiceId: string, outDir: string, log: Log): Promise<void> {
  await ensureVieneu(log)
  fs.mkdirSync(outDir, { recursive: true })
  const list = path.join(outDir, 'texts.json')
  fs.writeFileSync(list, JSON.stringify(texts), 'utf8')
  const started = Date.now()
  await runTts(['batch', '--texts', list, '--outdir', outDir, ...voiceArgs(voiceId)], log, (kind, value) => {
    if (kind !== 'ITEM') return
    const n = parseInt(value)
    const per = (Date.now() - started) / 1000 / n
    log(`[VieNeu ${n}/${texts.length}] ✓ (~${Math.round(per * (texts.length - n))}s còn lại)`)
  })
}

async function listPresets(log: Log): Promise<{ label: string; id: string }[]> {
  if (fs.existsSync(presetCache())) return JSON.parse(fs.readFileSync(presetCache(), 'utf8'))
  await ensureVieneu(log)
  let voices: { label: string; id: string }[] = []
  await runTts(['list'], log, (kind, value) => {
    if (kind === 'VOICES') voices = JSON.parse(value)
  })
  if (voices.length) fs.writeFileSync(presetCache(), JSON.stringify(voices), 'utf8')
  return voices
}

function listClones(): { name: string; file: string; createdAt: number }[] {
  if (!fs.existsSync(cloneDir())) return []
  return fs
    .readdirSync(cloneDir())
    .filter((f) => f.toLowerCase().endsWith('.wav'))
    .map((f) => {
      const file = path.join(cloneDir(), f)
      return { name: f.slice(0, -4), file, createdAt: fs.statSync(file).mtimeMs }
    })
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function setupVoiceEngine(mainWindow: BrowserWindow): void {
  const log: Log = (msg) => mainWindow.webContents.send('voice:log', msg)

  ipcMain.handle('voice:list', async () => {
    let presets: { label: string; id: string }[] = []
    let error = ''
    try {
      presets = await listPresets(log)
    } catch (e: any) {
      error = e.message
    }
    return { presets, clones: listClones(), error }
  })

  ipcMain.handle('voice:pickAudio', async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Âm thanh / Video', extensions: ['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg', 'mp4', 'mkv', 'mov', 'webm'] }]
    })
    return r.canceled ? null : r.filePaths[0]
  })

  // Tạo giọng clone: cắt đoạn mẫu (mặc định 8 giây) từ file âm thanh/video, mono 24 kHz.
  ipcMain.handle('voice:addClone', async (_e, opts: { name: string; source: string; start?: number; duration?: number }) => {
    const name = safeName(opts.name || '')
    if (!name) throw new Error('Hãy đặt tên cho giọng.')
    if (!opts.source || !fs.existsSync(opts.source)) throw new Error('Chưa chọn file mẫu giọng.')
    fs.mkdirSync(cloneDir(), { recursive: true })
    const out = path.join(cloneDir(), name + '.wav')
    const dur = Math.min(Math.max(opts.duration || 8, 3), 15)
    const r = spawnSync(
      ffmpegPath(),
      ['-y', '-ss', String(Math.max(0, opts.start || 0)), '-t', String(dur), '-i', opts.source, '-vn', '-ac', '1', '-ar', '24000', out],
      { windowsHide: true }
    )
    if (r.status !== 0 || !fs.existsSync(out)) throw new Error('Không cắt được mẫu giọng: ' + String(r.stderr).slice(-300))
    log(`Đã lưu giọng clone "${name}".`)
    return { name, file: out }
  })

  ipcMain.handle('voice:deleteClone', async (_e, name: string) => {
    const f = path.join(cloneDir(), safeName(name) + '.wav')
    if (fs.existsSync(f)) fs.unlinkSync(f)
    return true
  })

  // Nghe thử: trả về đường dẫn file wav vừa tạo
  ipcMain.handle('voice:preview', async (_e, opts: { voiceId: string; text: string }) => {
    await ensureVieneu(log)
    fs.mkdirSync(previewDir(), { recursive: true })
    const out = path.join(previewDir(), `preview_${Date.now()}.wav`)
    log('Đang tạo giọng nghe thử...')
    await runTts(['say', '--text', opts.text, '--out', out, ...voiceArgs(opts.voiceId)], log)
    log('Xong.')
    return out
  })
}
