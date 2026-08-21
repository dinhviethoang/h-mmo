import { useState, useRef, useEffect } from 'react';
import { FolderOpen, Settings, Zap } from 'lucide-react';
import './SubtitlePage.css';

export function SubtitlePage() {
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [outputDir, setOutputDir] = useState<string>('C:\\Users\\ITHN\\Downloads');
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('geminiApiKey') || '');
  useEffect(() => { localStorage.setItem('geminiApiKey', apiKey); }, [apiKey]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Settings
  const [accuracy, setAccuracy] = useState('Cân bằng');
  const [lang, setLang] = useState('Tự nhận diện');
  const [translateEnabled, setTranslateEnabled] = useState(true);
  const [aiEngine, setAiEngine] = useState('Gemini AI');

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  useEffect(() => {
    if (window.api) {
      window.api.onSubtitleLog((log: string) => {
        setLogs(prev => [...prev, log]);
        if (log.includes('====== HOÀN TẤT ======')) {
          setIsProcessing(false);
        }
      });
    }
  }, []);

  const handleSelectVideo = async () => {
    if (!window.api) return;
    const path = await window.api.selectVideo();
    if (path) setVideoPath(path);
  };

  const handleSelectDir = async () => {
    if (!window.api) return;
    const path = await window.api.selectDirectory();
    if (path) setOutputDir(path);
  };

  const handleGenerate = async () => {
    if (!videoPath) {
      setLogs(prev => [...prev, '[LỖI] Hàng đợi trống! Bạn chưa chọn video.']);
      return;
    }
    
    setIsProcessing(true);
    setLogs(['Đang khởi động quy trình AI Whisper...']);
    
    try {
      // Pass the updated settings to the IPC call
      await window.api.generateSubtitle({
        videoPath,
        apiKey,
        accuracy,
        lang,
        translateEnabled,
        aiEngine
      });
    } catch (e: any) {
      setIsProcessing(false);
      setLogs(prev => [...prev, `[LỖI] ${e.message}`]);
    }
  };

  return (
    <div className="subtitle-page">
      <div className="header-section">
        <div className="header-title">
          <h2>Tạo phụ đề</h2>
          <p>Chuyển lời nói trong video thành phụ đề</p>
        </div>
      </div>

      <div className="main-content">
        {/* Left: Configuration */}
        <div className="config-panel">
          <div className="section-title">CẤU HÌNH</div>
          
          <div className="card">
            <div className="dir-selector">
              <div className="dir-path" title={outputDir}>{outputDir}</div>
              <button className="btn-outline" onClick={handleSelectDir}>Chọn thư mục</button>
            </div>

            <div className="dropdown-row">
              <div className="dropdown-group">
                <label>Mức nhận diện</label>
                <select className="custom-select" value={accuracy} onChange={e => setAccuracy(e.target.value)}>
                  <option>Nhanh</option>
                  <option>Cân bằng</option>
                  <option>Chính xác cao</option>
                </select>
              </div>
              <div className="dropdown-group">
                <label>Ngôn ngữ nói</label>
                <select className="custom-select" value={lang} onChange={e => setLang(e.target.value)}>
                  <option>Tự nhận diện</option>
                  <option>Tiếng Anh</option>
                  <option>Tiếng Trung</option>
                </select>
              </div>
            </div>

            <div className="hint-text">
              Whisper sẽ tự động tải thêm dữ liệu cần thiết nếu chưa có trên máy.
            </div>

            <div className="checkbox-list">
              <label className="checkbox-item">
                <input type="checkbox" className="custom-checkbox" defaultChecked />
                <span>Phụ đề thông thường (.srt)</span>
              </label>
              <label className="checkbox-item">
                <input type="checkbox" className="custom-checkbox" />
                <span>Văn bản (.txt)</span>
              </label>
              <label className="checkbox-item">
                <input type="checkbox" className="custom-checkbox" />
                <span>Phụ đề dùng trên web (.vtt)</span>
              </label>
            </div>
          </div>

          <div className="accordion-card">
            <div className="accordion-header" onClick={() => setTranslateEnabled(!translateEnabled)}>
              <div className="accordion-title">
                <Settings size={18} className="icon" />
                <span>Dịch phụ đề bằng AI</span>
              </div>
              <span className="accordion-badge">Tuỳ chọn</span>
            </div>
            {translateEnabled && (
              <div className="accordion-body">
                <div className="dropdown-group">
                  <label>Bộ máy dịch</label>
                  <select className="custom-select" value={aiEngine} onChange={e => setAiEngine(e.target.value)}>
                    <option>Google (Miễn phí)</option>
                    <option>Gemini AI</option>
                  </select>
                </div>
                {aiEngine === 'Gemini AI' && (
                  <div className="dropdown-group mt-2">
                    <label>API Key</label>
                    <input 
                      type="password" 
                      className="form-input" 
                      placeholder="Nhập API Key Gemini..." 
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="accordion-card">
            <div className="accordion-header">
              <div className="accordion-title">
                <Zap size={18} className="icon" style={{ color: '#60a5fa' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span>Tăng tốc xử lý</span>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                    Nếu máy tương thích, H-MMO có thể xử lý nhanh hơn đáng kể.
                  </span>
                </div>
              </div>
              <span className="accordion-badge">Chế độ tiêu chuẩn</span>
            </div>
          </div>
        </div>

        {/* Right: Preview Panel */}
        <div className="preview-panel" style={{ flex: 6, display: 'flex', flexDirection: 'column' }}>
          <div className="section-title">VÙNG ĐỌC CHỮ</div>
          
          <div className="preview-viewport" style={{ flex: 1, backgroundColor: 'var(--bg-dark)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
            {videoPath ? (
              <video 
                src={`file:///${videoPath.replace(/\\/g, '/').split('/').map(s => encodeURIComponent(s)).join('/').replace('%3A', ':')}`} 
                className="video-player" 
                style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                controls 
              />
            ) : (
              <div className="placeholder" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                <FolderOpen size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                <h3 style={{ color: 'var(--text-primary)', marginBottom: '4px' }}>Chọn video để xác định vùng có chữ</h3>
                <p style={{ fontSize: '12px' }}>Khung nhận diện sẽ hiển thị trực tiếp trên video.</p>
                <button className="btn-outline" style={{ marginTop: '16px', pointerEvents: 'auto' }} onClick={handleSelectVideo}>
                  Chọn file video
                </button>
              </div>
            )}
          </div>

          <div className="log-console" style={{ height: '100px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)', padding: '12px', fontSize: '11px', color: 'var(--text-muted)', overflowY: 'auto', fontFamily: 'monospace', marginTop: '16px' }}>
            {logs.map((log, index) => (
              <div key={index}>{log}</div>
            ))}
            <div ref={logEndRef} />
          </div>

          <button 
            className="btn-primary" 
            style={{ width: '100%', marginTop: '16px', padding: '16px', fontSize: '16px', textTransform: 'uppercase', letterSpacing: '1px' }}
            onClick={handleGenerate} 
            disabled={isProcessing || !videoPath}
          >
            {isProcessing ? 'Đang xử lý...' : 'Bắt đầu'}
          </button>
        </div>
      </div>
    </div>
  );
}
