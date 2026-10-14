import { BrowserWindow, ipcMain, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { spawn, ChildProcess } from 'child_process'
import { workspaceDir } from './workspace'
import { ffmpegPath, ytdlpPath } from './tools'
import { douyinCookiePath } from './douyinConnect'
import { isDouyinUrl, downloadDouyin } from './douyinBrowserDl'

// Hàng đợi tải video: chọn chất lượng, chỉ âm thanh, mẫu tên file, tải song song, nhúng ảnh bìa/metadata.


export type DlItem = { id: string; url: string; title?: string }
export type DlOptions = {
  savePath?: string
  cookie?: string
  quality: 'best' | '2160' | '1440' | '1080' | '720' | '480' | '360'
  mode: 'video' | 'audio'
  audioFormat: 'mp3' | 'm4a' | 'wav'
  template: string
  concurrency: number
  embedThumb: boolean
  embedMeta: boolean
  skipDownloaded: boolean
}

export const TEMPLATES: Record<string, string> = {
  title: '%(title).150B',
  uploader_title: '%(uploader).50B - %(title).120B',
  date_title: '%(upload_date>%Y-%m-%d)s - %(title).130B',
  index_title: '{N} - %(title).140B', // {N} = thứ tự trong hàng đợi
  id: '%(id)s'
}

function formatFor(o: DlOptions): string[] {
  if (o.mode === 'audio') return ['-f', 'ba/b', '-x', '--audio-format', o.audioFormat || 'mp3', '--audio-quality', '0']
  if (o.quality === 'best') return ['-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b', '--merge-output-format', 'mp4']
  const h = o.quality
  return ['-f', `bv*[height<=${h}][ext=mp4]+ba[ext=m4a]/bv*[height<=${h}]+ba/b[height<=${h}]/b`, '--merge-output-format', 'mp4']
}

export function buildArgs(item: DlItem, o: DlOptions, outDir: string, idx = 0): string[] {
  const tpl = (TEMPLATES[o.template] || TEMPLATES.title).replace('{N}', String(idx + 1).padStart(3, '0'))
  const a = [
    '--newline', '--progress', '--no-warnings', '--no-check-certificate', '--windows-filenames', '--no-playlist',
    '--ffmpeg-location', ffmpegPath(),
    '-o', path.join(outDir, `${tpl}.%(ext)s`),
    '--progress-template', 'download:PRG %(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
    '--print', 'after_move:FILE %(filepath)s',
    ...formatFor(o)
  ]
  if (o.embedThumb) a.push('--embed-thumbnail')
  if (o.embedMeta) a.push('--embed-metadata')
  if (o.skipDownloaded) a.push('--download-archive', path.join(outDir, '.hmmo-da-tai.txt'))
  const c = o.cookie
  if (c === 'douyin-app') a.push('--cookies', douyinCookiePath())
  else if (c && c !== 'none') a.push(...(c.endsWith('.txt') ? ['--cookies', c] : ['--cookies-from-browser', c]))
  a.push(item.url)
  return a
}

export function setupDownloadEngine(win: BrowserWindow): void {
  const procs = new Map<string, ChildProcess>()
  let cancelled = false
  const log = (m: string) => win.webContents.send('download-progress', m)
  const upd = (u: any) => win.webContents.send('download:item', u)

  const runOne = (item: DlItem, o: DlOptions, outDir: string, label: string, idx: number) =>
    new Promise<string | null>((resolve, reject) => {
      const p = spawn(ytdlpPath(), buildArgs(item, o, outDir, idx), { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } })
      procs.set(item.id, p)
      let file: string | null = null, err = '', buf = '', skipped = false
      const onLine = (l: string) => {
        const t = l.trim()
        if (t.startsWith('PRG ')) {
          const [pct, speed, eta] = t.slice(4).split('|').map((s) => s.trim())
          const v = parseFloat(pct)
          upd({ id: item.id, status: 'downloading', percent: isNaN(v) ? undefined : v, speed: speed === 'Unknown B/s' ? '' : speed, eta: eta === 'Unknown' ? '' : eta })
        } else if (t.startsWith('FILE ')) file = t.slice(5)
        else if (/has already been recorded in the archive/.test(t)) skipped = true
        else if (/\[(Merger|ExtractAudio|EmbedThumbnail|Metadata)\]/.test(t)) upd({ id: item.id, status: 'processing' })
      }
      p.stdout!.on('data', (d: Buffer) => {
        buf += d.toString('utf8')
        const lines = buf.split(/\r?\n/)
        buf = lines.pop() || ''
        lines.forEach(onLine)
      })
      // tiến độ có thể ra stderr khi yt-dlp ở chế độ quiet (do --print) -> đọc cả hai luồng
      let ebuf = ''
      p.stderr!.on('data', (d: Buffer) => {
        const s = d.toString('utf8')
        ebuf += s
        const lines = ebuf.split(/\r?\n/)
        ebuf = lines.pop() || ''
        for (const l of lines) { if (l.startsWith('PRG ')) onLine(l); else err += l + '\n' }
      })
      p.on('error', reject)
      p.on('close', (code) => {
        procs.delete(item.id)
        if (buf) onLine(buf)
        if (ebuf) err += ebuf
        if (cancelled) return reject(new Error('Đã huỷ'))
        if (code === 0) return resolve(skipped ? null : file)
        const m = err.match(/ERROR:\s*(.*)/)
        reject(new Error(friendly((m ? m[1] : err.trim().split('\n').pop()) || `yt-dlp thoát mã ${code}`)))
      })
      log(`${label} Bắt đầu: ${item.title || item.url}`)
    })

  // Douyin: tải qua trình duyệt ẩn của H-MMO (không cần yt-dlp). Lỗi thì thử lại bằng yt-dlp.
  const runDouyin = async (item: DlItem, o: DlOptions, outDir: string, label: string, idx: number): Promise<string | null> => {
    log(`${label} Bắt đầu (Douyin – trình duyệt H-MMO): ${item.title || item.url}`)
    let f: string | null
    try {
      f = await downloadDouyin({
        url: item.url, outDir, template: o.template, index: idx, quality: o.quality, skipDownloaded: o.skipDownloaded,
        onProgress: (u) => upd({ id: item.id, ...u }),
        log: (m) => log(`${label} ${m}`),
        isCancelled: () => cancelled
      })
    } catch (e: any) {
      if (cancelled) throw e
      log(`${label} Cách tải bằng trình duyệt lỗi: ${e.message} – thử lại bằng yt-dlp...`)
      return runOne(item, o, outDir, label, idx)
    }
    if (f && o.mode === 'audio') {
      upd({ id: item.id, status: 'processing' })
      const fmt = o.audioFormat || 'mp3'
      const out = f.replace(/\.mp4$/i, '.' + fmt)
      const codec = fmt === 'mp3' ? ['-c:a', 'libmp3lame', '-q:a', '0'] : fmt === 'm4a' ? ['-c:a', 'aac', '-b:a', '256k'] : ['-c:a', 'pcm_s16le']
      await new Promise<void>((res, rej) => {
        const p = spawn(ffmpegPath(), ['-y', '-i', f!, '-vn', ...codec, out], { windowsHide: true })
        p.on('error', rej)
        p.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg tách âm thanh thất bại'))))
      })
      fs.rmSync(f, { force: true })
      f = out
    }
    return f
  }

  ipcMain.handle('download:start', async (_e, items: DlItem[], o: DlOptions) => {
    cancelled = false
    const outDir = o.savePath && path.isAbsolute(o.savePath) ? o.savePath : workspaceDir('goc')
    fs.mkdirSync(outDir, { recursive: true })
    log(`Lưu tại: ${outDir} — ${items.length} mục, tải song song ${o.concurrency}, ${o.mode === 'audio' ? 'chỉ âm thanh ' + o.audioFormat : 'chất lượng ' + (o.quality === 'best' ? 'cao nhất' : o.quality + 'p')}`)
    items.forEach((it) => upd({ id: it.id, status: 'queued', percent: 0 }))
    let ok = 0, fail = 0, skip = 0, next = 0
    const worker = async () => {
      while (!cancelled && next < items.length) {
        const i = next++
        const it = items[i]
        const label = `[${i + 1}/${items.length}]`
        try {
          const f = isDouyinUrl(it.url) ? await runDouyin(it, o, outDir, label, i) : await runOne(it, o, outDir, label, i)
          if (f === null) { skip++; upd({ id: it.id, status: 'skipped', percent: 100 }); log(`${label} Đã tải trước đó, bỏ qua.`) }
          else { ok++; upd({ id: it.id, status: 'done', percent: 100, file: f }); log(`${label} Xong: ${f ? path.basename(f) : it.url}`) }
        } catch (e: any) {
          if (cancelled) { upd({ id: it.id, status: 'cancelled' }); continue }
          fail++
          upd({ id: it.id, status: 'error', error: e.message })
          log(`${label} LỖI: ${e.message}`)
        }
      }
    }
    await Promise.all(Array.from({ length: Math.max(1, Math.min(4, o.concurrency || 1)) }, worker))
    if (cancelled) items.slice(next).forEach((it) => upd({ id: it.id, status: 'cancelled' }))
    log(`====== Tải xong: ${ok} thành công${skip ? `, ${skip} bỏ qua` : ''}${fail ? `, ${fail} lỗi` : ''}${cancelled ? ' (đã huỷ)' : ''} ======`)
    return { ok, fail, skip, outDir, cancelled }
  })

  ipcMain.handle('download:cancel', () => {
    cancelled = true
    for (const p of procs.values()) {
      try { process.platform === 'win32' && p.pid ? spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true }) : p.kill() } catch { /* bỏ qua */ }
    }
    return true
  })
  ipcMain.handle('download:reveal', (_e, f: string) => {
    if (f && fs.existsSync(f)) shell.showItemInFolder(f)
    else shell.openPath(workspaceDir('goc'))
    return true
  })
}

function friendly(m: string): string {
  if (/Fresh cookies|cookies are needed|Sign in to confirm|login required/i.test(m)) return m + ' → Cần cookie: bấm "Kết nối Douyin" hoặc chọn trình duyệt ở mục Cookies.'
  if (/Requested format is not available/i.test(m)) return m + ' → Thử chọn chất lượng "Cao nhất".'
  if (/Unsupported URL|Unable to extract|HTTP Error 403/i.test(m)) return m + ' → Thử Cập nhật yt-dlp ở tab Hệ thống.'
  return m
}
