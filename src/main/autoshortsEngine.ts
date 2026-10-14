import { ipcMain, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { app } from 'electron';

export interface SceneData {
  content: string;
  prompt: string;
  voiceover: string;
}

interface SrtBlock {
  id: number;
  start: number;
  end: number;
  duration: number;
  text: string;
}

function parseSrt(srtContent: string): SrtBlock[] {
  const blocks: SrtBlock[] = [];
  const lines = srtContent.replace(/\r\n/g, '\n').split('\n');
  
  let currentBlock: any = null;
  let textLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') {
      if (currentBlock && textLines.length > 0) {
        currentBlock.text = textLines.join('\n');
        blocks.push(currentBlock as SrtBlock);
        currentBlock = null;
        textLines = [];
      }
      continue;
    }

    if (!currentBlock) {
      if (/^\d+$/.test(line)) {
        currentBlock = { id: parseInt(line, 10) };
      }
    } else if (currentBlock.start === undefined) {
      const timeMatch = line.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
      if (timeMatch) {
        const startSec = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 1000;
        const endSec = parseInt(timeMatch[5]) * 3600 + parseInt(timeMatch[6]) * 60 + parseInt(timeMatch[7]) + parseInt(timeMatch[8]) / 1000;
        currentBlock.start = startSec;
        currentBlock.end = endSec;
        currentBlock.duration = endSec - startSec;
      }
    } else {
      textLines.push(line);
    }
  }

  if (currentBlock && textLines.length > 0) {
    currentBlock.text = textLines.join('\n');
    blocks.push(currentBlock as SrtBlock);
  }

  return blocks;
}

function parsePrompts(promptContent: string): Record<number, string> {
  const map: Record<number, string> = {};
  const regex = /\[(\d+)\]\s*(.*?)(?=\n\[\d+\]|$)/gs;
  let match;
  while ((match = regex.exec(promptContent)) !== null) {
    map[parseInt(match[1], 10)] = match[2].trim();
  }
  return map;
}

