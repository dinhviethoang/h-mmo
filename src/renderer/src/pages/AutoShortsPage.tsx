import { useState, useEffect, useRef } from 'react';
import './AutoShortsPage.css';
import Papa from 'papaparse';

export interface Scene {
  content: string;
  prompt: string;
  voiceover: string;
  selected: boolean;
}

export function AutoShortsPage() {
  const [activeTab, setActiveTab] = useState(1);
  const [gsheetUrl, setGsheetUrl] = useState('');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [apiKey] = useState('FREE_MODE');
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [activeSceneIndex, setActiveSceneIndex] = useState<number>(0);
  
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  useEffect(() => {
    // Chỉ đăng ký 1 lần
    const listener = (logMsg: string) => {
      setLogs((prev) => [...prev, logMsg]);
    };
    window.api.autoshortsLogs(listener);
    // Cleanup - Dù trong preload ta dùng ipcRenderer.on nên có thể bị duplicate nếu React mount 2 lần
    return () => {}; 
  }, []);

  const handleFetchGsheet = async () => {
    if (!gsheetUrl.includes('docs.google.com/spreadsheets')) {
      alert('Vui lòng nhập link Google Sheets hợp lệ!');
      return;
    }
    try {
      const csvUrl = gsheetUrl.replace(/\/edit.*$/, '/export?format=csv');
      const csvText = await window.api.fetchGoogleSheet(csvUrl);
      
      Papa.parse(csvText, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = results.data as string[][];
          const dataRows = rows.length > 1 && rows[0][0].toLowerCase().includes('nội dung') ? rows.slice(1) : rows;
          
          const newScenes: Scene[] = dataRows.map(row => ({
            content: row[0] || '',
            prompt: row[1] || row[0] || '',
            voiceover: row[2] || row[0] || '',
            selected: true
          })).filter(s => s.content.trim().length > 0);
          
          setScenes(newScenes);
          setActiveSceneIndex(0);
          alert(`Đã tải thành công ${newScenes.length} kịch bản video! Bạn có thể tick chọn video muốn render.`);
        },
        error: (err: any) => {
          alert('Lỗi parse CSV: ' + err.message);
        }
      });
    } catch (error: any) {
      alert('Lỗi tải Google Sheets. Vui lòng đảm bảo Sheet đã được Share: ' + error.message);
    }
  };

  const toggleSceneSelection = (index: number) => {
    setScenes(prev => {
      const newScenes = [...prev];
      newScenes[index] = { ...newScenes[index], selected: !newScenes[index].selected };
      return newScenes;
    });
  };

  const selectAll = (select: boolean) => {
    setScenes(prev => prev.map(s => ({ ...s, selected: select })));
  };

  const handleStartRender = async () => {
    const selectedScenes = scenes.filter(s => s.selected);
    if (selectedScenes.length === 0) {
      alert('Không có kịch bản nào được chọn để render!');
      return;
    }

    setIsProcessing(true);
    setLogs([]);
    try {
      await window.api.generateAutoShorts({ apiKey, scenes: selectedScenes });
    } catch (error: any) {
      setLogs(prev => [...prev, `LỖI HỆ THỐNG: ${error.message}`]);
    } finally {
      setIsProcessing(false);
    }
  };

  const selectedCount = scenes.filter(s => s.selected).length;
  const activeScene = scenes[activeSceneIndex];

  return (
    <div className="autoshorts-page" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
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
          <div className="as-content-area" style={{ display: 'flex', gap: '20px', flex: 1, overflow: 'hidden' }}>
            <div style={{ width: '40%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="as-panel" style={{ flex: '0 0 auto', padding: '15px' }}>
                <h3 className="as-panel-title" style={{ marginBottom: '15px' }}>Nguồn Dữ Liệu (Google Sheets)</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <input 
                    type="text" 
                    className="form-control" 
                    style={{ backgroundColor: '#121319', border: '1px solid #2a2c38', color: '#fff', padding: '10px', borderRadius: '4px' }}
                    placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                    value={gsheetUrl}
                    onChange={(e) => setGsheetUrl(e.target.value)}
                  />
                  <button 
                    onClick={handleFetchGsheet}
                    style={{ 
                    backgroundColor: '#ff6600', 
                    color: '#fff', 
                    padding: '10px 20px', 
                    borderRadius: '4px', 
                    cursor: 'pointer',
                    fontWeight: 500,
                    border: 'none',
                    width: '100%'
                  }}>
                    Tải Dữ Liệu Từ Sheet
                  </button>
                </div>
              </div>

              <div className="as-panel" style={{ flex: '1', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div className="as-panel-header" style={{ paddingBottom: '10px', borderBottom: '1px solid #2a2c38', marginBottom: '10px' }}>
                  <div>
                    <h3 className="as-panel-title">Danh sách Video</h3>
                    <div className="as-panel-subtitle">Tổng: {scenes.length} | Đã chọn: {selectedCount}</div>
                  </div>
                  {scenes.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <button onClick={() => selectAll(true)} style={{ background: '#2a2c38', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Tất cả</button>
                      <button onClick={() => selectAll(false)} style={{ background: '#2a2c38', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Bỏ chọn</button>
                    </div>
                  )}
                </div>
                
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '5px' }}>
                  {scenes.map((scene, index) => (
                    <div 
                      key={index} 
                      onClick={() => setActiveSceneIndex(index)}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '10px', 
                        padding: '10px', 
                        borderRadius: '6px',
                        backgroundColor: activeSceneIndex === index ? '#2a2c38' : '#1a1b23',
                        border: activeSceneIndex === index ? '1px solid #ff6600' : '1px solid transparent',
                        cursor: 'pointer'
                      }}
                    >
                      <input 
                        type="checkbox" 
                        checked={!!scene.selected} 
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleSceneSelection(index);
                        }} 
                        style={{ transform: 'scale(1.2)', cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: scene.selected ? '#fff' : '#8b8e9d' }}>
                        <strong style={{ color: '#ff6600' }}>#{index + 1}</strong>: {scene.content}
                      </div>
                    </div>
                  ))}
                  {scenes.length === 0 && (
                    <div style={{ color: '#8b8e9d', textAlign: 'center', marginTop: '20px' }}>
                      Chưa có dữ liệu. Hãy tải từ Google Sheets.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="as-panel" style={{ width: '60%', display: 'flex', flexDirection: 'column' }}>
              <div className="as-panel-header" style={{ borderBottom: '1px solid #2a2c38', paddingBottom: '10px', marginBottom: '15px' }}>
                <h3 className="as-panel-title">Chi tiết Video #{activeSceneIndex + 1}</h3>
              </div>
              
              {activeScene ? (
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px', paddingRight: '10px' }}>
                  <div>
                    <h4 style={{ color: '#8b8e9d', marginBottom: '8px', fontSize: '13px', textTransform: 'uppercase' }}>Nội dung gốc (Tham khảo)</h4>
                    <div style={{ backgroundColor: '#1a1b23', padding: '15px', borderRadius: '6px', color: '#fff', fontSize: '15px', lineHeight: '1.6' }}>
                      {activeScene.content}
                    </div>
                  </div>
                  
                  <div>
                    <h4 style={{ color: '#8b8e9d', marginBottom: '8px', fontSize: '13px', textTransform: 'uppercase' }}>Prompt Sinh Hình Ảnh / Video (Dành cho Veo 3)</h4>
                    <div style={{ backgroundColor: '#101720', padding: '15px', borderRadius: '6px', color: '#00ffff', fontSize: '14px', lineHeight: '1.6', fontFamily: 'monospace', border: '1px solid #1a2332' }}>
                      {activeScene.prompt}
                    </div>
                  </div>

                  <div>
                    <h4 style={{ color: '#8b8e9d', marginBottom: '8px', fontSize: '13px', textTransform: 'uppercase' }}>Kịch Bản Lồng Tiếng & SRT</h4>
                    <div style={{ backgroundColor: '#201a10', padding: '15px', borderRadius: '6px', color: '#ffcc00', fontSize: '15px', lineHeight: '1.6', border: '1px solid #332815', whiteSpace: 'pre-wrap' }}>
                      {activeScene.voiceover}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b8e9d' }}>
                  Vui lòng tải dữ liệu từ Google Sheets
                </div>
              )}
            </div>
          </div>

          <div className="as-footer">
            <button className="btn-continue" onClick={() => {
              if(selectedCount === 0) { alert('Vui lòng chọn ít nhất 1 kịch bản!'); return; }
              setActiveTab(2);
            }}>
              Lưu {selectedCount} kịch bản & Tiếp tục →
            </button>
          </div>
        </>
      )}

      {activeTab === 2 && (
        <div className="as-content-area" style={{ display: 'flex', gap: '20px', flex: 1, overflow: 'hidden' }}>
          
          <div className="as-panel" style={{ width: '35%', display: 'flex', flexDirection: 'column', gap: '20px', padding: '25px', backgroundColor: '#1a1b23' }}>
            <div>
              <h3 className="as-panel-title" style={{ fontSize: '22px', marginBottom: '8px', color: '#fff' }}>Bảng Điều Khiển</h3>
              <p style={{ color: '#8b8e9d', fontSize: '14px', marginBottom: '25px' }}>Chuỗi hệ thống render hàng loạt video bằng Google Veo 3 AI.</p>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ backgroundColor: '#1a472a', border: '1px solid #2ea043', padding: '15px', borderRadius: '8px' }}>
                <div style={{ color: '#39ff14', fontSize: '15px', fontWeight: 'bold', marginBottom: '5px' }}>✓ Chế độ MIỄN PHÍ 100%</div>
                <div style={{ color: '#8b949e', fontSize: '13px' }}>Hệ thống sẽ tự động dùng AI sinh ảnh cực nét, tạo hiệu ứng chuyển động video và lồng ghép phụ đề mà không tốn 1 đồng API nào.</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: 'auto' }}>
              <div style={{ backgroundColor: '#121319', padding: '15px', borderRadius: '8px', border: '1px dashed #4a4d5e' }}>
                <div style={{ color: '#8b8e9d', fontSize: '13px', marginBottom: '5px' }}>Số video sẵn sàng:</div>
                <div style={{ color: '#ffcc00', fontSize: '24px', fontWeight: 'bold' }}>{selectedCount} kịch bản</div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn-continue" style={{ flex: 1, padding: '15px', backgroundColor: '#2a2c38', color: '#fff', border: 'none', borderRadius: '6px' }} onClick={() => setActiveTab(1)} disabled={isProcessing}>
                  ← Trở về
                </button>
                <button className="btn-continue" style={{ flex: 2, padding: '15px', backgroundColor: '#ff6600', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '16px' }} onClick={handleStartRender} disabled={isProcessing}>
                  {isProcessing ? 'ĐANG RENDER...' : `BẮT ĐẦU`}
                </button>
              </div>
            </div>
          </div>

          <div style={{ width: '65%', display: 'flex', flexDirection: 'column', borderRadius: '10px', overflow: 'hidden', border: '1px solid #2a2c38', backgroundColor: '#0d1117' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '12px 15px', backgroundColor: '#161b22', borderBottom: '1px solid #30363d' }}>
              <div style={{ display: 'flex', gap: '8px', marginRight: '15px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#ff5f56' }}></div>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#ffbd2e' }}></div>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#27c93f' }}></div>
              </div>
              <div style={{ color: '#8b949e', fontSize: '13px', fontFamily: 'sans-serif' }}>System Log - H-MMO Engine</div>
            </div>
            
            <div style={{
              flex: 1,
              padding: '20px',
              fontFamily: '"Fira Code", "Consolas", monospace',
              fontSize: '14px',
              color: '#39ff14',
              overflowY: 'auto',
              textAlign: 'left',
              lineHeight: '1.6',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}>
              {logs.length === 0 ? (
                <span style={{ color: '#8b8e9d' }}>[Terminal] Sẵn sàng nhận lệnh... Vui lòng nhập API Key và bấm "BẮT ĐẦU".</span>
              ) : (
                logs.map((l, i) => (
                  <div key={i} style={{ 
                    marginBottom: '4px',
                    color: l.includes('LỖI') || l.includes('Error') ? '#ff5f56' : 
                           l.includes('Thành công') || l.includes('HOÀN THÀNH') ? '#00ffff' : '#39ff14'
                  }}>
                    {l}
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
