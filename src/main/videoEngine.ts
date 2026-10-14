import { ipcMain, dialog, BrowserWindow, shell } from 'electron'
import ffmpeg from 'fluent-ffmpeg'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { workspaceDir } from './workspace'
import { buildAss, fontsDir } from './subtitleBurn'
import { probeMedia, filterPath } from './tools'

type ExportExtras = {
  segments?: Array<{ start: number; end: number }>
  speed?: number
  aspect?: 'original' | '9:16' | '16:9' | '1:1' | '4:5'
  fitMode?: 'crop' | 'pad' | 'blur'
  bgm?: { path: string; volume?: number; loop?: boolean; fadeIn?: number; fadeOut?: number }
  originalVolume?: number
  quality?: 'fast' | 'balanced' | 'high'
}

/** Build the contract's post-effect filters. Kept pure for review/manual verification. */
export function buildExportFilters(options: ExportExtras, width: number, height: number, hasAudio: boolean, bgmInput = 1, sourceDuration = 0): string[] {
  const filters: string[] = []
  let video = 'vbase', audio = 'abase'
  const segments = options.segments?.filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start) || []
  if (segments.length) {
    filters.push(`[${video}]split=${segments.length}${segments.map((_, i) => `[vsrc${i}]`).join('')}`)
    filters.push(`[${audio}]asplit=${segments.length}${segments.map((_, i) => `[asrc${i}]`).join('')}`)
    segments.forEach((s, i) => {
      filters.push(`[vsrc${i}]trim=start=${s.start}:end=${s.end},setpts=PTS-STARTPTS[vcut${i}]`)
      filters.push(`[asrc${i}]atrim=start=${s.start}:end=${s.end},asetpts=PTS-STARTPTS[acut${i}]`)
    })
    filters.push(`${segments.map((_, i) => `[vcut${i}][acut${i}]`).join('')}concat=n=${segments.length}:v=1:a=1[vcat][acat]`)
    video = 'vcat'; audio = 'acat'
  }
  const speed = Math.max(0.5, Math.min(2, Number(options.speed) || 1))
  if (speed !== 1) {
    filters.push(`[${video}]setpts=PTS/${speed}[vsped]`); video = 'vsped'
    filters.push(`[${audio}]atempo=${speed}[asped]`); audio = 'asped'
  }
  const aspect = options.aspect || 'original'
  if (aspect !== 'original') {
    const sizes: Record<string, [number, number]> = { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1080, 1080], '4:5': [1080, 1350] }
    const [ow, oh] = sizes[aspect] || [width, height]
    const mode = options.fitMode || 'blur'
    if (mode === 'crop') filters.push(`[${video}]scale=${ow}:${oh}:force_original_aspect_ratio=increase,crop=${ow}:${oh}[vframe]`)
    else if (mode === 'pad') filters.push(`[${video}]scale=${ow}:${oh}:force_original_aspect_ratio=decrease,pad=${ow}:${oh}:(ow-iw)/2:(oh-ih)/2:black[vframe]`)
    else filters.push(`[${video}]split=2[vbg0][vfg0];[vbg0]scale=${ow}:${oh}:force_original_aspect_ratio=increase,crop=${ow}:${oh},gblur=sigma=30[ vbg ];[vfg0]scale=${ow}:${oh}:force_original_aspect_ratio=decrease[vfg];[vbg][vfg]overlay=(W-w)/2:(H-h)/2[vframe]`.replace('[ vbg ]', '[vbg]'))
    video = 'vframe'
  }
  if (hasAudio) {
    const volume = Math.max(0, Math.min(2, Number(options.originalVolume ?? 1)))
    if (volume !== 1) { filters.push(`[${audio}]volume=${volume}[avol]`); audio = 'avol' }
  }
  if (options.bgm?.path) {
    const b = options.bgm
    if (b.loop) filters.push(`[${bgmInput}:a]aloop=loop=-1:size=2147483647,asetpts=PTS-STARTPTS[bloop]`)
    const src = b.loop ? 'bloop' : `${bgmInput}:a`
    filters.push(`[${src}]volume=${Math.max(0, Math.min(1, Number(b.volume ?? 0.3)))}${Number(b.fadeIn) > 0 ? `,afade=t=in:st=0:d=${b.fadeIn}` : ''}[bgmvol]`)
    const out = Math.max(0, Number(b.fadeOut) || 0)
    const duration = (segments.length ? segments.reduce((sum, s) => sum + s.end - s.start, 0) : sourceDuration) / speed
    if (out && duration > 0) filters.push(`[bgmvol]afade=t=out:st=${Math.max(0, duration - out)}:d=${Math.min(out, duration)}[bgmfade]`)
    const bgm = out ? 'bgmfade' : 'bgmvol'
    filters.push(`[${audio}][${bgm}]amix=inputs=2:duration=first:normalize=0[aout]`)
  } else filters.push(`[${audio}]anull[aout]`)
  filters.push(`[${video}]null[vout]`)
  return filters
}

