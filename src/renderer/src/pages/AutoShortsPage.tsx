import { useState, useEffect, useRef } from 'react';
import './AutoShortsPage.css';

export function AutoShortsPage() {
  const [activeTab, setActiveTab] = useState(1);
  const [inputType, setInputType] = useState('manual');
  const [inputText, setInputText] = useState("Hôm nay tôi sẽ hướng dẫn các bạn cách làm video tự động.\nChỉ với vài thao tác cơ bản, AI sẽ lo toàn bộ phần hình ảnh.\nHãy đăng ký kênh để xem thêm nhiều công cụ hay nhé!");
  const [scenes, setScenes] = useState<string[]>([]);
  
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('geminiApiKey') || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { localStorage.setItem('geminiApiKey', apiKey); }, [apiKey]);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  useEffect(() => {
    // Listen for backend logs
    const removeListener = window.api.autoshortsLogs((logMsg: string) => {
      setLogs((prev) => [...prev, logMsg]);
    });
    return () => {
      if (removeListener) removeListener();
    };
  }, []);

  useEffect(() => {
    if (!inputText && inputType === 'manual') {
      setScenes([]);
      return;
    }
    if (inputType === 'manual') {
      const splitText = inputText
        .split(/\n+|\.\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
      setScenes(splitText);
    }
  }, [inputText, inputType]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      alert(`Đã chọn file: ${file.name}\nTính năng đọc Excel đang được phát triển!`);
      setScenes([
        `Nội dung từ file ${file.name} - Dòng 1`,
        `Nội dung từ file ${file.name} - Dòng 2`,
        `Nội dung từ file ${file.name} - Dòng 3`
      ]);
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
                      const splitText = inputText.split(/\n+|\.\s+/).map(s => s.trim()).filter(s => s.length > 0);
                      setScenes(splitText);
                    }}
                  >
                    Nhập thủ công
                  </button>
                  <button 
                    className={`as-toggle-btn ${inputType === 'excel' ? 'active' : ''}`}
                    onClick={() => setInputType('excel')}
                  >
                    Tải file Excel
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
                  cursor: 'pointer'
                }}>
                  <p style={{ color: '#8b8e9d', marginBottom: '15px' }}>Kéo thả file .xlsx / .csv vào đây</p>
                  <label style={{ 
                    backgroundColor: '#ff6600', 
                    color: '#fff', 
                    padding: '8px 20px', 
                    borderRadius: '4px', 
                    cursor: 'pointer',
                    fontWeight: 500
                  }}>
                    Chọn File
                    <input type="file" accept=".xlsx, .xls, .csv" style={{ display: 'none' }} onChange={handleFileUpload} />
                  </label>
                </div>
              )}
            </div>

            <div className="as-panel">
              <div className="as-panel-header">
                <div>
                  <h3 className="as-panel-title">Bản xem trước (Đã tách câu)</h3>
                  <div className="as-panel-subtitle">{scenes.length} cảnh được tìm thấy</div>
                </div>
              </div>
              
              <div className="as-scene-list">
                {scenes.map((scene, index) => (
                  <div key={index} className={`as-scene-card ${index < 2 ? 'active' : ''}`}>
                    <div className="as-scene-header"># Cảnh {index + 1}</div>
                    <div className="as-scene-text">{scene}</div>
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
             <p style={{ color: '#8b8e9d', marginBottom: '20px' }}>Hệ thống sẽ lấy {scenes.length} cảnh từ Bước 1, gọi AI sinh video và tự ép phụ đề.</p>
             
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
