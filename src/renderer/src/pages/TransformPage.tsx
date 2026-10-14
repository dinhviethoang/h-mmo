import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FolderOpen, Film, Play, Trash2, Image as ImageIcon, RotateCcw } from 'lucide-react';

type Pos = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
export type TransformOpts = Opts;
type Opts = {
  zoom: number; flip: boolean; speed: number; pitch: number;
  brightness: number; contrast: number; saturation: number; hue: number;
  aspect: 'keep' | '9:16' | '16:9' | '1:1' | '4:5'; aspectMode: 'blur' | 'crop' | 'pad';
  border: number; borderColor: string;
  text: string; textPos: Pos; textOpacity: number; textSize: number;
  logoPath: string; logoPos: Pos; logoSize: number; logoOpacity: number;
  volume: number;
  voiceReduce: number; sepModel: 'fast' | 'hq'; exportInstrumental: boolean;
};

export const TRANSFORM_DEFAULTS: Opts = {
  zoom: 1, flip: false, speed: 1, pitch: 0,
  brightness: 0, contrast: 1, saturation: 1, hue: 0,
  aspect: 'keep', aspectMode: 'blur',
  border: 0, borderColor: '#ff6a00',
  text: '', textPos: 'top-right', textOpacity: 0.7, textSize: 3.5,
  logoPath: '', logoPos: 'top-left', logoSize: 14, logoOpacity: 0.9,
  volume: 1,
  voiceReduce: 0, sepModel: 'fast', exportInstrumental: false
};
const STORE = 'hmmo-transform-opts';
const fileUrl = (p: string) => `hmmo-media://f/${encodeURIComponent(p)}`;
const POS: [Pos, string][] = [['top-left', 'Trên trái'], ['top-right', 'Trên phải'], ['bottom-left', 'Dưới trái'], ['bottom-right', 'Dưới phải'], ['center', 'Giữa']];

export function loadTransformOpts(): Opts {
  try { return { ...TRANSFORM_DEFAULTS, ...JSON.parse(localStorage.getItem(STORE) || '{}') }; } catch { return TRANSFORM_DEFAULTS; }
}

const S = {
  grid: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.15fr)', gap: 18, alignItems: 'start' } as const,
  col: { display: 'flex', flexDirection: 'column', gap: 14 } as const,
  row: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 } as const,
  label: { width: 120, flexShrink: 0, fontSize: 13, color: 'var(--text-secondary)' } as const,
  val: { width: 64, textAlign: 'right', fontFamily: 'Consolas, monospace', fontSize: 13, color: 'var(--accent)' } as const,
  h3: { margin: '0 0 12px', fontSize: 15, textTransform: 'uppercase', letterSpacing: 1 } as const,
  input: { padding: '7px 10px', fontSize: 13, flex: 1, minWidth: 0 } as const
};

