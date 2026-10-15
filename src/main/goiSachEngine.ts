import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { ffmpegPath, ffprobePath, engineScript, pythonExe } from './tools'
import { buildLibraryLineArt } from './goiSachLibrary'

export type GoiSachScene = { section: string; time: string; expression: string; caption: string; stepLabel: string; narration: string; series: string; shorts: boolean }
const expressions = 'vui|buon|buon-ngu|ngac-nhien|nhay-mat|phan-khich|suy-nghi|tuc-gian'
export function parseScript(mdPath: string): GoiSachScene[] {
  const md = fs.readFileSync(mdPath, 'utf8').replace(/^\uFEFF/, '')
  const shortAt = md.search(/^##\s+KỊCH BẢN YOUTUBE SHORTS/im)
  const series = (md.match(/^\*\*Series:\*\*\s*(.+)$/im)?.[1] || 'Gối Sách').replace(/\s*\([^)]*\)\s*$/, '').trim()
  const chunks = [md.slice(0, shortAt < 0 ? md.length : shortAt), shortAt < 0 ? '' : md.slice(shortAt)]
  const out: GoiSachScene[] = []
  for (let ci = 0; ci < chunks.length; ci++) {
    const text = chunks[ci]
    const lines = text.split(/\r?\n/)
    let section = ''
    for (let i = 0; i < lines.length; i++) {
      const h = lines[i].match(/^#{2,4}\s+(.+)/)
      if (h) section = h[1].replace(/\s*\([^)]*\)\s*$/, '').trim()
      if (!/^\|/.test(lines[i]) || !/\|/.test(lines[i + 1] || '') || !/---/.test(lines[i + 1] || '')) continue
      i += 2
      while (i < lines.length && /^\|/.test(lines[i])) {
        const cells = lines[i].trim().replace(/\|$/, '').split('|').slice(1).map(x => x.trim())
        i++
        if (cells.length < 3 || /mốc thời gian|thời gian/i.test(cells[0])) continue
        const time = (cells[0].match(/\*\*(.*?)\*\*/) || [])[1] || cells[0]
        const image = cells.slice(1, -1).join(' | ')
        const narration = cells[cells.length - 1].replace(/<br\s*\/?>/gi, ' ').replace(/\*\*/g, '').trim()
        if (!narration || /^(?:[-*]|\d+\.)\s/.test(narration)) continue
        const expression = ((image.match(new RegExp(`\\b(${expressions})\\b`, 'i')) || [])[1] || 'suy-nghi').toLowerCase()
        const explicit = image.match(/Chữ\s+to\s*:\s*[“"']([^”"']+)[”"']/i)?.[1]
          || image.match(/Chữ\s+to\s*:\s*(.+?)(?=\s*\|\s*|\]\s*$)/i)?.[1]
        const step = section.match(/^(Cách\s+\d+)\s*:\s*(.*)$/i)
        const lesson = section.match(/^Bài học\s+(\d+)\s*:\s*(.*)$/i)
        const caption = explicit?.trim().replace(/\*\*/g, '') || (step ? step[2].trim() : lesson ? `Bài học ${lesson[1]}` : '')
        out.push({ section: section || (ci ? 'Shorts' : 'Gối Sách'), time, expression, caption, stepLabel: step?.[1] || '', narration, series, shorts: ci === 1 })
      }
      i--
    }
  }
  return out
}

