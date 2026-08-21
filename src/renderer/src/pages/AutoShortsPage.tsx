import { useState } from 'react';
import './EditorPage.css'; // Reuse styles

export function AutoShortsPage() {
  const [activeTask, setActiveTask] = useState(1);

  return (
    <div className="editor-container">
      <div className="editor-header">
        <h2>Auto Shorts (Veo 3 AI)</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className={`btn-outline-dark ${activeTask === 1 ? 'active' : ''}`} onClick={() => setActiveTask(1)}>Task 1: N?i dung</button>
          <button className={`btn-outline-dark ${activeTask === 2 ? 'active' : ''}`} onClick={() => setActiveTask(2)}>Task 2: Ph? d? & TTS</button>
          <button className={`btn-outline-dark ${activeTask === 3 ? 'active' : ''}`} onClick={() => setActiveTask(3)}>Task 3: Render Video Câm</button>
          <button className={`btn-outline-dark ${activeTask === 4 ? 'active' : ''}`} onClick={() => setActiveTask(4)}>Task 4: Ghép Âm Thanh</button>
        </div>
      </div>

      <div className="main-content" style={{ padding: '20px', color: '#fff' }}>
        {activeTask === 1 && (
          <div className="panel">
            <h3 className="section-title">Qu?n lý n?i dung (K?ch b?n)</h3>
            <p>Nh?p k?ch b?n ho?c Upload file Excel ch?a danh sách các câu nói hay.</p>
            <textarea className="form-control" rows={10} placeholder="Nh?p trích d?n sách vào dây..."></textarea>
            <button className="btn-export-large mt-3" style={{ width: '200px' }}>Luu K?ch B?n</button>
          </div>
        )}

        {activeTask === 2 && (
          <div className="panel">
            <h3 className="section-title">T?o Ph? d? (SRT) & Gi?ng nói</h3>
            <p>H? th?ng s? ch?y NeeyuVoice d? t?o âm thanh và thu?t toán bóc bang t?o file .srt chu?n xác.</p>
            <button className="btn-export-large mt-3" style={{ width: '200px' }}>B?t d?u t?o</button>
          </div>
        )}

        {activeTask === 3 && (
          <div className="panel">
            <h3 className="section-title">S?n xu?t Video (Google Veo 3)</h3>
            <p>Nh?p API Key Google Pro c?a b?n d? s? d?ng AI Veo 3 t? d?ng v? video n?n.</p>
            <input type="text" className="form-control mb-3" placeholder="Google Gemini/Veo API Key..." />
            <button className="btn-export-large mt-3" style={{ width: '200px' }}>T?o Video Câm (9:16)</button>
          </div>
        )}

        {activeTask === 4 && (
          <div className="panel">
            <h3 className="section-title">Hoàn thi?n Video</h3>
            <p>Ghép video câm (t? Veo 3) và âm thanh (NeeyuVoice) thành video hoàn ch?nh.</p>
            <button className="btn-export-large mt-3" style={{ width: '200px' }}>Mix & Xu?t Video</button>
          </div>
        )}
      </div>
    </div>
  );
}
