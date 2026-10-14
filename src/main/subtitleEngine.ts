import { ipcMain, BrowserWindow, app } from 'electron'
import { GoogleGenAI } from '@google/genai'
import path from 'path'
import fs from 'fs'
import { workspaceDir } from './workspace'
import { googleTranslateSrt } from './translate'
import { requirePython, engineScript } from './tools'
const ffmpeg = require('fluent-ffmpeg');

// ====== HELPER: Tìm model khả dụng và thử với retry + fallback ======
export async function findAndCallModel(
  ai: InstanceType<typeof GoogleGenAI>,
  apiKey: string,
  contents: any,
  log: (msg: string) => void,
  taskLabel: string
): Promise<string> {
  log('Đang kiểm tra danh sách model khả dụng...')
  const fetchRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
  const modelsJson = await fetchRes.json()
  const allModels: string[] = modelsJson.models?.map((m: any) => m.name) || []
  
  // Lọc chỉ giữ model hỗ trợ generateContent (loại embedding, tts, robotics, video-only, image-only)
  const excludeKeywords = ['embedding', 'robotics', 'computer-use', 'cap', 'customtools']
  const usableModels = allModels.filter((name: string) => {
    const lower = name.toLowerCase()
    if (!lower.includes('gemini')) return false
    for (const kw of excludeKeywords) {
      if (lower.includes(kw)) return false
    }
    return true
  })
  
  // Danh sách ưu tiên: model mới, ổn định, hỗ trợ multimodal (audio+text)
  const priorityOrder = [
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-pro-latest',
    'gemini-2.5-pro',
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
    'gemini-3.1-pro-preview',
    'gemini-3-flash-preview',
    'gemini-omni-flash-preview',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash'
  ]
  
  // Sắp xếp theo ưu tiên
  const sortedCandidates: string[] = []
  for (const pref of priorityOrder) {
    const found = usableModels.find((m: string) => m.includes(pref))
    if (found) sortedCandidates.push(found.replace('models/', ''))
  }
  for (const m of usableModels) {
    const short = m.replace('models/', '')
    if (!sortedCandidates.includes(short)) sortedCandidates.push(short)
  }
  
  if (sortedCandidates.length === 0) {
    throw new Error('Không tìm thấy model nào khả dụng. Vui lòng kiểm tra API Key.')
  }
  
  log(`Thứ tự thử cho ${taskLabel}: ${sortedCandidates.slice(0, 5).join(' → ')}...`)
  
  for (const modelName of sortedCandidates) {
    const MAX_RETRIES = 2
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        log(`[${taskLabel}] Đang thử model: ${modelName} (lần ${attempt})...`)
        const response = await ai.models.generateContent({
          model: modelName,
          contents: contents
        })
        const text = response.text || ''
        log(`✓ ${taskLabel} thành công với model: ${modelName}`)
        return text
      } catch (modelErr: any) {
        const code = modelErr?.status || modelErr?.code || 0
        const msg = modelErr?.message || String(modelErr)
        
        if (code === 503 || code === 429 || msg.includes('503') || msg.includes('429') || msg.includes('high demand') || msg.includes('quota')) {
          log(`⚠ ${modelName} quá tải. ${attempt < MAX_RETRIES ? 'Chờ 3s...' : 'Chuyển model...'}`)
          if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, 3000))
        } else if (code === 404 || msg.includes('404') || msg.includes('NOT_FOUND')) {
          log(`✗ ${modelName} không khả dụng (404). Chuyển model...`)
          break
        } else if (msg.includes('not supported') || msg.includes('does not support')) {
          log(`✗ ${modelName} không hỗ trợ tác vụ này. Chuyển model...`)
          break
        } else {
          log(`✗ Lỗi với ${modelName}: ${msg.substring(0, 120)}`)
          break
        }
      }
    }
  }
  
  throw new Error(`Tất cả model đều lỗi cho tác vụ "${taskLabel}". Vui lòng thử lại sau.`)
}

// ====== HELPER: Dọn markdown ======
export function cleanMarkdown(text: string): string {
  let clean = text.trim()
  if (clean.startsWith('```srt')) clean = clean.substring(6).trim()
  else if (clean.startsWith('```')) clean = clean.substring(3).trim()
  if (clean.endsWith('```')) clean = clean.substring(0, clean.length - 3).trim()
  return clean
}

// ====== WHISPER OFFLINE (faster-whisper trong .venv-hmmo) ======
const WHISPER_MODELS: Record<string, string> = { 'Nhanh': 'small', 'Cân bằng': 'medium', 'Chính xác cao': 'large-v3' }
const WHISPER_LANGS: Record<string, string> = { 'Tiếng Anh': 'en', 'Tiếng Trung': 'zh', 'Tiếng Việt': 'vi', 'Tiếng Nhật': 'ja', 'Tiếng Hàn': 'ko' }

