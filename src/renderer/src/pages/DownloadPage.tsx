import { useState, useRef, useEffect } from 'react';
import './DownloadPage.css';

interface VideoInfo {
  url: string;
  title: string;
  thumbnail?: string;
  duration?: string;
  views?: string;
}

type ItemState = { status: string; percent?: number; speed?: string; eta?: string; file?: string; error?: string };
type DlOpts = { quality: string; mode: 'video' | 'audio'; audioFormat: string; template: string; concurrency: number; embedThumb: boolean; embedMeta: boolean; skipDownloaded: boolean };
const DL_DEFAULTS: DlOpts = { quality: 'best', mode: 'video', audioFormat: 'mp3', template: 'title', concurrency: 2, embedThumb: false, embedMeta: true, skipDownloaded: true };
const loadJson = <T,>(k: string, d: T): T => { try { return { ...d, ...JSON.parse(localStorage.getItem(k) || '{}') }; } catch { return d; } };
const saveJson = (k: string, v: any) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bỏ qua */ } };
const ipc = () => (window as any).electron.ipcRenderer;
const STATUS_TEXT: Record<string, string> = { queued: 'Chờ tải', downloading: 'Đang tải', processing: 'Đang ghép/xử lý', done: 'Xong', skipped: 'Đã có, bỏ qua', error: 'Lỗi', cancelled: 'Đã huỷ' };
const STATUS_COLOR: Record<string, string> = { done: '#22c55e', skipped: '#94a3b8', error: '#ef4444', cancelled: '#94a3b8' };

interface LogEntry {
  text: string;
  type: 'info' | 'success' | 'error';
}

