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
          <button className={`btn-outline-dark ${activeTask === 1 ? 'active' : ''}`} onClick={() => setActiveTask(1)}>Tab 1: Quản lý Nội Dung</button>
          <button className={`btn-outline-dark ${activeTask === 2 ? 'active' : ''}`} onClick={() => setActiveTask(2)}>Tab 2: Render Video Tự Động</button>
        </div>
      </div>

      <div className="main-content" style={{ padding: '20px', color: '#fff' }}>
        {activeTask === 1 && (
          <div className="panel">
            <h3 className="section-title">Quản lý nội dung (Kịch bản)</h3>
            <p>Nhập kịch bản hoặc Upload file Excel chứa danh sách các câu nói hay để chuẩn bị làm video.</p>
            <textarea className="form-control" rows={10} placeholder="Nhập trích dẫn sách vào đây..."></textarea>
            <button className="btn-export-large mt-3" style={{ width: '200px' }}>Lưu Kịch Bản</button>
          </div>
        )}

        {activeTask === 2 && (
          <div className="panel">
            <h3 className="section-title">Sản xuất Video Tự Động (Google Veo 3)</h3>
            <p>Hệ thống sẽ lấy dữ liệu từ Tab 1, tự động gọi Veo 3 vẽ hình nền, tự động lồng tiếng, và render ra video 9:16 hoàn chỉnh.</p>
            <label className="input-label mt-2">Google Veo 3 API Key</label>
            <input type="password" className="form-control mb-3" placeholder="Nhập API Key của bạn..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            <button className="btn-export-large mt-3" style={{ width: '300px' }}>Bắt Đầu Render Hàng Loạt</button>
          </div>
        )}
      </div>
    </div>
  );
}
