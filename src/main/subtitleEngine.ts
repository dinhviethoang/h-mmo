import { ipcMain, BrowserWindow, app } from 'electron'
import { GoogleGenAI } from '@google/genai'
import path from 'path'
import fs from 'fs'
const ffmpeg = require('fluent-ffmpeg');

// ====== HELPER: Tìm model khả dụng và thử với retry + fallback ======
async function findAndCallModel(
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
function cleanMarkdown(text: string): string {
  let clean = text.trim()
  if (clean.startsWith('```srt')) clean = clean.substring(6).trim()
  else if (clean.startsWith('```')) clean = clean.substring(3).trim()
  if (clean.endsWith('```')) clean = clean.substring(0, clean.length - 3).trim()
  return clean
}

// ====== MAIN ENGINE ======
export function setupSubtitleEngine(mainWindow: BrowserWindow) {
  ipcMain.handle('subtitle:generate', async (_event, options) => {
    return new Promise(async (resolve, reject) => {
      const { videoPath, apiKey, translateEnabled, aiEngine } = options
      
      const parsedPath = path.parse(videoPath)
      const audioPath = path.join(app.getPath('temp'), `${parsedPath.name}_temp_audio.wav`)
      const outSrtPath = path.join(parsedPath.dir, `${parsedPath.name}.srt`)
      const outViSrtPath = path.join(parsedPath.dir, `${parsedPath.name}_vi.srt`)
      
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
        const cleanedSrt = cleanMarkdown(originalSrt)
        
        fs.writeFileSync(outSrtPath, cleanedSrt, 'utf8')
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

${cleanedSrt}`
          
          const translatedSrt = await findAndCallModel(ai, apiKey, translatePrompt, log, 'Dịch phụ đề')
          const cleanedTranslation = cleanMarkdown(translatedSrt)
          
          fs.writeFileSync(outViSrtPath, cleanedTranslation, 'utf8')
          log(`Phụ đề Tiếng Việt đã lưu tại: ${outViSrtPath}`)
        } else if (aiEngine === 'Google (Miễn phí)') {
          log('Dịch qua Google Translate (Tính năng đang phát triển)...')
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