export function DownloadPage({ platform }: { platform: 'YouTube' | 'Douyin' }) {
  const [url, setUrl] = useState('');
  const place = loadJson(`hmmo-dl-${platform}`, { savePath: 'Downloads', cookie: 'none' });
  const [savePath, setSavePath] = useState(place.savePath);
  const [cookieBrowser, setCookieBrowser] = useState(place.cookie);
  const [opts, setOpts] = useState<DlOpts>(() => loadJson('hmmo-dl-opts', DL_DEFAULTS));
  const [states, setStates] = useState<Record<string, ItemState>>({});
  const setOpt = <K extends keyof DlOpts>(k: K, v: DlOpts[K]) => setOpts(p => ({ ...p, [k]: v }));
  useEffect(() => saveJson('hmmo-dl-opts', opts), [opts]);
  const placeFor = useRef(platform); // tránh ghi thư mục/cookie của nền tảng cũ sang nền tảng mới khi chuyển tab
  useEffect(() => { if (placeFor.current === platform) saveJson(`hmmo-dl-${platform}`, { savePath, cookie: cookieBrowser }); }, [savePath, cookieBrowser, platform]);
  useEffect(() => {
    const h = (_e: any, u: ItemState & { id: string }) => setStates(p => ({ ...p, [u.id]: { ...p[u.id], ...u } }));
    ipc().on('download:item', h);
    return () => ipc().removeListener('download:item', h);
  }, []);
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
    setStates({});
    setUrl('');
    const pl = loadJson(`hmmo-dl-${platform}`, { savePath: 'Downloads', cookie: 'none' });
    setSavePath(pl.savePath);
    setCookieBrowser(pl.cookie);
    placeFor.current = platform;
    setLogs([{ text: `Đã chuyển sang tải từ ${platform}`, type: 'info' }]);
    if (platform === 'Douyin' && (window as any).api.douyinCookieStatus) {
      (window as any).api.douyinCookieStatus().then((st: any) => {
        if (st?.exists) {
          setCookieBrowser('douyin-app');
          setLogs(prev => [...prev, { text: `Đang dùng cookie Douyin đã kết nối (${new Date(st.savedAt).toLocaleString('vi-VN')}).`, type: 'info' }]);
        }
      });
    }
    
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
      } else if ((url.match(/https?:\/\//g) || []).length > 1) {
        // Dán nhiều link cùng lúc -> đưa thẳng vào hàng đợi
        const links = Array.from(new Set(url.split(/[\s,]+/).filter(s => /^https?:\/\//.test(s))));
        parsedVideos = links.map((l, i) => {
          const id = l.match(/modal_id=(\d+)/) || l.match(/\/video\/(\d+)/);
          const u = id && /douyin/.test(l) ? `https://www.douyin.com/video/${id[1]}` : l;
          return { url: u, title: `Link ${i + 1}: ${u}`, thumbnail: '', duration: '', views: '' };
        });
        addLog(`Đã nạp ${parsedVideos.length} link.`, 'success');
      } else {
        const dyId = platform === 'Douyin' ? (url.match(/modal_id=(\d+)/) || url.match(/\/video\/(\d+)/)) : null;
        if (dyId) {
          // Link 1 video Douyin (kể cả dạng jingxuan?modal_id=...): tải thẳng, không cần quét
          parsedVideos = [{ url: `https://www.douyin.com/video/${dyId[1]}`, title: `Douyin ${dyId[1]}`, thumbnail: '', duration: '', views: '' }];
        } else if (platform === 'Douyin') {
          throw new Error('Douyin chặn quét link trực tiếp! Hãy dùng nút [Copy lệnh JS], dán vào Console của Douyin rồi dán dữ liệu JSON vào đây.');
        }
        if (!dyId) {
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
    try {
      const items = videos.filter(v => selectedUrls.has(v.url)).map(v => ({ id: v.url, url: v.url, title: v.title }));
      const r = await ipc().invoke('download:start', items, { ...opts, savePath, cookie: cookieBrowser });
      addLog(`Hoàn tất: ${r.ok} thành công${r.skip ? `, ${r.skip} đã có` : ''}${r.fail ? `, ${r.fail} lỗi` : ''}${r.cancelled ? ' (đã huỷ)' : ''}.`, r.fail ? 'error' : 'success');
    } catch (e: any) {
      if (/No handler registered/.test(e.message)) { addLog('Hãy TẮT hẳn H-MMO rồi mở lại để nạp bộ tải mới.', 'error'); return; }
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
            {platform === 'Douyin' && (
              <button
                className="btn-outline"
                style={{ borderColor: '#16a34a', color: '#16a34a' }}
                onClick={async () => {
                  addLog('Đang mở cửa sổ Douyin... Lướt vài video (đăng nhập nếu muốn) rồi ĐÓNG cửa sổ đó để lưu cookie.');
                  const r = await (window as any).api.douyinConnect();
                  if (r?.ok) {
                    setCookieBrowser('douyin-app');
                    addLog(`Đã lưu ${r.count} cookie Douyin. Từ giờ tải Douyin không cần cookies.txt.`, 'success');
                  } else {
                    addLog(`Kết nối Douyin thất bại: ${r?.error || 'không rõ lỗi'}`, 'error');
                  }
                }}
              >
                Kết nối Douyin
              </button>
            )}
            {platform === 'Douyin' && (
              <button 
                className="btn-outline" 
                style={{ borderColor: '#dc2626', color: '#dc2626' }}
                onClick={() => {
                  const jsCode = `(function(){var v=[],s={};var RV=new RegExp('/(?:video|note)/([0-9]{8,})'),RM=new RegExp('modal_id=([0-9]{8,})');function txt(el){return el?(el.innerText||el.textContent||'').trim():''}function add(id,t,m,first){if(!id||s[id])return;s[id]=1;var o={url:'https://www.douyin.com/video/'+id,title:(t||'').replace(/\\s+/g,' ').trim().slice(0,200),thumbnail:m||'',views:'',duration:''};if(first)v.unshift(o);else v.push(o)}function descIn(box){if(!box)return '';var d=box.querySelector('[data-e2e="video-desc"]')||box.querySelector('[data-e2e="feed-video-desc"]');return txt(d)}function imgIn(box){var i=box&&box.querySelector('img');return i?i.src:''}var cur=(location.href.match(RM)||location.href.match(RV)||[])[1];var act=document.querySelector('[data-e2e="feed-active-video"]');if(act){var ve=act.hasAttribute('data-e2e-vid')?act:act.querySelector('[data-e2e-vid]');add(ve?ve.getAttribute('data-e2e-vid'):'',descIn(act)||document.title,imgIn(act),true)}if(cur){add(cur,descIn(document)||document.title,'',true)}document.querySelectorAll('[data-e2e-vid],[data-aweme-id]').forEach(function(el){var id=el.getAttribute('data-e2e-vid')||el.getAttribute('data-aweme-id');if(!/^[0-9]{8,}$/.test(id||''))return;add(id,descIn(el),imgIn(el))});document.querySelectorAll('a[href]').forEach(function(a){var h=a.getAttribute('href')||'';var r=h.match(RV)||h.match(RM);if(!r)return;var p=a.parentElement&&a.parentElement.parentElement;var img=a.querySelector('img')||(p&&p.querySelector('img'));add(r[1],txt(a),img?img.src:'')});if(v.length>0){var ta=document.createElement('textarea');ta.value=JSON.stringify(v);document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);alert('Đã copy '+v.length+' video! Về H-MMO dán vào ô URL rồi bấm QUÉT LINK.');}else{alert('Không tìm thấy video nào! Hãy mở trang kênh (douyin.com/user/...), 1 video cụ thể, hoặc để video đang phát trên trang Đề xuất rồi chạy lại.');}})();`;
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
          <div className="dl-opts">
            <label>Tải
              <select value={opts.mode} onChange={e => setOpt('mode', e.target.value as any)}>
                <option value="video">Video</option>
                <option value="audio">Chỉ âm thanh</option>
              </select>
            </label>
            {opts.mode === 'video' ? (
              <label>Chất lượng
                <select value={opts.quality} onChange={e => setOpt('quality', e.target.value)}>
                  <option value="best">Cao nhất</option>
                  <option value="2160">4K (2160p)</option>
                  <option value="1440">1440p</option>
                  <option value="1080">1080p</option>
                  <option value="720">720p</option>
                  <option value="480">480p</option>
                  <option value="360">360p</option>
                </select>
              </label>
            ) : (
              <label>Định dạng
                <select value={opts.audioFormat} onChange={e => setOpt('audioFormat', e.target.value)}>
                  <option value="mp3">MP3</option>
                  <option value="m4a">M4A</option>
                  <option value="wav">WAV</option>
                </select>
              </label>
            )}
            <label>Tên file
              <select value={opts.template} onChange={e => setOpt('template', e.target.value)}>
                <option value="title">Tiêu đề</option>
                <option value="uploader_title">Kênh - Tiêu đề</option>
                <option value="date_title">Ngày đăng - Tiêu đề</option>
                <option value="index_title">Số thứ tự - Tiêu đề</option>
                <option value="id">Mã video</option>
              </select>
            </label>
            <label>Song song
              <select value={opts.concurrency} onChange={e => setOpt('concurrency', Number(e.target.value))}>
                {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n} video</option>)}
              </select>
            </label>
            <label className="chk"><input type="checkbox" checked={opts.skipDownloaded} onChange={e => setOpt('skipDownloaded', e.target.checked)} /> Bỏ qua video đã tải</label>
            <label className="chk"><input type="checkbox" checked={opts.embedMeta} onChange={e => setOpt('embedMeta', e.target.checked)} /> Ghi thông tin</label>
            <label className="chk"><input type="checkbox" checked={opts.embedThumb} onChange={e => setOpt('embedThumb', e.target.checked)} /> Nhúng ảnh bìa</label>
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
                    {states[video.url] && (() => {
                      const st = states[video.url];
                      const pct = Math.max(0, Math.min(100, st.percent ?? 0));
                      return (
                        <div className="dl-state" onClick={e => e.stopPropagation()}>
                          <div className="dl-bar"><div style={{ width: `${pct}%`, background: STATUS_COLOR[st.status] || 'var(--accent, #ff6a00)' }} /></div>
                          <div className="dl-meta" style={{ color: STATUS_COLOR[st.status] }}>
                            <span>{STATUS_TEXT[st.status] || st.status}{st.status === 'downloading' ? ` ${pct.toFixed(1)}%` : ''}</span>
                            {st.status === 'downloading' && st.speed && <span>{st.speed}</span>}
                            {st.status === 'downloading' && st.eta && <span>còn {st.eta}</span>}
                            {st.status === 'done' && <button className="btn-outline dl-open" onClick={() => ipc().invoke('download:reveal', st.file)}>Mở thư mục</button>}
                          </div>
                          {st.error && <div className="dl-err" title={st.error}>{st.error}</div>}
                        </div>
                      );
                    })()}
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
                <option value="douyin-app">Douyin (đã kết nối)</option>
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
                {savePath === 'Downloads' ? 'H-MMO › 1. Video gốc' : savePath}
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

            {isDownloading ? (
              <button className="btn-download" style={{ background: '#dc2626' }} onClick={() => { ipc().invoke('download:cancel'); addLog('Đang huỷ tải...', 'error'); }}>
                ■ Huỷ tải
              </button>
            ) : (
              <button className="btn-download" onClick={handleDownload} disabled={selectedUrls.size === 0}>
                ⬇ Tải {selectedUrls.size || ''} mục đã chọn
              </button>
            )}
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
