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
      const { videoPath, srtPath, voiceId } = options;
      const log = (msg: string) => mainWindow.webContents.send('dubbing:log', msg);
      
      const parsedPath = path.parse(videoPath);
      const outVideoPath = path.join(parsedPath.dir, `${parsedPath.name}_dubbed.mp4`);
      const tempDir = app.getPath('temp');
      const masterPcmPath = path.join(tempDir, `master_${parsedPath.name}.pcm`);
      
      try {
        log('Bắt đầu quy trình lồng tiếng...');
        log('Đọc file phụ đề SRT...');
        const srtContent = fs.readFileSync(srtPath, 'utf8');
        const cues = parseSrt(srtContent);
        log(`Tìm thấy ${cues.length} câu thoại.`);
        
        log('Đang phân tích thời lượng video gốc...');
        const totalDuration = await getVideoDuration(videoPath);
        
        // 24000 Hz, 1 channel, 16-bit (2 bytes per sample)
        const SAMPLE_RATE = 24000;
        const BYTES_PER_SAMPLE = 2;
        const bufferSize = Math.ceil(totalDuration * SAMPLE_RATE * BYTES_PER_SAMPLE);
        const masterBuffer = Buffer.alloc(bufferSize, 0); // Filled with silence
        
        log('Bắt đầu tạo giọng nói (TTS) cho từng câu...');
        
        let currentVoiceId = voiceId;
        
        for (let i = 0; i < cues.length; i++) {
          const cue = cues[i];
          log(`Đang tạo audio [${i+1}/${cues.length}]: "${cue.text.substring(0, 30)}..."`);
          
          const tempMp3 = path.join(tempDir, `cue_${i}.mp3`);
          const tempPcm = path.join(tempDir, `cue_${i}.pcm`);
          
          // TTS Generation via APIs

          let cueSuccess = false;
          
          while (!cueSuccess) {
            try {
              if (currentVoiceId.startsWith('neeyu-')) {
                const voiceName = currentVoiceId.replace('neeyu-', '');
                const os = require('os');
                const neeyuDir = path.join(os.homedir(), 'AppData', 'Roaming', 'NeeyuVoice');
                const engineExe = path.join(neeyuDir, 'runtime', 'engines', 'win-x64', 'cpu', 'vietnamese', 'neeyuvoice-engine.exe');
                const voicesDir = path.join(neeyuDir, 'voices');
                const modelsDir = path.join(neeyuDir, 'runtime', 'models', 'neeyuvoice-vietnamese');
                
                if (!fs.existsSync(engineExe)) throw new Error("Không tìm thấy Engine NeeyuVoice. Vui lòng cài đặt NeeyuVoice.");
                
                log(`[NeeyuVoice] Đang tạo âm thanh (Offline CPU)...`);
                
                const { spawn } = require('child_process');
                await new Promise<void>((resolve, reject) => {
                  const process = spawn(engineExe, [
                    '--voices-dir', voicesDir,
                    '--models-dir', modelsDir,
                    'generate',
                    '--text', cue.text,
                    '--voice', voiceName,
                    '--out', tempMp3,
                    '--no-watermark'
                  ]);
                  
                  process.stdout.on('data', (data) => {
                    const lines = data.toString().split('\n');
                    for (const line of lines) {
                      if (!line.trim()) continue;
                      try {
                        const parsed = JSON.parse(line);
                        if (parsed.type === 'error') reject(new Error(parsed.message));
                      } catch (e) {
                         // Ignore non-json logs
                      }
                    }
                  });
                  
                  process.on('close', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`NeeyuVoice process exited with code ${code}`));
                  });
                });
                
                cueSuccess = true;
                
              } else {
                 throw new Error("Giọng đọc không được hỗ trợ: " + currentVoiceId);
              }
            } catch (err: any) {
              throw err;
            }
          }
          
          // Convert to PCM
          await mp3ToPcm(tempMp3, tempPcm);
          
          // Read PCM and place into master buffer
          const pcmData = fs.readFileSync(tempPcm);
          const offset = Math.floor(cue.startSec * SAMPLE_RATE * BYTES_PER_SAMPLE);
          
          // Ensure we don't write out of bounds
          if (offset < masterBuffer.length) {
            const bytesToWrite = Math.min(pcmData.length, masterBuffer.length - offset);
            pcmData.copy(masterBuffer, offset, 0, bytesToWrite);
          }
          
          // Cleanup temps
          if (fs.existsSync(tempMp3)) fs.unlinkSync(tempMp3);
          if (fs.existsSync(tempPcm)) fs.unlinkSync(tempPcm);
        }
        
        log('Đã tạo xong luồng âm thanh lồng tiếng. Đang lưu ra file tạm...');
        fs.writeFileSync(masterPcmPath, masterBuffer);
        
        log('Đang ghép âm thanh lồng tiếng vào video (Audio Mixing & Ducking)...');
        // Mix: original audio volume at 15%, dubbing audio at 100%
        await new Promise((res, rej) => {
          ffmpeg(videoPath)
            .input(masterPcmPath)
            .inputOptions([
              '-f', 's16le',
              '-ar', '24000',
              '-ac', '1'
            ])
            .complexFilter([
              '[0:a]volume=0.15[bg]',
              '[1:a]volume=1.5[dub]',
              '[bg][dub]amix=inputs=2:duration=first[a]'
            ])
            .outputOptions([
              '-map', '0:v',
              '-map', '[a]',
              '-c:v', 'copy',
              '-c:a', 'aac',
              '-b:a', '192k'
            ])
            .on('end', res)
            .on('error', rej)
            .save(outVideoPath);
        });
        
        // Cleanup master PCM
        if (fs.existsSync(masterPcmPath)) fs.unlinkSync(masterPcmPath);
        
        log(`====== HOÀN TẤT ======`);
        log(`Video lồng tiếng đã lưu tại: ${outVideoPath}`);
        resolve(outVideoPath);
      } catch (err: any) {
        log(`[LỖI] ${err.message}`);
        reject(err);
      }
    });
  });
}
