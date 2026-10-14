import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Film, Trash2, FolderOpen, ClipboardCheck, Scissors } from 'lucide-react';

// Tab "Chấm chất lượng" — AI xem contact sheet của video, chấm 6 tiêu chí, chỉ ra lỗi theo thời điểm.
// Lõi chuyển thể từ module review của FlowKit (MIT) — xem licenses/LICENSE_FlowKit_MIT.txt.

const fileUrl = (p: string) => `hmmo-media://f/${encodeURIComponent(p)}`;
const ipc = () => (window as any).electron.ipcRenderer;
const STORE = 'hmmo-review-opts';
const ASSEMBLE_INBOX = 'hmmo-assemble-inbox';

type Err = { severity: 'CRITICAL' | 'HIGH' | 'MINOR'; time_range: string; description: string; start?: number; end?: number };
type Seg = { time_range: string; score: number; start?: number; end?: number };
type Result = {
  video: string; overall: number; verdict: string; verdictText: string; dimensions: Record<string, number>;
  dimLabels: Record<string, string>; weights: Record<string, number>; errors: Err[]; usable_segments: Seg[];
  fixGuide: string; sheets: string[]; nFrames: number; fps: number; duration: number;
};
type Opts = { mode: 'light' | 'deep'; aiGenerated: boolean; context: string; characters: string };
const DEFAULTS: Opts = { mode: 'light', aiGenerated: false, context: '', characters: '' };
const load = (): Opts => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE) || '{}') }; } catch { return DEFAULTS; } };
const name = (f: string) => f.split(/[\\/]/).pop() || f;
const VCOLOR: Record<string, string> = { excellent: '#22c55e', good: '#84cc16', acceptable: '#fbbf24', poor: '#f97316', unusable: '#ef4444' };
const SCOLOR: Record<string, string> = { CRITICAL: '#ef4444', HIGH: '#f97316', MINOR: '#fbbf24' };
const SEV_VI: Record<string, string> = { CRITICAL: 'Nghiêm trọng', HIGH: 'Cao', MINOR: 'Nhẹ' };

