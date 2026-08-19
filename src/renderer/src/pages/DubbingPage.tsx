import React, { useState, useEffect } from 'react';
import { Mic, Play, Settings, Type, FileVideo } from 'lucide-react';
import './DubbingPage.css';

export default function DubbingPage() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [srtFile, setSrtFile] = useState<File | null>(null);
  const [voiceId, setVoiceId] = useState('vi-VN-HoaiMyNeural');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [outVideo, setOutVideo] = useState<string | null>(null);

  useEffect(() => {
    const handleLog = (_event: any, msg: string) => {
      setLogs((prev) => [...prev, msg]);
    };
    window.electron.ipcRenderer.on('dubbing:log', handleLog);
    return () => {
      window.electron.ipcRenderer.removeAllListeners('dubbing:log');
    };
  }, []);

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setVideoFile(e.target.files[0]);
      setOutVideo(null);
    }
  };

  const handleSrtSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSrtFile(e.target.files[0]);
    }
  };

  const handleStartDubbing = async () => {
    if (!videoFile || !srtFile) return;
    
    setIsProcessing(true);
    setLogs([]);
    setOutVideo(null);
    
    try {
      const resultPath = await window.electron.ipcRenderer.invoke('dubbing:generate', {
        videoPath: (videoFile as any).path,
        srtPath: (srtFile as any).path,
        voiceId: voiceId
      });
      setOutVideo(resultPath);
    } catch (err: any) {
      setLogs((prev) => [...prev, `[LỖI]: ${err.message}`]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="dubbing-container">
      <div className="dubbing-header">
        <Mic className="header-icon" />
        <h2>Lồng Tiếng (AI Dubbing)</h2>
        <p>Lồng tiếng vào video gốc với giọng đọc AI chất lượng cao từ Microsoft Azure Neural.</p>
      </div>

      <div className="dubbing-layout">
        <div className="settings-panel">
          <div className="upload-group">
            <label className="upload-label">
              <FileVideo size={18} /> Chọn Video Gốc (MP4)
            </label>
            <div className="file-input-wrapper">
              <input type="file" accept="video/mp4" onChange={handleVideoSelect} id="video-upload" />
              <label htmlFor="video-upload" className="file-btn">Duyệt File</label>
              <span className="file-name">{videoFile ? videoFile.name : 'Chưa chọn file'}</span>
            </div>
          </div>

          <div className="upload-group">
            <label className="upload-label">
              <Type size={18} /> Chọn Phụ Đề Đã Dịch (SRT)
            </label>
            <div className="file-input-wrapper">
              <input type="file" accept=".srt" onChange={handleSrtSelect} id="srt-upload" />
              <label htmlFor="srt-upload" className="file-btn">Duyệt File</label>
              <span className="file-name">{srtFile ? srtFile.name : 'Chưa chọn file'}</span>
            </div>
          </div>

          <div className="upload-group">
            <label className="upload-label">
              <Settings size={18} /> Chọn Giọng Đọc
            </label>
            <select className="voice-select" value={voiceId} onChange={e => setVoiceId(e.target.value)}>
              <option value="vi-VN-HoaiMyNeural">Hoài My (Nữ, Miền Nam, Truyền cảm)</option>
              <option value="vi-VN-NamMinhNeural">Nam Minh (Nam, Miền Bắc, Trầm ấm)</option>
            </select>
          </div>

          <button 
            className="btn-start" 
            onClick={handleStartDubbing}
            disabled={!videoFile || !srtFile || isProcessing}
          >
            <Play size={18} fill="currentColor" />
            {isProcessing ? 'Đang Xử Lý...' : 'Bắt Đầu Lồng Tiếng'}
          </button>
        </div>

        <div className="logs-panel">
          <div className="logs-header">
            <h3>Tiến Trình Chạy</h3>
          </div>
          <div className="logs-box">
            {logs.length === 0 ? (
              <div className="empty-logs">Chưa có thông tin...</div>
            ) : (
              logs.map((log, idx) => (
                <div key={idx} className="log-line">{log}</div>
              ))
            )}
          </div>
        </div>
      </div>

      {outVideo && (
        <div className="result-panel">
          <h3>Thành Phẩm:</h3>
          <video 
            src={`local:///${encodeURIComponent(outVideo)}`} 
            controls 
            className="preview-video"
          />
        </div>
      )}
    </div>
  );
}
