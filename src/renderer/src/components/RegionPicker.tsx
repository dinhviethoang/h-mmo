import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';

export type Region = { x: number; y: number; w: number; h: number }; // phần trăm khung hình

/** Khung xem video + ô chữ nhật kéo/thả/đổi cỡ để khoanh vùng (tính theo % khung hình thật). */
export function RegionPicker({ src, region, onChange, label = 'Vùng chữ', color = '#ff6a00' }: {
  src: string | null; region: Region; onChange: (r: Region) => void; label?: string; color?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(16 / 9);
  const vid = useRef<HTMLVideoElement>(null);
  const [dur, setDur] = useState(0);
  const [cur, setCur] = useState(0);
  const drag = useRef<{ mode: 'move' | 'nw' | 'se'; sx: number; sy: number; r: Region } | null>(null);

  const clamp = (r: Region): Region => {
    const w = Math.min(100, Math.max(3, r.w)), h = Math.min(100, Math.max(3, r.h));
    return { w, h, x: Math.min(100 - w, Math.max(0, r.x)), y: Math.min(100 - h, Math.max(0, r.y)) };
  };
  const down = (mode: 'move' | 'nw' | 'se') => (e: RPointerEvent) => {
    e.stopPropagation(); e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, r: { ...region } };
  };
  const move = (e: RPointerEvent) => {
    const d = drag.current; const el = wrap.current;
    if (!d || !el) return;
    const b = el.getBoundingClientRect();
    const dx = ((e.clientX - d.sx) / b.width) * 100, dy = ((e.clientY - d.sy) / b.height) * 100;
    const r = d.r;
    if (d.mode === 'move') onChange(clamp({ ...r, x: r.x + dx, y: r.y + dy }));
    else if (d.mode === 'se') onChange(clamp({ ...r, w: r.w + dx, h: r.h + dy }));
    else onChange(clamp({ x: r.x + dx, y: r.y + dy, w: r.w - dx, h: r.h - dy }));
  };
  const up = () => { drag.current = null; };
  const handle = (pos: 'nw' | 'se') => (
    <div onPointerDown={down(pos)} style={{
      position: 'absolute', width: 14, height: 14, background: color, border: '2px solid #000',
      cursor: pos === 'se' ? 'nwse-resize' : 'nwse-resize', ...(pos === 'se' ? { right: -7, bottom: -7 } : { left: -7, top: -7 })
    }} />
  );

  const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  return (
    <div>
    <div style={{ width: '100%', background: '#000', border: '1px solid #000', display: 'flex', justifyContent: 'center' }}>
      <div ref={wrap} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
        style={{ position: 'relative', width: '100%', maxHeight: 460, aspectRatio: String(ratio), maxWidth: `calc(460px * ${ratio})`, touchAction: 'none' }}>
        {src
          ? <video ref={vid} src={src} muted preload="auto" style={{ width: '100%', height: '100%', display: 'block' }}
              onLoadedMetadata={(e) => { const v = e.currentTarget; if (v.videoWidth) setRatio(v.videoWidth / v.videoHeight); setDur(v.duration || 0); v.currentTime = Math.min(1, (v.duration || 0) / 3); }}
              onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)} />
          : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Chọn video để khoanh vùng</div>}
        <div onPointerDown={down('move')} style={{
          position: 'absolute', left: `${region.x}%`, top: `${region.y}%`, width: `${region.w}%`, height: `${region.h}%`,
          border: `2px dashed ${color}`, background: 'rgba(255,106,0,0.12)', cursor: 'move', boxSizing: 'border-box'
        }}>
          <span style={{ position: 'absolute', top: -20, left: 0, fontSize: 11, fontWeight: 700, background: color, color: '#111', padding: '1px 6px', whiteSpace: 'nowrap' }}>{label}</span>
          {handle('nw')}{handle('se')}
        </div>
      </div>
    </div>
    {src && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
        <span style={{ fontFamily: 'Consolas, monospace', fontSize: 12, color: 'var(--accent)', width: 90 }}>{fmt(cur)} / {fmt(dur)}</span>
        <input type="range" min={0} max={dur || 1} step={0.05} value={cur} style={{ flex: 1 }}
          onChange={(e) => { const t = Number(e.target.value); setCur(t); if (vid.current) vid.current.currentTime = t; }} />
      </div>
    )}
    </div>
  );
}
