import { ipcMain, dialog, BrowserWindow } from 'electron'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import path from 'path'
import fs from 'fs'

// Set path for ffmpeg static binary
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic.replace('app.asar', 'app.asar.unpacked'))
}

export function setupVideoEngine(mainWindow: BrowserWindow) {
  // Select Video/Audio File
  ipcMain.handle('dialog:openVideo', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Media Files', extensions: ['mp4', 'mkv', 'webm', 'mov', 'mp3', 'wav', 'flac', 'm4a'] }]
    })
    if (!canceled) return filePaths[0]
    return null
  })

  // Select Directory
  ipcMain.handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })
    if (!canceled) return filePaths[0]
    return null
  })

  // Select File
  ipcMain.handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Text Files', extensions: ['txt'] }]
    })
    if (!canceled) return filePaths[0]
    return null
  })

  // Select SRT File
  ipcMain.handle('dialog:openSrt', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Subtitles', extensions: ['srt'] }]
    })
    if (!canceled) return filePaths[0]
    return null
  })

  // Export Video Process
  ipcMain.handle('video:process', async (_event, options) => {
    return new Promise((resolve, reject) => {
      const { videoPath, srtPath, blurRegions, subStyle, fontSize = 32, textColor = '#ffffff', borderColor = '#000000', borderWidth = 2, addBg = false, fontFamily = 'Arial' } = options
      
      const parsedPath = path.parse(videoPath)
      const outPath = path.join(parsedPath.dir, `${parsedPath.name}_final${parsedPath.ext}`)
      
      let command = ffmpeg(videoPath)
      let complexFilter: string[] = []

      // 1. Blur Logic
      if (blurRegions && Array.isArray(blurRegions)) {
        blurRegions.forEach((region) => {
          // Region is defined by x, y, w, h in percentages
          // We use delogo to apply blur
          const fw = `max(iw*${region.w}/100\\,10)`
          const fh = `max(ih*${region.h}/100\\,10)`
          complexFilter.push(`delogo=x='iw*${region.x}/100':y='ih*${region.y}/100':w='${fw}':h='${fh}'`)
        })
      }

      // Helper to convert #RRGGBB to ASS color &H00BBGGRR
      const hexToAss = (hex: string, alpha: string = '00') => {
        const clean = hex.replace('#', '')
        if (clean.length !== 6) return '&H00FFFFFF'
        const r = clean.substring(0, 2)
        const g = clean.substring(2, 4)
        const b = clean.substring(4, 6)
        return `&H${alpha}${b}${g}${r}`
      }

      // 2. Hardsub Logic
      if (srtPath && fs.existsSync(srtPath)) {
        // Normalize path for FFmpeg filter
        const srtClean = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:')
        
        let alignment = '2' // Bottom center
        let marginV = '20'
        
        if (subStyle === 'center') { alignment = '5'; marginV = '0'; }
        else if (subStyle === 'top') { alignment = '8'; marginV = '20'; }

        const assTextColor = hexToAss(textColor)
        const assBorderColor = hexToAss(borderColor)
        const assBgColor = hexToAss('#000000', '80') // Semi-transparent black if background is active
        
        const borderStyleVal = addBg ? '3' : '1'
        const outlineVal = addBg ? '0' : borderWidth.toString()

        const style = `FontName=${fontFamily},Alignment=${alignment},MarginV=${marginV},FontSize=${fontSize},PrimaryColour=${assTextColor},OutlineColour=${assBorderColor},BackColour=${assBgColor},BorderStyle=${borderStyleVal},Outline=${outlineVal},Shadow=0,Bold=-1`
        const subFilter = `subtitles='${srtClean}':force_style='${style}'`
        complexFilter.push(subFilter)
      }

      if (complexFilter.length > 0) {
        command = command.videoFilters(complexFilter)
      }


      command.output(outPath)
        .on('start', (cmdline) => {
          console.log('Spawned Ffmpeg with command: ' + cmdline)
          mainWindow.webContents.send('video:log', 'Đang bắt đầu tiến trình xuất video...')
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            mainWindow.webContents.send('video:log', `Đang xử lý: ${progress.percent.toFixed(1)}%`)
          }
        })
        .on('end', () => {
          mainWindow.webContents.send('video:log', '====== XUẤT VIDEO HOÀN TẤT ======')
          mainWindow.webContents.send('video:log', `Đã lưu tại: ${outPath}`)
          resolve(outPath)
        })
        .on('error', (err) => {
          console.error('Error processing video', err)
          mainWindow.webContents.send('video:log', `[LỖI] ${err.message}`)
          reject(err)
        })
        .run()
    })
  })
}