/** Pure post-effect ffmpeg plan shared by the IPC handler and manual integration checks. */
export function buildProcessPlan(options: ExportExtras, width: number, height: number, hasAudio: boolean, sourceDuration: number, previewMode = false, bgmInput = 1) {
  const filters = buildExportFilters(options, width, height, hasAudio, bgmInput, sourceDuration)
  const presets = { fast: ['veryfast', 23], balanced: ['fast', 20], high: ['slow', 18] } as const
  const hasExtras = !!(options.segments?.length || options.speed != null || (options.aspect && options.aspect !== 'original') || options.bgm || options.originalVolume != null || options.quality)
  const quality = options.quality || (hasExtras ? 'balanced' : 'fast')
  const [preset, crf] = presets[quality] || presets.balanced
  const outputOptions = ['-map', '[vout]', '-map', '[aout]', '-c:v', 'libx264', '-preset', preset]
  if (hasExtras) outputOptions.push('-crf', String(crf))
  outputOptions.push('-c:a', hasExtras ? 'aac' : 'copy')
  if (previewMode) outputOptions.push('-t', '15')
  const segments = options.segments?.length ? options.segments : [{ start: 0, end: sourceDuration }]
  const duration = Math.min(previewMode ? 15 : Infinity, segments.reduce((sum, s) => sum + Math.max(0, s.end - s.start), 0) / Math.max(0.5, Number(options.speed) || 1))
  return { filters, outputOptions, duration, hasExtras }
}