export function setupAutoShortsEngine(mainWindow: BrowserWindow) {
  ipcMain.handle('autoshorts:fetchGsheet', async (_event, url: string) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      return await response.text();
    } catch (err: any) {
      throw new Error(err.message);
    }
  });

  ipcMain.handle('autoshorts:generate', async (_event, options) => {
    return new Promise(async (resolve, reject) => {
      const { scenes } = options;
      const downloadsPath = path.join(app.getPath('downloads'), 'H-MMO-Shorts');
      
      if (!fs.existsSync(downloadsPath)) {
        fs.mkdirSync(downloadsPath, { recursive: true });
      }

      const log = (msg: string) => {
        console.log(`[AutoShorts] ${msg}`);
        mainWindow.webContents.send('autoshorts:log', msg);
      };

      log('=== BẮT ĐẦU CHUỖI SẢN XUẤT MONTAGE AUTO SHORTS ===');
      log(`Thư mục lưu trữ: ${downloadsPath}`);
      log(`Tổng số kịch bản cần render: ${scenes.length}`);

      try {
        for (let i = 0; i < scenes.length; i++) {
          const scene: SceneData = scenes[i];
          log(`\n--- ĐANG XỬ LÝ KỊCH BẢN ${i + 1}/${scenes.length} ---`);
          
          let srtContent = scene.voiceover;
          if (!srtContent.includes('-->')) {
             throw new Error("Lỗi kịch bản: Cột Lời Thoại không phải chuẩn SRT (không có -->). Vui lòng dùng lệnh ChatGPT được cung cấp.");
          }

          const srtBlocks = parseSrt(srtContent);
          const promptMap = parsePrompts(scene.prompt);
          
          if (srtBlocks.length === 0) {
             throw new Error("Lỗi SRT: Không phân tích được đoạn thoại nào.");
          }
          
          log(`[Phân tích] Tìm thấy ${srtBlocks.length} phân cảnh (câu thoại).`);

          const safeName = `scene_${i + 1}_${Date.now()}`;
          const workDir = path.join(downloadsPath, safeName);
          fs.mkdirSync(workDir, { recursive: true });

          const srtPath = path.join(workDir, `subs.srt`);
          fs.writeFileSync(srtPath, srtContent, 'utf8');

          const clipFiles: string[] = [];

          for (let b = 0; b < srtBlocks.length; b++) {
             const block = srtBlocks[b];
             const pId = block.id;
             let imgPrompt = promptMap[pId] || promptMap[1] || "A cinematic scene";
             
             log(`[Phân cảnh ${pId}] Sinh ảnh: "${imgPrompt.substring(0, 30)}..."`);
             
             const encodedPrompt = encodeURIComponent(imgPrompt + ", cinematic, highly detailed, 8k");
             const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1080&height=1920&nologo=true`;
             
             const imgRes = await fetch(url);
             if (!imgRes.ok) throw new Error("Không thể tải ảnh từ Pollinations AI");
             const arrayBuffer = await imgRes.arrayBuffer();
             const imgPath = path.join(workDir, `img_${pId}.jpg`);
             fs.writeFileSync(imgPath, Buffer.from(arrayBuffer));

             const clipPath = path.join(workDir, `clip_${pId}.mp4`);
             const duration = Math.max(block.duration, 0.5);

             log(`[Phân cảnh ${pId}] Render clip nền (Dài ${duration.toFixed(2)}s)`);
             
             await new Promise<void>((resolveRender, rejectRender) => {
                ffmpeg(imgPath)
                  .loop(duration)
                  .videoFilters([
                    `zoompan=z='min(zoom+0.001,1.1)':d=${Math.ceil(duration * 25)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920`
                  ])
                  .outputOptions([
                    '-c:v libx264',
                    '-t', duration.toString(),
                    '-pix_fmt yuv420p',
                    '-y'
                  ])
                  .on('end', () => resolveRender())
                  .on('error', (err) => rejectRender(err))
                  .save(clipPath);
             });
             
             clipFiles.push(clipPath);
          }

          log('Đang nối các phân cảnh lại thành 1 video (Concat)...');
          const concatListPath = path.join(workDir, 'concat_list.txt');
          const concatContent = clipFiles.map(c => `file '${path.basename(c)}'`).join('\n');
          fs.writeFileSync(concatListPath, concatContent, 'utf8');

          const rawVideoPath = path.join(workDir, `raw_merged.mp4`);
          await new Promise<void>((resConcat, rejConcat) => {
            ffmpeg()
              .input(concatListPath)
              .inputOptions(['-f concat', '-safe 0'])
              .outputOptions(['-c copy', '-y'])
              .on('end', () => resConcat())
              .on('error', (err) => rejConcat(err))
              .save(rawVideoPath);
          });

          log('Đang ghép Phụ đề lên Video hoàn chỉnh (Hardsub)...');
          const finalPath = path.join(downloadsPath, `${safeName}_final.mp4`);
          const safeSrtPath = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');

          await new Promise<void>((resSub, rejSub) => {
            ffmpeg(rawVideoPath)
              .outputOptions([
                `-vf subtitles='${safeSrtPath}':force_style='Fontname=Arial,FontSize=24,PrimaryColour=&H00FFFF,Outline=1,Shadow=1'`,
                '-c:v libx264',
                '-c:a copy',
                '-y'
              ])
              .on('end', () => resSub())
              .on('error', (err) => rejSub(err))
              .save(finalPath);
          });

          log(`=> HOÀN THÀNH VIDEO ${i + 1}: ${finalPath}`);
          fs.rmSync(workDir, { recursive: true, force: true });
        }

        log('\n=== TẤT CẢ VIDEO ĐÃ ĐƯỢC RENDER THÀNH CÔNG! ===');
        resolve({ success: true });
      } catch (error: any) {
        log(`[LỖI HỆ THỐNG] Quá trình bị gián đoạn: ${error.message}`);
        reject(error);
      }
    });
  });
}
