import { useState, useEffect } from 'react';
import './EditorPage.css'; // Reuse styles

export function AutoShortsPage() {
  const [activeTask, setActiveTask] = useState(1);
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('geminiApiKey') || '');
  useEffect(() => { localStorage.setItem('geminiApiKey', apiKey); }, [apiKey]);

  return (
    <div className="editor-container">
      <div className="editor-header">
        <h2>Auto Shorts (Veo 3 AI)</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className={`btn-outline-dark ${activeTask === 1 ? 'active' : ''}`} onClick={() => setActiveTask(1)}>Tab 1: Qu?n l� N?i Dung</button>
          <button className={`btn-outline-dark ${activeTask === 2 ? 'active' : ''}`} onClick={() => setActiveTask(2)}>Tab 2: Render Video T? �?ng</button>
        </div>
      </div>

      <div className="main-content" style={{ padding: '20px', color: '#fff' }}>
        {activeTask === 1 && (
          <div className="panel">
            <h3 className="section-title">Qu?n l� n?i dung (K?ch b?n)</h3>
            <p>Nh?p k?ch b?n ho?c Upload file Excel ch?a danh s�ch c�c c�u n�i hay d? chu?n b? l�m video.</p>
            <textarea className="form-control" rows={10} placeholder="Nh?p tr�ch d?n s�ch v�o d�y..."></textarea>
            <button className="btn-export-large mt-3" style={{ width: '200px' }}>Luu K?ch B?n</button>
          </div>
        )}

        {activeTask === 2 && (
          <div className="panel">
            <h3 className="section-title">S?n xu?t Video T? �?ng (Google Veo 3)</h3>
            <p>H? th?ng s? l?y d? li?u t? Tab 1, t? d?ng g?i Veo 3 v? h�nh n?n, t? d?ng l?ng ti?ng, v� render ra video 9:16 ho�n ch?nh.</p>
            <label className="input-label mt-2">Google Veo 3 API Key</label>
            <input type="password" className="form-control mb-3" placeholder="Nh?p API Key c?a b?n..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            <button className="btn-export-large mt-3" style={{ width: '300px' }}>B?t �?u Render H�ng Lo?t</button>
          </div>
        )}
      </div>
    </div>
  );
}
