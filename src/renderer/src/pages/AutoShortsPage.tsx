import { useState, useEffect, useRef } from 'react';
import './AutoShortsPage.css';

export function AutoShortsPage() {
  const [activeTab, setActiveTab] = useState(1);
  const [inputType, setInputType] = useState('manual');
  const [inputText, setInputText] = useState("H�m nay t�i s? hu?ng d?n c�c b?n c�ch l�m video t? d?ng.\nCh? v?i v�i thao t�c co b?n, AI s? lo to�n b? ph?n h�nh ?nh.\nH�y dang k� k�nh d? xem th�m nhi?u c�ng c? hay nh�!");
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
      alert(`�� ch?n file: ${file.name}\nT�nh nang d?c Excel dang du?c ph�t tri?n!`);
      setScenes([
        `N?i dung t? file ${file.name} - D�ng 1`,
        `N?i dung t? file ${file.name} - D�ng 2`,
        `N?i dung t? file ${file.name} - D�ng 3`
      ]);
    }
  };

  const handleStartRender = async () => {
    if (!apiKey) {
      alert('Vui l�ng nh?p API Key c?a Google Veo 3!');
      return;
    }
    if (scenes.length === 0) {
      alert('Kh�ng c� c?nh n�o d? render!');
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
          <div className="as-step-label">Nh?p & Qu?n l� k?ch b?n</div>
        </div>
        <div className="as-step-line" style={{ background: activeTab >= 2 ? '#ff6600' : 'linear-gradient(90deg, #ff6600 50%, #4a4d5e 50%)' }}></div>
        <div className={`as-step ${activeTab >= 2 ? 'active' : ''}`}>
          <div className="as-step-circle">#2</div>
          <div className="as-step-label">C?u h�nh & S?n xu?t Video</div>
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
                      const splitText = inputText.split(/\n+|\.\s+/).map(s => s.trim()).filter(s => s.length > 0);
                      setScenes(splitText);
                    }}
                  >
                    Nh?p th? c�ng
                  </button>
                  <button 
                    className={`as-toggle-btn ${inputType === 'excel' ? 'active' : ''}`}
                    onClick={() => setInputType('excel')}
                  >
                    T?i file Excel
                  </button>
                </div>
              </div>
              
              {inputType === 'manual' ? (
                <textarea 
                  className="as-textarea" 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Nh?p k?ch b?n v�o d�y..."
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
                  <p style={{ color: '#8b8e9d', marginBottom: '15px' }}>K�o th? file .xlsx / .csv v�o d�y</p>
                  <label style={{ 
                    backgroundColor: '#ff6600', 
                    color: '#fff', 
                    padding: '8px 20px', 
                    borderRadius: '4px', 
                    cursor: 'pointer',
                    fontWeight: 500
                  }}>
                    Ch?n File
                    <input type="file" accept=".xlsx, .xls, .csv" style={{ display: 'none' }} onChange={handleFileUpload} />
                  </label>
                </div>
              )}
            </div>

            <div className="as-panel">
              <div className="as-panel-header">
                <div>
                  <h3 className="as-panel-title">B?n xem tru?c (�� t�ch c�u)</h3>
                  <div className="as-panel-subtitle">{scenes.length} c?nh du?c t�m th?y</div>
                </div>
              </div>
              
              <div className="as-scene-list">
                {scenes.map((scene, index) => (
                  <div key={index} className={`as-scene-card ${index < 2 ? 'active' : ''}`}>
                    <div className="as-scene-header"># C?nh {index + 1}</div>
                    <div className="as-scene-text">{scene}</div>
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
             <p style={{ color: '#8b8e9d', marginBottom: '20px' }}>H? th?ng s? l?y {scenes.length} c?nh t? Bu?c 1, g?i AI sinh video v� t? �p ph? d?.</p>
             
             <div style={{ width: '100%', maxWidth: '600px', marginBottom: '20px' }}>
               <label className="input-label">Google API Key</label>
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
               <button className="btn-continue" style={{ padding: '12px 30px', backgroundColor: '#ff6600', color: '#fff' }} onClick={handleStartRender} disabled={isProcessing}>
                {isProcessing ? '�ang X? L�...' : 'B?t �?u Render'}
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
                  <span style={{ color: '#8b8e9d' }}>[Terminal] �ang ch? l?nh...</span>
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
