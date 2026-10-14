import { useState, useEffect, useRef, useMemo, type PointerEvent as RPointerEvent } from 'react';
import { Play, Folder } from 'lucide-react';
import './EditorPage.css';
import { EM, layoutCues, parseSrtText, burnStyleOf } from '../lib/subLayout';

// ---------- tiện ích ----------
const fileUrl = (p: string) => `hmmo-media://f/${encodeURIComponent(p)}`;
const ipc = () => (window as any).electron.ipcRenderer;
const STORE = 'hmmo-editor-opts';

type Region = { id: string; x: number; y: number; w: number; h: number; intensity: number; mode: 'blur' | 'delogo' | 'black'; from: string; to: string };

const DEFAULTS = {
  subStyle: 'highlight' as 'sentence' | 'word' | 'highlight',
  highlightColor: '#ffcc00',
  enableBounce: true,
  autoOptimize: true,
  fontFamily: 'Arial',
  fontSize: 32,
  textColor: '#ffffff',
  borderColor: '#000000',
  borderWidth: 2,
  addBg: false,
  position: 'bottom' as 'bottom' | 'center' | 'top',
  marginPct: 12,
  flipVideo: false,
  enableSubtitles: true,
  enableBlur: true,
  blurRegions: [] as Region[],
  bgVolume: 15,
  dubVolume: 100,
  voiceId: 'google-free',
  fitEnabled: true,
  fitMaxRate: 1.35,
  fitBorrowGap: true,
  speed: 1 as number, aspect: 'original' as 'original' | '9:16' | '16:9' | '1:1' | '4:5', fitMode: 'blur' as 'crop' | 'pad' | 'blur',
  bgmPath: '', bgmVolume: 0.3, bgmLoop: true, bgmFadeIn: 0, bgmFadeOut: 0, originalVolume: 1,
  quality: 'balanced' as 'fast' | 'balanced' | 'high'
};
type Opts = typeof DEFAULTS;
export type EditorOpts = Opts;
export const loadEditorOpts = (): Opts => {
  try {
    const o = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE) || '{}') };
    o.blurRegions = (o.blurRegions || []).map((r: any) => ({ mode: 'blur', from: '', to: '', intensity: 10, ...r }));
    return o;
  } catch { return DEFAULTS; }
};
const SYS_FONTS = ['Arial', 'Tahoma', 'Verdana', 'Segoe UI', 'Times New Roman', 'Georgia', 'Impact', 'Trebuchet MS', 'Calibri', 'Cambria', 'Comic Sans MS'];
/** Ô kéo/thả/đổi cỡ trên khung xem trước (toạ độ %). */
function DragRect({ r, label, active, onSelect, onChange }: { r: Region; label: string; active: boolean; onSelect: () => void; onChange: (r: Region) => void }) {
  const drag = useRef<{ mode: string; sx: number; sy: number; r: Region; bw: number; bh: number } | null>(null);
  const clamp = (v: Region): Region => {
    const w = Math.min(100, Math.max(2, v.w)), h = Math.min(100, Math.max(2, v.h));
    return { ...v, w, h, x: Math.min(100 - w, Math.max(0, v.x)), y: Math.min(100 - h, Math.max(0, v.y)) };
  };
  const down = (mode: string) => (e: RPointerEvent) => {
    e.stopPropagation(); e.preventDefault(); onSelect();
    const box = (e.currentTarget as HTMLElement).closest('.ed-box') as HTMLElement;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, r: { ...r }, bw: box.clientWidth, bh: box.clientHeight };
  };
  const move = (e: RPointerEvent) => {
    const d = drag.current; if (!d) return;
    const dx = ((e.clientX - d.sx) / d.bw) * 100, dy = ((e.clientY - d.sy) / d.bh) * 100, o = d.r;
    if (d.mode === 'move') onChange(clamp({ ...o, x: o.x + dx, y: o.y + dy }));
    else if (d.mode === 'se') onChange(clamp({ ...o, w: o.w + dx, h: o.h + dy }));
    else onChange(clamp({ ...o, x: o.x + dx, y: o.y + dy, w: o.w - dx, h: o.h - dy }));
  };
  const up = () => { drag.current = null; };
  const col = active ? '#ff6a00' : '#a78bfa';
  const handle = (pos: 'nw' | 'se') => (
    <div onPointerDown={down(pos)} onPointerMove={move} onPointerUp={up}
      style={{ position: 'absolute', width: 12, height: 12, background: col, border: '2px solid #000', cursor: 'nwse-resize', ...(pos === 'se' ? { right: -6, bottom: -6 } : { left: -6, top: -6 }) }} />
  );
  return (
    <div onPointerDown={down('move')} onPointerMove={move} onPointerUp={up}
      style={{
        position: 'absolute', left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%`, zIndex: 40, cursor: 'move', boxSizing: 'border-box',
        border: `2px dashed ${col}`, touchAction: 'none',
        backdropFilter: r.mode === 'blur' ? `blur(${r.intensity}px)` : r.mode === 'delogo' ? 'blur(3px)' : undefined,
        background: r.mode === 'black' ? '#000' : 'rgba(167,139,250,0.12)'
      }}>
      <span style={{ position: 'absolute', top: -19, left: -2, fontSize: 11, fontWeight: 700, background: col, color: '#111', padding: '1px 6px', whiteSpace: 'nowrap' }}>{label}</span>
      {handle('nw')}{handle('se')}
    </div>
  );
}

export function EditorPage() {
  const [activeTab, setActiveTab] = useState('subtitle');
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [srtPath, setSrtPath] = useState<string | null>(null);
  const [o, setO] = useState<Opts>(loadEditorOpts);
  const set = <K extends keyof Opts>(k: K, v: Opts[K]) => setO((p) => ({ ...p, [k]: v }));
  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch { /* bỏ qua */ } }, [o]);

  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  type Segment = { start: number; end: number };
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<number>(-1);
  const undoRef = useRef<{ past: Segment[][]; future: Segment[][] }>({ past: [], future: [] });
  const [progress, setProgress] = useState<number | null>(null);
  const progressUnsub = useRef<(() => void) | null>(null);
  const [duration, setDuration] = useState(0);
  const [vsize, setVsize] = useState({ w: 1080, h: 1920 });
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [selRegion, setSelRegion] = useState<string | null>(null);
  const [previewOut, setPreviewOut] = useState<string | null>(null);
  const [showPreviewOut, setShowPreviewOut] = useState(false);
  const [previewStamp, setPreviewStamp] = useState(0);
  const [customFonts, setCustomFonts] = useState<{ family: string; file: string }[]>([]);
  const [fontTick, setFontTick] = useState(0);

  const [neeyuVoices, setNeeyuVoices] = useState<string[]>([]);
  const [vnVoices, setVnVoices] = useState<{ presets: { label: string; id: string }[]; clones: { name: string }[] }>({ presets: [], clones: [] });
  const [enableDubbing, setEnableDubbing] = useState(false);
  type FitRow = { i: number; start: number; end: number; slot: number; text: string; est: number; need: number; verdict: 'fits' | 'tight' | 'impossible'; maxChars: number };
  const [fitReport, setFitReport] = useState<{ cps: number; calibrated: boolean; rows: FitRow[] } | null>(null);
  const [fitEdits, setFitEdits] = useState<Record<number, string>>({});
  const [fitBusy, setFitBusy] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>(['Sẵn sàng...']);
  const logEndRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  const editSegments = (next: Segment[]) => {
    undoRef.current.past.push(segments.map(x => ({ ...x }))); undoRef.current.future = [];
    setSegments(next); setSelectedSegment(-1);
  };
  const seek = (seconds: number) => { const v = videoRef.current; if (!v) return; v.currentTime = Math.max(0, Math.min(duration / 1000, seconds)); setCurrentTimeMs(v.currentTime * 1000); };
  const addSegment = (start: number, end: number) => {
    const sorted = [...segments, { start: Math.max(0, start), end: Math.min(duration / 1000, end) }].filter(x => x.end > x.start).sort((a,b) => a.start-b.start);
    const merged: Segment[] = [];
    sorted.forEach(x => { const prev = merged[merged.length-1]; if (prev && x.start <= prev.end) prev.end = Math.max(prev.end, x.end); else merged.push({ ...x }); });
    editSegments(merged);
  };
  useEffect(() => () => progressUnsub.current?.(), []);
  useEffect(() => { if (!isProcessing) setProgress(null); }, [isProcessing]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName || '')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); const p=undoRef.current.past.pop(); if(p){undoRef.current.future.push(segments);setSegments(p);} return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); const n=undoRef.current.future.pop(); if(n){undoRef.current.past.push(segments);setSegments(n);} return; }
      if (e.code === 'Space') { e.preventDefault(); const v=videoRef.current; if(v) v.paused ? v.play() : v.pause(); }
      else if(e.key==='ArrowLeft'||e.key==='ArrowRight') { e.preventDefault(); seek((currentTimeMs/1000)+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?5:1)); }
      else if(e.key.toLowerCase()==='i') setIn(); else if(e.key.toLowerCase()==='o') setOut(); else if(e.key.toLowerCase()==='s') splitAt();
      else if(e.key==='Delete' && selectedSegment>=0) editSegments(segments.filter((_,i)=>i!==selectedSegment));
    };
    window.addEventListener('keydown',onKey); return ()=>window.removeEventListener('keydown',onKey);
  }, [segments, currentTimeMs, selectedSegment]);
  const setIn = () => { const t=Math.min(duration/1000,currentTimeMs/1000), i=selectedSegment>=0?selectedSegment:Math.max(0,segments.length-1), s=segments.map(x=>({...x})); if(s[i]) s[i].start=t; else s.push({start:t,end:duration/1000}); editSegments(s.filter(x=>x.end>x.start).sort((a,b)=>a.start-b.start)); };
  const setOut = () => { const t=Math.min(duration/1000,currentTimeMs/1000), i=selectedSegment>=0?selectedSegment:Math.max(0,segments.length-1), s=segments.map(x=>({...x})); if(s[i]) s[i].end=t; editSegments(s.filter(x=>x.end>x.start).sort((a,b)=>a.start-b.start)); };
  const splitAt = () => { const t=currentTimeMs/1000, i=segments.findIndex(x=>t>x.start&&t<x.end); if(i<0)return; const s=segments.map(x=>({...x})), x=s.splice(i,1)[0]; s.splice(i,0,{start:x.start,end:t},{start:t,end:x.end}); editSegments(s); };

  // nạp font riêng của H-MMO để xem trước và đo độ rộng chữ đúng font
  const loadFonts = async (list?: { family: string; file: string }[]) => {
    try {
      const fonts = list || (await ipc().invoke('fonts:list')) || [];
      setCustomFonts(fonts);
      for (const f of fonts) {
        if ([...(document as any).fonts].some((x: FontFace) => x.family === f.family)) continue;
        const data = await ipc().invoke('fonts:data', f.file);
        if (!data) continue;
        const face = new FontFace(f.family, new Uint8Array(data));
        await face.load();
        (document as any).fonts.add(face);
      }
      setFontTick((t) => t + 1);
    } catch { /* tính năng cần mở lại app */ }
  };

  useEffect(() => {
    loadFonts();
    const api = (window as any).api;
    if (!api) return;
    api.getNeeyuVoices?.().then((voices: string[]) => setNeeyuVoices(voices || []));
    api.voiceList?.().then((r: any) => {
      setVnVoices({ presets: r.presets || [], clones: r.clones || [] });
      setO((p) => {
        if (p.voiceId.startsWith('neeyu-') || p.voiceId.startsWith('vieneu:')) return p;
        if (r.clones?.length) return { ...p, voiceId: `vieneu:clone:${r.clones[0].name}` };
        if (r.presets?.length) return { ...p, voiceId: `vieneu:preset:${r.presets[0].id}` };
        return p;
      });
    });
    api.onVideoLog?.((log: string) => setLogs((prev) => [...prev.slice(-400), log]));
  }, []);

  // khung xem trước đúng tỉ lệ video -> toạ độ % của vùng mờ khớp với video xuất
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const fit = () => {
      const W = el.clientWidth, H = el.clientHeight, ratio = vsize.w / vsize.h;
      const w = Math.min(W, H * ratio);
      setBox({ w, h: w / ratio });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [vsize, videoPath]);

  const [parsedSubtitles, setParsedSubtitles] = useState<{ startMs: number; endMs: number; text: string }[]>([]);
  useEffect(() => {
    if (!srtPath) { setParsedSubtitles([]); return; }
    (window as any).api.readFile(srtPath).then((content: string | null) => setParsedSubtitles(parseSrtText(content || '')));
  }, [srtPath]);

  const cues = useMemo(() => layoutCues(parsedSubtitles, o, vsize.w, vsize.h),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parsedSubtitles, o.fontFamily, o.fontSize, o.borderWidth, o.addBg, o.autoOptimize, vsize, fontTick]);

  const burnStyle = () => burnStyleOf(o, vsize.h);

  const handleSelectVideo = async () => {
    const p = await (window as any).api.selectVideo();
    if (p) { setVideoPath(p); setPreviewOut(null); setShowPreviewOut(false); }
  };
  const handleSelectSrt = async () => {
    const p = await (window as any).api.selectSrt();
    if (p) setSrtPath(p);
  };

  const runPipeline = async (isPreview = false) => {
    progressUnsub.current?.();
    const api = (window as any).api;
    if (api?.onVideoProgress) progressUnsub.current = api.onVideoProgress((p: { percent: number }) => setProgress(p.percent));
    setProgress(null);
    if (!videoPath) { setLogs((prev) => [...prev, '[LỖI] Bạn chưa chọn video!']); return; }
    setIsProcessing(true);
    setLogs([isPreview ? 'Bắt đầu tạo bản xem trước (15 giây)...' : 'Bắt đầu xử lý video...']);
    try {
      let dubbedAudioPath: string | null = null;
      if (enableDubbing) {
        if (!srtPath) throw new Error('Bạn cần chọn file phụ đề SRT để lồng tiếng!');
        const h = (_e: any, log: string) => setLogs((prev) => [...prev, log]);
        ipc().on('dubbing:log', h);
        const v = o.voiceId;
        const apiKeyKey = v.startsWith('zalo-') ? 'zaloApiKey' : v.startsWith('fpt-') ? 'fptApiKey' : '';
        setLogs((prev) => [...prev, '[BƯỚC 1/2] Đang lồng tiếng AI...']);
        try {
          dubbedAudioPath = await ipc().invoke('dubbing:generate', {
            videoPath, srtPath, voiceId: v,
            fptApiKey: localStorage.getItem('fptApiKey') || '', zaloApiKey: localStorage.getItem('zaloApiKey') || '',
            apiKey: apiKeyKey ? localStorage.getItem(apiKeyKey) || '' : '', flipVideo: false, previewMode: isPreview,
            fit: { enabled: o.fitEnabled, maxRate: o.fitMaxRate, borrowGap: o.fitBorrowGap }
          });
        } finally { ipc().removeListener('dubbing:log', h); }
      }
      setLogs((prev) => [...prev, enableDubbing ? '[BƯỚC 2/2] Đang áp dụng hình ảnh/phụ đề...' : 'Đang xử lý hình ảnh/phụ đề...']);
      const out = await (window as any).api.processVideo({
        videoPath, dubbedAudioPath, srtPath,
        blurRegions: o.enableBlur ? o.blurRegions : [],
        assCues: o.enableSubtitles && cues.length ? cues : null,
        burnStyle: burnStyle(),
        fontSize: o.fontSize, textColor: o.textColor, borderColor: o.borderColor, borderWidth: o.borderWidth, addBg: o.addBg, fontFamily: o.fontFamily,
        bgVolume: o.bgVolume / 100, dubVolume: o.dubVolume / 100,
        flipVideo: o.flipVideo, applySubtitles: o.enableSubtitles, previewMode: isPreview,
        ...(segments.length ? { segments: segments.map(s => ({ start: s.start, end: s.end })) } : {}),
        speed: o.speed, aspect: o.aspect, fitMode: o.fitMode,
        ...(o.bgmPath ? { bgm: { path: o.bgmPath, volume: o.bgmVolume, loop: o.bgmLoop, fadeIn: o.bgmFadeIn, fadeOut: o.bgmFadeOut } } : {}),
        originalVolume: o.originalVolume, quality: o.quality
      });
      if (isPreview && out) { setCurrentTimeMs(0); setPreviewOut(out); setPreviewStamp(Date.now()); setShowPreviewOut(true); setLogs((prev) => [...prev, 'Đang phát bản xem trước (có tiếng đã trộn) ngay trong khung bên trái.']); }
    } catch (e: any) {
      const msg=String(e.message || e); setLogs((prev) => [...prev, /cancel/i.test(msg) ? 'Đã hủy' : `[LỖI]: ${msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`]);
    } finally {
      progressUnsub.current?.(); progressUnsub.current = null;
      setIsProcessing(false); setProgress(null);
    }
  };

  const fitErr = (e: any) => {
    const m = String(e?.message || e);
    setLogs((p) => [...p, /No handler registered/.test(m) ? '[LỖI] Hãy TẮT hẳn H-MMO rồi mở lại để dùng tính năng Khớp thời gian.' : `[LỖI] ${m.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`]);
  };
  const analyzeFit = async (path = srtPath) => {
    if (!path) { setLogs((p) => [...p, '[LỖI] Chọn file phụ đề SRT trước.']); return; }
    setFitBusy(true);
    try {
      const r = await ipc().invoke('dubfit:analyze', { srtPath: path, voiceId: o.voiceId, maxRate: o.fitMaxRate, borrowGap: o.fitBorrowGap, total: duration ? duration / 1000 : undefined });
      setFitReport(r);
      setFitEdits({});
    } catch (e) { fitErr(e); }
    setFitBusy(false);
  };
  const shortenFit = async () => {
    if (!fitReport) return;
    const apiKey = localStorage.getItem('geminiApiKey') || '';
    const items = fitReport.rows.filter((r) => r.verdict === 'impossible').map((r) => ({ i: r.i, text: fitEdits[r.i] ?? r.text, maxChars: r.maxChars }));
    if (!items.length) return;
    setFitBusy(true);
    const h = (_e: any, log: string) => setLogs((p) => [...p, log]);
    ipc().on('dubbing:log', h);
    try {
      const res: Record<number, string> = await ipc().invoke('dubfit:shorten', { items, apiKey });
      setFitEdits((p) => ({ ...p, ...res }));
    } catch (e) { fitErr(e); }
    ipc().removeListener('dubbing:log', h);
    setFitBusy(false);
  };
  const saveFit = async () => {
    if (!srtPath) return;
    try {
      const out: string = await ipc().invoke('dubfit:save', { srtPath, edits: fitEdits });
      setSrtPath(out);
      setLogs((p) => [...p, `Đã lưu phụ đề đã chỉnh: ${out} (đang dùng file này để lồng tiếng).`]);
      await analyzeFit(out);
    } catch (e) { fitErr(e); }
  };

  const tabs = [
    { id: 'subtitle', label: 'Phụ đề' },
    { id: 'blur', label: 'Làm mờ' },
    { id: 'voice', label: 'Lồng tiếng & âm thanh' }
  ];
  const updRegion = (r: Region) => set('blurRegions', o.blurRegions.map((x) => (x.id === r.id ? r : x)));
  const addRegion = () => {
    const r: Region = { id: `region-${Date.now()}`, x: 35, y: 40, w: 30, h: 12, intensity: 10, mode: 'blur', from: '', to: '' };
    set('blurRegions', [...o.blurRegions, r]);
    setSelRegion(r.id);
    setActiveTab('blur');
  };

  // ---------- phụ đề trên khung xem trước (cùng cách ngắt dòng với video xuất) ----------
  const scale = box.w / vsize.w || 0;
  const showingOut = showPreviewOut && previewOut;
  const renderSubs = () => {
    if (!o.enableSubtitles || showingOut) return null;
    const cue = cues.find((c) => currentTimeMs >= c.start && currentTimeMs < c.end);
    if (!cue) return null;
    const size = (o.fontSize * vsize.h) / 720;
    const bord = o.addBg ? size * 0.25 : (o.borderWidth * vsize.h) / 720;
    const flat = cue.lines.flat();
    const k = flat.findIndex((_w, i) => currentTimeMs < (i === flat.length - 1 ? cue.end : flat[i + 1].s));
    let idx = 0;
    const pos: any = o.position === 'top' ? { top: o.marginPct * box.h / 100 } : o.position === 'center' ? { top: '50%', transform: 'translateY(-50%)' } : { bottom: o.marginPct * box.h / 100 };
    return (
      <div style={{ position: 'absolute', left: '5%', right: '5%', textAlign: 'center', pointerEvents: 'none', zIndex: 30, ...pos }}>
        {cue.lines.map((l, li) => (
          <div key={li} style={{ lineHeight: 1.18 }}>
            <span style={{
              fontFamily: `"${o.fontFamily}", Arial, sans-serif`, fontWeight: 700, fontSize: size * EM * scale, color: o.textColor,
              WebkitTextStroke: o.addBg ? undefined : `${bord * 2 * scale}px ${o.borderColor}`, paintOrder: 'stroke fill',
              background: o.addBg ? 'rgba(0,0,0,0.62)' : undefined, padding: o.addBg ? `0 ${bord * scale}px` : undefined, whiteSpace: 'pre'
            } as any}>
              {l.map((w, wi) => {
                const i = idx++;
                const st: any = {};
                if (o.subStyle !== 'sentence' && i === k) {
                  st.color = o.highlightColor;
                  if (o.enableBounce && !o.addBg) st.animation = 'hmmoPulse 0.18s ease-out';
                }
                if (o.subStyle === 'word' && i > k) st.visibility = 'hidden';
                return <span key={wi}>{wi > 0 && !w.n ? ' ' : ''}<span key={`${cue.start}-${i}-${i === k}`} style={st}>{w.w}</span></span>;
              })}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms / 1000) % 60)).padStart(2, '0')}`;
  const fonts = [...customFonts.map((f) => f.family), ...SYS_FONTS.filter((f) => !customFonts.some((c) => c.family === f))];
  if (!fonts.includes(o.fontFamily)) fonts.unshift(o.fontFamily);

  return (
    <div className="editor-page">
      <style>{`@keyframes hmmoPulse { 0% { -webkit-text-stroke-width: inherit; filter: brightness(1.6); } 100% { filter: none; } }`}</style>
      <div className="header-section">
        <div className="header-title">
          <h2>Biên tập video</h2>
          <p>Xem trước, tạo kiểu phụ đề, che logo/chữ và xuất video</p>
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
            <div className="input-field" onClick={() => ipc().invoke('workspace:open', 'hoanthanh')}>
              <span className="input-text">H-MMO › 4. Hoàn thành</span>
              <Folder size={16} className="input-icon" />
            </div>
          </div>
        </div>
      </div>

      <div className="main-content">
        <div className="panel preview-panel">
          <div className="panel-header">
            <span className="panel-title">{showingOut ? 'BẢN XEM TRƯỚC ĐÃ XUẤT (15s)' : 'BẢN XEM TRƯỚC'}</span>
            {previewOut && (
              <button className="btn-outline-dark" style={{ width: 'auto', padding: '2px 10px', fontSize: 11 }} onClick={() => { setCurrentTimeMs(0); setShowPreviewOut(!showPreviewOut); }}>
                {showPreviewOut ? '← Về video gốc' : 'Xem bản đã xuất 15s'}
              </button>
            )}
            <span className="time-label">{fmt(currentTimeMs)} / {fmt(duration)}</span>
          </div>

          <div className="preview-container">
            <div className="preview-viewport" ref={viewportRef} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {videoPath ? (
                <div className="ed-box" style={{ position: 'relative', width: box.w, height: box.h, flexShrink: 0 }}>
                  <video
                    ref={videoRef}
                    key={showingOut ? `out-${previewStamp}` : 'src'}
                    src={showingOut ? `${fileUrl(previewOut!)}?t=${previewStamp}` : fileUrl(videoPath)}
                    style={{ width: '100%', height: '100%', display: 'block', background: '#000' }}
                    controls={!!showingOut}
                    autoPlay={!!showingOut}
                    onClick={(e) => { if (!showingOut) { const v = e.currentTarget; v.paused ? v.play() : v.pause(); } }}
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget;
                      setDuration((v.duration || 0) * 1000);
                      v.playbackRate = showingOut ? 1 : o.speed;
                      setCurrentTimeMs(0);
                      if (!showingOut && v.videoWidth) setVsize({ w: v.videoWidth, h: v.videoHeight });
                    }}
                    onTimeUpdate={(e) => { const v=e.currentTarget, t=v.currentTime; if(!showingOut && segments.length && !segments.some(s=>t>=s.start&&t<s.end)){ const next=segments.find(s=>s.start>t); if(next){ v.currentTime=next.start; return; } if(t<segments[0].start){v.currentTime=segments[0].start;return;} if(t>=segments[segments.length-1].end){v.currentTime=segments[segments.length-1].end;v.pause();return;} } setCurrentTimeMs(t*1000); }}
                  />
                  {!showingOut && o.aspect !== 'original' && <div className="aspect-guide" style={{aspectRatio:o.aspect.replace(':',' / '), maxWidth:'92%', maxHeight:'92%'}} />}
                  {renderSubs()}
                  {!showingOut && o.enableBlur && o.blurRegions.map((r, i) => (
                    <DragRect key={r.id} r={r} label={`${r.mode === 'black' ? 'Che' : r.mode === 'delogo' ? 'Xoá logo' : 'Mờ'} ${i + 1}`}
                      active={selRegion === r.id} onSelect={() => setSelRegion(r.id)} onChange={updRegion} />
                  ))}
                </div>
              ) : (
                <div className="placeholder">
                  <Play size={48} className="placeholder-icon" />
                  <h3>Chọn video để bắt đầu</h3>
                  <p>Phụ đề, vùng làm mờ và kết quả sẽ hiển thị tại đây</p>
                </div>
              )}
            </div>
          </div>

          {videoPath && !showingOut && (
            <div className="play-controls" style={{ gap: 10 }}>
              <button className="btn-play" onClick={() => { const v = videoRef.current; if (v) v.paused ? v.play() : v.pause(); }}>
                <Play size={16} fill="currentColor" />
              </button>
              <input type="range" min={0} max={duration || 1} step={50} value={currentTimeMs} style={{ flex: 1 }}
                onChange={(e) => { const t = Number(e.target.value); setCurrentTimeMs(t); if (videoRef.current) videoRef.current.currentTime = t / 1000; }} />
              <button className="btn-outline-dark" style={{ width: 'auto', padding: '4px 10px', fontSize: 12 }} onClick={addRegion}>+ Vùng mờ</button>
            </div>
          )}

          {videoPath && !showingOut && <div className="timeline-editor">
            <div className="timeline-actions">
              <button onClick={setIn}>Đặt điểm vào (I)</button><button onClick={setOut}>Đặt điểm ra (O)</button>
              <button onClick={()=>addSegment(currentTimeMs/1000, Math.min(duration/1000,currentTimeMs/1000+5))}>Thêm đoạn</button>
              <button onClick={splitAt}>Tách tại đầu phát (S)</button>
              <button disabled={selectedSegment<0} onClick={()=>editSegments(segments.filter((_,i)=>i!==selectedSegment))}>Xóa đoạn</button>
              <button onClick={()=>editSegments([])}>Xóa tất cả</button>
            </div>
            <div className="timeline-ruler" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);const r=e.currentTarget.getBoundingClientRect(); seek(((e.clientX-r.left)/r.width)*(duration/1000));}} onPointerMove={e=>{if(e.buttons){const r=e.currentTarget.getBoundingClientRect();seek(((e.clientX-r.left)/r.width)*(duration/1000));}}}>
              {Array.from({length:6},(_,i)=><span key={i} style={{left:`${i*20}%`}}>{fmt(duration*i/5)}</span>)}
              {segments.map((s,i)=><button key={i} title={`${s.start.toFixed(2)}–${s.end.toFixed(2)}s`} className={`timeline-segment ${selectedSegment===i?'selected':''}`} style={{left:`${s.start/(duration/1000||1)*100}%`,width:`${(s.end-s.start)/(duration/1000||1)*100}%`}} onClick={e=>{e.stopPropagation();setSelectedSegment(i);}} />)}
              <i className="timeline-playhead" style={{left:`${currentTimeMs/(duration||1)*100}%`}} />
            </div>
          </div>}
          <div className="timeline-options">
            <label>Tốc độ <select className="form-select" value={o.speed} onChange={e=>{set('speed',Number(e.target.value));if(videoRef.current)videoRef.current.playbackRate=Number(e.target.value);}}>{[0.5,0.75,1,1.25,1.5,2].map(x=><option key={x}>{x}</option>)}</select></label>
            <label>Tỷ lệ <select className="form-select" value={o.aspect} onChange={e=>set('aspect',e.target.value as Opts['aspect'])}>{[['original','Gốc'],['9:16','9:16'],['16:9','16:9'],['1:1','1:1'],['4:5','4:5']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
            <label>Khung <select className="form-select" value={o.fitMode} onChange={e=>set('fitMode',e.target.value as Opts['fitMode'])}><option value="crop">Cắt</option><option value="pad">Viền đen</option><option value="blur">Nền mờ</option></select></label>
            <label>Chất lượng <select className="form-select" value={o.quality} onChange={e=>set('quality',e.target.value as Opts['quality'])}><option value="fast">Nhanh</option><option value="balanced">Cân bằng</option><option value="high">Cao</option></select></label>
          </div>
          <div className="timeline-options audio-options">
            <button className="btn-outline-dark" style={{width:'auto'}} onClick={async()=>{const p=await (window as any).api.selectAudio?.();if(p)set('bgmPath',p);}}>Chọn nhạc nền</button><span>{o.bgmPath.split(/[\\/]/).pop()||'Chưa chọn nhạc'}</span>
            <label>Nhạc {Math.round(o.bgmVolume*100)}% <input type="range" min="0" max="1" step="0.01" value={o.bgmVolume} onChange={e=>set('bgmVolume',Number(e.target.value))}/></label>
            <label><input type="checkbox" checked={o.bgmLoop} onChange={e=>set('bgmLoop',e.target.checked)}/> Lặp</label>
            <label>Fade vào <input type="number" min="0" step="0.5" value={o.bgmFadeIn} onChange={e=>set('bgmFadeIn',Number(e.target.value))}/></label>
            <label>Fade ra <input type="number" min="0" step="0.5" value={o.bgmFadeOut} onChange={e=>set('bgmFadeOut',Number(e.target.value))}/></label>
            <label>Âm gốc {Math.round(o.originalVolume*100)}% <input type="range" min="0" max="2" step="0.01" value={o.originalVolume} onChange={e=>set('originalVolume',Number(e.target.value))}/></label>
          </div>
          {isProcessing && <div className="export-progress"><progress max="100" value={progress ?? undefined}/><span>{progress === null ? '…' : `${Math.round(progress)}%`}</span><button onClick={()=> (window as any).api.cancelVideo?.()}>Hủy</button></div>}

          <div className="log-console">
            {logs.map((log, index) => <div key={index} style={{ color: /LỖI/.test(log) ? '#f87171' : undefined }}>{log}</div>)}
            <div ref={logEndRef} />
          </div>
        </div>

        <div className="panel settings-panel">
          <div className="tabs-bar">
            {tabs.map((tab) => (
              <button key={tab.id} className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>
            ))}
          </div>

          <div className="tab-content">
            {activeTab === 'subtitle' && (
              <div className="tab-pane new-style">
                <div className="section-header-flex">
                  <div>
                    <h3 className="section-title">Kiểu phụ đề</h3>
                    <p className="section-desc">Bản xem trước và video xuất dùng cùng cách ngắt dòng, cùng font.</p>
                  </div>
                  <button className={`btn-toggle ${o.enableSubtitles ? 'on' : ''}`} onClick={() => set('enableSubtitles', !o.enableSubtitles)}>{o.enableSubtitles ? 'Bật' : 'Tắt'}</button>
                </div>

                <div style={{ opacity: o.enableSubtitles ? 1 : 0.5, pointerEvents: o.enableSubtitles ? 'auto' : 'none' }}>
                  <div className="radio-card-group">
                    {([['sentence', 'Hiển thị cả câu', 'Ổn định và dễ đọc'], ['word', 'Hiện lần lượt từng từ', 'Từ đã hiện được giữ lại'], ['highlight', 'Làm nổi bật từ đang đọc', 'Toàn câu luôn hiển thị']] as const).map(([v, t, d]) => (
                      <label key={v} className={`radio-card ${o.subStyle === v ? 'active' : ''}`}>
                        <input type="radio" name="subStyle" checked={o.subStyle === v} onChange={() => set('subStyle', v)} />
                        <span className="radio-icon"></span>
                        <div className="radio-card-text"><h4>{t}</h4><p>{d}</p></div>
                      </label>
                    ))}
                  </div>

                  <div className="flex-row mt-3">
                    <div className="form-group flex-1">
                      <label className="input-label">Màu từ đang đọc</label>
                      <input type="color" className="color-picker-input mt-1" value={o.highlightColor} onChange={(e) => set('highlightColor', e.target.value)} />
                    </div>
                    <div className="form-group flex-1">
                      <label className="input-label">Màu chữ</label>
                      <input type="color" className="color-picker-input mt-1" value={o.textColor} onChange={(e) => set('textColor', e.target.value)} />
                    </div>
                    <div className="form-group flex-1">
                      <label className="input-label">Màu viền</label>
                      <input type="color" className="color-picker-input mt-1" value={o.borderColor} onChange={(e) => set('borderColor', e.target.value)} />
                    </div>
                  </div>

                  <div className="setting-card mt-3">
                    <div className="setting-card-header">
                      <div className="setting-card-text">
                        <h4>Nhấn nhẹ từ đang đọc</h4>
                        <p>Viền từ đang đọc dày lên rồi trở về, không làm xô dòng chữ.</p>
                      </div>
                      <button className={`btn-toggle ${o.enableBounce ? 'on' : 'off'}`} onClick={() => set('enableBounce', !o.enableBounce)}>{o.enableBounce ? 'Bật' : 'Tắt'}</button>
                    </div>
                  </div>

                  <div className="setting-card mt-3">
                    <div className="setting-card-header">
                      <div className="setting-card-text">
                        <h4>Tự ngắt dòng, tối đa 2 dòng</h4>
                        <p>Đo độ rộng chữ thật để không tràn khung; câu dài được tách thành nhiều lần hiện. File SRT gốc giữ nguyên.</p>
                      </div>
                      <button className={`btn-toggle ${o.autoOptimize ? 'on' : 'off'}`} onClick={() => set('autoOptimize', !o.autoOptimize)}>{o.autoOptimize ? 'Bật' : 'Tắt'}</button>
                    </div>
                  </div>

                  <div className="form-group mt-3">
                    <label className="input-label">Font chữ</label>
                    <div className="select-wrapper mt-1">
                      <select className="form-select dark" value={o.fontFamily} onChange={(e) => set('fontFamily', e.target.value)}>
                        {customFonts.length > 0 && <optgroup label="Font đã thêm">{customFonts.map((f) => <option key={f.file} value={f.family}>{f.family}</option>)}</optgroup>}
                        <optgroup label="Font Windows">{SYS_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}</optgroup>
                      </select>
                    </div>
                    <button className="btn-outline-dark mt-2" onClick={async () => { try { await loadFonts(await ipc().invoke('fonts:add')); } catch (e: any) { setLogs((p) => [...p, '[LỖI] Hãy tắt hẳn H-MMO rồi mở lại để dùng thư viện font.']); } }}>
                      Thêm font từ máy (.ttf/.otf)
                    </button>
                    <p className="helper-text mt-2">Font thêm vào được lưu trong thư viện H-MMO và dùng được khi xuất video.</p>
                  </div>

                  <div className="form-group mt-3">
                    <label className="input-label">Kích thước chữ · {o.fontSize}</label>
                    <input type="range" min="12" max="80" className="slider-purple mt-1" value={o.fontSize} onChange={(e) => set('fontSize', Number(e.target.value))} />
                  </div>
                  <div className="form-group mt-3">
                    <label className="input-label">Độ dày viền · {o.borderWidth}</label>
                    <input type="range" min="0" max="10" className="slider-purple mt-1" value={o.borderWidth} onChange={(e) => set('borderWidth', Number(e.target.value))} />
                  </div>
                  <div className="flex-row mt-3">
                    <div className="form-group flex-1">
                      <label className="input-label">Vị trí</label>
                      <select className="form-select dark mt-1" value={o.position} onChange={(e) => set('position', e.target.value as any)}>
                        <option value="bottom">Dưới</option>
                        <option value="center">Giữa</option>
                        <option value="top">Trên</option>
                      </select>
                    </div>
                    <div className="form-group flex-1" style={{ opacity: o.position === 'center' ? 0.4 : 1 }}>
                      <label className="input-label">Cách mép · {o.marginPct}%</label>
                      <input type="range" min="2" max="40" className="slider-purple mt-1" value={o.marginPct} disabled={o.position === 'center'} onChange={(e) => set('marginPct', Number(e.target.value))} />
                    </div>
                  </div>
                  <label className="checkbox-label mt-3">
                    <input type="checkbox" checked={o.addBg} onChange={(e) => set('addBg', e.target.checked)} />
                    <span className="checkbox-custom"></span>
                    <span>Thêm nền đen mờ sau chữ</span>
                  </label>
                  {!srtPath && <p className="helper-text mt-2">Chọn file SRT ở trên (thư mục H-MMO › 3. Phụ đề) để xem phụ đề trên khung xem trước.</p>}
                </div>
              </div>
            )}

            {activeTab === 'blur' && (
              <div className="tab-pane new-style">
                <div className="section-header-flex">
                  <div>
                    <h3 className="section-title">Vùng che</h3>
                    <p className="section-desc">Kéo ô trên khung xem trước để đặt vị trí, kéo góc để đổi cỡ.</p>
                  </div>
                  <button className={`btn-toggle ${o.enableBlur ? 'on' : ''}`} onClick={() => set('enableBlur', !o.enableBlur)}>{o.enableBlur ? 'Bật' : 'Tắt'}</button>
                </div>
                <div style={{ opacity: o.enableBlur ? 1 : 0.5, pointerEvents: o.enableBlur ? 'auto' : 'none' }}>
                  <button className="btn-outline-dark mt-3" onClick={addRegion}>+ Thêm vùng</button>
                  <div className="blur-regions-list mt-3">
                    {o.blurRegions.length === 0 && <p className="helper-text">Chưa có vùng nào. Bấm "+ Thêm vùng" rồi kéo ô lên logo/chữ cần che.</p>}
                    {o.blurRegions.map((r, index) => (
                      <div key={r.id} className="setting-card mb-2" onClick={() => setSelRegion(r.id)}
                        style={{ padding: 12, borderColor: selRegion === r.id ? '#ff6a00' : undefined }}>
                        <div className="section-header-flex">
                          <h4 style={{ color: '#fff', margin: 0, fontSize: 14 }}>Vùng {index + 1}</h4>
                          <button className="btn-outline-dark" style={{ width: 'auto', padding: '2px 8px', color: '#f87171', borderColor: '#451a1a', fontSize: 11 }}
                            onClick={(e) => { e.stopPropagation(); set('blurRegions', o.blurRegions.filter((x) => x.id !== r.id)); }}>Xóa</button>
                        </div>
                        <div className="form-group mt-2">
                          <label className="input-label">Cách che</label>
                          <select className="form-select dark mt-1" value={r.mode} onChange={(e) => updRegion({ ...r, mode: e.target.value as any })}>
                            <option value="blur">Làm mờ</option>
                            <option value="delogo">Xoá logo (nội suy từ viền xung quanh)</option>
                            <option value="black">Che bằng khối đen</option>
                          </select>
                        </div>
                        {r.mode === 'blur' && (
                          <div className="form-group mt-2">
                            <label className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}><span>Độ mờ</span><span>{r.intensity}</span></label>
                            <input type="range" min="2" max="30" className="slider-purple mt-1" value={r.intensity} onChange={(e) => updRegion({ ...r, intensity: Number(e.target.value) })} />
                          </div>
                        )}
                        <div className="flex-row mt-2" style={{ alignItems: 'flex-end' }}>
                          <div className="form-group flex-1">
                            <label className="input-label">Từ giây</label>
                            <input className="form-select dark mt-1" type="number" min={0} step={0.1} placeholder="đầu" value={r.from} onChange={(e) => updRegion({ ...r, from: e.target.value })} />
                          </div>
                          <div className="form-group flex-1">
                            <label className="input-label">Đến giây</label>
                            <input className="form-select dark mt-1" type="number" min={0} step={0.1} placeholder="cuối" value={r.to} onChange={(e) => updRegion({ ...r, to: e.target.value })} />
                          </div>
                          <button className="btn-outline-dark" style={{ width: 'auto', padding: '6px 8px', fontSize: 11 }} title="Lấy thời điểm đang xem"
                            onClick={() => updRegion({ ...r, [r.from === '' ? 'from' : 'to']: (currentTimeMs / 1000).toFixed(1) } as Region)}>⏱ Lấy giờ</button>
                        </div>
                        <p className="helper-text mt-1">Để trống = che suốt video.</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'voice' && (
              <div className="tab-pane">
                <div className="section-header-flex">
                  <div>
                    <h3 className="section-title">Lồng tiếng (AI)</h3>
                    <p className="section-desc">VieNeu-TTS (giọng có sẵn hoặc clone ở tab Giọng đọc) hoặc NeeyuVoice, đọc theo file SRT.</p>
                  </div>
                  <button className={`btn-toggle ${enableDubbing ? 'on' : ''}`} onClick={() => setEnableDubbing(!enableDubbing)}>{enableDubbing ? 'Bật' : 'Tắt'}</button>
                </div>
                <div style={{ opacity: enableDubbing ? 1 : 0.5, pointerEvents: enableDubbing ? 'auto' : 'none', marginTop: 15 }}>
                  <h3 className="pane-title small">Chọn giọng đọc</h3>
                  <select className="form-select mb-2" value={o.voiceId} onChange={(e) => set('voiceId', e.target.value)}>
                    {vnVoices.clones.length > 0 && <optgroup label="Giọng clone (VieNeu)">{vnVoices.clones.map((c) => <option key={`vc-${c.name}`} value={`vieneu:clone:${c.name}`}>{c.name}</option>)}</optgroup>}
                    {vnVoices.presets.length > 0 && <optgroup label="Giọng có sẵn (VieNeu)">{vnVoices.presets.map((p) => <option key={`vp-${p.id}`} value={`vieneu:preset:${p.id}`}>{p.label}</option>)}</optgroup>}
                    <optgroup label="NeeyuVoice (đã clone)">
                      {neeyuVoices.map((voice) => (
                        <option key={`neeyu-${voice}`} value={`neeyu-${voice}`}>{voice.split('---')[0]} {voice.includes('---') ? `- ${voice.split('---')[1].split('_')[0]}` : ''}</option>
                      ))}
                    </optgroup>
                  </select>

                  <div className="pane-divider"></div>
                  <div className="section-header-flex">
                    <div>
                      <h3 className="pane-title small" style={{ margin: 0 }}>Khớp thời gian</h3>
                      <p className="section-desc">Giọng đọc dài hơn câu gốc sẽ mượn khoảng lặng phía sau và tăng tốc nhẹ (giữ cao độ) thay vì chồng lên câu sau.</p>
                    </div>
                    <button className={`btn-toggle ${o.fitEnabled ? 'on' : ''}`} onClick={() => set('fitEnabled', !o.fitEnabled)}>{o.fitEnabled ? 'Bật' : 'Tắt'}</button>
                  </div>
                  <div style={{ opacity: o.fitEnabled ? 1 : 0.5, pointerEvents: o.fitEnabled ? 'auto' : 'none' }}>
                    <div className="form-group mt-2">
                      <label className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}><span>Tăng tốc tối đa</span><span>{o.fitMaxRate.toFixed(2)}×</span></label>
                      <input type="range" min="1" max="1.8" step="0.05" className="slider-purple mt-1" value={o.fitMaxRate} onChange={(e) => set('fitMaxRate', Number(e.target.value))} />
                      <p className="helper-text mt-1">Dưới 1.2× gần như không nghe ra; trên 1.5× bắt đầu nghe vội.</p>
                    </div>
                    <label className="checkbox-label mt-2">
                      <input type="checkbox" checked={o.fitBorrowGap} onChange={(e) => set('fitBorrowGap', e.target.checked)} />
                      <span className="checkbox-custom"></span>
                      <span>Mượn khoảng lặng trước câu kế tiếp</span>
                    </label>
                  </div>
                  <button className="btn-outline-dark mt-3" disabled={fitBusy || !srtPath} onClick={() => analyzeFit()}>
                    {fitBusy ? 'Đang xử lý...' : 'Kiểm tra độ vừa trước khi đọc'}
                  </button>
                  {fitReport && (() => {
                    const cnt = { fits: 0, tight: 0, impossible: 0 } as Record<string, number>;
                    fitReport.rows.forEach((r) => cnt[r.verdict]++);
                    const bad = fitReport.rows.filter((r) => r.verdict !== 'fits');
                    const badge = (v: string) => v === 'impossible' ? { c: '#f87171', t: 'Không vừa' } : { c: '#fbbf24', t: 'Hơi chật' };
                    const fmtS = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
                    return (
                      <div className="mt-2" style={{ fontSize: 12 }}>
                        <div style={{ display: 'flex', gap: 12, margin: '6px 0', flexWrap: 'wrap' }}>
                          <span style={{ color: '#4ade80' }}>● {cnt.fits} vừa</span>
                          <span style={{ color: '#fbbf24' }}>● {cnt.tight} hơi chật (tăng tốc)</span>
                          <span style={{ color: '#f87171' }}>● {cnt.impossible} không vừa (sẽ bị cắt)</span>
                        </div>
                        <div className="helper-text">Tốc độ đọc dùng để ước lượng: {fitReport.cps.toFixed(1)} ký tự/giây {fitReport.calibrated ? '(đo từ lần lồng tiếng trước của giọng này)' : '(mặc định; sẽ tự chỉnh sau lần lồng tiếng đầu)'}</div>
                        <div style={{ maxHeight: 300, overflowY: 'auto', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {bad.map((r) => {
                            const txt = fitEdits[r.i] ?? r.text;
                            const b = badge(r.verdict);
                            const len = txt.replace(/\s+/g, ' ').trim().length;
                            return (
                              <div key={r.i} style={{ borderLeft: `3px solid ${b.c}`, paddingLeft: 8 }}>
                                <div style={{ display: 'flex', gap: 8, color: '#9ca3af', alignItems: 'center' }}>
                                  <span style={{ color: b.c, fontWeight: 700 }}>#{r.i + 1} {b.t}</span>
                                  <span style={{ cursor: 'pointer', textDecoration: 'underline' }} title="Tua tới câu này"
                                    onClick={() => { if (videoRef.current) videoRef.current.currentTime = r.start; setCurrentTimeMs(r.start * 1000); }}>{fmtS(r.start)}</span>
                                  <span>cần {r.need.toFixed(2)}×</span>
                                  <span style={{ marginLeft: 'auto', color: len > r.maxChars ? '#f87171' : '#4ade80' }}>{len}/{r.maxChars} ký tự</span>
                                </div>
                                <textarea value={txt} rows={2} onChange={(e) => setFitEdits((p) => ({ ...p, [r.i]: e.target.value }))}
                                  style={{ width: '100%', marginTop: 4, background: '#111', color: '#e5e7eb', border: '1px solid #333', fontSize: 12, padding: 6, boxSizing: 'border-box', resize: 'vertical' }} />
                              </div>
                            );
                          })}
                          {!bad.length && <div style={{ color: '#4ade80' }}>Tất cả các câu đều vừa khung thời gian.</div>}
                        </div>
                        {bad.length > 0 && (
                          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <button className="btn-outline-dark" style={{ flex: 1 }} disabled={fitBusy || !cnt.impossible} onClick={shortenFit}>Rút gọn câu không vừa (Gemini)</button>
                            <button className="btn-outline-dark" style={{ flex: 1 }} disabled={fitBusy || !Object.keys(fitEdits).length} onClick={saveFit}>Lưu SRT mới &amp; dùng</button>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div className="pane-divider"></div>
                  <h3 className="pane-title small">Trộn âm thanh</h3>
                  <div className="form-group mt-2">
                    <label className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}><span>Tiếng gốc của video</span><span>{o.bgVolume}%</span></label>
                    <input type="range" min="0" max="100" className="slider-purple mt-1" value={o.bgVolume} onChange={(e) => set('bgVolume', Number(e.target.value))} />
                  </div>
                  <div className="form-group mt-2">
                    <label className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}><span>Giọng lồng tiếng</span><span>{o.dubVolume}%</span></label>
                    <input type="range" min="50" max="200" step="5" className="slider-purple mt-1" value={o.dubVolume} onChange={(e) => set('dubVolume', Number(e.target.value))} />
                  </div>
                  <p className="helper-text mt-2">Mẹo: tách giọng nhân vật ở tab Hiệu chỉnh video trước, rồi để tiếng gốc 60–100% (chỉ còn nhạc nền). Bấm <b>XEM TRƯỚC (15s)</b> để nghe thử phần trộn ngay trong khung bên trái.</p>
                </div>
              </div>
            )}
          </div>

          <div className="settings-footer">
            <div style={{ marginBottom: 15 }}>
              <label className="checkbox-label" style={{ justifyContent: 'center' }}>
                <input type="checkbox" checked={o.flipVideo} onChange={(e) => set('flipVideo', e.target.checked)} />
                <span className="checkbox-custom"></span>
                <span style={{ fontWeight: 'bold', color: 'var(--color-primary)' }}>Lật ngang video</span>
              </label>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button className="btn-outline-dark" style={{ padding: 12, fontSize: 14, fontWeight: 'bold' }} onClick={() => runPipeline(true)} disabled={isProcessing}>
                {isProcessing ? 'ĐANG XỬ LÝ...' : 'XEM TRƯỚC (15s)'}
              </button>
              <button className="btn-export-large" onClick={() => runPipeline(false)} disabled={isProcessing}>
                {isProcessing ? 'ĐANG XỬ LÝ...' : 'XUẤT VIDEO'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
