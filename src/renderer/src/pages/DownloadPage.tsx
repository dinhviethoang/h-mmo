import { useState, useRef, useEffect } from 'react';
import './DownloadPage.css';

interface VideoInfo {
  url: string;
  title: string;
  thumbnail?: string;
  duration?: string;
  views?: string;
}

interface LogEntry {
  text: string;
  type: 'info' | 'success' | 'error';
}

export function DownloadPage({ platform }: { platform: 'YouTube' | 'Douyin' }) {
  const [url, setUrl] = useState('');
  const [savePath, setSavePath] = useState('Downloads');
  const [cookieBrowser, setCookieBrowser] = useState('none');
  const [isScanning, setIsScanning] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [videos, setVideos] = useState<VideoInfo[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [logs, setLogs] = useState<LogEntry[]>([{ text: 'Sẵn sàng...', type: 'info' }]);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    // Reset state when platform changes
    setVideos([]);
    setSelectedUrls(new Set());
    setUrl('');
    setLogs([{ text: `Đã chuyển sang tải từ ${platform}`, type: 'info' }]);
    
    // Listen to download progress
    if ((window as any).api.onDownloadProgress) {
      (window as any).api.onDownloadProgress((log: string) => {
        setLogs(prev => {
          // If the last log is a progress update for the same video, replace it to avoid log spam
          const lastLog = prev[prev.length - 1];
          if (lastLog && lastLog.text.startsWith('Đang tải') && log.startsWith('Đang tải')) {
            const newLogs = [...prev];
            newLogs[newLogs.length - 1] = { text: log, type: 'info' };
            return newLogs;
          }
          return [...prev, { text: log, type: 'info' }];
        });
      });
    }
  }, [platform]);

  const addLog = (text: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [...prev, { text, type }]);
  };

  const handleScan = async () => {
    if (!url.trim()) return;
    
    setIsScanning(true);
    addLog(`Đang quét link: ${url}`);
    
    try {
      let parsedVideos: VideoInfo[] = [];

      // Check if the user pasted a JSON string (from Douyin JS script)
      if (url.trim().startsWith('[') && url.trim().endsWith(']')) {
        try {
          const jsonArr = JSON.parse(url.trim());
          if (Array.isArray(jsonArr)) {
            parsedVideos = jsonArr;
            addLog('Đã nạp dữ liệu từ chuỗi JSON.', 'success');
          }
        } catch (err) {
          throw new Error('Chuỗi JSON không hợp lệ!');
        }
      } else {
        if (platform === 'Douyin') {
          throw new Error('Douyin chặn quét link trực tiếp! Hãy dùng nút [Copy lệnh JS], dán vào Console của Douyin rồi dán dữ liệu JSON vào đây.');
        }
        // Normal URL, call backend
        const result = await (window as any).api.scanUrl(url);
        if (result && result.entries) {
          // Playlist
          parsedVideos = result.entries.map((v: any) => ({
            url: v.url || v.webpage_url,
            title: v.title || 'Không có tiêu đề',
            thumbnail: v.thumbnails?.[0]?.url || '',
            duration: v.duration_string || '',
            views: v.view_count ? `${v.view_count}` : ''
          }));
        } else if (result) {
          // Single video
          parsedVideos = [{
            url: result.url || result.webpage_url,
            title: result.title || 'Không có tiêu đề',
            thumbnail: result.thumbnail || '',
            duration: result.duration_string || '',
            views: result.view_count ? `${result.view_count}` : ''
          }];
        }
      }
      
      setVideos(parsedVideos);
      setSelectedUrls(new Set(parsedVideos.map(v => v.url)));
      addLog(`Tìm thấy ${parsedVideos.length} video.`, 'success');
      
    } catch (e: any) {
      addLog(`Lỗi khi quét: ${e.message}`, 'error');
    } finally {
      setIsScanning(false);
    }
  };

  const toggleSelect = (videoUrl: string) => {
    const next = new Set(selectedUrls);
    if (next.has(videoUrl)) next.delete(videoUrl);
    else next.add(videoUrl);
    setSelectedUrls(next);
  };

  const selectAll = () => setSelectedUrls(new Set(videos.map(v => v.url)));
  const deselectAll = () => setSelectedUrls(new Set());

  const handleDownload = async () => {
    if (selectedUrls.size === 0) return;
    
    setIsDownloading(true);
    addLog(`Bắt đầu tải ${selectedUrls.size} video...`);
    
    try {
      const urlsToDownload = Array.from(selectedUrls);
      const result = await (window as any).api.downloadVideos(urlsToDownload, savePath, cookieBrowser);
      if (result.success) {
        addLog(`Tải xong ${result.downloaded} video!`, 'success');
      } else {
        addLog(`Có lỗi khi tải: ${result.error}`, 'error');
      }
    } catch (e: any) {
      addLog(`Lỗi tải xuống: ${e.message}`, 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="download-page">
      <div className="download-header">
        <h2>{platform} Downloader</h2>
        <p>Dán link kênh hoặc video để quét và tải xuống</p>
      </div>

      <div className="download-container">
        <div className="input-card">
          <div className="input-row">
            <input 
              className="url-input" 
              placeholder={`Nhập link ${platform}...`} 
              value={url}
              onChange={e => setUrl(e.target.value)}
              disabled={isScanning || isDownloading}
              onKeyDown={e => e.key === 'Enter' && handleScan()}
            />
            {platform === 'YouTube' && (
              <select className="form-select" style={{ width: 120 }}>
                <option>Tất cả</option>
                <option>Videos</option>
                <option>Shorts</option>
              </select>
            )}
            {platform === 'Douyin' && (
              <button 
                className="btn-outline" 
                style={{ borderColor: '#dc2626', color: '#dc2626' }}
                onClick={() => {
                  const jsCode = `(function(){const v=[];const s=new Set();document.querySelectorAll('a[href*="/video/"]').forEach(a=>{const u=a.href;if(s.has(u))return;s.add(u);let t=a.innerText||'';const img=a.querySelector('img')||(a.parentElement&&a.parentElement.parentElement&&a.parentElement.parentElement.querySelector('img'));const m=img?img.src:'';v.push({url:u,title:t,thumbnail:m,views:'',duration:''})});if(v.length>0){const textArea=document.createElement('textarea');textArea.value=JSON.stringify(v);document.body.appendChild(textArea);textArea.select();document.execCommand('copy');document.body.removeChild(textArea);alert('Đã copy '+v.length+' video! Về H-MMO dán vào ô URL.');}else{alert('Không tìm thấy video nào!');}})();`;
                  navigator.clipboard.writeText(jsCode).then(() => {
                    addLog('Đã copy Script cào Douyin. Hãy dán vào F12 Chrome (Console) trên kênh Douyin.', 'success');
                  });
                }}
              >
                Copy lệnh JS
              </button>
            )}
            <button 
              className="btn-scan" 
              onClick={handleScan}
              disabled={!url.trim() || isScanning || isDownloading}
            >
              {isScanning ? 'Đang quét...' : 'Quét Link'}
            </button>
          </div>
        </div>

        <div className="results-card">
          <div className="results-status">
            {videos.length === 0 ? 'Chưa có dữ liệu. Nhập link và bấm Quét.' : `Đã chọn ${selectedUrls.size}/${videos.length} video`}
          </div>
          
          <div className="video-grid">
            {videos.map(video => {
              const isSelected = selectedUrls.has(video.url);
              return (
                <div 
                  key={video.url} 
                  className={`video-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleSelect(video.url)}
                >
                  <div className="video-thumbnail-container">
                    <img src={video.thumbnail} alt={video.title} className="video-thumbnail" />
                    <div className="video-overlay"></div>
                    <div className="video-duration">{video.duration}</div>
                    <div className="video-views">👁 {video.views}</div>
                    
                    <div className="video-checkbox-wrapper">
                      <div className={`checkbox-custom ${isSelected ? 'checked' : ''}`}></div>
                    </div>
                  </div>
                  <div className="video-info">
                    <h4 className="video-title" title={video.title}>{video.title}</h4>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="actions-bar" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button className="btn-outline" onClick={selectAll} disabled={videos.length === 0}>Chọn tất cả</button>
            <button className="btn-outline" onClick={deselectAll} disabled={videos.length === 0}>Bỏ chọn</button>
            
            <div style={{ flex: 1 }}></div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#9ca3af' }}>
              <span>Cookies:</span>
              <select 
                style={{ background: '#111', color: 'white', border: '1px solid #374151', padding: '6px 12px', borderRadius: '4px', outline: 'none', maxWidth: '120px' }}
                value={cookieBrowser.endsWith('.txt') ? 'cookies.txt' : cookieBrowser}
                onChange={async e => {
                  if (e.target.value === 'cookies.txt') {
                    const file = await (window as any).api.selectFile();
                    if (file) setCookieBrowser(file);
                    else setCookieBrowser('none'); // Revert if canceled
                  } else {
                    setCookieBrowser(e.target.value);
                  }
                }}
              >
                <option value="none">Không dùng</option>
                <option value="chrome">Chrome</option>
                <option value="edge">Edge</option>
                <option value="firefox">Firefox</option>
                <option value="cookies.txt">Chọn File cookies.txt...</option>
              </select>
              
              {cookieBrowser.endsWith('.txt') && (
                <div style={{ background: '#222', padding: '6px 8px', borderRadius: '4px', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }} title={cookieBrowser}>
                  {cookieBrowser.split('\\').pop()}
                </div>
              )}
              
              <span style={{ marginLeft: '8px' }}>Lưu tại:</span>
              <div style={{ background: '#111', padding: '6px 12px', borderRadius: '4px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={savePath}>
                {savePath}
              </div>
              <button 
                className="btn-outline" 
                style={{ padding: '6px 12px' }}
                onClick={async () => {
                  const dir = await (window as any).api.selectDirectory();
                  if (dir) setSavePath(dir);
                }}
              >
                Đổi thư mục
              </button>
            </div>

            <button 
              className="btn-download" 
              onClick={handleDownload}
              disabled={selectedUrls.size === 0 || isDownloading}
            >
              {isDownloading ? 'Đang tải...' : '⬇ Tải Video Đã Chọn'}
            </button>
          </div>
        </div>

        <div className="log-box">
          {logs.map((log, i) => (
            <div key={i} className={`log-line ${log.type}`}>
              {log.text}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}