let activeCommand: { command: ReturnType<typeof ffmpeg>; cancel: () => void } | null = null

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

  ipcMain.handle('dialog:openAudio', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'], filters: [{ name: 'Audio Files', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'] }]
    })
    return canceled ? null : filePaths[0]
  })

  ipcMain.handle('video:cancel', () => {
    if (!activeCommand) return false
    activeCommand.cancel()
    return true
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
      let settled = false
      let wasCancelled = false
      activeCommand = { command, cancel: () => { wasCancelled = true; command.kill('SIGKILL') } }
      

      const fpath = filterPath
      const media = probeMedia(videoPath)
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

      let effectVideoPad = '0:v'
      if (vFilters.length) {
        filterChain.push(`[${cur}]${vFilters.join(',')}[veff]`)
        effectVideoPad = '[veff]'
      } else if (cur !== '0:v') {
        filterChain.push(`[${cur}]null[veff]`)
        effectVideoPad = '[veff]'
      }

      let outputOptions: string[] = ['-y']
      let bgmInputIndex = 1
      const hasDub = !!(dubbedAudioPath && fs.existsSync(dubbedAudioPath))
      const extras = options as ExportExtras
      if (hasDub) {
        command = command.input(dubbedAudioPath)
          .inputOptions([
            '-f', 's16le',
            '-ar', '24000',
            '-ac', '1'
          ]);
          
        if (media.hasAudio) filterChain.push(`[0:a]volume=${Math.max(0, Math.min(2, Number(bgVolume)))}[bg]`)
        else filterChain.push(`anullsrc=channel_layout=stereo:sample_rate=44100,atrim=duration=${media.dur || 3600}[bg]`)
        filterChain.push(`[1:a]volume=${Math.max(0, Math.min(3, Number(dubVolume)))}[dub]`);
        filterChain.push('[bg][dub]amix=inputs=2:duration=first[amix]');
        filterChain.push('[amix]alimiter=limit=-1.0dB[adubmix]');
      }
      if (extras.bgm?.path && fs.existsSync(extras.bgm.path)) {
        bgmInputIndex = hasDub ? 2 : 1
        command = command.input(extras.bgm.path)
      }
      const applicableExtras = extras.bgm?.path && !fs.existsSync(extras.bgm.path) ? { ...extras, bgm: undefined } : extras
      const plan = buildProcessPlan(applicableExtras, VW, VH, true, media.dur, previewMode, bgmInputIndex)

      if (plan.hasExtras) {
        // Contract filters consume stable base pads after the legacy effects.
        const videoSource = effectVideoPad === '0:v' ? '[0:v]' : effectVideoPad
        filterChain.push(`${videoSource}null[vbase]`)
        if (hasDub) filterChain.push('[adubmix]anull[abase]')
        else if (media.hasAudio) filterChain.push('[0:a]anull[abase]')
        else filterChain.push(`anullsrc=channel_layout=stereo:sample_rate=44100,atrim=duration=${media.dur || 3600}[abase]`)
        filterChain.push(...plan.filters)
        outputOptions.push(...plan.outputOptions)
      } else if (hasDub) {
        filterChain.push('[adubmix]anull[aout]')
        outputOptions.push('-map', effectVideoPad, '-map', '[aout]', '-c:v', 'libx264', '-preset', 'fast', '-c:a', 'aac', '-b:a', '192k')
      } else {
        outputOptions.push('-map', effectVideoPad, '-map', '0:a?', '-c:v', 'libx264', '-preset', 'fast', '-c:a', 'copy')
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
          const segments = extras.segments?.length ? extras.segments : [{ start: 0, end: media.dur }]
          const duration = Math.min(previewMode ? 15 : Infinity, segments.reduce((sum, s) => sum + Math.max(0, s.end - s.start), 0) / Math.max(0.5, Number(extras.speed) || 1))
          const raw = progress.timemark || '00:00:00.00'
          const tm = raw.split(':').reduce((a, p) => a * 60 + Number(p), 0)
          const percent = duration > 0 ? Math.max(0, Math.min(100, tm / duration * 100)) : 0
          mainWindow.webContents.send('video:progress', { percent, timeText: raw })
          if (progress.percent) mainWindow.webContents.send('video:log', `Đang xử lý: ${progress.percent.toFixed(1)}%`)
        })
        .on('end', () => {
          mainWindow.webContents.send('video:log', '====== XUẤT VIDEO HOÀN TẤT ======')
          mainWindow.webContents.send('video:log', `Đã lưu tại: ${outPath}`)
          // bản xem trước được phát ngay trong tab (không mở trình phát ngoài)
          if (!previewMode && !options.noReveal) shell.showItemInFolder(outPath);
          if (activeCommand?.command === command) activeCommand = null
          if (!settled) { settled = true; resolve(outPath) }
        })
        .on('error', (err) => {
          console.error('Error processing video', err)
          mainWindow.webContents.send('video:log', `[LỖI] ${err.message}`)
          const error = wasCancelled ? new Error('Video export cancel') : err
          if (activeCommand && activeCommand.command === command) activeCommand = null
          if (!settled) { settled = true; reject(error) }
        })
        .run()
    })
  })
}
