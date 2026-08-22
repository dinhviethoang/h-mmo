const fs = require('fs');
let content = fs.readFileSync('src/renderer/src/pages/EditorPage.tsx', 'utf8');

const regexBlur = /<h3 className="section-title">VA1ng lA.m mA.<\/h3>[\s\S]*?<button \r?\n\s*className="btn-outline-dark"/;
console.log("Found Blur?", regexBlur.test(content));

const newBlur = `<h3 className="section-title">Vùng làm m?</h3>
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
                  <div className="section-header-flex mt-3 mb-2">
                    <p className="section-desc mb-0">Kéo và thay d?i kích thu?c vùng m?.</p>
                    <button 
                      className="btn-outline-dark"`;

if (regexBlur.test(content)) {
    content = content.replace(regexBlur, newBlur);
}

const regexBlurClose = /                  \)\)}\r?\n                <\/div>\r?\n              <\/div>\r?\n            \)}/;
console.log("Found Blur Close?", regexBlurClose.test(content));

if (regexBlurClose.test(content)) {
    content = content.replace(regexBlurClose, `                  ))}
                </div>
                </div>
              </div>
            )}`);
}

fs.writeFileSync('src/renderer/src/pages/EditorPage.tsx', content);
