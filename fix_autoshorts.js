const fs = require('fs');

const code = `import { useState } from 'react';
import './EditorPage.css'; // Reuse styles

export function AutoShortsPage() {
  const [activeTask, setActiveTask] = useState(1);

  return (
    <div className="editor-container">
      <div className="editor-header">
        <h2>Auto Shorts (Veo 3 AI)</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className={\`btn-outline-dark \${activeTask === 1 ? 'active' : ''}\`} onClick={() => setActiveTask(1)}>Tab 1: Qu?n lý N?i Dung</button>
          <button className={\`btn-outline-dark \${activeTask === 2 ? 'active' : ''}\`} onClick={() => setActiveTask(2)}>Tab 2: Render Video T? Ð?ng</button>
        </div>
      </div>

      <div className="main-content" style={{ padding: '20px', color: '#fff' }}>
        {activeTask === 1 && (
          <div className="panel">
            <h3 className="section-title">Qu?n lý n?i dung (K?ch b?n)</h3>
            <p>Nh?p k?ch b?n ho?c Upload file Excel ch?a danh sách các câu nói hay d? chu?n b? làm video.</p>
            <textarea className="form-control" rows={10} placeholder="Nh?p trích d?n sách vào dây..."></textarea>
            <button className="btn-export-large mt-3" style={{ width: '200px' }}>Luu K?ch B?n</button>
          </div>
        )}

        {activeTask === 2 && (
          <div className="panel">
            <h3 className="section-title">S?n xu?t Video T? Ð?ng (Google Veo 3)</h3>
            <p>H? th?ng s? l?y d? li?u t? Tab 1, t? d?ng g?i Veo 3 v? hình n?n, t? d?ng l?ng ti?ng, và render ra video 9:16 hoàn ch?nh.</p>
            <label className="input-label mt-2">Google Veo 3 API Key</label>
            <input type="text" className="form-control mb-3" placeholder="Nh?p API Key c?a b?n..." />
            <button className="btn-export-large mt-3" style={{ width: '300px' }}>B?t Ð?u Render Hàng Lo?t</button>
          </div>
        )}
      </div>
    </div>
  );
}
`;

fs.writeFileSync('src/renderer/src/pages/AutoShortsPage.tsx', code, 'utf8');
