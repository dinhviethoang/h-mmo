const fs = require('fs');

const code = `import { useState, useEffect } from 'react';
import './AutoShortsPage.css';

export function AutoShortsPage() {
  const [activeTab, setActiveTab] = useState(1);
  const [inputType, setInputType] = useState('manual');
  const [inputText, setInputText] = useState("Hôm nay tôi s? hu?ng d?n các b?n cách làm video t? d?ng.\\nCh? v?i vài thao tác co b?n, AI s? lo toàn b? ph?n hình ?nh.\\nHãy dang ký kênh d? xem thêm nhi?u công c? hay nhé!");
  const [scenes, setScenes] = useState<string[]>([]);

  // Split text into scenes based on newlines or punctuation
  useEffect(() => {
    if (!inputText) {
      setScenes([]);
      return;
    }
    // Split by newline or period followed by space
    const splitText = inputText
      .split(/\\n+|\\.\\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    setScenes(splitText);
  }, [inputText]);

  return (
    <div className="autoshorts-page">
      <div className="as-header">Auto Shorts (Veo 3 AI)</div>
      
      <div className="as-stepper-box">
        <div className={\`as-step \${activeTab >= 1 ? 'active' : ''}\`}>
          <div className="as-step-circle">#1</div>
          <div className="as-step-label">Nh?p & Qu?n lý k?ch b?n</div>
        </div>
        <div className="as-step-line" style={{ background: activeTab >= 2 ? '#ff6600' : 'linear-gradient(90deg, #ff6600 50%, #4a4d5e 50%)' }}></div>
        <div className={\`as-step \${activeTab >= 2 ? 'active' : ''}\`}>
          <div className="as-step-circle">#2</div>
          <div className="as-step-label">C?u hình & S?n xu?t Video</div>
        </div>
      </div>

      {activeTab === 1 && (
        <>
          <div className="as-content-area">
            {/* Left Panel */}
            <div className="as-panel">
              <div className="as-panel-header">
                <h3 className="as-panel-title">Ngu?n D? Li?u</h3>
                <div className="as-toggle-group">
                  <button 
                    className={\`as-toggle-btn \${inputType === 'manual' ? 'active' : ''}\`}
                    onClick={() => setInputType('manual')}
                  >
                    Nh?p th? công
                  </button>
                  <button 
                    className={\`as-toggle-btn \${inputType === 'excel' ? 'active' : ''}\`}
                    onClick={() => setInputType('excel')}
                  >
                    T?i file Excel
                  </button>
                </div>
              </div>
              <textarea 
                className="as-textarea" 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Nh?p k?ch b?n vào dây..."
              />
            </div>

            {/* Right Panel */}
            <div className="as-panel">
              <div className="as-panel-header">
                <div>
                  <h3 className="as-panel-title">B?n xem tru?c (Ðã tách câu)</h3>
                  <div className="as-panel-subtitle">{scenes.length} c?nh du?c tìm th?y</div>
                </div>
              </div>
              
              <div className="as-scene-list">
                {scenes.map((scene, index) => (
                  <div key={index} className={\`as-scene-card \${index < 2 ? 'active' : ''}\`}>
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
             <h3 className="as-panel-title" style={{ fontSize: '24px', marginBottom: '20px' }}>S?n xu?t Video v?i Google Veo 3</h3>
             <p style={{ color: '#8b8e9d', marginBottom: '30px' }}>H? th?ng s? l?y {scenes.length} c?nh t? Bu?c 1, t? d?ng g?i AI sinh hình n?n và l?ng ti?ng.</p>
             <button className="btn-continue" style={{ padding: '15px 40px', fontSize: '16px' }} onClick={() => setActiveTab(1)}>
              ? Quay l?i ch?nh s?a
             </button>
           </div>
        </div>
      )}
    </div>
  );
}
`;
fs.writeFileSync('src/renderer/src/pages/AutoShortsPage.tsx', code, 'utf8');
