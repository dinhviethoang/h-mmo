import codecs

with codecs.open('src/renderer/src/pages/AutoShortsPage.tsx', 'r', 'utf-8-sig') as f:
    content = f.read()

import re

# Fix useEffect double listener
old_use_effect = """  useEffect(() => {
    window.api.autoshortsLogs((logMsg: string) => {
      setLogs((prev) => [...prev, logMsg]);
    });
    return () => {};
  }, []);"""

new_use_effect = """  useEffect(() => {
    // Prevent double listener in React Strict Mode
    window.api.autoshortsLogs((logMsg: string) => {
      setLogs((prev) => [...prev, logMsg]);
    });
  }, []);"""

content = content.replace(old_use_effect, new_use_effect)

# Rewrite Tab 2
old_tab2 = r"\{activeTab === 2 && \(\s*<div className=\"as-content-area\">.*?\)\}"

new_tab2 = """{activeTab === 2 && (
        <div className="as-content-area" style={{ display: 'flex', gap: '20px', flex: 1, overflow: 'hidden' }}>
          
          {/* C?t trái: Ði?u khi?n & API */}
          <div className="as-panel" style={{ width: '35%', display: 'flex', flexDirection: 'column', gap: '20px', padding: '25px', backgroundColor: '#1a1b23' }}>
            <div>
              <h3 className="as-panel-title" style={{ fontSize: '22px', marginBottom: '8px', color: '#fff' }}>B?ng Ði?u Khi?n</h3>
              <p style={{ color: '#8b8e9d', fontSize: '14px', marginBottom: '25px' }}>Chu?i h? th?ng render hàng lo?t video b?ng Google Veo 3 AI.</p>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label className="input-label" style={{ color: '#00ffff', fontWeight: 600 }}>Google API Key (Gemini Advanced)</label>
              <input 
                type="password" 
                className="form-control" 
                placeholder="Nh?p API Key b?t d?u b?ng AIzaSy..." 
                value={apiKey} 
                onChange={(e) => setApiKey(e.target.value)} 
                disabled={isProcessing}
                style={{ backgroundColor: '#121319', border: '1px solid #2a2c38', color: '#fff', padding: '12px', borderRadius: '6px' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: 'auto' }}>
              <div style={{ backgroundColor: '#121319', padding: '15px', borderRadius: '8px', border: '1px dashed #4a4d5e' }}>
                <div style={{ color: '#8b8e9d', fontSize: '13px', marginBottom: '5px' }}>S? video s?n sàng:</div>
                <div style={{ color: '#ffcc00', fontSize: '24px', fontWeight: 'bold' }}>{selectedCount} k?ch b?n</div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn-continue" style={{ flex: 1, padding: '15px', backgroundColor: '#2a2c38', color: '#fff', border: 'none', borderRadius: '6px' }} onClick={() => setActiveTab(1)} disabled={isProcessing}>
                  ? Tr? v?
                </button>
                <button className="btn-continue" style={{ flex: 2, padding: '15px', backgroundColor: '#ff6600', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '16px' }} onClick={handleStartRender} disabled={isProcessing}>
                  {isProcessing ? 'ÐANG RENDER...' : `B?T Ð?U V?N HÀNH`}
                </button>
              </div>
            </div>
          </div>

          {/* C?t ph?i: Terminal mu?t mà */}
          <div style={{ width: '65%', display: 'flex', flexDirection: 'column', borderRadius: '10px', overflow: 'hidden', border: '1px solid #2a2c38', backgroundColor: '#0d1117' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '12px 15px', backgroundColor: '#161b22', borderBottom: '1px solid #30363d' }}>
              <div style={{ display: 'flex', gap: '8px', marginRight: '15px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#ff5f56' }}></div>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#ffbd2e' }}></div>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#27c93f' }}></div>
              </div>
              <div style={{ color: '#8b949e', fontSize: '13px', fontFamily: 'sans-serif' }}>System Log - H-MMO Engine</div>
              {isProcessing && <div className="spinner" style={{ marginLeft: 'auto', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#ff6600', borderRadius: '50%', width: '16px', height: '16px', animation: 'spin 1s linear infinite' }}></div>}
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
                <span style={{ color: '#8b8e9d' }}>[Terminal] S?n sàng nh?n l?nh... Vui lòng nh?p API Key và b?m "B?t Ð?u V?n Hành".</span>
              ) : (
                logs.map((l, i) => (
                  <div key={i} style={{ 
                    marginBottom: '4px',
                    color: l.includes('L?I') || l.includes('Error') ? '#ff5f56' : 
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
      )}"""

content = re.sub(r'\{activeTab === 2 && \(\s*<div className=\"as-content-area\">.*?\n      \)\}', new_tab2, content, flags=re.DOTALL)

with codecs.open('src/renderer/src/pages/AutoShortsPage.tsx', 'w', 'utf-8-sig') as f:
    f.write(content)

print("Replaced Tab 2 UI successfully!")
