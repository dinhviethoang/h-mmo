import { ipcMain, BrowserWindow, app } from 'electron'
import path from 'path'
import fs from 'fs'
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');

// Set paths for ffmpeg/ffprobe static binaries
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic.replace('app.asar', 'app.asar.unpacked'));
}
if (ffprobeStatic && ffprobeStatic.path) {
  ffmpeg.setFfprobePath(ffprobeStatic.path.replace('app.asar', 'app.asar.unpacked'));
}



// Helper to get duration of video
function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err: any, metadata: any) => {
      if (err) return reject(err);
      resolve(metadata.format.duration);
    });
  });
}

// Convert MP3 to PCM using FFmpeg
function mp3ToPcm(mp3Path: string, pcmPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(mp3Path)
      .outputOptions([
        '-f', 's16le',
        '-ar', '24000',
        '-ac', '1',
        '-af', 'volume=0.75,afade=t=in:ss=0:d=0.05'
      ])
      .on('end', () => resolve())
      .on('error', (err: any) => reject(err))
      .save(pcmPath);
  });
}

// Parse SRT content to get cues
function parseSrt(srtContent: string) {
  const blocks = srtContent.trim().split(/\n\s*\n/);
  const cues: any[] = [];
  
  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length >= 3) {
      const timeLine = lines[1];
      const text = lines.slice(2).join(' ').trim();
      
      const timeMatch = timeLine.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
      if (timeMatch) {
        const startSec = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 1000;
        const endSec = parseInt(timeMatch[5]) * 3600 + parseInt(timeMatch[6]) * 60 + parseInt(timeMatch[7]) + parseInt(timeMatch[8]) / 1000;
        cues.push({ startSec, endSec, text });
      }
    }
  }
  return cues;
}

