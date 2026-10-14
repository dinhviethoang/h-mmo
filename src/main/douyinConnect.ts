import { app, BrowserWindow, ipcMain, session } from 'electron'
import fs from 'fs'
import path from 'path'

// Cookie Douyin "1 chạm": mở douyin.com trong một cửa sổ riêng của H-MMO,
// người dùng lướt / đăng nhập rồi đóng cửa sổ -> lưu cookie ra file Netscape
// (cookies.txt) để yt-dlp dùng. Không phải export cookie bằng tiện ích Chrome.

const PARTITION = 'persist:hmmo-douyin'

export function douyinCookiePath(): string {
  return path.join(app.getPath('userData'), 'douyin-cookies.txt')
}

function toNetscape(cookies: Electron.Cookie[]): string {
  const lines = ['# Netscape HTTP Cookie File', '# Tạo bởi H-MMO', '']
  for (const c of cookies) {
    const domain = c.domain || ''
    if (!domain.includes('douyin.com')) continue
    const includeSub = domain.startsWith('.') ? 'TRUE' : 'FALSE'
    const expires = c.session || !c.expirationDate ? 0 : Math.floor(c.expirationDate)
    lines.push(
      [domain, includeSub, c.path || '/', c.secure ? 'TRUE' : 'FALSE', expires, c.name, c.value].join('\t')
    )
  }
  return lines.join('\n') + '\n'
}

function status(): { exists: boolean; path: string; savedAt: number | null } {
  const p = douyinCookiePath()
  if (!fs.existsSync(p)) return { exists: false, path: p, savedAt: null }
  return { exists: true, path: p, savedAt: fs.statSync(p).mtimeMs }
}

export function setupDouyinConnect(parent: BrowserWindow): void {
  ipcMain.handle('douyin:cookieStatus', () => status())

  ipcMain.handle(
    'douyin:connect',
    () =>
      new Promise((resolve) => {
        const win = new BrowserWindow({
          width: 1100,
          height: 760,
          parent,
          title: 'Kết nối Douyin — lướt vài video rồi ĐÓNG cửa sổ này',
          autoHideMenuBar: true,
          webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false }
        })
        win.loadURL('https://www.douyin.com/').catch(() => {})

        win.on('close', async () => {
          try {
            const all = await session.fromPartition(PARTITION).cookies.get({})
            const dy = all.filter((c) => (c.domain || '').includes('douyin.com'))
            if (dy.length === 0) {
              resolve({ ok: false, error: 'Chưa có cookie Douyin. Hãy đợi trang tải xong rồi mới đóng.' })
              return
            }
            fs.writeFileSync(douyinCookiePath(), toNetscape(dy), 'utf8')
            resolve({ ok: true, count: dy.length, ...status() })
          } catch (e: any) {
            resolve({ ok: false, error: e?.message || String(e) })
          }
        })
      })
  )
}