function runWhisper(audioPath: string, outSrt: string, accuracy: string, lang: string, log: (m: string) => void): Promise<void> {
  const py = requirePython()
  const script = engineScript('whisper_srt.py')
  const model = WHISPER_MODELS[accuracy] || 'small'
  const args = [script, '--input', audioPath, '--out', outSrt, '--model', model,
    '--lang', WHISPER_LANGS[lang] || '', '--models-dir', path.join(app.getPath('userData'), 'whisper-models')]
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process')
    const p = spawn(py, args, { env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, windowsHide: true })
    let lastPct = -10, err = '', buf = ''
    p.stdout.on('data', (d: Buffer) => {
      buf += d.toString('utf8')
      const lines = buf.split(/\r?\n/); buf = lines.pop() || ''
      for (const line of lines) {
        if (line.startsWith('STATUS ')) log(line.slice(7))
        else if (line.startsWith('PROGRESS ')) {
          const pct = parseInt(line.slice(9))
          if (pct - lastPct >= 10 || pct === 100) { lastPct = pct; log(`Whisper: ${pct}%`) }
        } else if (line.startsWith('ERROR ')) err = line.slice(6)
      }
    })
    p.stderr.on('data', (d: Buffer) => { const t = d.toString('utf8'); if (/Error|error/.test(t)) err = err || t.trim().slice(-500) })
    p.on('error', (e: Error) => reject(e))
    p.on('close', (code: number) => {
      if (code === 0 && fs.existsSync(outSrt)) resolve()
      else reject(new Error(`Whisper lỗi: ${err || 'mã thoát ' + code}`))
    })
  })
}

// ====== MAIN ENGINE ======
// Ngân sách ký tự cho mỗi câu khi dịch (≈15 ký tự/giây tiếng Việt, tính cả khoảng lặng trước câu kế) -> bản dịch dễ lồng tiếng
function dubBudget(srt: string): string {
  const re = /(\d+)\s*\n\s*(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/g
  const items: { id: string; s: number; e: number }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(srt))) {
    const t = (a: number) => +m![a] * 3600 + +m![a + 1] * 60 + +m![a + 2] + +m![a + 3].padEnd(3, '0').slice(0, 3) / 1000
    items.push({ id: m[1], s: t(2), e: t(6) })
  }
  return items.map((x, i) => {
    const end = i + 1 < items.length ? Math.max(x.e, items[i + 1].s - 0.06) : x.e + 1
    return `${x.id}:${Math.max(8, Math.round((end - x.s) * 15 * 1.15))}`
  }).join(', ')
}

