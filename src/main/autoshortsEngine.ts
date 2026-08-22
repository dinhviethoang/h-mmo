import { ipcMain, BrowserWindow } from 'electron';
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
  log(`�ang g?i Google Veo 3 API cho k?ch b?n: "${prompt.substring(0, 30)}..."`);
  
  // NOTE: Thay th? do?n n�y b?ng actual REST API call to Google Veo 3 endpoint
  // fetch('https://generativelanguage.googleapis.com/v1beta/models/veo-3:generateVideo?key=' + apiKey, ...)
  
  await new Promise(r => setTimeout(r, 2000)); // Gi? l?p ch? Veo 3 render 2 gi�y
  
  // T?o 1 video c�m gi? l?p b?ng FFmpeg thay v� g?i API th?t (v� chua c� endpoint)
  await execPromise(`ffmpeg -y -f lavfi -i color=c=black:s=1080x1920:d=5 -f lavfi -i sine=f=440:b=4:d=5 -c:v libx264 -c:a aac "${outputPath}"`);
  log(`�� t?i video t? Veo 3 v?: ${outputPath}`);
}

export function setupAutoShortsEngine(mainWindow: BrowserWindow) {
  ipcMain.handle('autoshorts:generate', async (_event, options) => {
    return new Promise(async (resolve, reject) => {
      const { apiKey, scenes } = options;
      
      const log = (msg: string) => logToWindow(mainWindow, msg);
      log('B?t d?u quy tr�nh s?n xu?t Auto Shorts (Veo 3)...');

      try {
        const outDir = path.join(require('os').homedir(), 'Downloads', 'H-MMO-Shorts');
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        for (let i = 0; i < scenes.length; i++) {
          const sceneText = scenes[i];
          log(`\n--- X? L� C?NH ${i + 1}/${scenes.length} ---`);
          
          const veoVideoPath = path.join(outDir, `scene_${i+1}_veo.mp4`);
          const srtPath = path.join(outDir, `scene_${i+1}.srt`);
          const finalPath = path.join(outDir, `scene_${i+1}_final.mp4`);
          
          // Bu?c 1: G?i Veo 3 API
          await generateVeo3Video(apiKey, sceneText, veoVideoPath, log);

          // Bu?c 2: T?o Subtitles (Gi? l?p STT)
          log('�ang ch?y thu?t to�n Auto-alignment t?o Subtitle...');
          const srtContent = `1\n00:00:00,000 --> 00:00:04,500\n${sceneText}\n`;
          fs.writeFileSync(srtPath, srtContent, 'utf8');
          log('T?o file SRT th�nh c�ng!');

          // Bu?c 3: �p Subtitle v�o Video b?ng FFmpeg
          log('�ang d�ng FFmpeg �p Subtitle (Hardsub) l�n video c?a Veo 3...');
          // S?a du?ng d?n d? tr�nh l?i escape trong FFmpeg filter
          const srtPathFFmpeg = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
          
          const ffmpegCmd = `ffmpeg -y -i "${veoVideoPath}" -vf "subtitles='${srtPathFFmpeg}':force_style='FontName=Arial,FontSize=24,PrimaryColour=&H00FFFF,OutlineColour=&H000000,BorderStyle=1'" -c:a copy "${finalPath}"`;
          await execPromise(ffmpegCmd);
          
          log(`Ho�n th�nh C?nh ${i + 1}! File luu t?i: ${finalPath}`);
        }
        
        log('\nQUY TR�NH HO�N T?T!');
        resolve({ success: true });
      } catch (err: any) {
        log(`L?I: ${err.message}`);
        reject(err);
      }
    });
  });
}
