import { useState, useEffect, useRef } from 'react';
import { Play, Folder } from 'lucide-react';
import './EditorPage.css';

export function EditorPage() {
  const [activeTab, setActiveTab] = useState('subtitle');
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [srtPath, setSrtPath] = useState<string | null>(null);

  
  // Subtitle Settings State
  const [subStyle, setSubStyle] = useState<'sentence' | 'word' | 'highlight'>('highlight');
  const [highlightColor, setHighlightColor] = useState('#3be3b7');
  const [enableBounce, setEnableBounce] = useState(true);
  const [autoOptimize, setAutoOptimize] = useState(true);
  const [fontFamily, setFontFamily] = useState('Be Vietnam Pro, sans-serif');
  const [fontSize, setFontSize] = useState(32);
  const [textColor, setTextColor] = useState('#ffffff');
  const [borderColor, setBorderColor] = useState('#000000');
  const [borderWidth, setBorderWidth] = useState(2);
  const [addBg, setAddBg] = useState(false);
  const [flipVideo, setFlipVideo] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);

  // Blur Settings State
  const [blurRegions, setBlurRegions] = useState<any[]>([{ id: 'region-1', x: 10, y: 10, w: 20, h: 20, intensity: 10 }]);

  // Dubbing Settings
  const [voiceId, setVoiceId] = useState('google-free');
  const [neeyuVoices, setNeeyuVoices] = useState<string[]>([]);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>(['Sẵn sàng...']);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to bottom of logs
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  useEffect(() => {
    if (window.api) {
      (window as any).api.getNeeyuVoices().then(voices => {
        setNeeyuVoices(voices);
        if (voices.length > 0) {
          setVoiceId(`neeyu-${voices[0]}`);
        }
      });
      window.api.onVideoLog((log: string) => {
        setLogs(prev => [...prev, log]);
        if (log === '====== XUẤT VIDEO HOÀN TẤT ======') {
          setIsProcessing(false);
        }
      });
    }
  }, []);

  const [parsedSubtitles, setParsedSubtitles] = useState<any[]>([]);

  const parseTime = (timeStr: string) => {
    const parts = timeStr.replace(',', '.').split('.');
    const hms = parts[0];
    const ms = parts[1] || '000';
    const [h, m, s] = hms.split(':').map(Number);
    return (h * 3600 + m * 60 + s) * 1000 + Number(ms);
  };

  useEffect(() => {
    if (srtPath && window.api && (window as any).api.readFile) {
      (window as any).api.readFile(srtPath).then((content: string | null) => {
        if (!content) {
          setParsedSubtitles([]);
          return;
        }
        const blocks = content.trim().split(/\n\s*\n/);
        const parsed: any[] = [];
        for (const block of blocks) {
          const lines = block.split('\n');
          if (lines.length >= 3) {
            const id = lines[0];
            const timeLine = lines[1];
            if (timeLine.includes(' --> ')) {
              const [startStr, endStr] = timeLine.split(' --> ');
              const startMs = parseTime(startStr);
              const endMs = parseTime(endStr);
              const text = lines.slice(2).join('\n').trim();
              const wordsArr = text.split(/\s+/);
              const wordDur = (endMs - startMs) / Math.max(wordsArr.length, 1);
              const words = wordsArr.map((word, idx) => ({
                word,
                startMs: startMs + idx * wordDur,
                endMs: startMs + (idx + 1) * wordDur
              }));
              parsed.push({ id, startMs, endMs, text, words });
            }
          }
        }
        setParsedSubtitles(parsed);
      });
    } else {
      setParsedSubtitles([]);
    }
  }, [srtPath]);

  const handleSelectVideo = async () => {
    const path = await window.api.selectVideo();
    if (path) setVideoPath(path);
  };

  const handleSelectSrt = async () => {
    const path = await window.api.selectSrt();
    if (path) setSrtPath(path);
  };

  const handlePreview = async () => {
    if (!videoPath) {
      setLogs(prev => [...prev, '[LỖI] Bạn chưa chọn video!']);
      return;
    }
    
    setIsProcessing(true);
    setLogs(['Bắt đầu tạo video xem trước (15 giây)...']);
    
    try {
      await window.api.processVideo({
        videoPath,
        srtPath,
        blurRegions,
        subStyle,
        fontSize,
        textColor,
        borderColor,
        borderWidth,
        addBg,
        fontFamily,
        flipVideo,
        previewMode: true
      });
    } catch (e: any) {
      setIsProcessing(false);
    }
  };

  const handleDubbing = async (isPreview: boolean = false) => {
    if (!videoPath || !srtPath) {
      setLogs(prev => [...prev, '[LỖI] Bạn cần chọn cả video và file phụ đề SRT!']);
      return;
    }
    
    setIsProcessing(true);
    setLogs([isPreview ? 'Bắt đầu tạo lồng tiếng xem trước (15s)...' : 'Bắt đầu quy trình lồng tiếng...']);
    
    try {
      const handleDubbingLog = (_event: any, log: string) => {
        setLogs(prev => [...prev, log]);
      };
      window.electron.ipcRenderer.on('dubbing:log', handleDubbingLog);
      
      const isZalo = voiceId.startsWith('zalo-');
      const isFpt = voiceId.startsWith('fpt-');
      const apiKeyKey = isZalo ? 'zaloApiKey' : isFpt ? 'fptApiKey' : '';
      
      const fptKey = (window as any).fptApiKey || localStorage.getItem('fptApiKey') || '';
      const zaloKey = (window as any).zaloApiKey || localStorage.getItem('zaloApiKey') || '';
      
      await window.electron.ipcRenderer.invoke('dubbing:generate', {
        videoPath,
        srtPath,
        voiceId,
        fptApiKey: fptKey,
        zaloApiKey: zaloKey,
        apiKey: apiKeyKey ? ((window as any)[apiKeyKey] || localStorage.getItem(apiKeyKey) || '') : '',
        flipVideo,
        previewMode: isPreview
      });
      
      window.electron.ipcRenderer.removeListener('dubbing:log', handleDubbingLog);
    } catch (err: any) {
      setLogs((prev) => [...prev, `[LỖI]: ${err.message}`]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExport = async () => {
    if (!videoPath) {
      setLogs(prev => [...prev, '[LỖI] Bạn chưa chọn video!']);
      return;
    }
    
    setIsProcessing(true);
    setLogs(['Bắt đầu xử lý video...']);
    
    try {
      await window.api.processVideo({
        videoPath,
        srtPath,
        blurRegions,
        subStyle,
        fontSize,
        textColor,
        borderColor,
        borderWidth,
        addBg,
        fontFamily,
        flipVideo
      });
    } catch (e: any) {
      setIsProcessing(false);
    }
  };



  const tabs = [
    { id: 'subtitle', label: 'Phụ đề' },
    { id: 'blur', label: 'Làm mờ' },
    { id: 'voice', label: 'Lồng tiếng' }
  ];



  return (
    <div className="editor-page">
      {/* Top Header & Selector Bar */}
      <div className="header-section">
        <div className="header-title">
          <h2>Biên tập video</h2>
          <p>Xem trước, tạo kiểu phụ đề và xuất video</p>
        </div>
        
        <div className="selector-bar">
          <div className="input-group">
            <span className="input-label">Video (File):</span>
            <div className="input-field" onClick={handleSelectVideo}>
              <span className="input-text">{videoPath || ''}</span>
              <Folder size={16} className="input-icon" />
            </div>
          </div>
          
          <div className="input-group">
            <span className="input-label">Phụ đề (SRT):</span>
            <div className="input-field" onClick={handleSelectSrt}>
              <span className="input-text">{srtPath || ''}</span>
              <Folder size={16} className="input-icon" />
            </div>
          </div>
          
          <div className="input-group">
            <span className="input-label">Thư mục lưu:</span>
            <div className="input-field">
              <span className="input-text">Cùng thư mục gốc</span>
              <Folder size={16} className="input-icon" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="main-content">
        {/* Left: Preview Panel */}
        <div className="panel preview-panel">
          <div className="panel-header">
            <span className="panel-title">BẢN XEM TRƯỚC</span>
            <span className="time-label">0:00 / 0:00</span>
          </div>
          
          <div className="preview-container">
            <div className="preview-viewport">
              {videoPath ? (
                <>
                  <video 
                    src={`file:///${videoPath.replace(/\\/g, '/').split('/').map(s => encodeURIComponent(s)).join('/').replace('%3A', ':')}`} 
                    className="video-player" 
                    controls 
                    onTimeUpdate={(e) => setCurrentTimeMs(e.currentTarget.currentTime * 1000)}
                  />
                  {parsedSubtitles.map(sub => {
                    const isActive = currentTimeMs >= sub.startMs && currentTimeMs <= sub.endMs;
                    if (!isActive) return null;
                    return (
                      <div key={sub.id} className="subtitle-overlay" style={{
                        position: 'absolute',
                        bottom: '15%',
                        left: '5%',
                        right: '5%',
                        textAlign: 'center',
                        fontFamily: fontFamily,
                        fontWeight: 700,
                        fontSize: `${fontSize}px`,
                        color: textColor,
                        WebkitTextStroke: `${borderWidth}px ${borderColor}`,
                        textShadow: `0 4px 6px rgba(0,0,0,0.8)`,
                        backgroundColor: addBg ? 'rgba(0,0,0,0.6)' : 'transparent',
                        padding: addBg ? '12px 24px' : '0',
                        borderRadius: '12px',
                        pointerEvents: 'none',
                        transition: 'all 0.1s'
                      }}>
                        {sub.words.map((w: any, i: number) => {
                          const isWordActive = currentTimeMs >= w.startMs && currentTimeMs <= w.endMs;
                          const isWordPast = currentTimeMs > w.endMs;
                          
                          let wordStyle: any = { 
                            display: 'inline-block', 
                            margin: '0 6px', 
                            transition: 'all 0.15s ease-out',
                            transformOrigin: 'bottom center'
                          };
                          
                          if (subStyle === 'highlight') {
                            if (isWordActive) {
                              wordStyle.color = highlightColor;
                              if (enableBounce) wordStyle.transform = 'scale(1.2)';
                            }
                          } else if (subStyle === 'word') {
                            if (!isWordActive && !isWordPast) {
                              wordStyle.opacity = 0;
                              wordStyle.transform = 'translateY(10px)';
                            } else if (isWordActive) {
                              wordStyle.color = highlightColor;
                              if (enableBounce) wordStyle.transform = 'scale(1.2)';
                            }
                          }
                          
                          return <span key={i} style={wordStyle}>{w.word}</span>;
                        })}
                      </div>
                    );
                  })}
                  
                  {activeTab === 'blur' && blurRegions.map(region => (
                    <div key={`overlay-${region.id}`} style={{
                      position: 'absolute',
                      left: `${region.x}%`,
                      top: `${region.y}%`,
                      width: `${region.w}%`,
                      height: `${region.h}%`,
                      backdropFilter: `blur(${region.intensity}px)`,
                      backgroundColor: 'rgba(167, 139, 250, 0.15)',
                      border: '2px dashed #a78bfa',
                      zIndex: 40,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontWeight: 'bold',
                      textShadow: '0 2px 4px rgba(0,0,0,0.8)'
                    }}>
                      Blur {blurRegions.indexOf(region) + 1}
                    </div>
                  ))}
                </>
              ) : (
                <div className="placeholder">
                  <Play size={48} className="placeholder-icon" />
                  <h3>Chọn video để bắt đầu</h3>
                  <p>Phụ đề, vùng làm mờ và kết quả sẽ hiển thị tại đây</p>
                </div>
              )}
            </div>
          </div>

          <div className="play-controls">
            <button className="btn-play" onClick={() => {
              const video = document.querySelector('.video-player') as HTMLVideoElement;
              if (video) video.paused ? video.play() : video.pause();
            }}>
              <Play size={16} fill="currentColor" />
            </button>
            <span>Nhấn ▶ để xem video hoặc click đúp vào màn hình</span>
          </div>

          <div className="log-console">
            {logs.map((log, index) => (
              <div key={index}>{log}</div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>

        {/* Right: Settings Tabs Panel */}
        <div className="panel settings-panel">
          <div className="tabs-bar">
            {tabs.map(tab => (
              <button 
                key={tab.id}
                className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="tab-content">
            {activeTab === 'subtitle' && (
              <div className="tab-pane new-style">
                <div className="section-header-flex">
                  <div>
                    <h3 className="section-title">Kiểu phụ đề</h3>
                    <p className="section-desc">Áp dụng đồng thời cho xem trước và video xuất.</p>
                  </div>
                  <button className="btn-toggle on">Bật</button>
                </div>

                <div className="radio-card-group">
                  <label className={`radio-card ${subStyle === 'sentence' ? 'active' : ''}`}>
                    <input type="radio" name="subStyle" value="sentence" checked={subStyle === 'sentence'} onChange={() => setSubStyle('sentence')} />
                    <span className="radio-icon"></span>
                    <div className="radio-card-text">
                      <h4>Hiển thị cả câu</h4>
                      <p>Ổn định và dễ đọc</p>
                    </div>
                  </label>

                  <label className={`radio-card ${subStyle === 'word' ? 'active' : ''}`}>
                    <input type="radio" name="subStyle" value="word" checked={subStyle === 'word'} onChange={() => setSubStyle('word')} />
                    <span className="radio-icon"></span>
                    <div className="radio-card-text">
                      <h4>Hiện lần lượt từng từ</h4>
                      <p>Từ đã hiện được giữ lại</p>
                    </div>
                  </label>

                  <label className={`radio-card ${subStyle === 'highlight' ? 'active' : ''}`}>
                    <input type="radio" name="subStyle" value="highlight" checked={subStyle === 'highlight'} onChange={() => setSubStyle('highlight')} />
                    <span className="radio-icon"></span>
                    <div className="radio-card-text">
                      <h4>Làm nổi bật từ đang đọc</h4>
                      <p>Toàn câu luôn hiển thị</p>
                    </div>
                  </label>
                </div>

                <div className="form-group mt-3">
                  <label className="input-label">Màu từ đang đọc</label>
                  <input type="color" className="color-picker-input mt-1" value={highlightColor} onChange={(e) => setHighlightColor(e.target.value)} />
                </div>

                <div className="setting-card mt-3">
                  <div className="setting-card-header">
                    <div className="setting-card-text">
                      <h4>Nhấn nhẹ từ đang đọc</h4>
                      <p>Phóng nhẹ rồi trở về, không làm xô dòng chữ.</p>
                    </div>
                    <button className={`btn-toggle ${enableBounce ? 'on' : 'off'}`} onClick={() => setEnableBounce(!enableBounce)}>
                      {enableBounce ? 'Bật' : 'Tắt'}
                    </button>
                  </div>
                </div>

                <div className="setting-card mt-3">
                  <div className="setting-card-header">
                    <div className="setting-card-text">
                      <h4>Tự tối ưu phụ đề</h4>
                      <p>Giữ chữ gọn trong khung mà không sửa file SRT gốc.</p>
                    </div>
                    <button className={`btn-toggle ${autoOptimize ? 'on' : 'off'}`} onClick={() => setAutoOptimize(!autoOptimize)}>
                      {autoOptimize ? 'Bật' : 'Tắt'}
                    </button>
                  </div>
                  <div className="setting-card-body" style={{ opacity: autoOptimize ? 1 : 0.5, pointerEvents: autoOptimize ? 'auto' : 'none' }}>
                    <label className="input-label">Nhịp hiển thị</label>
                    <div className="select-wrapper">
                      <select className="form-select dark">
                        <option>Dễ đọc - Tối đa 2 dòng</option>
                      </select>
                    </div>
                    <label className="checkbox-label mt-3">
                      <input type="checkbox" defaultChecked />
                      <span className="checkbox-custom"></span>
                      <span>Hiện vùng an toàn trên bản xem trước</span>
                    </label>
                  </div>
                </div>

                <div className="form-group mt-3">
                  <label className="input-label">Font chữ</label>
                  <div className="select-wrapper mt-1">
                    <select className="form-select dark" value={fontFamily} onChange={(e) => setFontFamily(e.target.value)}>
                      <option value="Be Vietnam Pro, sans-serif">Be Vietnam Pro (Mặc định)</option>
                      <option value="Arial, sans-serif">Arial</option>
                      <option value="Times New Roman, serif">Times New Roman</option>
                    </select>
                  </div>
                  <p className="helper-text mt-2">• T-blao sẽ chọn font phù hợp khi xuất video.</p>
                  <button className="btn-outline-dark mt-2">Thêm font từ máy</button>
                </div>

                <div className="flex-row mt-3">
                  <div className="form-group flex-1">
                    <label className="input-label">Màu chữ</label>
                    <input type="color" className="color-picker-input mt-1" value={textColor} onChange={(e) => setTextColor(e.target.value)} />
                  </div>
                  <div className="form-group flex-1">
                    <label className="input-label">Màu viền</label>
                    <input type="color" className="color-picker-input mt-1" value={borderColor} onChange={(e) => setBorderColor(e.target.value)} />
                  </div>
                </div>

                <div className="form-group mt-3">
                  <label className="input-label">Kích thước chữ · {fontSize}px</label>
                  <input type="range" min="10" max="80" className="slider-purple mt-1" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} />
                </div>

                <div className="form-group mt-3">
                  <label className="input-label">Độ dày viền · {borderWidth}px</label>
                  <input type="range" min="0" max="10" className="slider-purple mt-1" value={borderWidth} onChange={(e) => setBorderWidth(Number(e.target.value))} />
                </div>

                <label className="checkbox-label mt-3">
                  <input type="checkbox" checked={addBg} onChange={(e) => setAddBg(e.target.checked)} />
                  <span className="checkbox-custom"></span>
                  <span>Thêm nền sau chữ</span>
                </label>
              </div>
            )}

            {activeTab === 'blur' && (
              <div className="tab-pane new-style">
                <div className="section-header-flex">
                  <div>
                    <h3 className="section-title">Vùng làm mờ</h3>
                    <p className="section-desc">Kéo và thay đổi kích thước vùng mờ trên bản xem trước.</p>
                  </div>
                  <button 
                    className="btn-outline-dark" 
                    style={{ width: 'auto' }}
                    onClick={() => {
                      const newId = `region-${Date.now()}`;
                      setBlurRegions([...blurRegions, { id: newId, x: 20, y: 20, w: 20, h: 20, intensity: 10 }]);
                    }}
                  >
                    + Thêm vùng
                  </button>
                </div>

                <div className="blur-regions-list mt-3">
                  {blurRegions.length === 0 && (
                    <p className="helper-text">Chưa có vùng làm mờ nào. Nhấn "+ Thêm vùng" để bắt đầu.</p>
                  )}
                  {blurRegions.map((region, index) => (
                    <div key={region.id} className="setting-card mb-2" style={{ padding: '12px' }}>
                      <div className="section-header-flex">
                        <h4 style={{ color: '#fff', margin: 0, fontSize: '14px' }}>Vùng mờ {index + 1}</h4>
                        <button 
                          className="btn-outline-dark" 
                          style={{ width: 'auto', padding: '2px 8px', color: '#f87171', borderColor: '#451a1a', fontSize: '11px' }}
                          onClick={() => setBlurRegions(blurRegions.filter(r => r.id !== region.id))}
                        >
                          Xóa
                        </button>
                      </div>

                      <div className="form-group mt-3">
                        <label className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Chiều ngang (X)</span>
                          <span>{Math.round(region.x)}%</span>
                        </label>
                        <input type="range" min="0" max="100" className="slider-purple mt-1" value={region.x} 
                          onChange={(e) => setBlurRegions(blurRegions.map(r => r.id === region.id ? {...r, x: Number(e.target.value)} : r))} />
                      </div>

                      <div className="form-group mt-2">
                        <label className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Chiều dọc (Y)</span>
                          <span>{Math.round(region.y)}%</span>
                        </label>
                        <input type="range" min="0" max="100" className="slider-purple mt-1" value={region.y} 
                          onChange={(e) => setBlurRegions(blurRegions.map(r => r.id === region.id ? {...r, y: Number(e.target.value)} : r))} />
                      </div>

                      <div className="flex-row mt-2">
                        <div className="form-group flex-1">
                          <label className="input-label text-center">Rộng {Math.round(region.w)}%</label>
                          <input type="range" min="5" max="100" className="slider-purple mt-1" value={region.w} 
                            onChange={(e) => setBlurRegions(blurRegions.map(r => r.id === region.id ? {...r, w: Number(e.target.value)} : r))} />
                        </div>
                        <div className="form-group flex-1">
                          <label className="input-label text-center">Cao {Math.round(region.h)}%</label>
                          <input type="range" min="5" max="100" className="slider-purple mt-1" value={region.h} 
                            onChange={(e) => setBlurRegions(blurRegions.map(r => r.id === region.id ? {...r, h: Number(e.target.value)} : r))} />
                        </div>
                      </div>
                      
                      <div className="form-group mt-2 pt-2" style={{ borderTop: '1px solid #2a2d3b' }}>
                        <label className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Cường độ mờ</span>
                          <span>{region.intensity}px</span>
                        </label>
                        <input type="range" min="1" max="30" className="slider-purple mt-1" value={region.intensity} 
                          onChange={(e) => setBlurRegions(blurRegions.map(r => r.id === region.id ? {...r, intensity: Number(e.target.value)} : r))} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'voice' && (
              <div className="tab-pane">
                <h3 className="pane-title">Lồng tiếng (AI Dubbing)</h3>
                <p className="pane-desc">Lồng tiếng vào video bằng NeeyuVoice (Hoàn toàn Offline và Miễn phí).</p>

                <div className="pane-divider"></div>
                
                <h3 className="pane-title small">Chọn Giọng Đọc</h3>
                <select className="form-select mb-2" value={voiceId} onChange={e => setVoiceId(e.target.value)}>
                  <optgroup label="Danh sách giọng đã Clone">
                    {neeyuVoices.map(voice => (
                      <option key={`neeyu-${voice}`} value={`neeyu-${voice}`}>
                        {voice.split('---')[0]} {voice.includes('---') ? `- ${voice.split('---')[1].split('_')[0]}` : ''}
                      </option>
                    ))}
                  </optgroup>
                </select>

                <div className="pane-divider"></div>
                <div style={{display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px'}}>
                <div style={{display: 'flex', gap: '10px'}}>
                  <button 
                    className="btn-outline-dark" 
                    onClick={() => handleDubbing(true)}
                    disabled={isProcessing || !videoPath || !srtPath}
                    style={{flex: 1, padding: '12px', fontSize: '14px', fontWeight: 'bold'}}
                  >
                    {isProcessing ? 'ĐANG XỬ LÝ...' : 'XEM TRƯỚC (15s)'}
                  </button>
                  <button 
                    className="btn-export" 
                    onClick={() => handleDubbing(false)}
                    disabled={isProcessing || !videoPath || !srtPath}
                    style={{flex: 2}}
                  >
                    {isProcessing ? 'ĐANG LỒNG TIẾNG...' : 'BẮT ĐẦU LỒNG TIẾNG'}
                  </button>
                </div>
                <span style={{fontSize: '12px', color: 'var(--color-text-muted)', textAlign: 'center'}}>
                  Lưu ý: Video lồng tiếng sẽ được xuất ra file mới ngay lập tức.
                </span>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Export Action inside Settings Panel */}
          <div className="settings-footer">
            <div style={{marginBottom: '15px'}}>
              <label className="checkbox-label" style={{justifyContent: 'center'}}>
                <input type="checkbox" checked={flipVideo} onChange={(e) => setFlipVideo(e.target.checked)} />
                <span className="checkbox-custom"></span>
                <span style={{fontWeight: 'bold', color: 'var(--color-primary)'}}>Lật ngang video (Lách bản quyền)</span>
              </label>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-outline-dark" style={{flex: 1, padding: '12px', fontSize: '14px', fontWeight: 'bold'}} onClick={handlePreview} disabled={isProcessing}>
                {isProcessing ? 'ĐANG XỬ LÝ...' : 'XEM TRƯỚC (15s)'}
              </button>
              <button className="btn-export-large" style={{flex: 2}} onClick={handleExport} disabled={isProcessing}>
                {isProcessing ? 'ĐANG XỬ LÝ...' : 'XUẤT VIDEO'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
