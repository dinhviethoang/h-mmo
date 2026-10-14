import { BrowserWindow, ipcMain, dialog, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { ffmpegPath, pythonExe, engineScript, ensurePython } from './tools'
import { GoogleGenAI } from '@google/genai'
import { workspaceDir } from './workspace'
import { googleTranslateSrt } from './translate'
import { findAndCallModel, cleanMarkdown } from './subtitleEngine'

// Tab "Đọc chữ video": lấy phụ đề cứng (chữ in trên hình) thành .srt bằng RapidOCR, rồi dịch (tuỳ chọn).


type OcrOptions = {
  video: string
  region: { x: number; y: number; w: number; h: number } // phần trăm
  fps: number
  minScore: number
  translate: 'none' | 'google' | 'gemini'
  apiKey?: string
}

const ensureRapidOcr = (log: (m: string) => void) =>
  ensurePython('import rapidocr_onnxruntime, numpy', ['rapidocr-onnxruntime', 'numpy'], log, 'Đang cài RapidOCR lần đầu (~60 MB)...')

export function setupOcrEngine(win: BrowserWindow): void {
  const log = (m: string) => win.webContents.send('ocr:log', m)

  ipcMain.handle('ocr:pickVideo', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Video', extensions: ['mp4', 'mkv', 'mov', 'webm', 'avi', 'flv'] }] })
    return r.canceled ? [] : r.filePaths
  })
  ipcMain.handle('ocr:reveal', (_e, f: string) => { if (f && fs.existsSync(f)) shell.showItemInFolder(f); return true })

  ipcMain.handle('ocr:run', async (_e, o: OcrOptions) => {
    await ensureRapidOcr(log)
    const name = path.parse(o.video).name
    const dir = workspaceDir('phude')
    const out = path.join(dir, `${name}_ocr.srt`)
    const r = o.region
    log(`Đọc chữ: ${path.basename(o.video)}`)
    await new Promise<void>((resolve, reject) => {
      const p = spawn(pythonExe(), [
        engineScript('ocr_srt.py'), '--input', o.video, '--out', out, '--ffmpeg', ffmpegPath(),
        '--region', [r.x, r.y, r.w, r.h].map((v) => v.toFixed(2)).join(','), '--fps', String(o.fps || 4), '--min-score', String(o.minScore || 0.6)
      ], { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } })
      let err = '', buf = '', last = -10
      p.stdout.on('data', (d: Buffer) => {
        buf += d.toString('utf8')
        const lines = buf.split(/\r?\n/)
        buf = lines.pop() || ''
        for (const l of lines) {
          if (l.startsWith('STATUS ')) log(l.slice(7))
          else if (l.startsWith('PROGRESS ')) { const v = parseInt(l.slice(9)); if (v - last >= 10 || v === 100) { last = v; log(`Đọc chữ: ${v}%`) } }
          else if (l.startsWith('ERROR ')) err = l.slice(6)
        }
      })
      p.stderr.on('data', (d: Buffer) => { const t = d.toString(); if (/Error|Traceback/.test(t)) err = err || t.slice(-400) })
      p.on('error', reject)
      p.on('close', (c) => (c === 0 && fs.existsSync(out) ? resolve() : reject(new Error('Đọc chữ lỗi: ' + (err || 'mã ' + c)))))
    })
    log(`Đã lưu phụ đề gốc: ${out}`)
    const result: { srt: string; vi?: string } = { srt: out }

    if (o.translate !== 'none') {
      const src = fs.readFileSync(out, 'utf8')
      const viPath = path.join(dir, `${name}_ocr_vi.srt`)
      if (o.translate === 'google') {
        log('Đang dịch sang tiếng Việt bằng Google (miễn phí)...')
        fs.writeFileSync(viPath, await googleTranslateSrt(src, 'vi', log), 'utf8')
      } else {
        if (!o.apiKey) throw new Error('Chưa có API Key Gemini (nhập ở tab Tạo phụ đề).')
        log('Đang dịch sang tiếng Việt bằng Gemini...')
        const ai = new GoogleGenAI({ apiKey: o.apiKey })
        const prompt = `Translate the following SRT subtitle file into natural, contextual Vietnamese. Keep the exact sequence numbers, timestamps and line structure. Only translate the text. Output ONLY raw SRT.\n\n${src}`
        fs.writeFileSync(viPath, cleanMarkdown(await findAndCallModel(ai, o.apiKey, prompt, log, 'Dịch phụ đề OCR')), 'utf8')
      }
      log(`Đã lưu phụ đề tiếng Việt: ${viPath}`)
      result.vi = viPath
    }
    log('====== HOÀN TẤT ======')
    return result
  })
}