export function ReviewPage({ onNavigate }: { onNavigate?: (p: string) => void }) {
  const [o, setO] = useState<Opts>(load);
  const [files, setFiles] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [current, setCurrent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<string[]>(['Chọn video đã làm xong (hoặc clip AI) để AI chấm chất lượng trước khi đăng.']);
  const logEnd = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);

  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch { /* bỏ qua */ } }, [o]);
  useEffect(() => logEnd.current?.scrollIntoView({ behavior: 'smooth' }), [logs]);
  useEffect(() => {
    const h = (_e: any, m: string) => setLogs((p) => [...p.slice(-300), m]);
    ipc().on('review:log', h);
    return () => ipc().removeListener('review:log', h);
  }, []);
  const set = <K extends keyof Opts>(k: K, v: Opts[K]) => setO((p) => ({ ...p, [k]: v }));
  const err = (e: any) => {
    const m = String(e?.message || e);
    setLogs((p) => [...p, /No handler registered/i.test(m) ? '[LỖI] Hãy TẮT hẳn H-MMO rồi mở lại để nạp tab mới.' : `[LỖI] ${m.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`]);
  };

  const target = current && files.includes(current) ? current : files[0] || null;
  const res = target ? results[target] : null;

  const add = async () => {
    try {
      const list: string[] = await ipc().invoke('review:pickVideos');
      if (list?.length) { setFiles((p) => Array.from(new Set([...p, ...list]))); if (!current) setCurrent(list[0]); }
    } catch (e) { err(e); }
  };
  const run = async () => {
    const apiKey = localStorage.getItem('geminiApiKey') || '';
    if (!apiKey) { setLogs((p) => [...p, '[LỖI] Chưa có API Key Gemini — nhập ở tab Tạo phụ đề.']); return; }
    setBusy(true);
    for (const video of files) {
      try {
        const r: Result = await ipc().invoke('review:run', { video, mode: o.mode, context: o.context, characters: o.characters, aiGenerated: o.aiGenerated, apiKey });
        setResults((p) => ({ ...p, [video]: r }));
      } catch (e) { err(e); }
    }
    setBusy(false);
  };
  const seek = (t?: number) => { if (t != null && vid.current) { vid.current.currentTime = t; vid.current.play().catch(() => {}); } };
  const sendSegments = () => {
    if (!res) return;
    const segs = res.usable_segments.filter((s) => s.start != null && s.end != null && s.end! > s.start!);
    try {
      const inbox = JSON.parse(localStorage.getItem(ASSEMBLE_INBOX) || '[]');
      localStorage.setItem(ASSEMBLE_INBOX, JSON.stringify([...inbox, ...segs.map((s) => ({ path: res.video, start: s.start, end: s.end }))]));
    } catch { /* bỏ qua */ }
    setLogs((p) => [...p, `Đã gửi ${segs.length} đoạn dùng được sang tab Ghép video.`]);
    onNavigate?.('assemble');
  };

  const card = (title: string, children: ReactNode) => (
    <div className="card" style={{ padding: 16 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 15, textTransform: 'uppercase', letterSpacing: 1 }}>{title}</h3>
      {children}
    </div>
  );
  const row = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 } as const;
  const label = { width: 130, flexShrink: 0, fontSize: 13, color: 'var(--text-secondary)' } as const;
  const tr = (s: { time_range: string; start?: number }) => (
    <span onClick={() => seek(s.start)} style={{ fontFamily: 'Consolas, monospace', cursor: s.start != null ? 'pointer' : undefined, textDecoration: s.start != null ? 'underline' : undefined, whiteSpace: 'nowrap' }}>{s.time_range || '—'}</span>
  );

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '22px 26px', boxSizing: 'border-box' }}>
      <h2 style={{ margin: 0 }}>Chấm chất lượng</h2>
      <p style={{ margin: '10px 0 18px', color: 'var(--text-muted)', fontSize: 13 }}>
        AI (Gemini) xem các khung hình của video theo dòng thời gian, chấm 6 tiêu chí, chỉ ra lỗi (nhân vật biến dạng, logo/watermark còn sót, phụ đề tràn, khung đen, giật...) và đoạn nào dùng được. Bấm vào mốc thời gian để tua tới lỗi.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr)', gap: 18, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {card(`① Video (${files.length})`, <>
            <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
              {files.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Chưa có video.</div>}
              {files.map((f) => {
                const r = results[f];
                return (
                  <div key={f} onClick={() => setCurrent(f)} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '6px 8px', cursor: 'pointer',
                    background: f === target ? 'rgba(255,106,0,0.12)' : 'transparent', borderLeft: `3px solid ${f === target ? 'var(--accent)' : 'transparent'}` }}>
                    <Film size={14} color="var(--accent)" />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f}>{name(f)}</span>
                    {r && <span style={{ fontWeight: 700, color: VCOLOR[r.verdict] }}>{r.overall.toFixed(1)}</span>}
                    <button style={{ color: 'var(--text-muted)' }} onClick={(e) => { e.stopPropagation(); setFiles((p) => p.filter((x) => x !== f)); }}><Trash2 size={13} /></button>
                  </div>
                );
              })}
            </div>
            <button className="btn-outline" style={{ padding: '8px 12px' }} onClick={add}>+ Thêm video</button>
          </>)}
          {card('② Thiết lập', <>
            <div style={row}><span style={label}>Mức độ</span>
              <select value={o.mode} onChange={(e) => set('mode', e.target.value as any)} style={{ flex: 1, padding: '7px 10px' }}>
                <option value="light">Nhanh — ~4 khung/giây</option>
                <option value="deep">Kỹ — ~8 khung/giây (bắt lỗi nhỏ, chậm hơn)</option>
              </select>
            </div>
            <div style={row}><span style={label}>Nội dung mong muốn</span>
              <textarea rows={2} value={o.context} placeholder="vd: cô gái nấu phở trong bếp, giới thiệu món ăn (để trống cũng được)" onChange={(e) => set('context', e.target.value)}
                style={{ flex: 1, background: '#111', color: '#e5e7eb', border: '1px solid #333', padding: 6, fontSize: 12, resize: 'vertical' }} />
            </div>
            <div style={row}><span style={label}>Nhân vật</span>
              <input value={o.characters} placeholder="vd: cô gái tóc đen, chú chó corgi" onChange={(e) => set('characters', e.target.value)}
                style={{ flex: 1, background: '#111', color: '#e5e7eb', border: '1px solid #333', padding: '6px 8px', fontSize: 12 }} />
            </div>
            <label style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <input type="checkbox" checked={o.aiGenerated} onChange={(e) => set('aiGenerated', e.target.checked)} /> Video do AI tạo (Veo, Kling...)
            </label>
            <button className="btn-primary" style={{ width: '100%', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} disabled={busy || !files.length} onClick={run}>
              <ClipboardCheck size={16} /> {busy ? 'Đang chấm...' : `Chấm ${files.length || ''} video`}
            </button>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Dùng API Key Gemini đã nhập ở tab Tạo phụ đề. Mỗi video gửi tối đa 64 khung hình thu nhỏ.</div>
          </>)}
          {target && card('Xem video', <video ref={vid} key={target} src={fileUrl(target)} controls style={{ width: '100%', maxHeight: 340, background: '#000' }} />)}
          <div className="log-box" style={{ padding: 12, minHeight: 90, maxHeight: 200, overflowY: 'auto', fontSize: 12 }}>
            {logs.map((l, i) => <div key={i} style={{ color: l.includes('[LỖI]') ? 'var(--danger)' : undefined }}>{l}</div>)}
            <div ref={logEnd} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!res && card('Kết quả', <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{target ? 'Chưa chấm video này.' : 'Thêm video để bắt đầu.'}</div>)}
          {res && <>
            {card('Kết quả', <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
                <div style={{ fontSize: 44, fontWeight: 800, color: VCOLOR[res.verdict], fontFamily: 'Consolas, monospace', lineHeight: 1 }}>{res.overall.toFixed(1)}</div>
                <div>
                  <div style={{ fontWeight: 700, color: VCOLOR[res.verdict] }}>{res.verdictText}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{res.nFrames} khung · {res.duration.toFixed(1)}s · trên thang 10</div>
                </div>
              </div>
              {Object.entries(res.dimensions).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, fontSize: 13 }}>
                  <span style={{ width: 200 }}>{res.dimLabels[k] || k} <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{Math.round((res.weights[k] || 0) * 100)}%</span></span>
                  <div style={{ flex: 1, height: 8, background: '#2a2e33' }}><div style={{ width: `${v * 10}%`, height: '100%', background: v >= 7.5 ? '#84cc16' : v >= 6 ? '#fbbf24' : '#ef4444' }} /></div>
                  <span style={{ width: 30, textAlign: 'right', fontFamily: 'Consolas, monospace' }}>{v.toFixed(1)}</span>
                </div>
              ))}
              <div style={{ marginTop: 12, padding: 10, background: 'rgba(255,106,0,0.08)', borderLeft: '3px solid var(--accent)', fontSize: 13 }}>
                <b>Gợi ý sửa:</b> {res.fixGuide}
              </div>
            </>)}
            {card(`Lỗi phát hiện (${res.errors.length})`, res.errors.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {res.errors.map((e, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, fontSize: 13, alignItems: 'baseline' }}>
                    <span style={{ color: SCOLOR[e.severity], fontWeight: 700, width: 90, flexShrink: 0 }}>{SEV_VI[e.severity]}</span>
                    {tr(e)}
                    <span style={{ flex: 1 }}>{e.description}</span>
                  </div>
                ))}
              </div>
            ) : <div style={{ color: '#22c55e', fontSize: 13 }}>Không thấy lỗi.</div>)}
            {card(`Đoạn dùng được (${res.usable_segments.length})`, <>
              {res.usable_segments.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, fontSize: 13, marginBottom: 4 }}>{tr(s)}<span style={{ color: 'var(--text-muted)' }}>điểm {s.score.toFixed(1)}</span></div>
              ))}
              {res.usable_segments.length > 0 && (
                <button className="btn-outline" style={{ marginTop: 8, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6 }} onClick={sendSegments}>
                  <Scissors size={14} /> Gửi các đoạn này sang Ghép video
                </button>
              )}
            </>)}
            {card('Contact sheet AI đã xem', <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
                {res.sheets.map((s) => <img key={s} src={fileUrl(s)} style={{ width: '100%', border: '1px solid #333', cursor: 'pointer' }} onClick={() => ipc().invoke('review:reveal', s)} />)}
              </div>
              <button className="btn-outline" style={{ marginTop: 8, padding: '5px 10px', fontSize: 12 }} onClick={() => ipc().invoke('review:reveal', res.sheets[0])}><FolderOpen size={12} /> Mở thư mục (có review.json)</button>
            </>)}
          </>}
        </div>
      </div>
    </div>
  );
}
