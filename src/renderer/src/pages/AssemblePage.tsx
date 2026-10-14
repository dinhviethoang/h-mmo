import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Film, Trash2, FolderOpen, ArrowUp, ArrowDown, Play, Music, Mic, Layers } from 'lucide-react';

// Tab "Ghép video" — cắt, chuẩn hoá, ghép clip, lồng lời dẫn, nhạc nền.
// Lõi xử lý chuyển thể từ FlowKit (MIT) — xem licenses/LICENSE_FlowKit_MIT.txt.

const fileUrl = (p: string) => `hmmo-media://f/${encodeURIComponent(p)}`;
const ipc = () => (window as any).electron.ipcRenderer;
const STORE = 'hmmo-assemble-opts';
export const ASSEMBLE_INBOX = 'hmmo-assemble-inbox';

type Info = { w: number; h: number; dur: number; hasAudio: boolean };
type Clip = { id: string; path: string; info: Info; start: string; end: string };
type Layer = { path: string; volume: number; fadeIn: number; fadeOut: number };
type Opts = {
  size: 'keep' | '1080x1920' | '1920x1080' | '1080x1080' | '1080x1350';
  fit: 'pad' | 'crop' | 'blur';
  fps: number;
  origVolume: number;
  narration: Layer;
  music: Layer & { loop: boolean };
};
const DEFAULTS: Opts = {
  size: '1080x1920', fit: 'blur', fps: 30, origVolume: 1,
  narration: { path: '', volume: 1, fadeIn: 0.3, fadeOut: 0.5 },
  music: { path: '', volume: 0.25, fadeIn: 2, fadeOut: 3, loop: true }
};
const load = (): Opts => {
  try {
    const o = JSON.parse(localStorage.getItem(STORE) || '{}');
    return { ...DEFAULTS, ...o, narration: { ...DEFAULTS.narration, ...o.narration }, music: { ...DEFAULTS.music, ...o.music } };
  } catch { return DEFAULTS; }
};
const name = (f: string) => f.split(/[\\/]/).pop() || f;
const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

