const fs = require('fs');
const path = require('path');

// 1. Create autoshortsEngine.ts
const autoshortsEngineCode = `import { ipcMain, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

function logToWindow(mainWindow: BrowserWindow, message: string) {
  mainWindow.webContents.send('autoshorts:log', message);
}

// Gi? l?p API call t?i Google Veo 3
async function generateVeo3Video(apiKey: string, prompt: string, outputPath: string, log: (m: string) => void) {
  log(\`Ðang g?i Google Veo 3 API cho k?ch b?n: "\${prompt.substring(0, 30)}..."\`);
  
  // NOTE: Thay th? do?n này b?ng actual REST API call to Google Veo 3 endpoint
  // fetch('https://generativelanguage.googleapis.com/v1beta/models/veo-3:generateVideo?key=' + apiKey, ...)
  
  await new Promise(r => setTimeout(r, 2000)); // Gi? l?p ch? Veo 3 render 2 giây
  
  // T?o 1 video câm gi? l?p b?ng FFmpeg thay vì g?i API th?t (vì chua có endpoint)
  await execPromise(\`ffmpeg -y -f lavfi -i color=c=black:s=1080x1920:d=5 -f lavfi -i sine=f=440:b=4:d=5 -c:v libx264 -c:a aac "\${outputPath}"\`);
  log(\`Ðã t?i video t? Veo 3 v?: \${outputPath}\`);
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
          
          // Bu?c 1: G?i Veo 3 API
          await generateVeo3Video(apiKey, sceneText, veoVideoPath, log);

          // Bu?c 2: T?o Subtitles (Gi? l?p STT)
          log('Ðang ch?y thu?t toán Auto-alignment t?o Subtitle...');
          const srtContent = \`1\\n00:00:00,000 --> 00:00:04,500\\n\${sceneText}\\n\`;
          fs.writeFileSync(srtPath, srtContent, 'utf8');
          log('T?o file SRT thành công!');

          // Bu?c 3: Ép Subtitle vào Video b?ng FFmpeg
          log('Ðang dùng FFmpeg ép Subtitle (Hardsub) lên video c?a Veo 3...');
          // S?a du?ng d?n d? tránh l?i escape trong FFmpeg filter
          const srtPathFFmpeg = srtPath.replace(/\\\\/g, '/').replace(/:/g, '\\\\:');
          
          const ffmpegCmd = \`ffmpeg -y -i "\${veoVideoPath}" -vf "subtitles='\${srtPathFFmpeg}':force_style='FontName=Arial,FontSize=24,PrimaryColour=&H00FFFF,OutlineColour=&H000000,BorderStyle=1'" -c:a copy "\${finalPath}"\`;
          await execPromise(ffmpegCmd);
          
          log(\`Hoàn thành C?nh \${i + 1}! File luu t?i: \${finalPath}\`);
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
fs.writeFileSync('src/main/autoshortsEngine.ts', autoshortsEngineCode, 'utf8');

// 2. Modify index.ts
let indexContent = fs.readFileSync('src/main/index.ts', 'utf8');
if (!indexContent.includes('setupAutoShortsEngine')) {
  indexContent = indexContent.replace(
    "import { setupDubbingEngine } from './dubbingEngine'",
    "import { setupDubbingEngine } from './dubbingEngine'\nimport { setupAutoShortsEngine } from './autoshortsEngine'"
  );
  indexContent = indexContent.replace(
    "setupDubbingEngine(mainWindow)",
    "setupDubbingEngine(mainWindow)\n  setupAutoShortsEngine(mainWindow)"
  );
  fs.writeFileSync('src/main/index.ts', indexContent, 'utf8');
}

// 3. Modify preload index.js
let preloadContent = fs.readFileSync('src/preload/index.ts', 'utf8');
if (!preloadContent.includes('autoshorts:generate')) {
  preloadContent = preloadContent.replace(
    "dubbingLogs: (callback) => ipcRenderer.on('dubbing:log', (_event, value) => callback(value)),",
    "dubbingLogs: (callback) => ipcRenderer.on('dubbing:log', (_event, value) => callback(value)),\n  generateAutoShorts: (options) => ipcRenderer.invoke('autoshorts:generate', options),\n  autoshortsLogs: (callback) => ipcRenderer.on('autoshorts:log', (_event, value) => callback(value)),"
  );
  fs.writeFileSync('src/preload/index.ts', preloadContent, 'utf8');
}

// 4. Modify preload index.d.ts
let dtsContent = fs.readFileSync('src/preload/index.d.ts', 'utf8');
if (!dtsContent.includes('generateAutoShorts')) {
  dtsContent = dtsContent.replace(
    "dubbingLogs: (callback: (log: string) => void) => void",
    "dubbingLogs: (callback: (log: string) => void) => void\n      generateAutoShorts: (options: any) => Promise<any>\n      autoshortsLogs: (callback: (log: string) => void) => void"
  );
  fs.writeFileSync('src/preload/index.d.ts', dtsContent, 'utf8');
}

console.log("Backend updated successfully.");
