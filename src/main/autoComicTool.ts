import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { app } from 'electron'; // Đảm bảo import app từ electron
const ffmpeg = require('fluent-ffmpeg'); // đường dẫn ffmpeg/ffprobe gán chung ở tools.configureFluentFfmpeg()

/**
 * =========================================================
 * TOOL LÀM VIDEO TRUYỆN TRANH TỰ ĐỘNG (AUTO COMIC MAKER)
 * =========================================================
 * Quy trình:
 * 1. Nhận JSON từ LLM (Text + Prompt)
 * 2. Chạy Song Song: Sinh TTS (NeeyuVoice) + Sinh Ảnh (Image API)
 * 3. FFmpeg ghép Ảnh + Audio thành Video Cảnh (Scene)
 * 4. FFmpeg nối tất cả các Scene thành Video hoàn chỉnh
 */

// Interface định nghĩa dữ liệu đầu vào
export interface ComicScene {
    id: number;
    dialogues: string[]; // Thay vì 1 câu dài, giờ là 1 mảng các câu ngắn
    image_prompt?: string;
    image_url?: string; // Dành cho luồng nhận ảnh thẳng từ Chrome Extension
}

export class AutoComicTool {
    private tempDir: string;
    private neeyuEngineExe: string;
    private neeyuVoicesDir: string;
    private neeyuModelsDir: string;

    constructor() {
        this.tempDir = path.join(app.getPath('temp'), 'auto_comic_build');
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }

