import { ipcMain, dialog, BrowserWindow, shell } from 'electron'
import ffmpeg from 'fluent-ffmpeg'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { workspaceDir } from './workspace'
import { buildAss, fontsDir } from './subtitleBurn'
import { probeMedia, filterPath } from './tools'

// Lấy kích thước khung hình thật (có xét video quay dọc bằng metadata rotate)
function probeSize(file: string): { w: number; h: number } {
  const m = probeMedia(file)
  return { w: m.w || 1080, h: m.h || 1920 }
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
      const { videoPath, dubbedAudioPath, srtPath, blurRegions, subStyle, assCues, burnStyle, bgVolume = 0.15, dubVolume = 1.0, fontSize = 32, textColor = '#ffffff', borderColor = '#000000', borderWidth = 2, addBg = false, fontFamily = 'Arial', flipVideo = false, applySubtitles = true, previewMode = false } = options
      
      const parsedPath = path.parse(videoPath)
      // Bản hoàn thành -> H-MMO › 4. Hoàn thành; bản xem trước -> thư mục tạm
      const outPath = previewMode
        ? path.join(app.getPath('temp'), `${parsedPath.name}_preview${parsedPath.ext}`)
        : path.join(workspaceDir('hoanthanh'), `${parsedPath.name}_final${parsedPath.ext}`)
      
      let command = ffmpeg(videoPath)
      
      if (previewMode) {
        command = command.setDuration(15); // only 15 seconds for preview
      }

      const fpath = filterPath
      const { w: VW, h: VH } = probeSize(videoPath)
      const filterChain: string[] = []
      let cur = '0:v'
      let n = 0

      // 1. Vùng che: làm mờ thật (gblur), xoá logo (delogo) hoặc che đen; có thể giới hạn theo thời gian
      if (blurRegions && Array.isArray(blurRegions) && blurRegions.length) {
        blurRegions.forEach((region: any) => {
          let x = Math.round((VW * Number(region.x || 0)) / 100)
          let y = Math.round((VH * Number(region.y || 0)) / 100)
          let w = Math.max(8, Math.round((VW * Number(region.w || 0)) / 100))
          let h = Math.max(8, Math.round((VH * Number(region.h || 0)) / 100))
          x = Math.min(Math.max(0, x), VW - 8)
          y = Math.min(Math.max(0, y), VH - 8)
          w = Math.min(w, VW - x)
          h = Math.min(h, VH - y)
          const a = Number(region.from), b = Number(region.to)
          const en = region.from !== '' && region.from != null && region.to !== '' && region.to != null && b > a ? `:enable='between(t,${a},${b})'` : ''
          const mode = region.mode || 'blur'
          if (mode === 'delogo') {
            // delogo không cho chạm mép khung
            const dx = Math.max(1, x), dy = Math.max(1, y)
            const dw = Math.min(w, VW - dx - 2), dh = Math.min(h, VH - dy - 2)
            if (dw < 4 || dh < 4) return
            filterChain.push(`[${cur}]delogo=x=${dx}:y=${dy}:w=${dw}:h=${dh}${en}[r${n}]`)
          } else if (mode === 'black') {
            filterChain.push(`[${cur}]drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=black@1:t=fill${en}[r${n}]`)
          } else {
            const sigma = Math.max(2, Math.round(Number(region.intensity || 10) * Math.max(VW, VH) / 640))
            filterChain.push(`[${cur}]split=2[m${n}][c${n}]`)
            filterChain.push(`[c${n}]crop=${w}:${h}:${x}:${y},gblur=sigma=${sigma}:steps=2[b${n}]`)
            filterChain.push(`[m${n}][b${n}]overlay=${x}:${y}${en}[r${n}]`)
          }
          cur = `r${n}`
          n++
        })
      }

      const vFilters: string[] = []
      // 2. Lật ngang (sau vùng che, trước phụ đề để chữ không bị lật)
      if (flipVideo) vFilters.push('hflip')

      // 3. Phụ đề
      if (applySubtitles && Array.isArray(assCues) && assCues.length && burnStyle) {
        // Phụ đề có kiểu: file .ass dựng sẵn (đã ngắt dòng theo độ rộng thật, có hiệu ứng từng từ)
        const dir = path.join(app.getPath('temp'), 'hmmo-sub')
        fs.mkdirSync(dir, { recursive: true })
        const assFile = path.join(dir, `sub_${Date.now()}.ass`)
        fs.writeFileSync(assFile, '\ufeff' + buildAss(assCues, burnStyle, VW, VH), 'utf8')
        const fd = fontsDir()
        vFilters.push(`subtitles=filename='${fpath(assFile)}'${fs.existsSync(fd) ? `:fontsdir='${fpath(fd)}'` : ''}`)
      } else if (applySubtitles && srtPath && fs.existsSync(srtPath)) {
        const hexToAss = (hex: string, alpha: string = '00') => {
          const clean = hex.replace('#', '')
          if (clean.length !== 6) return '&H00FFFFFF'
          return `&H${alpha}${clean.substring(4, 6)}${clean.substring(2, 4)}${clean.substring(0, 2)}`
        }
        let alignment = '2', marginV = '20'
        if (subStyle === 'center') { alignment = '5'; marginV = '0' } else if (subStyle === 'top') { alignment = '8' }
        const font = String(fontFamily).split(',')[0].replace(/["']/g, '').trim() || 'Arial'
        const style = `FontName=${font},Alignment=${alignment},MarginV=${marginV},FontSize=${fontSize},PrimaryColour=${hexToAss(textColor)},OutlineColour=${hexToAss(borderColor)},BackColour=${hexToAss('#000000', '80')},BorderStyle=${addBg ? '3' : '1'},Outline=${addBg ? '0' : borderWidth},Shadow=0,Bold=-1`
        vFilters.push(`subtitles='${fpath(srtPath)}':force_style='${style}'`)
      }

      let videoPad = '0:v'
      if (vFilters.length) {
        filterChain.push(`[${cur}]${vFilters.join(',')}[vout]`)
        videoPad = '[vout]'
      } else if (cur !== '0:v') {
        filterChain.push(`[${cur}]null[vout]`)
        videoPad = '[vout]'
      }

      let outputOptions: string[] = ['-y'];

      if (dubbedAudioPath && fs.existsSync(dubbedAudioPath)) {
        command = command.input(dubbedAudioPath)
          .inputOptions([
            '-f', 's16le',
            '-ar', '24000',
            '-ac', '1'
          ]);
          
        filterChain.push(`[0:a]volume=${Math.max(0, Math.min(2, Number(bgVolume)))}[bg]`);
        filterChain.push(`[1:a]volume=${Math.max(0, Math.min(3, Number(dubVolume)))}[dub]`);
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
          // bản xem trước được phát ngay trong tab (không mở trình phát ngoài)
          if (!previewMode && !options.noReveal) shell.showItemInFolder(outPath);
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
