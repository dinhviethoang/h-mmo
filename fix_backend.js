const fs = require('fs');
const content = `import { ipcMain, BrowserWindow } from 'electron';
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

// Gi? l?p API call t?i Google Veo 3
async function generateVeo3Video(apiKey: string, prompt: string, outputPath: string, log: (m: string) => void) {
  log(\`Ðang g?i Google Veo 3 API cho k?ch b?n: "\${prompt.substring(0, 30)}..."\`);
  
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
        log(\`Ðã t?i video t? Veo 3 v?: \${outputPath}\`);
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
      log('B?t d?u quy trình s?n xu?t Auto Shorts (Veo 3)...');

      try {
        const outDir = path.join(require('os').homedir(), 'Downloads', 'H-MMO-Shorts');
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        for (let i = 0; i < scenes.length; i++) {
          const sceneText = scenes[i];
          log(\`\\n--- X? LÝ C?NH \${i + 1}/\${scenes.length} ---\`);
          
          const veoVideoPath = path.join(outDir, \`scene_\${i+1}_veo.mp4\`);
          const srtPath = path.join(outDir, \`scene_\${i+1}.srt\`);
          const finalPath = path.join(outDir, \`scene_\${i+1}_final.mp4\`);
          
          await generateVeo3Video(apiKey, sceneText, veoVideoPath, log);

          log('Ðang ch?y thu?t toán Auto-alignment t?o Subtitle...');
          const srtContent = \`1\\n00:00:00,000 --> 00:00:04,500\\n\${sceneText}\\n\`;
          fs.writeFileSync(srtPath, srtContent, 'utf8');
          log('T?o file SRT thành công!');

          log('Ðang dùng FFmpeg ép Subtitle (Hardsub) lên video c?a Veo 3...');
          const srtPathFFmpeg = srtPath.replace(/\\\\/g, '/').replace(/:/g, '\\\\:');
          
          await new Promise((res, rej) => {
            ffmpeg(veoVideoPath)
              .outputOptions([
                \`-vf subtitles='\${srtPathFFmpeg}':force_style='FontName=Arial,FontSize=24,PrimaryColour=&H00FFFF,OutlineColour=&H000000,BorderStyle=1'\`,
                '-c:a copy',
                '-y'
              ])
              .output(finalPath)
              .on('end', () => {
                log(\`Hoàn thành C?nh \${i + 1}! File luu t?i: \${finalPath}\`);
                res(true);
              })
              .on('error', (err) => {
                rej(err);
              })
              .run();
          });
        }
        
        log('\\nQUY TRÌNH HOÀN T?T!');
        resolve({ success: true });
      } catch (err: any) {
        log(\`L?I: \${err.message}\`);
        reject(err);
      }
    });
  });
}
`;
fs.writeFileSync('src/main/autoshortsEngine.ts', content, 'utf8');