export function setupSubtitleEngine(mainWindow: BrowserWindow) {
  ipcMain.handle('subtitle:generate', async (_event, options) => {
    return new Promise(async (resolve, reject) => {
      const { videoPath, apiKey, translateEnabled, aiEngine, sttEngine, accuracy, lang } = options
      const useWhisper = sttEngine !== 'Gemini AI (online)'
      
      const parsedPath = path.parse(videoPath)
      const audioPath = path.join(app.getPath('temp'), `${parsedPath.name}_temp_audio.wav`)
      // Phụ đề lưu vào thư mục H-MMO › 3. Phụ đề
      const subDir = workspaceDir('phude')
      const outSrtPath = path.join(subDir, `${parsedPath.name}.srt`)
      const outViSrtPath = path.join(subDir, `${parsedPath.name}_vi.srt`)
      
      const log = (msg: string) => mainWindow.webContents.send('subtitle:log', msg)
      
      try {
        // ===== BƯỚC 1: Trích xuất audio bằng FFmpeg =====
        log('Bước 1/3: Trích xuất âm thanh từ video...')
        
        await new Promise((res, rej) => {
          ffmpeg(videoPath)
            .toFormat('wav')
            .audioChannels(1)
            .audioFrequency(16000)
            .on('end', res)
            .on('error', rej)
            .save(audioPath)
        })
        
        const audioSize = fs.statSync(audioPath).size
        log(`Trích xuất xong. Kích thước audio: ${(audioSize / 1024 / 1024).toFixed(1)} MB`)
        
        let cleanedSrt = ''
        if (useWhisper) {
          log('Bước 2/3: Nhận diện giọng nói bằng Whisper (offline, chạy trên máy)...')
          await runWhisper(audioPath, outSrtPath, accuracy, lang, log)
          cleanedSrt = fs.readFileSync(outSrtPath, 'utf8')
        } else {
        if (!apiKey) {
          throw new Error('Bạn chưa nhập API Key Gemini. Vui lòng nhập API Key ở mục "Dịch phụ đề bằng AI".')
        }
        
        const ai = new GoogleGenAI({ apiKey })
        
        // ===== BƯỚC 2: Nhận diện giọng nói bằng Gemini (STT) =====
        log('Bước 2/3: Gửi audio lên Gemini AI để nhận diện giọng nói...')
        
        // Đọc file audio và encode base64
        const audioBuffer = fs.readFileSync(audioPath)
        const audioBase64 = audioBuffer.toString('base64')
        
        log(`Đang upload audio (${(audioSize / 1024 / 1024).toFixed(1)} MB) và chờ Gemini xử lý...`)
        
        const sttPrompt = [
          {
            inlineData: {
              mimeType: 'audio/wav',
              data: audioBase64
            }
          },
          {
            text: `You are a professional subtitle transcription engine. Transcribe the audio into SRT format with STRICT rules:

FORMAT RULES (CRITICAL - MUST FOLLOW):
- Output ONLY raw SRT text. No markdown, no code blocks, no explanations.
- Each subtitle entry has exactly: sequence number, timestamp line, text line(s), blank line.
- Timestamp format: HH:MM:SS,mmm --> HH:MM:SS,mmm

SEGMENTATION RULES (CRITICAL):
- Each subtitle segment MUST be maximum 5 seconds long. NEVER exceed 7 seconds.
- Each segment MUST have maximum 2 lines of text.
- Each line MUST have maximum 42 characters.
- Break at natural pauses: sentence boundaries, commas, breath pauses.
- If a speaker talks continuously for 15 seconds, split into 3-4 separate segments.
- NEVER put more than 2 sentences in one segment.

TIMING RULES:
- Timestamps must be precise to the actual speech timing in the audio.
- Leave small gaps (100-300ms) between segments when there is silence.
- Start timestamp when speech begins, end when speech ends (not silence).

LANGUAGE:
- Auto-detect the spoken language and transcribe in that original language.
- Do NOT translate. Transcribe exactly what is spoken.

EXAMPLE of correct output:
1
00:00:00,430 --> 00:00:02,100
Nè nhanh! Lùi lại nửa bước!

2
00:00:02,400 --> 00:00:04,800
May quá, không trúng.

3
00:00:05,100 --> 00:00:07,500
Đừng đi sâu quá,
giữ chặt lối ra vào!

If no speech is detected, output:
1
00:00:00,000 --> 00:00:05,000
(Không có lời nói)`
          }
        ]
        
        const originalSrt = await findAndCallModel(ai, apiKey, sttPrompt, log, 'Nhận diện giọng nói')
        cleanedSrt = cleanMarkdown(originalSrt)
        
        fs.writeFileSync(outSrtPath, cleanedSrt, 'utf8')
        }
        
        log(`Phụ đề gốc đã được lưu: ${outSrtPath}`)
        
        // Dọn file audio tạm
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath)
        
        // ===== BƯỚC 3: Dịch phụ đề (tuỳ chọn) =====
        if (!translateEnabled) {
          log(`Phụ đề gốc đã lưu tại: ${outSrtPath}`)
          log('====== HOÀN TẤT ======')
          return resolve(outSrtPath)
        }
        
        if (aiEngine === 'Gemini AI' && apiKey) {
          log('Bước 3/3: Dịch phụ đề sang Tiếng Việt bằng Gemini AI...')
          
          const translatePrompt = `Translate the following SRT subtitle file into natural, contextual Vietnamese. Rules:
1. Keep the exact SRT sequence numbers, timestamps and line structure.
2. Only translate the subtitle text, NOT the timestamps or sequence numbers.
3. Output ONLY the raw SRT content, no markdown code blocks.
4. The translation should sound natural in Vietnamese, not word-by-word.
5. The Vietnamese text will also be used for voice dubbing, so keep each line concise enough to be spoken inside its own time slot. Stay within the character budget listed below for each sequence number (count spaces); shorten wording rather than dropping meaning.

Character budget per sequence number: ${dubBudget(cleanedSrt)}

${cleanedSrt}`
          
          const ai = new GoogleGenAI({ apiKey })
          const translatedSrt = await findAndCallModel(ai, apiKey, translatePrompt, log, 'Dịch phụ đề')
          const cleanedTranslation = cleanMarkdown(translatedSrt)
          
          fs.writeFileSync(outViSrtPath, cleanedTranslation, 'utf8')
          log(`Phụ đề Tiếng Việt đã lưu tại: ${outViSrtPath}`)
        } else if (aiEngine === 'Gemini AI' && !apiKey) {
          log('Bỏ qua bước dịch: chưa nhập API Key Gemini.')
        } else if (aiEngine === 'Google (Miễn phí)') {
          log('Bước 3/3: Dịch phụ đề sang Tiếng Việt bằng Google Translate (miễn phí)...')
          const vi = await googleTranslateSrt(cleanedSrt, 'vi', log)
          fs.writeFileSync(outViSrtPath, vi, 'utf8')
          log(`Phụ đề Tiếng Việt đã lưu tại: ${outViSrtPath}`)
        }
        
        log('====== HOÀN TẤT ======')
        resolve(outViSrtPath)
      } catch (error: any) {
        log(`[LỖI] ${error.message}`)
        console.error(error)
        reject(error)
      }
    })
  })
}
