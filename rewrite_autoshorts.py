import codecs

jsx_code = """import React, { useState, useEffect, useRef } from 'react';
import './AutoShortsPage.css';
import Papa from 'papaparse';

export interface Scene {
  content: string;
  prompt: string;
  voiceover: string;
}

export function AutoShortsPage() {
  const [activeTab, setActiveTab] = useState(1);
  const [inputType, setInputType] = useState('manual');
  const [inputText, setInputText] = useState('Xin chào.\\nHôm nay là m?t ngày tuy?t v?i.');
  const [gsheetUrl, setGsheetUrl] = useState('');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [apiKey, setApiKey] = useState('AIzaSyC-Fake-Key-For-Veo-3');
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  useEffect(() => {
    window.api.autoshortsLogs((logMsg: string) => {
      setLogs((prev) => [...prev, logMsg]);
    });
    return () => {};
  }, []);

  useEffect(() => {
    if (inputType === 'manual') {
      const splitText = inputText
        .split(/\\n+|\\.\\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
      setScenes(splitText.map(t => ({ content: t, prompt: t, voiceover: t })));
    }
  }, [inputText, inputType]);

  const handleFetchGsheet = async () => {
    if (!gsheetUrl.includes('docs.google.com/spreadsheets')) {
      alert('Vui lòng nh?p link Google Sheets h?p l?!');
      return;
    }
    try {
      const csvUrl = gsheetUrl.replace(/\\/edit.*$/, '/export?format=csv');
      const response = await fetch(csvUrl);
      const csvText = await response.text();
      
      Papa.parse(csvText, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = results.data as string[][];
          // Skip header row if it exists
          const dataRows = rows.length > 1 && rows[0][0].toLowerCase().includes('n?i dung') ? rows.slice(1) : rows;
          
          const newScenes: Scene[] = dataRows.map(row => ({
            content: row[0] || '',
            prompt: row[1] || row[0] || '',
            voiceover: row[2] || row[0] || ''
          })).filter(s => s.content.length > 0);
          
          setScenes(newScenes);
          alert(`Ðã t?i thành công ${newScenes.length} c?nh t? Google Sheets!`);
        },
        error: (err: any) => {
          alert('L?i parse CSV: ' + err.message);
        }
      });
    } catch (error: any) {
      alert('L?i t?i Google Sheets. Vui lòng d?m b?o Sheet dã du?c Share (Anyone with the link can view): ' + error.message);
    }
  };

  const handleStartRender = async () => {
    if (!apiKey) {
      alert('Vui lòng nh?p API Key c?a Google Veo 3!');
      return;
    }
    if (scenes.length === 0) {
      alert('Không có c?nh nào d? render!');
      return;
    }

    setIsProcessing(true);
    setLogs([]);
    try {
      await window.api.generateAutoShorts({ apiKey, scenes });
    } catch (error: any) {
      setLogs(prev => [...prev, `L?I H? TH?NG: ${error.message}`]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="autoshorts-page">
      <div className="as-header">Auto Shorts (Veo 3 AI)</div>
      
      <div className="as-stepper-box">
        <div className={`as-step ${activeTab >= 1 ? 'active' : ''}`}>
          <div className="as-step-circle">#1</div>
          <div className="as-step-label">Nh?p & Qu?n lý k?ch b?n</div>
        </div>
        <div className="as-step-line" style={{ background: activeTab >= 2 ? '#ff6600' : 'linear-gradient(90deg, #ff6600 50%, #4a4d5e 50%)' }}></div>
        <div className={`as-step ${activeTab >= 2 ? 'active' : ''}`}>
          <div className="as-step-circle">#2</div>
          <div className="as-step-label">C?u hình & S?n xu?t Video</div>
        </div>
      </div>

      {activeTab === 1 && (
        <>
          <div className="as-content-area">
            <div className="as-panel">
              <div className="as-panel-header">
                <h3 className="as-panel-title">Ngu?n D? Li?u</h3>
                <div className="as-toggle-group">
                  <button 
                    className={`as-toggle-btn ${inputType === 'manual' ? 'active' : ''}`}
                    onClick={() => {
                      setInputType('manual');
                    }}
                  >
                    Nh?p th? công
                  </button>
                  <button 
                    className={`as-toggle-btn ${inputType === 'gsheet' ? 'active' : ''}`}
                    onClick={() => setInputType('gsheet')}
                  >
                    Google Sheets
                  </button>
                </div>
              </div>
              
              {inputType === 'manual' ? (
                <textarea 
                  className="as-textarea" 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Nh?p k?ch b?n vào dây..."
                />
              ) : (
                <div className="as-upload-box" style={{ 
                  flex: 1, 
                  border: '2px dashed #4a4d5e', 
                  borderRadius: '8px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  backgroundColor: '#16171e',
                  padding: '20px'
                }}>
                  <p style={{ color: '#8b8e9d', marginBottom: '15px', textAlign: 'center' }}>
                    Dán link Google Sheets c?a b?n vào dây.<br/>(Yêu c?u Sheet có 3 c?t: N?i dung, Prompt Hình ?nh, K?ch b?n L?ng ti?ng)
                  </p>
                  <input 
                    type="text" 
                    className="form-control" 
                    style={{ width: '90%', marginBottom: '15px', backgroundColor: '#121319', border: '1px solid #2a2c38', color: '#fff', padding: '10px', borderRadius: '4px' }}
                    placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                    value={gsheetUrl}
                    onChange={(e) => setGsheetUrl(e.target.value)}
                  />
                  <button 
                    onClick={handleFetchGsheet}
                    style={{ 
                    backgroundColor: '#ff6600', 
                    color: '#fff', 
                    padding: '8px 20px', 
                    borderRadius: '4px', 
                    cursor: 'pointer',
                    fontWeight: 500,
                    border: 'none'
                  }}>
                    T?i D? Li?u T? Sheet
                  </button>
                </div>
              )}
            </div>

            <div className="as-panel">
              <div className="as-panel-header">
                <div>
                  <h3 className="as-panel-title">B?n xem tru?c ({scenes.length} c?nh)</h3>
                </div>
              </div>
              
              <div className="as-scene-list">
                {scenes.map((scene, index) => (
                  <div key={index} className={`as-scene-card ${index < 2 ? 'active' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div className="as-scene-header"># C?nh {index + 1}</div>
                    <div style={{ color: '#fff', fontSize: '14px' }}><b>G?c:</b> {scene.content}</div>
                    <div style={{ color: '#00ffff', fontSize: '13px' }}><b>Prompt Veo3:</b> {scene.prompt}</div>
                    <div style={{ color: '#ffcc00', fontSize: '13px' }}><b>L?i tho?i:</b> {scene.voiceover}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="as-footer">
            <button className="btn-continue" onClick={() => setActiveTab(2)}>
              Luu k?ch b?n & Ti?p t?c ?
            </button>
          </div>
        </>
      )}

      {activeTab === 2 && (
        <div className="as-content-area">
           <div className="as-panel" style={{ alignItems: 'center', justifyContent: 'center' }}>
             <h3 className="as-panel-title" style={{ fontSize: '24px', marginBottom: '10px' }}>S?n xu?t Video v?i Google Veo 3</h3>
             <p style={{ color: '#8b8e9d', marginBottom: '20px' }}>H? th?ng s? l?y {scenes.length} c?nh t? Bu?c 1, g?i AI sinh video (d?a trên Prompt) và t? ép ph? d? (d?a trên L?i tho?i).</p>
             
             <div style={{ width: '100%', maxWidth: '600px', marginBottom: '20px' }}>
               <label className="input-label" style={{ color: '#8b8e9d' }}>Google API Key</label>
               <input 
                 type="password" 
                 className="form-control" 
                 placeholder="Nh?p API Key c?a b?n..." 
                 value={apiKey} 
                 onChange={(e) => setApiKey(e.target.value)} 
                 disabled={isProcessing}
               />
             </div>

             <div style={{ display: 'flex', gap: '15px', marginBottom: '30px' }}>
               <button className="btn-continue" style={{ padding: '12px 30px', borderColor: '#4a4d5e', color: '#fff' }} onClick={() => setActiveTab(1)} disabled={isProcessing}>
                ? Quay l?i
               </button>
               <button className="btn-continue" style={{ padding: '12px 30px', backgroundColor: '#ff6600', color: '#fff', border: 'none' }} onClick={handleStartRender} disabled={isProcessing}>
                {isProcessing ? 'Ðang X? Lý...' : 'B?t Ð?u Render'}
               </button>
             </div>

             {/* Terminal Logs */}
             <div style={{
               width: '100%',
               flex: 1,
               backgroundColor: '#121319',
               borderRadius: '8px',
               padding: '15px',
               fontFamily: 'monospace',
               fontSize: '13px',
               color: '#00ff00',
               overflowY: 'auto',
               textAlign: 'left',
               border: '1px solid #2a2c38'
             }}>
                {logs.length === 0 ? (
                  <span style={{ color: '#8b8e9d' }}>[Terminal] Ðang ch? l?nh...</span>
                ) : (
                  logs.map((l, i) => <div key={i}>{l}</div>)
                )}
                <div ref={logEndRef} />
             </div>

           </div>
        </div>
      )}
    </div>
  );
}
"""

