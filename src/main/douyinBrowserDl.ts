import { BrowserWindow, session } from 'electron'
import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'

// Tải Douyin KHÔNG cần yt-dlp:
// mở trang video trong cửa sổ ẩn (dùng chung phiên/cookie với nút "Kết nối Douyin"),
// đọc dữ liệu video mà chính trang Douyin tải về (API aweme/detail hoặc RENDER_DATA),
// lấy link mp4 gốc rồi tải thẳng bằng phiên đó.

const PARTITION = 'persist:hmmo-douyin'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

const withTimeout = <T>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))])

export const isDouyinUrl = (u: string): boolean => /(^|\.)douyin\.com\/|iesdouyin\.com\//i.test(u)

type Cand = { url: string; height: number; h265: boolean; size: number }
export type DyInfo = { id: string; title: string; author: string; cands: Cand[]; mediaUrls: string[] }

export type DyProgress = (u: { status?: string; percent?: number; speed?: string; eta?: string }) => void

function videoIdOf(u: string): string | null {
  const m = u.match(/modal_id=(\d+)/) || u.match(/\/(?:video|note)\/(\d+)/)
  return m ? m[1] : null
}

/** Gom các link chất lượng từ object aweme (định dạng API web của Douyin) */
function candsFromAweme(aw: any): Cand[] {
  const out: Cand[] = []
  const v = aw?.video
  if (!v) return out
  for (const br of v.bit_rate || []) {
    const pa = br.play_addr || {}
    for (const url of pa.url_list || []) {
      out.push({ url, height: Number(pa.height || v.height || 0), h265: !!(br.is_h265 || br.is_bytevc1), size: Number(pa.data_size || 0) })
    }
  }
  for (const key of ['play_addr', 'play_addr_h264', 'download_addr']) {
    const pa = v[key]
    for (const url of pa?.url_list || []) {
      out.push({ url, height: Number(pa.height || v.height || 0), h265: key === 'play_addr' && !!v.is_h265, size: Number(pa.data_size || 0) })
    }
  }
  // bỏ link có watermark (playwm) nếu đã có link khác
  const clean = out.filter((c) => !/playwm/.test(c.url))
  return (clean.length ? clean : out).map((c) => ({ ...c, url: c.url.replace(/^http:/, 'https:') }))
}

/** Tìm đệ quy object aweme có id đúng trong 1 khối JSON bất kỳ */
function findAweme(obj: any, id: string, depth = 0): any {
  if (!obj || typeof obj !== 'object' || depth > 12) return null
  if ((obj.aweme_id === id || obj.awemeId === id) && obj.video) return obj
  if (obj.aweme_detail && obj.aweme_detail.video) return obj.aweme_detail
  for (const k of Object.keys(obj)) {
    const r = findAweme(obj[k], id, depth + 1)
    if (r) return r
  }
  return null
}

/** Dữ liệu SSR trong trang (RENDER_DATA) – kiểu field khác API: playApi / bitRateList */
function candsFromRender(aw: any): Cand[] {
  const out: Cand[] = []
  const v = aw?.video
  if (!v) return out
  for (const br of v.bitRateList || v.bitrateInfo || []) {
    for (const p of br.playAddr || []) if (p?.src) out.push({ url: p.src, height: Number(br.height || v.height || 0), h265: !!br.isH265, size: Number(br.dataSize || 0) })
  }
  for (const p of v.playAddr || []) if (p?.src) out.push({ url: p.src, height: Number(v.height || 0), h265: false, size: 0 })
  if (v.playApi) out.push({ url: v.playApi, height: Number(v.height || 0), h265: false, size: 0 })
  return out.map((c) => ({ ...c, url: c.url.startsWith('//') ? 'https:' + c.url : c.url.replace(/^http:/, 'https:') }))
}

