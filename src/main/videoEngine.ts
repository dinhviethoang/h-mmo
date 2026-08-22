import { ipcMain, dialog, BrowserWindow, shell } from 'electron'
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
      const { videoPath, dubbedAudioPath, srtPath, blurRegions, subStyle, fontSize = 32, textColor = '#ffffff', borderColor = '#000000', borderWidth = 2, addBg = false, fontFamily = 'Arial', flipVideo = false, applySubtitles = true, previewMode = false } = options
      
      const parsedPath = path.parse(videoPath)
      const outPath = previewMode 
        ? path.join(parsedPath.dir, `${parsedPath.name}_preview${parsedPath.ext}`)
        : path.join(parsedPath.dir, `${parsedPath.name}_final${parsedPath.ext}`)
      
      let command = ffmpeg(videoPath)
      
      if (previewMode) {
        command = command.setDuration(15); // only 15 seconds for preview
      }
      let vFilters: string[] = []

      // 1. Blur Logic
      if (blurRegions && Array.isArray(blurRegions)) {
        blurRegions.forEach((region) => {
          // Region is defined by x, y, w, h in percentages
          // We use delogo to apply blur
          const fw = `max(iw*${region.w}/100\\,10)`
          const fh = `max(ih*${region.h}/100\\,10)`
          vFilters.push(`delogo=x='iw*${region.x}/100':y='ih*${region.y}/100':w='${fw}':h='${fh}'`)
        })
      }

      // 2. Flip Logic
      if (flipVideo) {
        vFilters.push('hflip')
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
      if (applySubtitles && srtPath && fs.existsSync(srtPath)) {
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
        vFilters.push(subFilter)
      }

      let filterChain: string[] = [];
      let videoPad = '0:v';
      
      if (vFilters.length > 0) {
        filterChain.push(`[0:v]${vFilters.join(',')}[vout]`);
        videoPad = '[vout]';
      }

      let outputOptions: string[] = ['-y'];

      if (dubbedAudioPath && fs.existsSync(dubbedAudioPath)) {
        command = command.input(dubbedAudioPath)
          .inputOptions([
            '-f', 's16le',
            '-ar', '24000',
            '-ac', '1'
          ]);
          
        filterChain.push('[0:a]volume=0.15[bg]');
        filterChain.push('[1:a]volume=1.0[dub]');
        filterChain.push('[bg][dub]amix=inputs=2:duration=first[amix]');
        filterChain.push('[amix]alimiter=limit=-1.0dB[aout]');
        
        outputOptions.push('-map', videoPad, '-map', '[aout]', '-c:v', 'libx264', '-preset', 'fast', '-c:a', 'aac', '-b:a', '192k');
      } else {
        outputOptions.push('-map', videoPad, '-map', '0:a?', '-c:v', 'libx264', '-preset', 'fast', '-c:a', 'copy');
      }

      if (filterChain.length > 0) {
        command = command.complexFilter(filterChain);
      } else {
        // If NO filters at all, we don't need to re-encode video unless we want to, but we mapped it so we should.
      }


      command.output(outPath)
        .outputOptions(outputOptions)
        .on('start', (cmdline) => {
          console.log('Spawned Ffmpeg with command: ' + cmdline)
          mainWindow.webContents.send('video:log', 'Bắt đầu tiến trình xuất video...')
          mainWindow.webContents.send('video:log', `[CMD]: ${cmdline}`)
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            mainWindow.webContents.send('video:log', `Đang xử lý: ${progress.percent.toFixed(1)}%`)
          }
        })
        .on('end', () => {
          mainWindow.webContents.send('video:log', '====== XUẤT VIDEO HOÀN TẤT ======')
          mainWindow.webContents.send('video:log', `Đã lưu tại: ${outPath}`)
          if (previewMode) {
            shell.openPath(outPath);
          }
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