        // Cấu hình đường dẫn NeeyuVoice (Tương tự dubbingEngine.ts)
        const neeyuDir = path.join(os.homedir(), 'AppData', 'Roaming', 'NeeyuVoice');
        this.neeyuEngineExe = path.join(neeyuDir, 'runtime', 'engines', 'win-x64', 'cpu', 'vietnamese', 'neeyuvoice-engine.exe');
        this.neeyuVoicesDir = path.join(neeyuDir, 'voices');
        this.neeyuModelsDir = path.join(neeyuDir, 'runtime', 'models', 'neeyuvoice-vietnamese');
    }

    /**
     * 1. HÀM TẠO GIỌNG ĐỌC (Tái sử dụng logic NeeyuVoice)
     */
    private async generateTTS(text: string, outFile: string, voiceName: string = 'neeyu-voice-name'): Promise<void> {
        let success = false;
        let retries = 0;
        const MAX_RETRIES = 3;

        while (!success && retries < MAX_RETRIES) {
            try {
                await new Promise<void>((resolve, reject) => {
                    const proc = spawn(this.neeyuEngineExe, [
                        '--voices-dir', this.neeyuVoicesDir,
                        '--models-dir', this.neeyuModelsDir,
                        'generate',
                        '--text', text,
                        '--voice', voiceName,
                        '--out', outFile,
                        '--no-watermark'
                    ]);

                    let errorMessage = '';
                    proc.stdout.on('data', (data: Buffer) => {
                        const lines = data.toString().split('\n');
                        for (const line of lines) {
                            if (!line.trim()) continue;
                            try {
                                const parsed = JSON.parse(line);
                                if (parsed.type === 'error') errorMessage = parsed.message;
                            } catch (e) { /* Ignore */ }
                        }
                    });

                    proc.on('close', (code: number) => {
                        if (errorMessage) reject(new Error(`Lỗi NeeyuVoice: ${errorMessage}`));
                        else if (code === 0) resolve();
                        else reject(new Error(`NeeyuVoice exited with code ${code}`));
                    });
                    
                    proc.on('error', (err) => reject(err));
                });
                success = true;
            } catch (err: any) {
                retries++;
                console.warn(`[Cảnh báo] Lỗi TTS lần ${retries}, đang thử lại... (Chi tiết: ${err.message})`);
                if (retries >= MAX_RETRIES) {
                    throw new Error(`TTS thất bại sau ${MAX_RETRIES} lần: ${err.message}`);
                }
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }

    /**
     * 2. HÀM TẠO ẢNH (Bắt Base64 từ Extension hoặc gọi API DALL-E)
     */
    private async generateImage(scene: ComicScene, outFile: string, apiKey: string, baseUrl: string, imageModel: string = 'dall-e-3'): Promise<void> {
        // Ưu tiên dùng ảnh có sẵn từ Chrome Extension gửi về (Base64)
        if (scene.image_url && scene.image_url.startsWith('data:image')) {
            console.log(`[Image API] Trích xuất ảnh Base64 từ Chrome Extension...`);
            const base64Data = scene.image_url.replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, 'base64');
            require('fs').writeFileSync(outFile, buffer);
            console.log(`[Image API] Đã lưu ảnh từ ChatGPT thành công: ${outFile}`);
            return Promise.resolve();
        }

        // Nếu không có ảnh từ Extension, gọi DALL-E API như cũ
        return new Promise((resolve, reject) => {
            const prompt = scene.image_prompt || '';
            const https = require('https');
            const url = require('url');
            console.log(`[Image API] Đang gọi ${imageModel} API cho prompt: "${prompt.substring(0, 30)}..."`);
            
            const postData = JSON.stringify({
                model: imageModel,
                prompt: prompt,
                n: 1,
                size: imageModel === 'dall-e-2' ? "512x512" : "1024x1024" // DALL-E 2 hỗ trợ 512x512
            });

            const parsedUrl = url.parse(baseUrl);

            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || 443,
                path: parsedUrl.path,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = https.request(options, (res: any) => {
                let data = '';
                res.on('data', (chunk: any) => { data += chunk; });
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.error) return reject(new Error(`API DALL-E 3 lỗi: ${json.error.message}`));
                        
                        if (!json.data || !json.data[0] || !json.data[0].url) {
                            return reject(new Error(`Phản hồi API không hợp lệ: ${data}`));
                        }

                        const imageUrl = json.data[0].url;
                        console.log(`[Image API] Đã có link ảnh DALL-E 3, đang tải về...`);
                        
                        // Tải ảnh từ URL về máy
                        https.get(imageUrl, (imgRes: any) => {
                            if (imgRes.statusCode !== 200) return reject(new Error(`Lỗi tải ảnh: ${imgRes.statusCode}`));
                            const fileStream = fs.createWriteStream(outFile);
                            imgRes.pipe(fileStream);
                            fileStream.on('finish', () => {
                                fileStream.close();
                                console.log(`[Image API] Đã lưu ảnh thành công: ${outFile}`);
                                resolve();
                            });
                        }).on('error', reject);
                    } catch (e: any) {
                        reject(new Error(`Lỗi parse JSON từ API: ${e.message}`));
                    }
                });
            });

            req.on('error', reject);
            req.write(postData);
            req.end();
        });
    }

    /**
     * 3. HÀM ÉP ẢNH VÀ AUDIO THÀNH SCENE (FFMPEG TỐI ƯU)
     */
    private async buildSceneVideo(imagePath: string, audioPath: string, outVideoPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            ffmpeg()
                .input(imagePath).loop(1) 
                .input(audioPath)         
                // TỰ ĐỘNG CHUYỂN THÀNH VIDEO DỌC 9:16 (SHORTS/TIKTOK)
                // Phải chia luồng ảnh [0:v] làm 2 phần: nền (blur) và ảnh nổi (fg)
                .complexFilter([
                    '[0:v]split=2[blur][fg]',
                    '[blur]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:20[bg]',
                    '[fg]scale=1080:1920:force_original_aspect_ratio=decrease[fg_scaled]',
                    '[bg][fg_scaled]overlay=(W-w)/2:(H-h)/2[outv]'
                ], 'outv')
                .outputOptions([
                    '-map 1:a',           // Bắt buộc lấy luồng âm thanh

                    '-c:v libx264',
                    '-tune stillimage',
                    '-c:a aac',
                    '-b:a 192k',
                    '-pix_fmt yuv420p',
                    '-shortest'           
                ])
                .save(outVideoPath)
                .on('end', () => resolve())
                .on('error', (err: any) => reject(err));
        });
    }

    /**
     * 4. HÀM NỐI TẤT CẢ SCENE LẠI BẰNG CONCAT DEMUXER (SIÊU NHANH)
     */
    private async concatAllScenes(videoFiles: string[], finalOutput: string): Promise<void> {
        const listPath = path.join(this.tempDir, 'ffmpeg_concat_list.txt');
        const listContent = videoFiles.map(v => `file '${path.resolve(v).replace(/\\/g, '/')}'`).join('\n');
        fs.writeFileSync(listPath, listContent);

        return new Promise((resolve, reject) => {
            ffmpeg()
                .input(listPath)
                .inputOptions(['-f concat', '-safe 0'])
                .outputOptions(['-c copy']) // Nối Video không render lại (Mất 1s)
                .save(finalOutput)
                .on('end', () => resolve())
                .on('error', (err: any) => reject(err));
        });
    }

    /**
     * ==========================================
     * HÀM THỰC THI CHÍNH (MAIN PIPELINE)
     * ==========================================
     */
    public async runPipeline(storyData: ComicScene[], outputFileName: string = 'Truyen_Audio_Hoan_Chinh.mp4', voiceName: string = 'neeyu-voice-name', apiKey: string = '', baseUrl: string = '', imageModel: string = 'dall-e-3') {
        const finalOutput = path.join(app.getPath('downloads'), outputFileName);
        const videoList: string[] = [];

        console.log(`🚀 BẮT ĐẦU CHẠY PIPELINE ${imageModel.toUpperCase()} (${storyData.length} cảnh)`);

        for (let i = 0; i < storyData.length; i++) {
            const scene = storyData[i];
            console.log(`\n--- 🎬 XỬ LÝ CẢNH ${scene.id}/${storyData.length} ---`);

            const masterAudioFile = path.join(this.tempDir, `audio_master_${scene.id}.mp3`);
            const imageFile = path.join(this.tempDir, `image_${scene.id}.png`); 
            const sceneVideo = path.join(this.tempDir, `scene_${scene.id}.mp4`);

            // 1. CHẠY TẠO GIỌNG ĐỌC CHO TỪNG CÂU NGẮN (CHẠY LẦN LƯỢT ĐỂ TRÁNH QUÁ TẢI NEEYU)
            console.log(`[Tiến trình] Đang tạo Ảnh và ${scene.dialogues.length} câu thoại ngắn...`);
            
            const audioParts: string[] = [];
            // Chạy tạo ảnh ngầm song song
            const imagePromise = this.generateImage(scene, imageFile, apiKey, baseUrl, imageModel);
            
            // Chạy TTS lần lượt từng câu để không làm sập Neeyu Engine
            for (let idx = 0; idx < scene.dialogues.length; idx++) {
                let text = scene.dialogues[idx].replace(/["']/g, ''); // Xóa ngoặc kép gây lỗi
                const outPath = path.join(this.tempDir, `audio_${scene.id}_part_${idx}.mp3`);
                console.log(`   -> Đang đọc câu ${idx + 1}/${scene.dialogues.length}...`);
                await this.generateTTS(text, outPath, voiceName);
                audioParts.push(outPath);
            }

            await imagePromise; // Đợi ảnh tải xong (nếu chưa xong)

            // 2. NỐI CÁC CÂU THOẠI NGẮN THÀNH 1 FILE AUDIO MASTER CHO CẢNH ĐÓ
            const concatListPath = path.join(this.tempDir, `concat_audio_${scene.id}.txt`);
            const concatContent = audioParts.map(file => `file '${file.replace(/\\/g, '/')}'`).join('\n');
            fs.writeFileSync(concatListPath, concatContent);

            await new Promise<void>((resolve, reject) => {
                ffmpeg()
                    .input(concatListPath)
                    .inputOptions(['-f concat', '-safe 0'])
                    .outputOptions(['-c copy'])
                    .save(masterAudioFile)
                    .on('end', () => resolve())
                    .on('error', (err: any) => reject(err));
            });

            // 3. RENDER CẢNH VIDEO NHỎ BẰNG FFMPEG
            if (fs.existsSync(imageFile) && fs.existsSync(masterAudioFile)) {
                console.log(`[Tiến trình] Đang dùng FFmpeg render cảnh ${scene.id}...`);
                await this.buildSceneVideo(imageFile, masterAudioFile, sceneVideo);
                videoList.push(sceneVideo);
                console.log(`✅ Cảnh ${scene.id} hoàn tất!`);
            } else {
                throw new Error(`Thiếu tài nguyên cho cảnh ${scene.id}.`);
            }
        }

        // Bước 4: NỐI TẤT CẢ LẠI
        if (videoList.length > 0) {
            console.log(`\n🔥 Đang nối ${videoList.length} cảnh thành Video Hoàn Chỉnh...`);
            await this.concatAllScenes(videoList, finalOutput);
            console.log(`🎉 THÀNH CÔNG! Đã xuất video tại: ${finalOutput}`);
        } else {
            throw new Error("Không có cảnh nào được render.");
        }
    }
}

// ---------------------------------------------------------
// CÁCH SỬ DỤNG TRONG IPC MAIN (ELECTRON)
// ---------------------------------------------------------
import { ipcMain, BrowserWindow } from 'electron';

export function setupAutoComicIPC(_mainWindow: BrowserWindow) {
    ipcMain.handle('auto-comic:start', async (_event, data) => {
        try {
            const tool = new AutoComicTool();
            await tool.runPipeline(data.story, 'Truyen_Audio_Hoan_Chinh.mp4', data.voiceName, data.apiKey, data.baseUrl, data.imageModel);
            return true;
        } catch (error: any) {
            console.error("IPC Lỗi:", error);
            throw new Error(error.message); // Quăng lỗi về UI
        }
    });
}

// Lắng nghe dữ liệu bắn trực tiếp từ Chrome Extension
import http from 'http';
export function startAutoComicServer() {
    const server = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        if (req.method === 'POST' && req.url === '/api/create-comic') {
            let body = '';
            // Tăng limit nhận Base64
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    const tool = new AutoComicTool();
                    console.log("🔥 Đã nhận Kịch bản từ Chrome Extension. Bắt đầu render ngầm...");
                    
                    // Render ngầm
                    tool.runPipeline(data.story, 'Truyen_Audio_Extension_Grabbed.mp4', 'hoa-nu', '', '', '').catch(console.error);
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                } catch (e: any) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            });
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    // Cổng 8888 đang bị chiếm (thường do một cửa sổ H-MMO cũ chưa tắt hẳn) -> chỉ báo, không làm sập app
    server.on('error', (err: any) => {
        if (err?.code === 'EADDRINUSE') console.warn('[Extension Server] Cổng 8888 đang được dùng bởi chương trình khác - bỏ qua trạm thu sóng Auto Comic.')
        else console.error('[Extension Server] Lỗi:', err)
    })
    server.listen(8888, () => {
        console.log(`[Extension Server] Trạm thu sóng mở tại cổng 8888. Đang chờ dữ liệu từ trình duyệt...`);
    });
}
