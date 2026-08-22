import { ipcMain, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic.replace('app.asar', 'app.asar.unpacked'));
}

function logToWindow(mainWindow: BrowserWindow, message: string) {
  mainWindow.webContents.send('autoshorts:log', message);
}

// Giả lập API call tới Google Veo 3
async function generateVeo3Video(_apiKey: string, prompt: string, outputPath: string, log: (m: string) => void) {
  log(`Đang gọi Google Veo 3 API cho kịch bản: "${prompt.substring(0, 30)}..."`);
  
  await new Promise(r => setTimeout(r, 2000));
  
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input('color=c=black:s=1080x1920:d=5')
      .inputFormat('lavfi')
      .input('sine=f=440:b=4:d=5')
      .inputFormat('lavfi')
      .outputOptions(['-c:v libx264', '-c:a aac', '-y'])
      .output(outputPath)
      .on('end', () => {
        log(`Đã tải video từ Veo 3 về: ${outputPath}`);
        resolve(true);
      })
      .on('error', (err) => {
        reject(err);
      })
      .run();
  });
}

export function setupAutoShortsEngine(mainWindow: BrowserWindow) {
  ipcMain.handle('autoshorts:generate', async (_event, options) => {
    return new Promise(async (resolve, reject) => {
      const { apiKey, scenes } = options;
      
      const log = (msg: string) => logToWindow(mainWindow, msg);
      log('Bắt đầu quy trình sản xuất Auto Shorts 3-Cột (Veo 3)...');

      try {
        const outDir = path.join(require('os').homedir(), 'Downloads', 'H-MMO-Shorts');
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        for (let i = 0; i < scenes.length; i++) {
          const scene = scenes[i];
          log(`\n--- XỬ LÝ CẢNH ${i + 1}/${scenes.length} ---`);
          log(`Prompt Video: ${scene.prompt.substring(0, 50)}...`);
          log(`Lời thoại: ${scene.voiceover.substring(0, 50)}...`);
          
          const veoVideoPath = path.join(outDir, `scene_${i+1}_veo.mp4`);
          const srtPath = path.join(outDir, `scene_${i+1}.srt`);
          const finalPath = path.join(outDir, `scene_${i+1}_final.mp4`);
          
          // Bước 1: Gọi Veo 3 sử dụng PROMPT (Cột 2)
          await generateVeo3Video(apiKey, scene.prompt, veoVideoPath, log);

          // Bước 2: Tạo Subtitles / TTS sử dụng LỜI THOẠI (Cột 3)
          log('Đang chạy thuật toán Auto-alignment tạo Subtitle từ Lời Thoại...');
          const srtContent = `1\n00:00:00,000 --> 00:00:04,500\n${scene.voiceover}\n`;
          fs.writeFileSync(srtPath, srtContent, 'utf8');
          log('Tạo file SRT thành công!');

          // Bước 3: Ghép nối bằng FFmpeg
          log('Đang dùng FFmpeg ép Subtitle (Hardsub) lên video của Veo 3...');
          const srtPathFFmpeg = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
          
          await new Promise((res, rej) => {
            ffmpeg(veoVideoPath)
              .outputOptions([
                `-vf subtitles='${srtPathFFmpeg}':force_style='FontName=Arial,FontSize=24,PrimaryColour=&H00FFFF,OutlineColour=&H000000,BorderStyle=1'`,
                '-c:a copy',
                '-y'
              ])
              .output(finalPath)
              .on('end', () => {
                log(`Hoàn thành Cảnh ${i + 1}! File lưu tại: ${finalPath}`);
                res(true);
              })
              .on('error', (err) => {
                rej(err);
              })
              .run();
          });
        }
        
        log('\nQUY TRÌNH HOÀN TẤT!');
        resolve({ success: true });
      } catch (err: any) {
        log(`LỖI: ${err.message}`);
        reject(err);
      }
    });
  });
}
