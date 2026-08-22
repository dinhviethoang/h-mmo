const fs = require('fs');
let content = fs.readFileSync('src/renderer/src/pages/EditorPage.tsx', 'utf8');

// Blur UI
content = content.replace(
  /<h3 className="section-title">Vùng làm m?<\/h3>[\s\S]*?<\/button>/,
  `<h3 className="section-title">Vùng làm m?</h3>
                    <p className="section-desc">Áp d?ng làm m? vào video xu?t.</p>
                  </div>
                  <button 
                    className={\`btn-toggle \${enableBlur ? 'on' : ''}\`} 
                    onClick={() => setEnableBlur(!enableBlur)}
                  >
                    {enableBlur ? 'B?t' : 'T?t'}
                  </button>`
);

content = content.replace(
  /<div className="blur-regions-list mt-3">/,
  `<div style={{ opacity: enableBlur ? 1 : 0.5, pointerEvents: enableBlur ? 'auto' : 'none' }}>
                  <div className="section-header-flex mt-3 mb-2">
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
                  <div className="blur-regions-list mt-3">`
);

content = content.replace(
  /                  \)\)}\r?\n                <\/div>\r?\n              <\/div>\r?\n            \)}/,
  `                  ))}
                </div>
                </div>
              </div>
            )}`
);

// Dubbing UI
content = content.replace(
  /<div style={{marginBottom: '15px'}}>[\s\S]*?<\/div>[\s\S]*?<div style={{opacity: enableDubbing \? 1 : 0\.5, pointerEvents: enableDubbing \? 'auto' : 'none'}}>/,
  `<div className="section-header-flex">
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
                <div style={{opacity: enableDubbing ? 1 : 0.5, pointerEvents: enableDubbing ? 'auto' : 'none', marginTop: '15px'}}>`
);

fs.writeFileSync('src/renderer/src/pages/EditorPage.tsx', content);