export async function probeDouyin(pageUrl: string, log: (m: string) => void, isCancelled: () => boolean = () => false, timeoutMs = 40000): Promise<DyInfo> {
  const id0 = videoIdOf(pageUrl)
  const target = id0 ? `https://www.douyin.com/video/${id0}` : pageUrl
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    show: false,
    title: 'Douyin – nếu hiện ô xác minh, hãy làm xác minh rồi đợi app tự tải',
    autoHideMenuBar: true,
    webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  })
  win.webContents.setAudioMuted(true)
  win.webContents.setUserAgent(UA)

  let info: DyInfo | null = null
  const mediaUrls = new Set<string>()
  const pending = new Map<string, string>() // requestId -> url (API cần đọc body)
  const dbg = win.webContents.debugger

  const finish = (aw: any, cands: Cand[], idFound: string): void => {
    if (info || !cands.length) return
    info = {
      id: idFound,
      title: String(aw?.desc || aw?.preview_title || '').trim(),
      author: String(aw?.author?.nickname || aw?.authorInfo?.nickname || '').trim(),
      cands,
      mediaUrls: [...mediaUrls]
    }
  }

  try {
    dbg.attach('1.3')
    await withTimeout(dbg.sendCommand('Network.enable', { maxResourceBufferSize: 20e6, maxTotalBufferSize: 60e6 }), 3000, null)
  } catch {
    /* debugger không gắn được -> vẫn còn cách đọc RENDER_DATA */
  }
  dbg.on('message', async (_e: unknown, method: string, params: any) => {
    try {
      if (method === 'Network.responseReceived') {
        const u: string = params.response?.url || ''
        const mime: string = params.response?.mimeType || ''
        if (/\/aweme\/v1\/web\/aweme\/detail|\/aweme\/v1\/web\/aweme\/post|\/web\/api\/v2\/aweme\/iteminfo/.test(u)) pending.set(params.requestId, u)
        if (/^video\//.test(mime) || /douyinvod\.com|\/aweme\/v1\/play\//.test(u)) mediaUrls.add(u)
      } else if (method === 'Network.loadingFinished' && pending.has(params.requestId)) {
        pending.delete(params.requestId)
        const r: any = await withTimeout(dbg.sendCommand('Network.getResponseBody', { requestId: params.requestId }), 5000, null)
        if (!r) return
        const body = r.base64Encoded ? Buffer.from(r.body, 'base64').toString('utf8') : r.body
        const j = JSON.parse(body)
        const id = id0 || ''
        const aw = j.aweme_detail || (id ? findAweme(j, id) : (j.aweme_list || [])[0])
        if (aw) finish(aw, candsFromAweme(aw), aw.aweme_id || id)
      }
    } catch {
      /* bỏ qua gói lỗi */
    }
  })

  const readRender = async (): Promise<void> => {
    if (info) return
    try {
      if (win.isDestroyed()) return
      const res: any = await withTimeout(win.webContents.executeJavaScript(
        `(() => {
          const id = (location.href.match(/modal_id=(\\d+)/) || location.href.match(/\\/(?:video|note)\\/(\\d+)/) || [])[1] || '';
          const el = document.getElementById('RENDER_DATA');
          let data = null;
          if (el) { try { data = JSON.parse(decodeURIComponent(el.textContent)); } catch (e) {} }
          const vids = [...document.querySelectorAll('video source, video')].map(v => v.src || v.currentSrc).filter(s => s && !s.startsWith('blob:'));
          const desc = (document.querySelector('[data-e2e="video-desc"]') || {}).innerText || document.title;
          const captcha = !!document.querySelector('#captcha_container, .captcha_verify_container, iframe[src*="verify"]');
          return { id, data, vids, desc, captcha, href: location.href };
        })()`,
        true
      ), 4000, null)
      if (res?.captcha && !win.isVisible()) {
        log('Douyin yêu cầu xác minh (captcha) – đã mở cửa sổ, hãy làm xác minh. App sẽ tự tải tiếp.')
        win.show()
      }
      const id = id0 || res?.id || ''
      if (res?.data && id) {
        const aw = findAweme(res.data, id)
        if (aw) {
          const c = candsFromRender(aw).concat(candsFromAweme(aw))
          finish({ desc: aw.desc, author: aw.authorInfo || aw.author }, c, id)
        }
      }
      if (!info && res?.vids?.length) {
        finish({ desc: res.desc }, res.vids.map((url: string) => ({ url: url.startsWith('//') ? 'https:' + url : url, height: 0, h265: false, size: 0 })), id)
      }
    } catch {
      /* trang chưa sẵn sàng */
    }
  }

  try {
    // KHÔNG chờ loadURL xong: trang Douyin tải liên tục nên sự kiện "xong" có thể không bao giờ đến
    log('Đang mở trang video Douyin...')
    win.loadURL(target, { userAgent: UA, httpReferrer: 'https://www.douyin.com/' }).catch(() => {})
    const t0 = Date.now()
    let shownHint = false
    while (!info && Date.now() - t0 < timeoutMs) {
      if (isCancelled()) throw new Error('Đã huỷ')
      if (win.isDestroyed()) break
      await new Promise((r) => setTimeout(r, 1000))
      await readRender()
      // sau 20s vẫn chưa có -> có thể đang bị xác minh: cho người dùng thấy cửa sổ
      if (!info && !shownHint && Date.now() - t0 > 20000) {
        shownHint = true
        if (!win.isVisible()) {
          log('Douyin chưa trả dữ liệu – mở cửa sổ để bạn kiểm tra (xác minh / đăng nhập nếu được hỏi).')
          win.show()
        }
        timeoutMs = Math.max(timeoutMs, 120000)
      }
    }
    if (!info && mediaUrls.size) {
      finish({ desc: '' }, [...mediaUrls].map((url) => ({ url, height: 0, h265: false, size: 0 })), id0 || '')
    }
  } finally {
    try { dbg.detach() } catch { /* */ }
    if (!win.isDestroyed()) win.destroy()
  }
  if (!info) throw new Error('Không lấy được link video từ trang Douyin (hết thời gian chờ).')
  return info
}

function pickCand(cands: Cand[], quality: string): Cand[] {
  const maxH = quality === 'best' ? 1e9 : Number(quality) || 1e9
  const score = (c: Cand): number => (c.height && c.height <= maxH ? c.height : c.height ? -c.height : 0) * 10 + (c.h265 ? 0 : 5) + c.size / 1e9
  const uniq = [...new Map(cands.map((c) => [c.url, c])).values()]
  return uniq.sort((a, b) => score(b) - score(a))
}