export function TransformPage() {
  const [o, setO] = useState<Opts>(loadTransformOpts);
  const [files, setFiles] = useState<string[]>([]);
  const [outDir, setOutDir] = useState('');
  const [suffix, setSuffix] = useState('_edit');
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [outputs, setOutputs] = useState<string[]>([]);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'original' | 'edited' | null>(null);
  const [current, setCurrent] = useState<string | null>(null); // video đang chọn để xem trước
  const [logs, setLogs] = useState<string[]>(['Sẵn sàng. Thêm video, chỉnh thông số rồi bấm Xem trước hoặc Xuất.']);
  const logEnd = useRef<HTMLDivElement>(null);

  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch { /* bỏ qua */ } }, [o]);
  useEffect(() => {
    const h = (_e: any, m: string) => setLogs((p) => [...p.slice(-300), m]);
    (window as any).electron.ipcRenderer.on('transform:log', h);
    return () => (window as any).electron.ipcRenderer.removeListener('transform:log', h);
  }, []);
  useEffect(() => logEnd.current?.scrollIntoView({ behavior: 'smooth' }), [logs]);

  const set = <K extends keyof Opts>(k: K, v: Opts[K]) => setO((p) => ({ ...p, [k]: v }));
  const invoke = (ch: string, ...a: any[]) => (window as any).electron.ipcRenderer.invoke(ch, ...a);

  const slider = (label: string, k: keyof Opts, min: number, max: number, step: number, fmt: (v: number) => string) => (
    <div style={S.row}>
      <span style={S.label}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={o[k] as number} onChange={(e) => set(k, Number(e.target.value) as any)} style={{ flex: 1 }} />
      <span style={S.val}>{fmt(o[k] as number)}</span>
    </div>
  );
  const posSelect = (k: 'textPos' | 'logoPos') => (
    <select value={o[k]} onChange={(e) => set(k, e.target.value as Pos)} style={{ ...S.input, flex: '0 0 130px' }}>
      {POS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
  const card = (title: string, children: ReactNode, extra?: ReactNode) => (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h3 style={{ ...S.h3, flex: 1 }}>{title}</h3>{extra}
      </div>
      {children}
    </div>
  );

  const explain = (e: any) => {
    const m = String(e?.message || e);
    setLogs((p) => [...p, /No handler registered/i.test(m)
      ? '[LỖI] Phần xử lý chưa được nạp. Hãy TẮT hẳn H-MMO (cả cửa sổ lệnh) rồi mở lại bằng shortcut H-MMO.'
      : `[LỖI] ${m}`]);
  };
  const addFiles = async () => {
    try {
      const list: string[] = await invoke('transform:pickVideos');
      if (list?.length) {
        setFiles((p) => Array.from(new Set([...p, ...list])));
        setLogs((p) => [...p, `Đã thêm ${list.length} video.`]);
      }
    } catch (e: any) { explain(e); }
  };
  const target = current && files.includes(current) ? current : files[0];
  const showOriginal = () => {
    if (!target) return;
    setPreviewSrc(fileUrl(target));
    setPreviewMode('original');
  };
  const preview = async () => {
    if (!target) return setLogs((p) => [...p, '[LỖI] Thêm ít nhất 1 video trước.']);
    setBusy(true); setPreviewing(true);
    try {
      setPreviewSrc(fileUrl(await invoke('transform:preview', target, o)) + `?t=${Date.now()}`);
      setPreviewMode('edited');
    }
    catch (e: any) { explain(e); }
    finally { setBusy(false); setPreviewing(false); }
  };
  const run = async () => {
    if (!files.length) return;
    setBusy(true);
    try {
      const done: string[] = await invoke('transform:run', files, o, outDir, suffix);
      setOutputs(done || []);
      if (done?.length) invoke('transform:reveal', done[0]);
    }
    catch (e: any) { explain(e); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '22px 26px', boxSizing: 'border-box' }}>
      <h2 style={{ margin: 0 }}>Hiệu chỉnh video</h2>
      <p style={{ margin: '10px 0 18px', color: 'var(--text-muted)', fontSize: 13 }}>
        Biến đổi hàng loạt: crop/zoom, lật, tốc độ, cao độ giọng, màu, viền, chữ, logo, tỷ lệ khung hình, âm lượng. Thiết lập được lưu lại cho lần sau.
      </p>

      <div style={S.grid}>
        {/* CỘT TRÁI: 1) video  2) xem trước  3) xuất  4) log */}
        <div style={S.col}>
          {card(`① Video (${files.length})`, <>
            <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
              {files.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Chưa có video. Bấm "Thêm video" (chọn được nhiều file).</div>}
              {files.map((f) => {
                const active = f === target;
                return (
                  <div key={f} onClick={() => setCurrent(f)} title="Bấm để chọn video xem trước"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '6px 8px', cursor: 'pointer',
                      background: active ? 'rgba(255,106,0,0.12)' : 'transparent', borderLeft: `3px solid ${active ? 'var(--accent)' : 'transparent'}` }}>
                    <Film size={14} color="var(--accent)" />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: active ? 'var(--text-primary)' : undefined }} title={f}>{f.split(/[\\/]/).pop()}</span>
                    <button style={{ color: 'var(--text-muted)' }} onClick={(e) => { e.stopPropagation(); setFiles((p) => p.filter((x) => x !== f)); }}><Trash2 size={13} /></button>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-outline" style={{ padding: '8px 12px' }} onClick={addFiles}>+ Thêm video</button>
              {files.length > 0 && <button className="btn-outline" style={{ padding: '8px 12px' }} onClick={() => { setFiles([]); setPreviewSrc(null); setPreviewMode(null); }}>Xoá hết</button>}
            </div>
          </>)}

          {card('② Xem trước', <>
            <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#000', border: '1px solid #000', boxShadow: 'inset 0 0 20px rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
              {previewSrc
                ? <video key={previewSrc} src={previewSrc} controls autoPlay loop style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                : <span style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>{target ? 'Bấm "Xem gốc" hoặc "Xem bản hiệu chỉnh"' : 'Thêm video để xem trước'}</span>}
              {previewMode && (
                <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 11, letterSpacing: 1, padding: '2px 8px', background: previewMode === 'edited' ? 'var(--accent)' : '#333', color: previewMode === 'edited' ? '#111' : '#ddd', fontWeight: 700 }}>
                  {previewMode === 'edited' ? 'ĐÃ HIỆU CHỈNH · 6s' : 'BẢN GỐC'}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {target ? `Video: ${target.split(/[\\/]/).pop()}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-outline" style={{ padding: '9px 14px' }} disabled={!target} onClick={showOriginal}>Xem gốc</button>
              <button className="btn-outline" style={{ flex: 1, padding: '9px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} disabled={busy || !target} onClick={preview}>
                <Play size={14} /> {previewing ? 'Đang tạo...' : 'Xem bản hiệu chỉnh (6s)'}
              </button>
            </div>
          </>)}

          {card('③ Xuất video', <>
            <div style={S.row}>
              <div className="dir-path" style={{ ...S.input, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={outDir}>
                {outDir || 'Thư mục H-MMO › 2. Đã hiệu chỉnh (bấm 📁 để đổi)'}
              </div>
              <button className="btn-outline" style={{ padding: '7px 10px' }} onClick={async () => { try { const d = await invoke('transform:pickDir'); if (d) setOutDir(d); } catch (e) { explain(e); } }}><FolderOpen size={14} /></button>
            </div>
            <div style={S.row}>
              <span style={S.label}>Đuôi tên file</span>
              <input value={suffix} onChange={(e) => setSuffix(e.target.value)} style={S.input} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button className="btn-primary" style={{ flex: 1, padding: '12px 14px' }} disabled={busy || !files.length} onClick={run}>
                {busy && !previewing ? 'Đang xuất...' : `Xuất ${files.length || ''} video`}
              </button>
              <button className="btn-outline" title="Đưa các thông số hiệu chỉnh về mặc định" style={{ padding: '10px 12px' }} onClick={() => setO(TRANSFORM_DEFAULTS)}><RotateCcw size={14} /></button>
            </div>
          </>)}

          {outputs.length > 0 && (
            <div className="card" style={{ padding: 14 }}>
              <h3 style={{ ...S.h3, marginBottom: 8 }}>Video đã xuất ({outputs.length})</h3>
              {outputs.map((f) => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 6 }}>
                  <Film size={14} color="var(--success)" />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f}>{f}</span>
                  <button className="btn-outline" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => { setPreviewSrc(fileUrl(f)); setPreviewMode('edited'); }}>Xem</button>
                  <button className="btn-outline" style={{ padding: '5px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => invoke('transform:reveal', f)}><FolderOpen size={12} /> Mở thư mục</button>
                </div>
              ))}
            </div>
          )}

          <div className="log-box" style={{ padding: 12, minHeight: 110, maxHeight: 200, overflowY: 'auto', fontSize: 12 }}>
            {logs.map((l, i) => <div key={i} style={{ color: l.includes('[LỖI]') ? 'var(--danger)' : undefined }}>{l}</div>)}
            <div ref={logEnd} />
          </div>
        </div>
        {/* CỘT PHẢI: các tác vụ hiệu chỉnh */}
        <div style={S.col}>
          {card('Khung hình', <>
            {slider('Zoom / crop', 'zoom', 1, 1.3, 0.01, (v) => `${Math.round((v - 1) * 100)}%`)}
            <div style={S.row}>
              <span style={S.label}>Lật ngang</span>
              <button className={`btn-toggle ${o.flip ? 'on' : ''}`} style={{ padding: '6px 16px' }} onClick={() => set('flip', !o.flip)}>{o.flip ? 'BẬT' : 'TẮT'}</button>
            </div>
            <div style={S.row}>
              <span style={S.label}>Tỷ lệ khung</span>
              <select value={o.aspect} onChange={(e) => set('aspect', e.target.value as any)} style={S.input}>
                <option value="keep">Giữ nguyên</option>
                <option value="9:16">9:16 (TikTok / Shorts / Reels)</option>
                <option value="16:9">16:9 (YouTube ngang)</option>
                <option value="1:1">1:1 (vuông)</option>
                <option value="4:5">4:5 (Facebook / Instagram)</option>
              </select>
            </div>
            {o.aspect !== 'keep' && (
              <div style={S.row}>
                <span style={S.label}>Cách lấp khung</span>
                <select value={o.aspectMode} onChange={(e) => set('aspectMode', e.target.value as any)} style={S.input}>
                  <option value="blur">Nền mờ phía sau (giữ trọn hình)</option>
                  <option value="crop">Cắt cho đầy khung</option>
                  <option value="pad">Thêm viền đen</option>
                </select>
              </div>
            )}
            <div style={S.row}>
              <span style={S.label}>Viền</span>
              <input type="range" min={0} max={60} step={2} value={o.border} onChange={(e) => set('border', Number(e.target.value))} style={{ flex: 1 }} />
              <input type="color" value={o.borderColor} onChange={(e) => set('borderColor', e.target.value)} style={{ width: 36, height: 28, padding: 0, border: 'none', background: 'none' }} />
              <span style={S.val}>{o.border}px</span>
            </div>
          </>)}

          {card('Tốc độ & âm thanh', <>
            {slider('Tốc độ', 'speed', 0.8, 1.3, 0.01, (v) => `${v.toFixed(2)}×`)}
            {slider('Cao độ (pitch)', 'pitch', -4, 4, 0.5, (v) => `${v > 0 ? '+' : ''}${v} st`)}
            {slider('Âm lượng', 'volume', 0, 2, 0.05, (v) => `${Math.round(v * 100)}%`)}
          </>)}

          {card('Âm thanh nâng cao (AI)', <>
            {slider('Giảm giọng nhân vật', 'voiceReduce', 0, 1, 0.05, (v) => (v === 0 ? 'Tắt' : v >= 1 ? 'Bỏ hẳn' : `-${Math.round(v * 100)}%`))}
            <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '-4px 0 10px' }}>
              AI tách riêng giọng nói khỏi nhạc nền & tiếng động, rồi giảm giọng xuống — giữ nguyên nhạc nền để lồng tiếng mới lên cho tự nhiên.
            </div>
            {o.voiceReduce > 0 && <>
              <div style={S.row}>
                <span style={S.label}>Chất lượng tách</span>
                <select value={o.sepModel} onChange={(e) => set('sepModel', e.target.value as any)} style={S.input}>
                  <option value="fast">Nhanh (MDX-Net) — khuyên dùng</option>
                  <option value="hq">Sạch hơn (Roformer) — chậm trên CPU</option>
                </select>
              </div>
              <label style={{ ...S.row, cursor: 'pointer' }}>
                <input type="checkbox" checked={o.exportInstrumental} onChange={(e) => set('exportInstrumental', e.target.checked)} />
                <span style={{ fontSize: 13 }}>Lưu kèm file nhạc nền không giọng (.wav) để lồng tiếng</span>
              </label>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Lần đầu dùng sẽ tự cài bộ tách giọng (~300 MB) và tải model. Video dài tách mất vài phút; kết quả được nhớ lại nên xem trước rồi xuất sẽ nhanh hơn.
              </div>
            </>}
          </>)}

          {card('Màu sắc', <>
            {slider('Độ sáng', 'brightness', -0.2, 0.2, 0.01, (v) => (v > 0 ? '+' : '') + v.toFixed(2))}
            {slider('Tương phản', 'contrast', 0.7, 1.4, 0.01, (v) => v.toFixed(2))}
            {slider('Bão hoà', 'saturation', 0, 2, 0.05, (v) => v.toFixed(2))}
            {slider('Tông màu (hue)', 'hue', -30, 30, 1, (v) => `${v}°`)}
          </>)}

          {card('Chữ watermark', <>
            <div style={S.row}>
              <input placeholder="VD: @kenhcuatoi" value={o.text} onChange={(e) => set('text', e.target.value)} style={S.input} />
              {posSelect('textPos')}
            </div>
            {slider('Cỡ chữ', 'textSize', 2, 8, 0.5, (v) => `${v}%`)}
            {slider('Độ đậm', 'textOpacity', 0.1, 1, 0.05, (v) => `${Math.round(v * 100)}%`)}
          </>)}

          {card('Logo', <>
            <div style={S.row}>
              <div className="dir-path" style={{ ...S.input, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: o.logoPath ? undefined : 'var(--text-muted)' }} title={o.logoPath}>
                {o.logoPath || 'Chưa chọn logo (PNG nền trong suốt là đẹp nhất)'}
              </div>
              <button className="btn-outline" style={{ padding: '7px 10px' }} onClick={async () => { try { const f = await invoke('transform:pickImage'); if (f) set('logoPath', f); } catch (e) { explain(e); } }}><ImageIcon size={14} /></button>
              {o.logoPath && <button className="btn-outline" style={{ padding: '7px 10px' }} onClick={() => set('logoPath', '')}><Trash2 size={14} /></button>}
              {posSelect('logoPos')}
            </div>
            {slider('Kích thước', 'logoSize', 5, 35, 1, (v) => `${v}%`)}
            {slider('Độ đậm', 'logoOpacity', 0.1, 1, 0.05, (v) => `${Math.round(v * 100)}%`)}
          </>)}
        </div>

      </div>
    </div>
  );
}
