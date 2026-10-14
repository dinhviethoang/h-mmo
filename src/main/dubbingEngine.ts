import { ipcMain, BrowserWindow, app } from 'electron'
import path from 'path'
import fs from 'fs'
import { vieneuBatch } from './voiceEngine'
import { parseSrt as parseSrtFit, slotOf, planCue, saveCalibration } from './dubFit'
const ffmpeg = require('fluent-ffmpeg'); // đường dẫn ffmpeg/ffprobe gán chung ở tools.configureFluentFfmpeg()



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
function mp3ToPcm(mp3Path: string, pcmPath: string, extra = ''): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(mp3Path)
      .outputOptions([
        '-f', 's16le',
        '-ar', '24000',
        '-ac', '1',
        '-af', `volume=0.75,afade=t=in:ss=0:d=0.05${extra ? ',' + extra : ''}`
      ])
      .on('end', () => resolve())
      .on('error', (err: any) => reject(err))
      .save(pcmPath);
  });
}

export function setupDubbingEngine(mainWindow: BrowserWindow) {
  ipcMain.handle('dubbing:generate', async (_event, options) => {
    return new Promise(async (resolve, reject) => {
      const { videoPath, srtPath, voiceId, flipVideo: _flipVideo, previewMode } = options;
      const fit = { enabled: options.fit?.enabled !== false, maxRate: Math.min(1.8, Math.max(1, Number(options.fit?.maxRate) || 1.35)), borrowGap: options.fit?.borrowGap !== false };
      const log = (msg: string) => mainWindow.webContents.send('dubbing:log', msg);
      
      const parsedPath = path.parse(videoPath);
      const tempDir = app.getPath('temp');
      const masterPcmPath = path.join(tempDir, `master_${parsedPath.name}.pcm`);
      
      try {
        const processStartTime = Date.now();
        log('Bắt đầu quy trình lồng tiếng...');
        log('Đọc file phụ đề SRT...');
        const srtContent = fs.readFileSync(srtPath, 'utf8');
        let cues: any[] = parseSrtFit(srtContent);
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
        const master16 = new Int16Array(masterBuffer.buffer, masterBuffer.byteOffset, masterBuffer.length >> 1);
        
        // --- PARALLEL TTS: Use all CPU cores ---
        const os = require('os');
        const { spawn } = require('child_process');
        
        // Dynamically calculate concurrency based on total RAM to avoid OOM and heavy swapping
        const totalRAM_GB = os.totalmem() / (1024 ** 3);
        let CONCURRENCY = 1;
        if (totalRAM_GB >= 30) CONCURRENCY = 4;
        else if (totalRAM_GB >= 14) CONCURRENCY = 2;
        
        log(`Bắt đầu tạo giọng nói (TTS) - ${CONCURRENCY} luồng song song (${os.cpus().length} CPU cores, ${Math.round(totalRAM_GB)}GB RAM)...`);
        
        // Pre-resolve NeeyuVoice paths once
        let voiceName = '';
        let engineExe = '';
        let voicesDir = '';
        let modelsDir = '';
        let vieneuDir = '';
        
        if (voiceId.startsWith('neeyu-')) {
          voiceName = voiceId.replace('neeyu-', '');
          const neeyuDir = path.join(os.homedir(), 'AppData', 'Roaming', 'NeeyuVoice');
          engineExe = path.join(neeyuDir, 'runtime', 'engines', 'win-x64', 'cpu', 'vietnamese', 'neeyuvoice-engine.exe');
          voicesDir = path.join(neeyuDir, 'voices');
          modelsDir = path.join(neeyuDir, 'runtime', 'models', 'neeyuvoice-vietnamese');
          if (!fs.existsSync(engineExe)) throw new Error("Không tìm thấy Engine NeeyuVoice. Vui lòng cài đặt NeeyuVoice.");
        } else if (voiceId.startsWith('vieneu:')) {
          // VieNeu: tạo sẵn toàn bộ câu trong 1 tiến trình (nạp model 1 lần)
          vieneuDir = path.join(tempDir, `vieneu_${Date.now()}`);
          log(`Tạo giọng bằng VieNeu-TTS cho ${cues.length} câu...`);
          await vieneuBatch(cues.map(c => c.text), voiceId, vieneuDir, log);
        } else {
          throw new Error("Giọng đọc không được hỗ trợ: " + voiceId);
        }
        
        const audioFiles: string[] = new Array(cues.length);
        // Worker function: generate TTS for a single cue (ghép vào sau, khi đã biết thời lượng thật)
        const processCue = async (i: number) => {
          const cue = cues[i];
          log(`[${i+1}/${cues.length}] Đang tạo: "${cue.text.substring(0, 40)}..."`);
          
          const tempMp3 = vieneuDir
            ? path.join(vieneuDir, `${String(i + 1).padStart(4, '0')}.wav`)
            : path.join(tempDir, `cue_${i}.mp3`);
          // TTS Generation with auto-retry
          let success = false;
          let retries = 0;
          const MAX_RETRIES = 3;

          const threadsPerProc = Math.max(1, Math.floor(os.cpus().length / CONCURRENCY)).toString();
          const procEnv = { 
            ...process.env, 
            OMP_NUM_THREADS: threadsPerProc,
            MKL_NUM_THREADS: threadsPerProc,
            OPENBLAS_NUM_THREADS: threadsPerProc,
            NUMEXPR_NUM_THREADS: threadsPerProc,
            VECLIB_MAXIMUM_THREADS: threadsPerProc
          };

          if (vieneuDir) success = true; // đã tạo sẵn ở bước trên
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
                ], { env: procEnv });
                
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
          
          audioFiles[i] = tempMp3;
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
        // ===== Khớp thời gian + trộn vào dải âm tổng =====
        log(fit.enabled
          ? `Đang khớp thời gian: mượn khoảng lặng ${fit.borrowGap ? 'BẬT' : 'TẮT'}, tăng tốc tối đa ${fit.maxRate.toFixed(2)}×...`
          : 'Đang ghép giọng vào đúng thời điểm (không khớp thời gian)...');
        const SR_BYTES = SAMPLE_RATE * BYTES_PER_SAMPLE;
        const calib: { chars: number; dur: number }[] = [];
        let nFit = 0, nSped = 0, maxUsed = 1;
        const trimmed: number[] = [];
        const mixCue = async (i: number) => {
          const cue = cues[i];
          const src = audioFiles[i];
          if (!src || !fs.existsSync(src)) return;
          const tempPcm = path.join(tempDir, `cue_${process.pid}_${i}.pcm`);
          await mp3ToPcm(src, tempPcm);
          let pcm = fs.readFileSync(tempPcm);
          const natural = pcm.length / SR_BYTES;
          calib.push({ chars: cue.text.replace(/\s+/g, ' ').trim().length, dur: natural });
          if (fit.enabled) {
            const slot = slotOf(cues, i, totalDuration, fit.borrowGap);
            const p = planCue(natural, slot, fit.maxRate);
            if (p.rate > 1.005 || p.overflow > 0.02) {
              const filters: string[] = [];
              if (p.rate > 1.005) filters.push(`atempo=${p.rate.toFixed(3)}`);
              if (p.overflow > 0.02) { filters.push(`atrim=0:${slot.toFixed(3)}`, `afade=t=out:st=${Math.max(0, slot - 0.12).toFixed(3)}:d=0.12`); trimmed.push(i + 1); }
              await mp3ToPcm(src, tempPcm, filters.join(','));
              pcm = fs.readFileSync(tempPcm);
            }
            if (p.rate > 1.005) { nSped++; maxUsed = Math.max(maxUsed, p.rate); } else nFit++;
          }
          // cộng (không ghi đè) để câu chồng nhẹ lên nhau không bị cắt mất
          const start = Math.floor(cue.startSec * SAMPLE_RATE);
          const pcmA = pcm.byteOffset % 2 ? Buffer.from(pcm) : pcm; // Int16Array cần offset chẵn
          const src16 = new Int16Array(pcmA.buffer, pcmA.byteOffset, pcmA.length >> 1);
          const n = Math.max(0, Math.min(src16.length, master16.length - start));
          for (let k = 0; k < n; k++) {
            const v = master16[start + k] + src16[k];
            master16[start + k] = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
          }
          try { fs.unlinkSync(tempPcm); fs.unlinkSync(src); } catch { /* bỏ qua */ }
        };
        for (let i = 0; i < cues.length; i += 4) {
          await Promise.all(Array.from({ length: Math.min(4, cues.length - i) }, (_, k) => mixCue(i + k)));
        }
        if (fit.enabled) {
          log(`Khớp thời gian: ${nFit} câu vừa sẵn, ${nSped} câu tăng tốc (nhanh nhất ${maxUsed.toFixed(2)}×), ${trimmed.length} câu vẫn dài phải cắt đuôi.`);
          if (trimmed.length) log(`⚠ Câu bị cắt: ${trimmed.slice(0, 30).join(', ')}${trimmed.length > 30 ? '...' : ''} — dùng "Kiểm tra độ vừa" để rút gọn rồi lồng lại.`);
        }
        const cps = saveCalibration(voiceId, calib);
        if (cps) log(`Đã ghi nhận tốc độ đọc của giọng này: ~${cps.toFixed(1)} ký tự/giây (dùng cho "Kiểm tra độ vừa").`);
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