const safeName = (s: string): string =>
  s.replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 140) || 'douyin'

const fmtSpeed = (bps: number): string =>
  bps > 1048576 ? (bps / 1048576).toFixed(1) + 'MiB/s' : (bps / 1024).toFixed(0) + 'KiB/s'
const fmtEta = (s: number): string => (isFinite(s) && s >= 0 ? `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '')

/** Tải 1 video Douyin. Trả về đường dẫn file, hoặc null nếu đã có (bỏ qua). */
export async function downloadDouyin(opts: {
  url: string
  outDir: string
  template: string
  index: number
  quality: string
  skipDownloaded: boolean
  onProgress: DyProgress
  log: (m: string) => void
  isCancelled: () => boolean
}): Promise<string | null> {
  const { outDir, onProgress, log } = opts
  const archive = path.join(outDir, '.hmmo-da-tai.txt')
  const id0 = videoIdOf(opts.url)
  if (opts.skipDownloaded && id0 && fs.existsSync(archive) && fs.readFileSync(archive, 'utf8').includes(`douyin ${id0}`)) return null

  onProgress({ status: 'downloading', percent: 0 })
  const info = await probeDouyin(opts.url, log, opts.isCancelled)
  const id = info.id || id0 || String(Date.now())
  const title = info.title || `Douyin ${id}`
  let base: string
  switch (opts.template) {
    case 'id': base = id; break
    case 'uploader_title': base = `${info.author || 'douyin'} - ${title}`; break
    case 'index_title': base = `${String(opts.index + 1).padStart(3, '0')} - ${title}`; break
    case 'date_title': base = `${new Date().toISOString().slice(0, 10)} - ${title}`; break
    default: base = title
  }
  const file = path.join(outDir, safeName(base) + '.mp4')
  const ses = session.fromPartition(PARTITION)
  const ranked = pickCand(info.cands, opts.quality)
  log(`Đã lấy được ${ranked.length} link video${ranked[0]?.height ? ` (tốt nhất ${ranked[0].height}p${ranked[0].h265 ? ' H.265' : ''})` : ''}. Đang tải...`)
  const list = ranked.map((c) => c.url).concat(info.mediaUrls)
  let lastErr = ''
  for (const link of [...new Set(list)]) {
    if (opts.isCancelled()) throw new Error('Đã huỷ')
    try {
      const ac = new AbortController()
      let stallTimer = setTimeout(() => ac.abort(), 30000) // 30s không có phản hồi -> bỏ link này
      const res = await ses.fetch(link, { headers: { Referer: 'https://www.douyin.com/', 'User-Agent': UA, Range: 'bytes=0-' }, signal: ac.signal })
      if (!res.ok || !res.body) { clearTimeout(stallTimer); lastErr = `HTTP ${res.status}`; log(`Link bị từ chối (HTTP ${res.status}), thử link khác...`); continue }
      const ct = res.headers.get('content-type') || ''
      if (/text|json|html/.test(ct)) { clearTimeout(stallTimer); lastErr = `link trả về ${ct}`; continue }
      const total = Number(res.headers.get('content-length') || 0)
      const tmp = file + '.part'
      let got = 0, lastT = Date.now(), lastGot = 0
      const src = Readable.fromWeb(res.body as any)
      src.on('data', (chunk: Buffer) => {
        clearTimeout(stallTimer)
        stallTimer = setTimeout(() => ac.abort(), 30000) // 30s không nhận thêm dữ liệu -> coi như đứng
        got += chunk.length
        const now = Date.now()
        if (now - lastT > 500) {
          const bps = ((got - lastGot) * 1000) / (now - lastT)
          lastT = now; lastGot = got
          onProgress({ status: 'downloading', percent: total ? (got / total) * 100 : undefined, speed: fmtSpeed(bps), eta: total ? fmtEta((total - got) / Math.max(bps, 1)) : '' })
        }
        if (opts.isCancelled()) src.destroy(new Error('Đã huỷ'))
      })
      try {
        await pipeline(src, fs.createWriteStream(tmp))
      } finally {
        clearTimeout(stallTimer)
      }
      if (got < 50 * 1024) { fs.rmSync(tmp, { force: true }); lastErr = 'file tải về quá nhỏ'; continue }
      fs.renameSync(tmp, file)
      if (opts.skipDownloaded) fs.appendFileSync(archive, `douyin ${id}\n`)
      onProgress({ status: 'downloading', percent: 100 })
      return file
    } catch (e: any) {
      if (opts.isCancelled()) throw new Error('Đã huỷ')
      lastErr = /abort/i.test(String(e?.name || e?.message)) ? 'quá 30 giây không nhận được dữ liệu' : e?.message || String(e)
      log(`Link lỗi (${lastErr}), thử link khác...`)
    }
  }
  throw new Error(`Đã lấy được link nhưng tải thất bại (${lastErr}).`)
}