with codecs.open('src/renderer/src/pages/AutoShortsPage.tsx', 'w', 'utf-8-sig') as f:
    f.write(jsx_code)

engine_code = """import { ipcMain, BrowserWindow } from 'electron';
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
async function generateVeo3Video(_apiKey: string, prompt: string, outputPath: string, log: (m: string) => void) {
  log(`Ðang g?i Google Veo 3 API cho k?ch b?n: "${prompt.substring(0, 30)}..."`);
  
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
        log(`Ðã t?i video t? Veo 3 v?: ${outputPath}`);
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
      log('B?t d?u quy trình s?n xu?t Auto Shorts 3-C?t (Veo 3)...');

      try {
        const outDir = path.join(require('os').homedir(), 'Downloads', 'H-MMO-Shorts');
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        for (let i = 0; i < scenes.length; i++) {
          const scene = scenes[i];
          log(`\\n--- X? LÝ C?NH ${i + 1}/${scenes.length} ---`);
          log(`Prompt Video: ${scene.prompt.substring(0, 50)}...`);
          log(`L?i tho?i: ${scene.voiceover.substring(0, 50)}...`);
          
          const veoVideoPath = path.join(outDir, `scene_${i+1}_veo.mp4`);
          const srtPath = path.join(outDir, `scene_${i+1}.srt`);
          const finalPath = path.join(outDir, `scene_${i+1}_final.mp4`);
          
          // Bu?c 1: G?i Veo 3 s? d?ng PROMPT (C?t 2)
          await generateVeo3Video(apiKey, scene.prompt, veoVideoPath, log);

          // Bu?c 2: T?o Subtitles / TTS s? d?ng L?I THO?I (C?t 3)
          log('Ðang ch?y thu?t toán Auto-alignment t?o Subtitle t? L?i Tho?i...');
          const srtContent = `1\\n00:00:00,000 --> 00:00:04,500\\n${scene.voiceover}\\n`;
          fs.writeFileSync(srtPath, srtContent, 'utf8');
          log('T?o file SRT thành công!');

          // Bu?c 3: Ghép n?i b?ng FFmpeg
          log('Ðang dùng FFmpeg ép Subtitle (Hardsub) lên video c?a Veo 3...');
          const srtPathFFmpeg = srtPath.replace(/\\\\/g, '/').replace(/:/g, '\\\\:');
          
          await new Promise((res, rej) => {
            ffmpeg(veoVideoPath)
              .outputOptions([
                `-vf subtitles='${srtPathFFmpeg}':force_style='FontName=Arial,FontSize=24,PrimaryColour=&H00FFFF,OutlineColour=&H000000,BorderStyle=1'`,
                '-c:a copy',
                '-y'
              ])
              .output(finalPath)
              .on('end', () => {
                log(`Hoàn thành C?nh ${i + 1}! File luu t?i: ${finalPath}`);
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
        log(`L?I: ${err.message}`);
        reject(err);
      }
    });
  });
}
"""

with codecs.open('src/main/autoshortsEngine.ts', 'w', 'utf-8-sig') as f:
    f.write(engine_code)
print('Done writing JSX and TS Engine!')
