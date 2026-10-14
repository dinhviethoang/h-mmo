import codecs

jsx_code = """import { useState, useEffect, useRef } from 'react';
import './AutoShortsPage.css';
import Papa from 'papaparse';

export interface Scene {
  content: string;
  prompt: string;
  voiceover: string;
  selected?: boolean;
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
      setScenes(splitText.map(t => ({ content: t, prompt: t, voiceover: t, selected: true })));
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
            voiceover: row[2] || row[0] || '',
            selected: true
          })).filter(s => s.content.length > 0);
          
          setScenes(newScenes);
          alert(`Ðã t?i thành công ${newScenes.length} k?ch b?n video! B?n có th? tick ch?n video mu?n render.`);
        },
        error: (err: any) => {
          alert('L?i parse CSV: ' + err.message);
        }
      });
    } catch (error: any) {
      alert('L?i t?i Google Sheets. Vui lòng d?m b?o Sheet dã du?c Share: ' + error.message);
    }
  };

  const toggleSceneSelection = (index: number) => {
    setScenes(prev => {
      const newScenes = [...prev];
      newScenes[index].selected = !newScenes[index].selected;
      return newScenes;
    });
  };

  const selectAll = (select: boolean) => {
    setScenes(prev => prev.map(s => ({ ...s, selected: select })));
  };

  const handleStartRender = async () => {
    if (!apiKey) {
      alert('Vui lòng nh?p API Key c?a Google Veo 3!');
      return;
    }
    const selectedScenes = scenes.filter(s => s.selected);
    if (selectedScenes.length === 0) {
      alert('Không có k?ch b?n nào du?c ch?n d? render!');
      return;
    }

    setIsProcessing(true);
    setLogs([]);
    try {
      await window.api.generateAutoShorts({ apiKey, scenes: selectedScenes });
    } catch (error: any) {
      setLogs(prev => [...prev, `L?I H? TH?NG: ${error.message}`]);
    } finally {
      setIsProcessing(false);
    }
  };

  const selectedCount = scenes.filter(s => s.selected).length;

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
                  <h3 className="as-panel-title">Danh sách K?ch b?n Video</h3>
                  <div className="as-panel-subtitle">T?ng: {scenes.length} video | Ðã ch?n: {selectedCount} video</div>
                </div>
                {scenes.length > 0 && (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => selectAll(true)} style={{ background: '#2a2c38', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}>Ch?n t?t c?</button>
                    <button onClick={() => selectAll(false)} style={{ background: '#2a2c38', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}>B? ch?n t?t c?</button>
                  </div>
                )}
              </div>
              
              <div className="as-scene-list">
                {scenes.map((scene, index) => (
                  <div key={index} className={`as-scene-card ${scene.selected ? 'active' : ''}`} style={{ display: 'flex', gap: '15px', alignItems: 'flex-start', opacity: scene.selected ? 1 : 0.6 }}>
                    <input 
                      type="checkbox" 
                      checked={!!scene.selected} 
                      onChange={() => toggleSceneSelection(index)} 
                      style={{ marginTop: '5px', transform: 'scale(1.2)' }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                      <div className="as-scene-header"># Video {index + 1}</div>
                      <div style={{ color: '#fff', fontSize: '14px' }}><b>G?c:</b> {scene.content}</div>
                      <div style={{ color: '#00ffff', fontSize: '13px' }}><b>Prompt Veo3:</b> {scene.prompt.length > 100 ? scene.prompt.substring(0, 100) + '...' : scene.prompt}</div>
                      <div style={{ color: '#ffcc00', fontSize: '13px' }}><b>L?i tho?i:</b> {scene.voiceover.length > 100 ? scene.voiceover.substring(0, 100) + '...' : scene.voiceover}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="as-footer">
            <button className="btn-continue" onClick={() => {
              if(selectedCount === 0) { alert('Vui lòng ch?n ít nh?t 1 k?ch b?n!'); return; }
              setActiveTab(2);
            }}>
              Luu {selectedCount} k?ch b?n & Ti?p t?c ?
            </button>
          </div>
        </>
      )}

      {activeTab === 2 && (
        <div className="as-content-area">
           <div className="as-panel" style={{ alignItems: 'center', justifyContent: 'center' }}>
             <h3 className="as-panel-title" style={{ fontSize: '24px', marginBottom: '10px' }}>S?n xu?t Video v?i Google Veo 3</h3>
             <p style={{ color: '#8b8e9d', marginBottom: '20px' }}>H? th?ng s? ti?n hành render {selectedCount} video mà b?n dã ch?n.</p>
             
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
                {isProcessing ? 'Ðang X? Lý...' : `B?t Ð?u Render (${selectedCount} video)`}
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
print('Done writing JSX')