export function AssemblePage() {
  const [o, setO] = useState<Opts>(load);
  const [clips, setClips] = useState<Clip[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [outName, setOutName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>(['Thêm các clip theo đúng thứ tự, cắt đầu/cuối nếu cần, rồi bấm Ghép.']);
  const logEnd = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);

  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch { /* bỏ qua */ } }, [o]);
  useEffect(() => logEnd.current?.scrollIntoView({ behavior: 'smooth' }), [logs]);
  useEffect(() => {
    const h = (_e: any, m: string) => setLogs((p) => [...p.slice(-300), m]);
    ipc().on('assemble:log', h);
    // nhận các "đoạn dùng được" gửi từ tab Chấm chất lượng
    (async () => {
      try {
        const inbox = JSON.parse(localStorage.getItem(ASSEMBLE_INBOX) || '[]') as { path: string; start: number; end: number }[];
        if (!inbox.length) return;
        localStorage.removeItem(ASSEMBLE_INBOX);
        const added: Clip[] = [];
        for (const it of inbox) {
          const info = await ipc().invoke('assemble:probe', it.path);
          if (info) added.push({ id: `${Date.now()}-${Math.random()}`, path: it.path, info, start: String(it.start ?? ''), end: String(it.end ?? '') });
        }
        setClips((p) => [...p, ...added]);
        setLogs((p) => [...p, `Đã nhận ${added.length} đoạn dùng được từ tab Chấm chất lượng.`]);
      } catch { /* bỏ qua */ }
    })();
    return () => ipc().removeListener('assemble:log', h);
  }, []);

  const err = (e: any) => {
    const m = String(e?.message || e);
    setLogs((p) => [...p, /No handler registered/i.test(m) ? '[LỖI] Hãy TẮT hẳn H-MMO rồi mở lại để nạp tab mới.' : `[LỖI] ${m.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`]);
  };
  const set = <K extends keyof Opts>(k: K, v: Opts[K]) => setO((p) => ({ ...p, [k]: v }));
  const setLayer = (k: 'narration' | 'music', patch: Partial<Opts['music']>) => setO((p) => ({ ...p, [k]: { ...p[k], ...patch } }));

  const add = async () => {
    try {
      const list: { path: string; info: Info }[] = await ipc().invoke('assemble:pickClips');
      const nc = list.map((c) => ({ id: `${Date.now()}-${Math.random()}`, ...c, start: '', end: '' }));
      setClips((p) => [...p, ...nc]);
      if (!sel && nc[0]) setSel(nc[0].id);
    } catch (e) { err(e); }
  };
  const move = (i: number, d: number) => setClips((p) => {
    const a = [...p]; const j = i + d;
    if (j < 0 || j >= a.length) return p;
    [a[i], a[j]] = [a[j], a[i]]; return a;
  });
  const upd = (id: string, patch: Partial<Clip>) => setClips((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const len = (c: Clip) => {
    const s = parseFloat(c.start) || 0, e = parseFloat(c.end);
    return Math.max(0, (Number.isFinite(e) && e > s ? Math.min(e, c.info.dur) : c.info.dur) - s);
  };
  const total = clips.reduce((a, c) => a + len(c), 0);
  const cur = clips.find((c) => c.id === sel) || null;

  const pickAudio = async (k: 'narration' | 'music') => {
    try { const p = await ipc().invoke('assemble:pickAudio'); if (p) setLayer(k, { path: p }); } catch (e) { err(e); }
  };

  const run = async () => {
    setBusy(true); setResult(null);
    try {
      const payload = clips.map((c) => ({ path: c.path, start: c.start === '' ? null : parseFloat(c.start), end: c.end === '' ? null : parseFloat(c.end) }));
      const r = await ipc().invoke('assemble:run', payload, {
        size: o.size, fit: o.fit, fps: o.fps, origVolume: o.origVolume, outName,
        narration: o.narration.path ? o.narration : null, music: o.music.path ? o.music : null
      });
      setResult(r.out);
    } catch (e) { err(e); }
    setBusy(false);
  };

  const card = (title: string, children: ReactNode, icon?: ReactNode) => (
    <div className="card" style={{ padding: 16 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 15, textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 8 }}>{icon}{title}</h3>
      {children}
    </div>
  );
  const row = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 } as const;
  const label = { width: 120, flexShrink: 0, fontSize: 13, color: 'var(--text-secondary)' } as const;
  const num = { width: 70, padding: '5px 6px', background: '#111', color: '#e5e7eb', border: '1px solid #333' } as const;
  const slider = (v: number, min: number, max: number, step: number, on: (v: number) => void, show: string) => (
    <>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => on(Number(e.target.value))} style={{ flex: 1 }} />
      <span style={{ width: 48, textAlign: 'right', fontFamily: 'Consolas, monospace', color: 'var(--accent)' }}>{show}</span>
    </>
  );
  const layerCard = (k: 'narration' | 'music', title: string, icon: ReactNode) => {
    const l = o[k];
    return card(title, <>
      <div style={row}>
        <button className="btn-outline" style={{ padding: '6px 10px' }} onClick={() => pickAudio(k)}>Chọn file</button>
        <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: l.path ? undefined : 'var(--text-muted)' }} title={l.path}>{l.path ? name(l.path) : 'Không dùng'}</span>
        {l.path && <button style={{ color: 'var(--text-muted)' }} onClick={() => setLayer(k, { path: '' })}><Trash2 size={13} /></button>}
      </div>
      <div style={{ opacity: l.path ? 1 : 0.45, pointerEvents: l.path ? 'auto' : 'none' }}>
        <div style={row}><span style={label}>Âm lượng</span>{slider(l.volume, 0, k === 'music' ? 1 : 2, 0.05, (v) => setLayer(k, { volume: v }), `${Math.round(l.volume * 100)}%`)}</div>
        <div style={row}><span style={label}>Hiện dần / tắt dần</span>
          <input type="number" min={0} max={10} step={0.1} value={l.fadeIn} onChange={(e) => setLayer(k, { fadeIn: Number(e.target.value) })} style={num} /> s
          <input type="number" min={0} max={10} step={0.1} value={l.fadeOut} onChange={(e) => setLayer(k, { fadeOut: Number(e.target.value) })} style={num} /> s
        </div>
        {k === 'music' && (
          <label style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={o.music.loop} onChange={(e) => setLayer('music', { loop: e.target.checked })} /> Lặp nhạc nếu ngắn hơn video
          </label>
        )}
      </div>
    </>, icon);
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '22px 26px', boxSizing: 'border-box' }}>
      <h2 style={{ margin: 0 }}>Ghép video</h2>
      <p style={{ margin: '10px 0 18px', color: 'var(--text-muted)', fontSize: 13 }}>
        Ghép nhiều clip thành 1 video: tự đưa về cùng khung hình, fps và định dạng âm thanh (clip không có tiếng được chèn im lặng), cắt đầu/cuối từng clip, thêm lời dẫn và nhạc nền. Lưu vào H-MMO › 4. Hoàn thành.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)', gap: 18, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {card(`① Clip (${clips.length}) · tổng ${fmt(total)}`, <>
            <div style={{ maxHeight: 330, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {clips.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Chưa có clip.</div>}
              {clips.map((c, i) => (
                <div key={c.id} onClick={() => setSel(c.id)} style={{ padding: '8px 8px', cursor: 'pointer', fontSize: 13,
                  background: c.id === sel ? 'rgba(255,106,0,0.12)' : 'rgba(255,255,255,0.02)', borderLeft: `3px solid ${c.id === sel ? 'var(--accent)' : 'transparent'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'Consolas, monospace', color: 'var(--accent)', width: 22 }}>{i + 1}.</span>
                    <Film size={14} color="var(--accent)" />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.path}>{name(c.path)}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.info.w}×{c.info.h}{c.info.hasAudio ? '' : ' · không tiếng'}</span>
                    <button title="Lên" onClick={(e) => { e.stopPropagation(); move(i, -1); }}><ArrowUp size={13} /></button>
                    <button title="Xuống" onClick={(e) => { e.stopPropagation(); move(i, 1); }}><ArrowDown size={13} /></button>
                    <button title="Bỏ" style={{ color: 'var(--text-muted)' }} onClick={(e) => { e.stopPropagation(); setClips((p) => p.filter((x) => x.id !== c.id)); }}><Trash2 size={13} /></button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, paddingLeft: 30, fontSize: 12, color: 'var(--text-secondary)' }} onClick={(e) => e.stopPropagation()}>
                    Từ <input type="number" min={0} step={0.1} placeholder="0" value={c.start} onChange={(e) => upd(c.id, { start: e.target.value })} style={num} />
                    đến <input type="number" min={0} step={0.1} placeholder={c.info.dur.toFixed(1)} value={c.end} onChange={(e) => upd(c.id, { end: e.target.value })} style={num} /> s
                    <span style={{ marginLeft: 'auto', fontFamily: 'Consolas, monospace' }}>{fmt(len(c))}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-outline" style={{ padding: '8px 12px' }} onClick={add}>+ Thêm clip</button>
              {clips.length > 0 && <button className="btn-outline" style={{ padding: '8px 12px' }} onClick={() => setClips([])}>Xoá hết</button>}
            </div>
          </>, <Layers size={16} />)}

          {card('② Xem clip đang chọn', cur ? <>
            <video ref={vid} key={cur.id} src={fileUrl(cur.path)} controls style={{ width: '100%', maxHeight: 360, background: '#000' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn-outline" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => vid.current && upd(cur.id, { start: vid.current.currentTime.toFixed(1) })}>⏱ Đặt điểm đầu</button>
              <button className="btn-outline" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => vid.current && upd(cur.id, { end: vid.current.currentTime.toFixed(1) })}>⏱ Đặt điểm cuối</button>
            </div>
          </> : <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Bấm vào 1 clip trong danh sách để xem và đặt điểm cắt.</div>, <Play size={16} />)}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {card('③ Khung hình', <>
            <div style={row}><span style={label}>Kích thước</span>
              <select value={o.size} onChange={(e) => set('size', e.target.value as any)} style={{ flex: 1, padding: '7px 10px' }}>
                <option value="1080x1920">Dọc 9:16 (1080×1920) — TikTok/Shorts/Reels</option>
                <option value="1920x1080">Ngang 16:9 (1920×1080) — YouTube</option>
                <option value="1080x1080">Vuông 1:1 (1080×1080)</option>
                <option value="1080x1350">4:5 (1080×1350) — Facebook/Instagram</option>
                <option value="keep">Giữ như clip đầu tiên</option>
              </select>
            </div>
            <div style={row}><span style={label}>Clip lệch khung</span>
              <select value={o.fit} onChange={(e) => set('fit', e.target.value as any)} style={{ flex: 1, padding: '7px 10px' }}>
                <option value="blur">Nền mờ phía sau</option>
                <option value="pad">Viền đen</option>
                <option value="crop">Lấp đầy (cắt bớt mép)</option>
              </select>
            </div>
            <div style={row}><span style={label}>Khung/giây</span>
              <select value={o.fps} onChange={(e) => set('fps', Number(e.target.value))} style={{ flex: 1, padding: '7px 10px' }}>
                {[24, 25, 30, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}
              </select>
            </div>
            <div style={row}><span style={label}>Tiếng gốc clip</span>{slider(o.origVolume, 0, 2, 0.05, (v) => set('origVolume', v), `${Math.round(o.origVolume * 100)}%`)}</div>
          </>)}
          {layerCard('narration', '④ Lời dẫn / lồng tiếng', <Mic size={16} />)}
          {layerCard('music', '⑤ Nhạc nền', <Music size={16} />)}
          {card('⑥ Xuất', <>
            <div style={row}><span style={label}>Tên file</span>
              <input value={outName} placeholder="để trống = tự đặt theo giờ" onChange={(e) => setOutName(e.target.value)} style={{ flex: 1, padding: '7px 10px', background: '#111', color: '#e5e7eb', border: '1px solid #333' }} />
            </div>
            <button className="btn-primary" style={{ width: '100%', padding: '12px 14px' }} disabled={busy || !clips.length} onClick={run}>
              {busy ? 'Đang ghép...' : `Ghép ${clips.length} clip (${fmt(total)})`}
            </button>
            {result && (
              <div style={{ marginTop: 10, fontSize: 13 }}>
                <video src={`${fileUrl(result)}?t=${result.length}`} controls style={{ width: '100%', maxHeight: 300, background: '#000' }} />
                <button className="btn-outline" style={{ marginTop: 6, padding: '5px 10px', fontSize: 12 }} onClick={() => ipc().invoke('assemble:reveal', result)}><FolderOpen size={12} /> Mở thư mục</button>
              </div>
            )}
          </>)}
          <div className="log-box" style={{ padding: 12, minHeight: 100, maxHeight: 220, overflowY: 'auto', fontSize: 12 }}>
            {logs.map((l, i) => <div key={i} style={{ color: l.includes('[LỖI]') ? 'var(--danger)' : undefined }}>{l}</div>)}
            <div ref={logEnd} />
          </div>
        </div>
      </div>
    </div>
  );
}