type RenderOptions = { script: string; outDir: string; only?: 'long'|'shorts'|'both'; limit?: number; voice?: string; music?: string; shortsStyle?: 'static'|'whiteboard'; wbImageDir?: string; apiKey?: string; imageSource?: 'auto'|'library'; imageModel?: string }
let active: ReturnType<typeof spawn> | null = null
const runtimePython = () => { try { return pythonExe() } catch { return path.join(process.cwd(), '.venv-hmmo', 'Scripts', 'python.exe') } }
const runtimeScript = () => { try { return engineScript('tts_vieneu.py') } catch { return path.join(process.cwd(), 'engines', 'tts_vieneu.py') } }
const send = (win: BrowserWindow, progress: number, message: string) => win.webContents.send('goisach:progress', { progress, message })
function run(cmd: string, args: string[]): Promise<void> { return new Promise((resolve,reject)=>{ const p=spawn(cmd,args,{windowsHide:true,env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'}}); active=p; let err=''; p.stderr.on('data',d=>err=(err+d).slice(-2000)); p.on('error',reject); p.on('close',c=>{active=null;c===0?resolve():reject(new Error(err.slice(-700)||`${cmd} exited ${c}`))}) }) }
const escText = (s:string) => s.replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/'/g,"\\'").replace(/:/g,'\\:').replace(/%/g,'\\%')
const probe = (file:string) => new Promise<number>((resolve,reject)=>{let o='';const p=spawn(ffprobePath(),['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',file],{windowsHide:true});p.stdout.on('data',d=>o+=d);p.on('close',c=>c===0?resolve(Number(o.trim())||1):reject(new Error('ffprobe failed')))})

async function tts(text:string, output:string, voice:string, log:(s:string)=>void) {
  try {
    const py=runtimePython()
    if(!fs.existsSync(py)) throw new Error(`Không tìm thấy Python VieNeu: ${py}`)
    const check=await new Promise<number>(resolve=>{const p=spawn(py,['-c','import vieneu'],{windowsHide:true});p.on('error',()=>resolve(-1));p.on('close',c=>resolve(c||0))})
    if(check!==0){log('Đang cài VieNeu-TTS lần đầu...');await new Promise<void>((resolve,reject)=>{const p=spawn(py,['-m','pip','install','-U','vieneu'],{windowsHide:true});let e='';p.stderr.on('data',d=>e+=d);p.on('error',reject);p.on('close',c=>c===0?resolve():reject(new Error(e.slice(-500)||`pip exited ${c}`)))})}
    const p=spawn(runtimePython(),[runtimeScript(),'say','--text',text,'--out',output,...(voice.startsWith('vieneu:preset:')?['--voice',voice.slice(14)]:[])],{windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'}}); active=p
    await new Promise<void>((resolve,reject)=>{let err='';p.stderr.on('data',d=>err+=d);p.on('error',e=>{active=null;reject(e)});p.on('close',c=>{active=null;c===0&&fs.existsSync(output)?resolve():reject(new Error(err||`VieNeu exited ${c}`))})})
  } catch (e) {
    try { const { EdgeTTS } = require('node-edge-tts'); const edge = new EdgeTTS({voice:voice.startsWith('edge:')?voice.slice(5):'vi-VN-HoaiMyNeural',lang:'vi-VN',outputFormat:'audio-24khz-48kbitrate-mono-mp3'}); await edge.ttsPromise(text,output); log('TTS: Edge TTS vi-VN-HoaiMyNeural'); }
    catch { throw new Error(`VieNeu không khả dụng; Edge TTS cũng chưa cài/không chạy được. ${String((e as Error)?.message||e)}`) }
  }
}

async function renderOne(scenes:GoiSachScene[], target:string, short:boolean, opts:RenderOptions, onProgress:(p:number,m:string)=>void) {
  if(short && (opts.shortsStyle || 'whiteboard')==='whiteboard') return renderWhiteboard(scenes,target,opts,onProgress)
  const root=path.dirname(target), frameDir=path.join(root,'frames'), audioDir=path.join(root,'audio'); fs.mkdirSync(frameDir,{recursive:true});fs.mkdirSync(audioDir,{recursive:true})
  const W=short?1080:1920,H=short?1920:1080, mascotDir=path.join(path.dirname(opts.script),'..','logo-final','bieu-cam'), font=process.platform==='win32'?':fontfile=C\\:/Windows/Fonts/segoeui.ttf':''
  const durations:number[]=[]
  let selected=scenes.filter(s=>s.shorts===short); if(opts.limit) selected=selected.slice(0,opts.limit)
  for(let i=0;i<selected.length;i++){
    const s=selected[i], n=i+1, frame=path.join(frameDir,`${short?'short':'long'}-${String(n).padStart(3,'0')}.png`), audio=path.join(audioDir,`${short?'short':'long'}-${String(n).padStart(3,'0')}.mp3`)
    const colors=short?['#7FD1B9','#302C3B','#FF8A65']:['#1E2A4A','#F6EBD9','#E8B04B']
    const expression=fs.existsSync(path.join(mascotDir,`${s.expression}.png`))?path.join(mascotDir,`${s.expression}.png`):path.join(mascotDir,'suy-nghi.png')
    const [mainTitle] = s.caption.split('\n')
    const seriesLabel = s.series.replace(/\s*\(#\d+\)\s*$/, '')
    const titleSize = short ? (mainTitle.length > 24 ? 72 : mainTitle.length > 14 ? 80 : 88) : (mainTitle.length > 34 ? 76 : mainTitle.length > 24 ? 84 : 92)
    const titleLines = splitCaption(mainTitle, short ? 14 : 18).slice(0, 3)
    const brandFilters = short
      ? `drawtext=text='${escText(seriesLabel)}':fontfile=C\\:/Windows/Fonts/segoeuib.ttf:fontcolor=#302C3B:fontsize=30:x=(w-text_w)/2:y=32:box=1:boxcolor=#FFF6EC@0.96:boxborderw=12,drawtext=text='Gối Sách':fontfile=C\\:/Windows/Fonts/segoeuib.ttf:fontcolor=#302C3B:fontsize=24:x=(w-text_w)/2:y=91`
      : `drawtext=text='Gối Sách':fontfile=C\\:/Windows/Fonts/segoeuib.ttf:fontcolor=#F6EBD9:fontsize=42:x=70:y=38,drawtext=text='${escText(seriesLabel)}':fontfile=C\\:/Windows/Fonts/segoeuib.ttf:fontcolor=#1E2A4A:fontsize=25:x=290:y=42:box=1:boxcolor=#E8B04B:boxborderw=14`
    const titleFilter = short
      ? `drawbox=x=90:y=300:w=900:h=${titleLines.length * 100 + 48}:color=#FFF6EC:t=fill,drawbox=x=90:y=300:w=900:h=${titleLines.length * 100 + 48}:color=#302C3B:t=6,${titleLines.map((line,row)=>`drawtext=text='${escText(line)}':fontfile=C\\:/Windows/Fonts/segoeuib.ttf:fontcolor=#302C3B:fontsize=${titleSize}:x=(w-text_w)/2:y=${330+row*100}:borderw=0`).join(',')}`
      : (() => {
        if (!mainTitle) return ''
        const lines = splitCaption(mainTitle, Math.max(18, Math.floor(29 * 92 / titleSize))).slice(0, 2)
        const size = lines.some(line => line.length > 28) ? 76 : lines.some(line => line.length > 23) ? 84 : 92
        const blockH = lines.length * 104 + 40, top = 220
        const cardX = 310, cardW = 1300, textY = top + Math.round((blockH - lines.length * 104) / 2) + 8
        const card = `drawbox=x=${cardX}:y=${top}:w=${cardW}:h=${blockH}:color=#302C3B:t=fill,drawbox=x=${cardX+6}:y=${top+6}:w=${cardW-12}:h=${blockH-12}:color=#FFF6EC:t=fill`
        const step = s.stepLabel ? `drawtext=text='${escText(s.stepLabel)}':fontfile=C\\:/Windows/Fonts/segoeuib.ttf:fontcolor=#F6EBD9:fontsize=30:x=(w-text_w)/2:y=${top-48}` : ''
        return [card, step, lines.map((line,row)=>`drawtext=text='${escText(line)}':fontfile=C\\:/Windows/Fonts/segoeuib.ttf:fontcolor=#302C3B:fontsize=${size}:x=(w-text_w)/2:y=${textY+row*104}`).join(',')].filter(Boolean).join(',')
      })()
    const longDecor = short ? '' : ',drawbox=x=90:y=160:w=3:h=3:color=#F6EBD9@0.75:t=fill,drawbox=x=470:y=210:w=3:h=3:color=#F6EBD9@0.65:t=fill,drawbox=x=1050:y=160:w=4:h=4:color=#F6EBD9@0.65:t=fill,drawbox=x=1770:y=235:w=3:h=3:color=#F6EBD9@0.7:t=fill'
    const base = `color=c=${colors[0]}:s=${W}x${H}:d=1,${brandFilters}${titleFilter ? `,${titleFilter}` : ''}${longDecor}`
    const comp = short
      ? '[1:v]scale=620:-1[mas];[0:v][mas]overlay=(W-w)/2:H*0.47[out]'
      : (() => {
        const hasCaption = Boolean(mainTitle)
        const lines = hasCaption ? splitCaption(mainTitle, Math.max(18, Math.floor(29 * 92 / titleSize))).slice(0, 2) : []
        const mascotSize = hasCaption && lines.length > 1 ? 330 : hasCaption ? 380 : 480
        const cardBottom = hasCaption ? 220 + lines.length * 104 + 40 : 0
        const mascotY = hasCaption ? cardBottom + 40 : 370
        const shadowY = mascotY + mascotSize - 100
        return `color=c=#26375E:s=1920x90:d=1,format=rgba,geq=r=38:g=55:b=94:a='if(gt(Y,38+10*sin(X/150)),255,0)'[wave];[0:v][wave]overlay=0:990[bg];color=c=#2A3A63:s=500x500:d=1,format=rgba,geq=r=42:g=58:b=99:a='255*max(0,1-sqrt((X-249.5)*(X-249.5)+(Y-249.5)*(Y-249.5))/250)'[orb];[bg][orb]overlay=(W-w)/2:${mascotY - 18}[glow];color=c=#F6EBD9:s=640x100:d=1,format=rgba,geq=r=246:g=235:b=217:a='90*max(0,1-sqrt(((X-319.5)/319.5)*((X-319.5)/319.5)+((Y-49.5)/49.5)*((Y-49.5)/49.5)))'[shadow];[glow][shadow]overlay=640:${shadowY}[decor];[1:v]scale=${mascotSize}:-1[mas];[decor][mas]overlay=(W-w)/2:${mascotY}[out]`
      })()
    await run(ffmpegPath(), ['-y','-f','lavfi','-i',base,'-i',expression,'-filter_complex',comp,'-map','[out]','-frames:v','1',frame])
    if(!fs.existsSync(audio)) await tts(s.narration,audio,opts.voice||'vieneu:default',m=>onProgress(0,m));durations.push(await probe(audio)+0.3);onProgress(Math.round((n/selected.length)*30),`Đã tạo audio ${n}/${selected.length}`)
  }
  if(!selected.length) throw new Error(`Không tìm thấy cảnh ${short?'Shorts':'dài'} trong kịch bản.`)
  const entries=selected.map((s,i)=>({s,i})); const concat=path.join(root,`concat-${short?'shorts':'long'}.txt`), parts:string[]=[]
  let elapsed=0, srt=''
  for(let i=0;i<entries.length;i++){
    const {s}=entries[i], k=i+1, frame=path.join(frameDir,`${short?'short':'long'}-${String(k).padStart(3,'0')}.png`), audio=path.join(audioDir,`${short?'short':'long'}-${String(k).padStart(3,'0')}.mp3`), clip=path.join(root,`scene-${short?'short':'long'}-${k}.mp4`), dur=await probe(audio)+0.3
    const capMax=short?44:92, pieces=splitCaption(s.narration,capMax), total=pieces.reduce((a,b)=>a+b.length,0);let local=0; const filters:string[]=[]
    for(let q=0;q<pieces.length;q++){const piece=pieces[q], start=dur*local/total, end=dur*(local+piece.length)/total;local+=piece.length; const lines=splitCaption(piece,short?22:46).slice(0,2), line=lines.join('\n'); for(let row=0;row<lines.length;row++){const y=short?`h*0.78+${row*70}`:`h-70-${(lines.length-row)*54}`;filters.push(`drawtext=text='${escText(lines[row])}'${font}:fontcolor=white:fontsize=${short?58:46}:x=(w-text_w)/2:y=${y}:borderw=5:bordercolor=black:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'`)}srt+=`${q+1}\n${stamp(elapsed+start)} --> ${stamp(elapsed+end)}\n${line}\n\n`}
    const motion = short ? `zoompan=z='min(zoom+0.0005,1.05)':d=1:s=${W}x${H}:fps=30` : `zoompan=z='min(zoom+0.0004,1.04)':d=1:s=${W}x${H}:fps=30,fade=t=in:st=0:d=0.25`
    await run(ffmpegPath(),['-y','-loop','1','-i',frame,'-i',audio,'-vf',`scale=${W}:${H},${filters.join(',')},${motion}`,...(short?[]:['-af','afade=t=in:st=0:d=0.25']),'-t',String(dur),'-r','30','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',clip]); parts.push(`file '${path.resolve(clip).replace(/\\/g,'/')}'`)
    elapsed+=dur;onProgress(30+Math.round(60*(i+1)/entries.length),`Đã dựng cảnh ${i+1}/${entries.length}`)
  }
  fs.writeFileSync(concat,parts.join('\n'),'utf8'); const args=['-y','-f','concat','-safe','0','-i',concat]
  if(opts.music && fs.existsSync(opts.music)) args.push('-stream_loop','-1','-i',opts.music,'-filter_complex','[1:a]volume=0.12[m];[0:a][m]amix=inputs=2:duration=first[a]','-map','0:v','-map','[a]')
  args.push('-c:v','copy','-c:a','aac',target);await run(ffmpegPath(),args)
  fs.writeFileSync(path.join(path.dirname(target),`subtitles.${short?'shorts':'long'}.srt`),srt,'utf8');onProgress(100,`Hoàn tất ${target}`)
}

async function renderWhiteboard(scenes:GoiSachScene[],target:string,opts:RenderOptions,onProgress:(p:number,m:string)=>void){
  const selected=scenes.filter(s=>s.shorts), list=opts.limit?selected.slice(0,opts.limit):selected
  if(!list.length) throw new Error('Khong tim thay canh Shorts.')
  const root=path.dirname(target), wb=path.join(root,'whiteboard'), images=path.join(wb,'images'), audios=path.join(root,'audio'), clips:string[]=[],srtParts:string[]=[];let srtElapsed=0,srtNo=0
  fs.mkdirSync(images,{recursive:true});fs.mkdirSync(audios,{recursive:true})
  const helper=path.join(process.cwd(),'engines','wb_prepare_scene.py'), py=process.env.WB_PYTHON||path.join('C:/Users/HOANGDV/tools/srt-whiteboard-animation/.venv/Scripts/python.exe')
  const renderer=path.join(process.cwd(),'engines','wb_render_goisach.py'), hand=path.join(process.cwd(),'resources/goisach/hand-goisach.png')
  const md=fs.readFileSync(opts.script,'utf8'), lines=md.split(/\r?\n/), shortIndex=lines.findIndex(x=>/^##\s+K.{0,3}CH B.{0,4}N YOUTUBE SHORTS/i.test(x)), rows=lines.slice(shortIndex<0?0:shortIndex).filter(x=>/^\|/.test(x)&&/\[H[^:\]]{1,4}NH:/i.test(x))
  let useLibrary=opts.imageSource==='library'
  for(let i=0;i<list.length;i++){
    const s=list[i],n=i+1,audio=path.join(audios,`short-${String(n).padStart(3,'0')}.mp3`),image=path.join(images,`scene-${String(n).padStart(2,'0')}.png`)
    if(!fs.existsSync(audio)) await tts(s.narration,audio,opts.voice||'vieneu:default',m=>onProgress(0,m))
    const dur=await probe(audio)+0.3
    let regions:any[]|undefined
    if(opts.wbImageDir){const supplied=path.join(opts.wbImageDir,`scene-${String(n).padStart(2,'0')}.png`);if(fs.existsSync(supplied))fs.copyFileSync(supplied,image);else{onProgress(Math.round(i/list.length*25),`Thieu anh mau canh ${n} → dung kho hinh`);const result=await buildLibraryLineArt({description:s.narration,narration:s.narration,series:s.series,expression:s.expression,sceneIndex:n,outPng:image});regions=result.regions}}
    else {
      const row=rows[i]||'', desc=row.match(/\[H[^:\]]{1,4}NH:\s*(.*?)(?:\s*?|\])/i)?.[1]||s.narration
      const prompt=`${desc}, ${s.narration}, minimal hand-drawn whiteboard line art, clean dark grey ink outlines, warm beige paper background #F5EBD7, few soft orange and blue accents, simple cute Vietnamese young office characters, lots of white space, no text, no letters, no watermark, vertical composition`
      const hash=require('crypto').createHash('sha256').update(prompt).digest('hex'), cache=path.join(app?.getPath?app.getPath('userData'):path.join(process.env.APPDATA||process.cwd(),'h-mmo'),'goisach-whiteboard-cache',`${hash}.png`);fs.mkdirSync(path.dirname(cache),{recursive:true})
      if(useLibrary){const result=await buildLibraryLineArt({description:desc,narration:s.narration,series:s.series,expression:s.expression,sceneIndex:n,outPng:image});regions=result.regions}
      else if(fs.existsSync(cache))fs.copyFileSync(cache,image)
      else{
        const key=opts.apiKey||process.env.GEMINI_API_KEY
        if(!key){fs.appendFileSync(path.join(root,'gemini-log.txt'),`[canh ${n}] khong nhan duoc API key Gemini -> dung kho hinh\n`);useLibrary=true;const result=await buildLibraryLineArt({description:desc,narration:s.narration,series:s.series,expression:s.expression,sceneIndex:n,outPng:image});regions=result.regions}
        else if(fs.existsSync(cache))fs.copyFileSync(cache,image)
        else{onProgress(Math.round(i/list.length*25),`Dang tao anh canh ${n}/${list.length}`);try{const bytes=await geminiImage(key,prompt,opts.imageModel);fs.writeFileSync(cache,bytes);fs.copyFileSync(cache,image)}catch(e){const msg=String((e as Error).message||e).replace(/key=[^&\s]+/gi,'[redacted]').slice(0,70);fs.appendFileSync(path.join(root,'gemini-log.txt'),`[canh ${n}] ${String((e as Error).message||e).replace(/AIza[\w-]+|AQ\.[\w.-]+/g,'[key]').slice(0,600)}\n`);onProgress(Math.round(i/list.length*25),`Gemini l\u1ed7i ${msg} \u2192 d\u00f9ng kho h\u00ecnh`);if(/429|403|quota|resource_exhausted/i.test(msg))useLibrary=true;const result=await buildLibraryLineArt({description:desc,narration:s.narration,series:s.series,expression:s.expression,sceneIndex:n,outPng:image});regions=result.regions}}
      }
    }
    onProgress(25+Math.round(i/list.length*55),`Dang ve canh ${n}/${list.length}`)
    const raw=path.join(wb,`draw-${n}.mp4`), final=path.join(root,`scene-shorts-${n}.mp4`), ann=path.join(wb,`scene-${n}.json`)
    const prepareArgs=[helper,'--image',image,'--audio-duration',String(dur),'--annotation',ann,'--duration-ms',String(Math.round(dur*1000*.75))]
    if(regions)prepareArgs.push('--regions',JSON.stringify(regions))
    await run(py,prepareArgs)
    await run(py,[renderer,image,ann,raw,hand,'--ink-path','grid','--color-fill','contour-wipe','--cap-long-edge','1920'])
    const title=splitCaption(s.caption.split('\n')[0]||'',20).slice(0,2), titleFilter=title.map((t,j)=>`drawtext=text='${escText(t)}':fontfile=C\\:/Windows/Fonts/segoeuib.ttf:fontcolor=#2B2B33:fontsize=72:x=(w-text_w)/2:y=${260+j*88}:alpha='min(1,t/0.6)'`).join(',')
    const subtitleParts=splitCaption(s.narration,42), subtitleFilters:string[]=[];let subOffset=0
    for(const part of subtitleParts){const start=dur*subOffset/Math.max(1,s.narration.length),end=dur*(subOffset+part.length)/Math.max(1,s.narration.length);subOffset+=part.length;const lines=splitCaption(part,23).slice(0,2);lines.forEach((line,row)=>subtitleFilters.push(`drawtext=text='${escText(line)}':fontfile=C\\:/Windows/Fonts/segoeui.ttf:fontcolor=white:fontsize=36:x=(w-text_w)/2:y=${1560+row*52}:borderw=4:bordercolor=black:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'`));srtNo++;srtParts.push(`${srtNo}\n${stamp(srtElapsed+start)} --> ${stamp(srtElapsed+end)}\n${lines.join('\n')}\n`)}
    const mascotDir=path.join(path.dirname(opts.script),'..','logo-final','bieu-cam'),mascot=path.join(mascotDir,`${s.expression}.png`);const inputs=['-i',raw,'-i',audio];if(fs.existsSync(mascot))inputs.push('-i',mascot)
    const overlay=fs.existsSync(mascot)?`;[2:v]scale=200:-1[mas];[base][mas]overlay=W-w-32:1700:shortest=0:eof_action=repeat[v]`:''
    const filter=`[0:v]tpad=stop_mode=clone:stop_duration=1,trim=duration=${dur},drawtext=text='${escText(s.series)}':fontfile=C\\:/Windows/Fonts/segoeuib.ttf:fontcolor=#2B2B33:fontsize=30:x=(w-text_w)/2:y=36${titleFilter?','+titleFilter:''}${subtitleFilters.length?','+subtitleFilters.join(','):''}[base]${overlay||';[base]null[v]'}`
    await run(ffmpegPath(),['-y',...inputs,'-filter_complex',filter,'-map','[v]','-map','1:a','-t',String(dur),'-r','30','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',final]);clips.push(final);srtElapsed+=dur
  }
  onProgress(90,'Dang ghep cac canh Shorts...')
  const concat=path.join(root,'concat-shorts.txt');fs.writeFileSync(concat,clips.map(f=>`file '${path.resolve(f).replace(/\\/g,'/')}'`).join('\n'),'utf8');await run(ffmpegPath(),['-y','-f','concat','-safe','0','-i',concat,'-c','copy',target]);fs.writeFileSync(path.join(root,'subtitles.shorts.srt'),srtParts.join('\n'),'utf8');onProgress(100,`Hoan tat ${target}`)
}
let cachedImageModel=''
async function geminiImage(key:string,prompt:string,configured?:string):Promise<Buffer>{
  let model=(configured||cachedImageModel).replace(/^models\//,''); const headers={'Content-Type':'application/json','x-goog-api-key':key}, signal=AbortSignal.timeout(90000)
  if(!model){const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models',{headers:{'x-goog-api-key':key},signal});if(!r.ok)throw new Error(`ListModels HTTP ${r.status}`);const d:any=await r.json();model=(d.models||[]).filter((m:any)=>m.name?.toLowerCase().includes('image')&&(m.supportedGenerationMethods||[]).includes('generateContent')).sort((a:any,b:any)=>Number(b.name.toLowerCase().includes('flash'))-Number(a.name.toLowerCase().includes('flash')))[0]?.name?.replace(/^models\//,'');if(!model)throw new Error('kh?ng t?m th?y model ?nh');cachedImageModel=model}
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  let r=await fetch(url,{method:'POST',headers,body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseModalities:['IMAGE'],imageConfig:{aspectRatio:'9:16'}}}),signal})
  if(!r.ok&&r.status===400){const detail=await r.text();if(/aspect.?ratio|imageConfig/i.test(detail))r=await fetch(url,{method:'POST',headers,body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseModalities:['IMAGE']}}),signal})}
  if(!r.ok)throw new Error(`HTTP ${r.status} model=${model} ${(await r.text().catch(()=>'')).slice(0,400)}`);const d:any=await r.json(),p=d.candidates?.[0]?.content?.parts?.find((x:any)=>x.inlineData?.data);if(!p)throw new Error('API kh?ng tr? ?nh');return Buffer.from(p.inlineData.data,'base64')
}
function stamp(t:number){const ms=Math.round(t*1000),h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),s=Math.floor(ms%60000/1000),x=ms%1000;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(x).padStart(3,'0')}`}
function splitCaption(text:string,max:number){const words=text.split(/\s+/),out:string[]=[];let row='';for(const word of words){if(row&&row.length+1+word.length>max){out.push(row);row=''}row+=(row?' ':'')+word}if(row)out.push(row);return out.length?out:['']}
export async function renderGoiSach(opts:RenderOptions, onProgress:(p:number,m:string)=>void=()=>{}) {
  const scenes=parseScript(opts.script)
  const dir=path.join(opts.outDir,path.basename(opts.script,path.extname(opts.script)));fs.mkdirSync(dir,{recursive:true})
  if(opts.only!=='shorts') await renderOne(scenes,path.join(dir,'long.mp4'),false,opts,onProgress)
  if(opts.only!=='long') await renderOne(scenes,path.join(dir,'shorts.mp4'),true,opts,onProgress)
  const subs=['long','shorts'].map(k=>path.join(dir,`subtitles.${k}.srt`)).filter(fs.existsSync).map(f=>fs.readFileSync(f,'utf8')).filter(Boolean)
  fs.writeFileSync(path.join(dir,'subtitles.srt'),subs.join('\n'),'utf8')
  return dir
}
export function setupGoiSachEngine(win:BrowserWindow){
  ipcMain.handle('goisach:parse',(_e,file:string)=>parseScript(file))
  ipcMain.handle('goisach:pickScript',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'Markdown',extensions:['md']}]});return r.canceled?null:r.filePaths[0]})
  ipcMain.handle('goisach:pickMusic',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'Âm thanh',extensions:['mp3','wav','m4a','aac','flac','ogg']}]});return r.canceled?null:r.filePaths[0]})
  ipcMain.handle('goisach:pickOutput',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openDirectory','createDirectory'],defaultPath:path.join(app.getPath('videos'),'H-MMO','GoiSach')});return r.canceled?null:r.filePaths[0]})
  ipcMain.handle('goisach:run',async(_e,o:RenderOptions)=>renderGoiSach(o,(p,m)=>send(win,p,m)))
  ipcMain.handle('goisach:cancel',()=>{active?.kill('SIGTERM');active=null;return true})
  ipcMain.handle('goisach:open',(_e,dir:string)=>shell.openPath(dir))
}
