import { protocol } from 'electron'
import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'

// Giao thức hmmo-media://f/<đường dẫn đã encodeURIComponent> để phát video/âm thanh
// trên máy trong app. Hỗ trợ Range (tua video) — giao thức local:// cũ không có.

export const MEDIA_SCHEME = 'hmmo-media'

const TYPES: Record<string, string> = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.mkv': 'video/x-matroska', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp'
}

export function registerMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, async (req) => {
    try {
      const raw = req.url.slice(`${MEDIA_SCHEME}://f/`.length).split('?')[0]
      const file = decodeURIComponent(raw)
      if (!fs.existsSync(file)) return new Response('Not found: ' + file, { status: 404 })
      const size = fs.statSync(file).size
      const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream'
      const range = req.headers.get('range')
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range)
        let start = m && m[1] ? parseInt(m[1]) : 0
        let end = m && m[2] ? parseInt(m[2]) : size - 1
        if (!m || !m[1]) { start = Math.max(0, size - (m && m[2] ? parseInt(m[2]) : size)); end = size - 1 }
        end = Math.min(end, size - 1)
        const body = Readable.toWeb(fs.createReadStream(file, { start, end })) as any
        return new Response(body, {
          status: 206,
          headers: {
            'Content-Type': type, 'Accept-Ranges': 'bytes',
            'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1)
          }
        })
      }
      const body = Readable.toWeb(fs.createReadStream(file)) as any
      return new Response(body, { status: 200, headers: { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': String(size) } })
    } catch (e: any) {
      return new Response(String(e?.message || e), { status: 500 })
    }
  })
}
