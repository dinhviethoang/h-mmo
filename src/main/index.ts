import { app, shell, BrowserWindow, ipcMain, protocol, net, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

function createWindow(): BrowserWindow {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false // allow local:// protocol
    }
  })

  mainWindow.maximize()

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

import { setupVideoEngine } from './videoEngine'
import { setupSubtitleEngine } from './subtitleEngine'
import { setupDubbingEngine } from './dubbingEngine'

// Register custom protocol as privileged before app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'local', privileges: { bypassCSP: true, supportFetchAPI: true, stream: true } }
])

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  protocol.handle('local', (request) => {
    // Simply swap the scheme. The renderer already encodes the URI properly (e.g. %23 for #)
    const fileUrl = request.url.replace('local://', 'file://')
    return net.fetch(fileUrl, { bypassCustomProtocolHandlers: true })
  })

  ipcMain.handle('select-video', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Videos', extensions: ['mp4', 'mkv', 'avi', 'mov'] }]
    })
    if (!canceled) {
      return filePaths[0]
    }
    return null
  })

  ipcMain.handle('select-srt', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Subtitles', extensions: ['srt'] }]
    })
    if (!canceled) {
      return filePaths[0]
    }
    return null
  })

  ipcMain.handle('read-file', async (_, filePath) => {
    try {
      const fs = require('fs');
      return fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      return null;
    }
  })

  ipcMain.handle('get-neeyu-voices', async () => {
    try {
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      const voicesDir = path.join(os.homedir(), 'AppData', 'Roaming', 'NeeyuVoice', 'voices');
      if (!fs.existsSync(voicesDir)) return [];
      const dirents = fs.readdirSync(voicesDir, { withFileTypes: true });
      return dirents.filter(dirent => dirent.isDirectory()).map(dirent => dirent.name);
    } catch (e) {
      return [];
    }
  })

  ipcMain.handle('scan-url', async (_, url: string) => {
    try {
      const ytdl = require('youtube-dl-exec');
      const output = await ytdl(url, {
        dumpSingleJson: true,
        flatPlaylist: true,
        noWarnings: true,
        noCallHome: true,
        noCheckCertificate: true,
        extractorArgs: 'youtube:player_client=android'
      });
      return output;
    } catch (e: any) {
      console.error('Error scanning URL:', e);
      throw e;
    }
  })

  ipcMain.handle('download-videos', async (event, urls: string[], savePath: string, cookie: string) => {
    try {
      const { exec } = require('youtube-dl-exec');
      const path = require('path');
      let downloaded = 0;
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        try {
          const args: any = {
            output: path.join(savePath, '%(title)s.%(ext)s'),
            noWarnings: true,
            noCheckCertificate: true,
            format: 'bestvideo+bestaudio/best',
            extractorArgs: 'youtube:player_client=android'
          };
          if (cookie && cookie !== 'none') {
            if (cookie.endsWith('.txt')) {
              args.cookies = cookie;
            } else {
              args.cookiesFromBrowser = cookie;
            }
          }
          
          event.sender.send('download-progress', `Chuẩn bị tải video ${i+1}/${urls.length}...`);
          
          const subprocess = exec(url, args);
          subprocess.stdout.on('data', (data: any) => {
            const str = data.toString();
            const progressMatch = str.match(/\[download\]\s+([\d.]+%)/);
            const speedMatch = str.match(/at\s+([a-zA-Z0-9.\/]+)/);
            if (progressMatch) {
               const progress = progressMatch[1];
               const speed = speedMatch ? speedMatch[1] : '';
               event.sender.send('download-progress', `Đang tải video ${i+1}/${urls.length}... ${progress} ${speed ? '('+speed+')' : ''}`);
            }
          });
          
          await new Promise((resolve, reject) => {
             let errorLog = '';
             subprocess.stderr.on('data', (data: any) => {
                errorLog += data.toString();
             });
             subprocess.on('close', (code: number) => {
                if (code === 0) resolve(true);
                else {
                  // extract ERROR: message if possible
                  const match = errorLog.match(/ERROR:\s*(.*)/);
                  const msg = match ? match[1] : errorLog || `Process exited with code ${code}`;
                  reject(new Error(msg.trim()));
                }
             });
          });
          
          downloaded++;
          event.sender.send('download-progress', `Tải xong video ${i+1}/${urls.length}!`);
        } catch (err: any) {
          console.error(`Failed to download ${url}:`, err);
          event.sender.send('download-progress', `Lỗi tải video ${i+1}: ${err.message}`);
        }
      }
      return { success: true, downloaded };
    } catch (e: any) {
      console.error('Error downloading videos:', e);
      return { success: false, error: e.message };
    }
  })

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  const mainWindow = createWindow()
  setupVideoEngine(mainWindow)
  setupSubtitleEngine(mainWindow)
  setupDubbingEngine(mainWindow)

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
