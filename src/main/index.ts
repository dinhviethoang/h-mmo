import { app, shell, BrowserWindow, ipcMain, protocol } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { configureFluentFfmpeg } from './tools'
import { setupVideoEngine } from './videoEngine'
import { setupSubtitleEngine } from './subtitleEngine'
import { setupDubbingEngine } from './dubbingEngine'
import { setupAutoShortsEngine } from './autoshortsEngine'
import { setupAutoComicIPC, startAutoComicServer } from './autoComicTool'
import { setupDouyinConnect } from './douyinConnect'
import { setupVoiceEngine } from './voiceEngine'
import { setupTransformEngine } from './transformEngine'
import { registerMediaProtocol } from './mediaProtocol'
import { setupWorkspace } from './workspace'
import { setupOcrEngine } from './ocrEngine'
import { setupSystemEngine, hookLogs } from './systemEngine'
import { setupDownloadEngine } from './downloadEngine'
import { setupFontLibrary } from './subtitleBurn'
import { setupDubFit } from './dubFit'
import { setupAssembleEngine } from './assembleEngine'
import { setupReviewEngine } from './reviewEngine'

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    title: 'H-MMO',
    icon,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false // cho phép trang gọi API dịch/Gemini và phát file trên máy
    }
  })
  mainWindow.maximize()
  mainWindow.on('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
  // Dev: nạp từ máy chủ electron-vite (HMR); bản đóng gói: nạp file html
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  return mainWindow
}

/** Các IPC nhỏ dùng chung (đọc file SRT, danh sách giọng NeeyuVoice, quét link). */
function setupCommonIpc(): void {
  ipcMain.handle('read-file', (_e, filePath: string) => {
    try { return fs.readFileSync(filePath, 'utf8') } catch { return null }
  })
  ipcMain.handle('get-neeyu-voices', () => {
    try {
      const voicesDir = path.join(os.homedir(), 'AppData', 'Roaming', 'NeeyuVoice', 'voices')
      if (!fs.existsSync(voicesDir)) return []
      return fs.readdirSync(voicesDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    } catch { return [] }
  })
  ipcMain.handle('scan-url', async (_e, url: string) => {
    const ytdl = require('youtube-dl-exec')
    return ytdl(url, { dumpSingleJson: true, flatPlaylist: true, noWarnings: true, noCheckCertificate: true })
  })
}

// Giao thức phát file trên máy trong app (hmmo-media://) phải đăng ký trước khi app sẵn sàng
protocol.registerSchemesAsPrivileged([
  { scheme: 'hmmo-media', privileges: { bypassCSP: true, supportFetchAPI: true, stream: true } }
])

// Chỉ cho chạy 1 cửa sổ H-MMO: mở lần 2 thì đưa cửa sổ đang chạy lên trước thay vì chạy thêm bản nữa
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}
app.on('second-instance', () => {
  const w = BrowserWindow.getAllWindows()[0]
  if (w) {
    if (w.isMinimized()) w.restore()
    w.show()
    w.focus()
  }
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.hmmo.studio')
  // F12 mở DevTools khi dev, chặn Ctrl+R khi đã đóng gói
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  configureFluentFfmpeg()
  registerMediaProtocol()
  setupWorkspace()
  setupCommonIpc()

  const mainWindow = createWindow()
  hookLogs(mainWindow) // gom log mọi tab cho tab Hệ thống
  setupVideoEngine(mainWindow)
  setupSubtitleEngine(mainWindow)
  setupDubbingEngine(mainWindow)
  setupDubFit(mainWindow)
  setupAutoShortsEngine(mainWindow)
  setupAutoComicIPC(mainWindow)
  setupDouyinConnect(mainWindow)
  setupVoiceEngine(mainWindow)
  setupTransformEngine(mainWindow)
  setupOcrEngine(mainWindow)
  setupSystemEngine(mainWindow)
  setupDownloadEngine(mainWindow)
  setupFontLibrary(mainWindow)
  setupAssembleEngine(mainWindow)
  setupReviewEngine(mainWindow)
  startAutoComicServer()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
