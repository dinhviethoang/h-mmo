const fs = require('fs');
let content = fs.readFileSync('src/renderer/src/pages/EditorPage.tsx', 'utf8');

// Add enableBlur state
content = content.replace(
    'const [enableSubtitles, setEnableSubtitles] = useState(true);',
    'const [enableSubtitles, setEnableSubtitles] = useState(true);\n  const [enableBlur, setEnableBlur] = useState(true);'
);

// Pass applyBlur to backend safely (replace inside processVideo call)
content = content.replace(
    '        srtPath,\r\n        blurRegions,\r\n        subStyle,',
    '        srtPath,\n        blurRegions: enableBlur ? blurRegions : [],\n        subStyle,'
);
// In case of unix line endings
content = content.replace(
    '        srtPath,\n        blurRegions,\n        subStyle,',
    '        srtPath,\n        blurRegions: enableBlur ? blurRegions : [],\n        subStyle,'
);

// Update Blur Tab
const blurOld = `            {activeTab === 'blur' && (
              <div className="tab-pane new-style">
                <div className="section-header-flex">
                  <div>
                    <h3 className="section-title">Vùng làm m?</h3>
                    <p className="section-desc">Kéo và thay d?i kích thu?c vùng m? trên b?n xem tru?c.</p>
                  </div>
                  <button 
                    className="btn-outline-dark" 
                    style={{ width: 'auto' }}
                    onClick={() => {
                      const newId = \`region-\${Date.now()}\`;
                      setBlurRegions([...blurRegions, { id: newId, x: 20, y: 20, w: 20, h: 20, intensity: 10 }]);
                    }}
                  >
                    + Thêm vùng
                  </button>
                </div>
  
                <div className="blur-regions-list mt-3">`;

const blurNew = `            {activeTab === 'blur' && (
              <div className="tab-pane new-style">
                <div className="section-header-flex">
                  <div>
                    <h3 className="section-title">Vùng làm m?</h3>
                    <p className="section-desc">Áp d?ng làm m? vào video xu?t.</p>
                  </div>
                  <button 
                    className={\`btn-toggle \${enableBlur ? 'on' : ''}\`} 
                    onClick={() => setEnableBlur(!enableBlur)}
                  >
                    {enableBlur ? 'B?t' : 'T?t'}
                  </button>
                </div>

                <div style={{ opacity: enableBlur ? 1 : 0.5, pointerEvents: enableBlur ? 'auto' : 'none' }}>
                  <div className="section-header-flex mt-3">
                    <p className="section-desc mb-0">Kéo và thay d?i kích thu?c vùng m?.</p>
                    <button 
                      className="btn-outline-dark" 
                      style={{ width: 'auto' }}
                      onClick={() => {
                        const newId = \`region-\${Date.now()}\`;
                        setBlurRegions([...blurRegions, { id: newId, x: 20, y: 20, w: 20, h: 20, intensity: 10 }]);
                      }}
                    >
                      + Thêm vùng
                    </button>
                  </div>
  
                  <div className="blur-regions-list mt-3">`;

content = content.replace(blurOld, blurNew);

// Close blur div
const blurCloseOld = `                  ))}
                </div>
              </div>
            )}`;
const blurCloseNew = `                  ))}
                </div>
                </div>
              </div>
            )}`;
content = content.replace(blurCloseOld, blurCloseNew);

// Update Dubbing Tab
const dubbingOld = `            {activeTab === 'voice' && (
              <div className="tab-pane new-style">
                
                <div style={{marginBottom: '15px'}}>
                  <label className="checkbox-label">
                    <input type="checkbox" checked={enableDubbing} onChange={(e) => setEnableDubbing(e.target.checked)} />
                    <span className="checkbox-custom"></span>
                    <span style={{fontWeight: 'bold', color: 'var(--color-primary)'}}>Áp d?ng l?ng ti?ng (AI Dubbing)</span>
                  </label>
                </div>

                <div style={{opacity: enableDubbing ? 1 : 0.5, pointerEvents: enableDubbing ? 'auto' : 'none'}}>`;
const dubbingNew = `            {activeTab === 'voice' && (
              <div className="tab-pane new-style">
                
                <div className="section-header-flex">
                  <div>
                    <h3 className="section-title">L?ng ti?ng (AI)</h3>
                    <p className="section-desc">Áp d?ng l?ng ti?ng vào video xu?t.</p>
                  </div>
                  <button 
                    className={\`btn-toggle \${enableDubbing ? 'on' : ''}\`} 
                    onClick={() => setEnableDubbing(!enableDubbing)}
                  >
                    {enableDubbing ? 'B?t' : 'T?t'}
                  </button>
                </div>

                <div style={{opacity: enableDubbing ? 1 : 0.5, pointerEvents: enableDubbing ? 'auto' : 'none', marginTop: '15px'}}>`;
content = content.replace(dubbingOld, dubbingNew);

fs.writeFileSync('src/renderer/src/pages/EditorPage.tsx', content);