export function setupDubbingEngine(mainWindow: BrowserWindow) {
  ipcMain.handle('dubbing:generate', async (_event, options) => {
    return new Promise(async (resolve, reject) => {
      const { videoPath, srtPath, voiceId, flipVideo, previewMode } = options;
      const log = (msg: string) => mainWindow.webContents.send('dubbing:log', msg);
      
      const parsedPath = path.parse(videoPath);
      const outVideoPath = previewMode 
        ? path.join(parsedPath.dir, `${parsedPath.name}_dubbed_preview${parsedPath.ext}`)
        : path.join(parsedPath.dir, `${parsedPath.name}_dubbed${parsedPath.ext}`);
      const tempDir = app.getPath('temp');
      const masterPcmPath = path.join(tempDir, `master_${parsedPath.name}.pcm`);
      
      try {
        const processStartTime = Date.now();
        log('Bắt đầu quy trình lồng tiếng...');
        log('Đọc file phụ đề SRT...');
        const srtContent = fs.readFileSync(srtPath, 'utf8');
        let cues = parseSrt(srtContent);
        if (previewMode) {
          cues = cues.filter(c => c.startSec < 15);
        }
        log(`Tìm thấy ${cues.length} câu thoại.`);
        
        log('Đang phân tích thời lượng video gốc...');
        const totalDuration = await getVideoDuration(videoPath);
        
        // 24000 Hz, 1 channel, 16-bit (2 bytes per sample)
        const SAMPLE_RATE = 24000;
        const BYTES_PER_SAMPLE = 2;
        const bufferSize = Math.ceil(totalDuration * SAMPLE_RATE * BYTES_PER_SAMPLE);
        const masterBuffer = Buffer.alloc(bufferSize, 0); // Filled with silence
        
        // --- PARALLEL TTS: Use all CPU cores ---
        const os = require('os');
        const { spawn } = require('child_process');
        const CONCURRENCY = Math.min(os.cpus().length, 4); // Cap at 4 to avoid OOM crashes
        log(`Bắt đầu tạo giọng nói (TTS) - ${CONCURRENCY} luồng song song (${os.cpus().length} CPU cores)...`);
        
        // Pre-resolve NeeyuVoice paths once
        let voiceName = '';
        let engineExe = '';
        let voicesDir = '';
        let modelsDir = '';
        
        if (voiceId.startsWith('neeyu-')) {
          voiceName = voiceId.replace('neeyu-', '');
          const neeyuDir = path.join(os.homedir(), 'AppData', 'Roaming', 'NeeyuVoice');
          engineExe = path.join(neeyuDir, 'runtime', 'engines', 'win-x64', 'cpu', 'vietnamese', 'neeyuvoice-engine.exe');
          voicesDir = path.join(neeyuDir, 'voices');
          modelsDir = path.join(neeyuDir, 'runtime', 'models', 'neeyuvoice-vietnamese');
          if (!fs.existsSync(engineExe)) throw new Error("Không tìm thấy Engine NeeyuVoice. Vui lòng cài đặt NeeyuVoice.");
        } else {
          throw new Error("Giọng đọc không được hỗ trợ: " + voiceId);
        }
        
        // Worker function: generate TTS + convert to PCM for a single cue
        const processCue = async (i: number) => {
          const cue = cues[i];
          log(`[${i+1}/${cues.length}] Đang tạo: "${cue.text.substring(0, 40)}..."`);
          
          const tempMp3 = path.join(tempDir, `cue_${i}.mp3`);
          const tempPcm = path.join(tempDir, `cue_${i}.pcm`);
          // TTS Generation with auto-retry
          let success = false;
          let retries = 0;
          const MAX_RETRIES = 3;

          while (!success && retries < MAX_RETRIES) {
            try {
              if (retries > 0) log(`[${i+1}/${cues.length}] ⚠ Lỗi, đang thử lại lần ${retries}/${MAX_RETRIES}...`);
              await new Promise<void>((resolve, reject) => {
                const proc = spawn(engineExe, [
                  '--voices-dir', voicesDir,
                  '--models-dir', modelsDir,
                  'generate',
                  '--text', cue.text,
                  '--voice', voiceName,
                  '--out', tempMp3,
                  '--no-watermark'
                ]);
                
                proc.stdout.on('data', (data: Buffer) => {
                  const lines = data.toString().split('\n');
                  for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                      const parsed = JSON.parse(line);
                      if (parsed.type === 'error') reject(new Error(parsed.message));
                    } catch (e) { /* Ignore non-json logs */ }
                  }
                });
                
                proc.on('close', (code: number) => {
                  if (code === 0) resolve();
                  else reject(new Error(`NeeyuVoice process exited with code ${code}`));
                });
              });
              success = true;
            } catch (err: any) {
              retries++;
              if (retries >= MAX_RETRIES) {
                throw new Error(`Câu [${i+1}] thất bại sau ${MAX_RETRIES} lần thử: ${err.message}`);
              }
              // Wait 1 second before retrying
              await new Promise(r => setTimeout(r, 1000));
            }
          }
          
          // Convert MP3 to PCM
          await mp3ToPcm(tempMp3, tempPcm);
          
          // Read PCM and place into master buffer at correct time offset
          const pcmData = fs.readFileSync(tempPcm);
          const sampleIndex = Math.floor(cue.startSec * SAMPLE_RATE);
          const offset = sampleIndex * BYTES_PER_SAMPLE;
          
          if (offset < masterBuffer.length) {
            const bytesToWrite = Math.min(pcmData.length, masterBuffer.length - offset);
            pcmData.copy(masterBuffer, offset, 0, bytesToWrite);
          }
          
          // Cleanup temp files
          if (fs.existsSync(tempMp3)) fs.unlinkSync(tempMp3);
          if (fs.existsSync(tempPcm)) fs.unlinkSync(tempPcm);
          
          log(`[${i+1}/${cues.length}] ✓ Hoàn thành`);
        };
        
        // Helper: format seconds to mm:ss
        const fmtTime = (s: number) => {
          const m = Math.floor(s / 60);
          const sec = Math.floor(s % 60);
          return `${m}:${sec.toString().padStart(2, '0')}`;
        };
        
        // Process cues in parallel batches
        const ttsStartTime = Date.now();
        let completed = 0;
        for (let batch = 0; batch < cues.length; batch += CONCURRENCY) {
          const batchEnd = Math.min(batch + CONCURRENCY, cues.length);
          const batchPromises: Promise<void>[] = [];
          for (let i = batch; i < batchEnd; i++) {
            batchPromises.push(processCue(i));
          }
          await Promise.all(batchPromises);
          completed = batchEnd;
          
          // Calculate elapsed and ETA
          const elapsedMs = Date.now() - ttsStartTime;
          const elapsedSec = elapsedMs / 1000;
          const avgPerCue = elapsedSec / completed;
          const remaining = cues.length - completed;
          const etaSec = avgPerCue * remaining;
          
          log(`--- Batch ${Math.floor(batch/CONCURRENCY) + 1}/${Math.ceil(cues.length/CONCURRENCY)} hoàn thành (${completed}/${cues.length} câu) | ⏱ ${fmtTime(elapsedSec)} đã chạy | ⏳ ~${fmtTime(etaSec)} còn lại ---`);
        }
        
        const totalTtsTime = (Date.now() - ttsStartTime) / 1000;
        log(`✅ Tạo giọng nói hoàn tất trong ${fmtTime(totalTtsTime)}.`);
        fs.writeFileSync(masterPcmPath, masterBuffer);
        
        const totalProcessTime = (Date.now() - processStartTime) / 1000;
        log(`====== TẠO ÂM THANH HOÀN TẤT (tổng thời gian: ${fmtTime(totalProcessTime)}) ======`);
        resolve(masterPcmPath);
      } catch (err: any) {
        log(`[LỖI] ${err.message}`);
        reject(err);
      }
    });
  });
}
