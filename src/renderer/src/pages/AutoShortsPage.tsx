import { useState, useEffect, useRef } from 'react';
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
  const [inputText, setInputText] = useState('Xin chào.\nHôm nay là một ngày tuyệt vời.');
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
        .split(/\n+|\.\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
      setScenes(splitText.map(t => ({ content: t, prompt: t, voiceover: t })));
    }
  }, [inputText, inputType]);

  const handleFetchGsheet = async () => {
    if (!gsheetUrl.includes('docs.google.com/spreadsheets')) {
      alert('Vui lòng nhập link Google Sheets hợp lệ!');
      return;
    }
    try {
      const csvUrl = gsheetUrl.replace(/\/edit.*$/, '/export?format=csv');
      const response = await fetch(csvUrl);
      const csvText = await response.text();
      
      Papa.parse(csvText, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = results.data as string[][];
          // Skip header row if it exists
          const dataRows = rows.length > 1 && rows[0][0].toLowerCase().includes('nội dung') ? rows.slice(1) : rows;
          
          const newScenes: Scene[] = dataRows.map(row => ({
            content: row[0] || '',
            prompt: row[1] || row[0] || '',
            voiceover: row[2] || row[0] || ''
          })).filter(s => s.content.length > 0);
          
          setScenes(newScenes);
          alert(`Đã tải thành công ${newScenes.length} cảnh từ Google Sheets!`);
        },
        error: (err: any) => {
          alert('Lỗi parse CSV: ' + err.message);
        }
      });
    } catch (error: any) {
      alert('Lỗi tải Google Sheets. Vui lòng đảm bảo Sheet đã được Share (Anyone with the link can view): ' + error.message);
    }
  };

  const handleStartRender = async () => {
    if (!apiKey) {
      alert('Vui lòng nhập API Key của Google Veo 3!');
      return;
    }
    if (scenes.length === 0) {
      alert('Không có cảnh nào để render!');
      return;
    }

    setIsProcessing(true);
    setLogs([]);
    try {
      await window.api.generateAutoShorts({ apiKey, scenes });
    } catch (error: any) {
      setLogs(prev => [...prev, `LỖI HỆ THỐNG: ${error.message}`]);
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
          <div className="as-step-label">Nhập & Quản lý kịch bản</div>
        </div>
        <div className="as-step-line" style={{ background: activeTab >= 2 ? '#ff6600' : 'linear-gradient(90deg, #ff6600 50%, #4a4d5e 50%)' }}></div>
        <div className={`as-step ${activeTab >= 2 ? 'active' : ''}`}>
          <div className="as-step-circle">#2</div>
          <div className="as-step-label">Cấu hình & Sản xuất Video</div>
        </div>
      </div>

      {activeTab === 1 && (
        <>
          <div className="as-content-area">
            <div className="as-panel">
              <div className="as-panel-header">
                <h3 className="as-panel-title">Nguồn Dữ Liệu</h3>
                <div className="as-toggle-group">
                  <button 
                    className={`as-toggle-btn ${inputType === 'manual' ? 'active' : ''}`}
                    onClick={() => {
                      setInputType('manual');
                    }}
                  >
                    Nhập thủ công
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
                  placeholder="Nhập kịch bản vào đây..."
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
                    Dán link Google Sheets của bạn vào đây.<br/>(Yêu cầu Sheet có 3 cột: Nội dung, Prompt Hình ảnh, Kịch bản Lồng tiếng)
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
                    Tải Dữ Liệu Từ Sheet
                  </button>
                </div>
              )}
            </div>

            <div className="as-panel">
              <div className="as-panel-header">
                <div>
                  <h3 className="as-panel-title">Bản xem trước ({scenes.length} cảnh)</h3>
                </div>
              </div>
              
              <div className="as-scene-list">
                {scenes.map((scene, index) => (
                  <div key={index} className={`as-scene-card ${index < 2 ? 'active' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div className="as-scene-header"># Cảnh {index + 1}</div>
                    <div style={{ color: '#fff', fontSize: '14px' }}><b>Gốc:</b> {scene.content}</div>
                    <div style={{ color: '#00ffff', fontSize: '13px' }}><b>Prompt Veo3:</b> {scene.prompt}</div>
                    <div style={{ color: '#ffcc00', fontSize: '13px' }}><b>Lời thoại:</b> {scene.voiceover}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="as-footer">
            <button className="btn-continue" onClick={() => setActiveTab(2)}>
              Lưu kịch bản & Tiếp tục →
            </button>
          </div>
        </>
      )}

      {activeTab === 2 && (
        <div className="as-content-area">
           <div className="as-panel" style={{ alignItems: 'center', justifyContent: 'center' }}>
             <h3 className="as-panel-title" style={{ fontSize: '24px', marginBottom: '10px' }}>Sản xuất Video với Google Veo 3</h3>
             <p style={{ color: '#8b8e9d', marginBottom: '20px' }}>Hệ thống sẽ lấy {scenes.length} cảnh từ Bước 1, gọi AI sinh video (dựa trên Prompt) và tự ép phụ đề (dựa trên Lời thoại).</p>
             
             <div style={{ width: '100%', maxWidth: '600px', marginBottom: '20px' }}>
               <label className="input-label" style={{ color: '#8b8e9d' }}>Google API Key</label>
               <input 
                 type="password" 
                 className="form-control" 
                 placeholder="Nhập API Key của bạn..." 
                 value={apiKey} 
                 onChange={(e) => setApiKey(e.target.value)} 
                 disabled={isProcessing}
               />
             </div>

             <div style={{ display: 'flex', gap: '15px', marginBottom: '30px' }}>
               <button className="btn-continue" style={{ padding: '12px 30px', borderColor: '#4a4d5e', color: '#fff' }} onClick={() => setActiveTab(1)} disabled={isProcessing}>
                ← Quay lại
               </button>
               <button className="btn-continue" style={{ padding: '12px 30px', backgroundColor: '#ff6600', color: '#fff', border: 'none' }} onClick={handleStartRender} disabled={isProcessing}>
                {isProcessing ? 'Đang Xử Lý...' : 'Bắt Đầu Render'}
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
                  <span style={{ color: '#8b8e9d' }}>[Terminal] Đang chờ lệnh...</span>
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
