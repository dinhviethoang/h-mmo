import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Film, Trash2, FolderOpen, ScanText } from 'lucide-react';
import { RegionPicker, type Region } from '../components/RegionPicker';

const fileUrl = (p: string) => `hmmo-media://f/${encodeURIComponent(p)}`;
const ipc = () => (window as any).electron.ipcRenderer;
const STORE = 'hmmo-ocr-opts';

type Opts = { region: Region; fps: number; minScore: number; translate: 'none' | 'google' | 'gemini' };
const DEFAULTS: Opts = { region: { x: 5, y: 72, w: 90, h: 20 }, fps: 4, minScore: 0.6, translate: 'google' };
const load = (): Opts => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE) || '{}') }; } catch { return DEFAULTS; } };

export function OcrPage() {
  const [o, setO] = useState<Opts>(load);
  const [files, setFiles] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ video: string; srt: string; vi?: string }[]>([]);
  const [logs, setLogs] = useState<string[]>(['Chọn video có phụ đề in sẵn trên hình, khoanh vùng chữ rồi bấm Đọc chữ.']);
  const logEnd = useRef<HTMLDivElement>(null);

  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch { /* bỏ qua */ } }, [o]);
  useEffect(() => {
    const h = (_e: any, m: string) => setLogs((p) => [...p.slice(-300), m]);
    ipc().on('ocr:log', h);
    return () => ipc().removeListener('ocr:log', h);
  }, []);
  useEffect(() => logEnd.current?.scrollIntoView({ behavior: 'smooth' }), [logs]);

  const set = <K extends keyof Opts>(k: K, v: Opts[K]) => setO((p) => ({ ...p, [k]: v }));
  const target = current && files.includes(current) ? current : files[0] || null;
  const err = (e: any) => {
    const m = String(e?.message || e);
    setLogs((p) => [...p, /No handler registered/i.test(m) ? '[LỖI] Hãy TẮT hẳn H-MMO rồi mở lại để nạp tính năng mới.' : `[LỖI] ${m.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`]);
  };

  const add = async () => {
    try {
      const list: string[] = await ipc().invoke('ocr:pickVideo');
      if (list?.length) { setFiles((p) => Array.from(new Set([...p, ...list]))); if (!current) setCurrent(list[0]); }
    } catch (e) { err(e); }
  };
  const run = async () => {
    setBusy(true);
    const apiKey = localStorage.getItem('geminiApiKey') || '';
    for (const video of files) {
      try {
        const r = await ipc().invoke('ocr:run', { video, region: o.region, fps: o.fps, minScore: o.minScore, translate: o.translate, apiKey });
        setResults((p) => [...p.filter((x) => x.video !== video), { video, ...r }]);
      } catch (e) { err(e); }
    }
    setBusy(false);
  };

  const card = (title: string, children: ReactNode) => (
    <div className="card" style={{ padding: 16 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 15, textTransform: 'uppercase', letterSpacing: 1 }}>{title}</h3>
      {children}
    </div>
  );
  const row = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 } as const;
  const label = { width: 130, flexShrink: 0, fontSize: 13, color: 'var(--text-secondary)' } as const;
  const name = (f: string) => f.split(/[\\/]/).pop();

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '22px 26px', boxSizing: 'border-box' }}>
      <h2 style={{ margin: 0 }}>Đọc chữ video</h2>
      <p style={{ margin: '10px 0 18px', color: 'var(--text-muted)', fontSize: 13 }}>
        Lấy phụ đề in sẵn trên hình (vd. chữ Trung trên video Douyin) thành file .srt bằng OCR chạy trên máy, rồi dịch sang tiếng Việt. Dùng khi video không có tiếng nói hoặc Whisper nghe sai.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.25fr) minmax(0,1fr)', gap: 18, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {card(`① Video (${files.length})`, <>
            <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
              {files.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Chưa có video.</div>}
              {files.map((f) => (
                <div key={f} onClick={() => setCurrent(f)} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '6px 8px', cursor: 'pointer',
                  background: f === target ? 'rgba(255,106,0,0.12)' : 'transparent', borderLeft: `3px solid ${f === target ? 'var(--accent)' : 'transparent'}` }}>
                  <Film size={14} color="var(--accent)" />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f}>{name(f)}</span>
                  <button style={{ color: 'var(--text-muted)' }} onClick={(e) => { e.stopPropagation(); setFiles((p) => p.filter((x) => x !== f)); }}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
            <button className="btn-outline" style={{ padding: '8px 12px' }} onClick={add}>+ Thêm video</button>
          </>)}
          {card('② Khoanh vùng chữ', <>
            <RegionPicker src={target ? fileUrl(target) : null} region={o.region} onChange={(r) => set('region', r)} label="VÙNG PHỤ ĐỀ" />
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
              Kéo ô cam trùm lên dòng phụ đề (kéo góc để đổi cỡ). Kéo thanh thời gian tới đoạn có chữ để căn cho chuẩn. Vùng càng sát chữ càng ít đọc nhầm logo/chữ khác.
            </div>
          </>)}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {card('③ Thiết lập', <>
            <div style={row}>
              <span style={label}>Tần suất quét</span>
              <select value={o.fps} onChange={(e) => set('fps', Number(e.target.value))} style={{ flex: 1, padding: '7px 10px' }}>
                <option value={2}>2 khung/giây — nhanh</option>
                <option value={4}>4 khung/giây — cân bằng</option>
                <option value={6}>6 khung/giây — bắt chữ chạy nhanh</option>
              </select>
            </div>
            <div style={row}>
              <span style={label}>Độ chắc chắn tối thiểu</span>
              <input type="range" min={0.3} max={0.95} step={0.05} value={o.minScore} onChange={(e) => set('minScore', Number(e.target.value))} style={{ flex: 1 }} />
              <span style={{ width: 44, textAlign: 'right', fontFamily: 'Consolas, monospace', color: 'var(--accent)' }}>{Math.round(o.minScore * 100)}%</span>
            </div>
            <div style={row}>
              <span style={label}>Dịch sang tiếng Việt</span>
              <select value={o.translate} onChange={(e) => set('translate', e.target.value as any)} style={{ flex: 1, padding: '7px 10px' }}>
                <option value="none">Không dịch</option>
                <option value="google">Google (miễn phí)</option>
                <option value="gemini">Gemini AI (dịch hay hơn, cần API key)</option>
              </select>
            </div>
            <button className="btn-primary" style={{ width: '100%', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} disabled={busy || !files.length} onClick={run}>
              <ScanText size={16} /> {busy ? 'Đang đọc chữ...' : `Đọc chữ ${files.length || ''} video`}
            </button>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>File .srt lưu vào thư mục H-MMO › 3. Phụ đề (đuôi _ocr và _ocr_vi).</div>
          </>)}

          {results.length > 0 && card(`Kết quả (${results.length})`, <>
            {results.map((r) => (
              <div key={r.video} style={{ marginBottom: 10, fontSize: 13 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{name(r.video)}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-outline" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => ipc().invoke('ocr:reveal', r.srt)}><FolderOpen size={12} /> Gốc</button>
                  {r.vi && <button className="btn-outline" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => ipc().invoke('ocr:reveal', r.vi)}><FolderOpen size={12} /> Tiếng Việt</button>}
                </div>
              </div>
            ))}
          </>)}

          <div className="log-box" style={{ padding: 12, minHeight: 120, maxHeight: 260, overflowY: 'auto', fontSize: 12 }}>
            {logs.map((l, i) => <div key={i} style={{ color: l.includes('[LỖI]') ? 'var(--danger)' : undefined }}>{l}</div>)}
            <div ref={logEnd} />
          </div>
        </div>
      </div>
    </div>
  );
}
