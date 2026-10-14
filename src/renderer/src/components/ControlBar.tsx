import { useEffect, useState, type CSSProperties } from 'react';

/** Bánh răng SVG (vẽ bằng toán, không cần file ảnh). */
export function Gear({ size = 40, teeth = 10, color = '#ff6a00', spin = 0, style }: {
  size?: number; teeth?: number; color?: string; spin?: number; style?: CSSProperties
}) {
  const r = 50, ro = 46, ri = 38, hole = 14;
  const pts: string[] = [];
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * Math.PI * 2;
    const a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
    const rad = i % 2 === 0 ? ro : ri;
    const inset = (a1 - a0) * 0.18;
    pts.push(`${r + rad * Math.cos(a0 + inset)},${r + rad * Math.sin(a0 + inset)}`);
    pts.push(`${r + rad * Math.cos(a1 - inset)},${r + rad * Math.sin(a1 - inset)}`);
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={spin ? 'ind-gear-spin' : undefined}
      style={{ animationDuration: spin ? `${Math.abs(spin)}s` : undefined, animationDirection: spin < 0 ? 'reverse' : undefined, ...style }}>
      <polygon points={pts.join(' ')} fill={color} />
      <circle cx={r} cy={r} r={26} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={4} />
      <circle cx={r} cy={r} r={hole} fill="#0b0c0e" />
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <circle key={k} cx={r + 21 * Math.cos((k * Math.PI) / 3)} cy={r + 21 * Math.sin((k * Math.PI) / 3)} r={3.2} fill="#0b0c0e" />
      ))}
    </svg>
  );
}

function Led({ color, label, blink }: { color: string; label: string; blink?: boolean }) {
  return (
    <div className="ind-led-wrap">
      <span className={`ind-led ${blink ? 'blink' : ''}`} style={{ ['--led' as any]: color }} />
      <span className="ind-led-label">{label}</span>
    </div>
  );
}

/** Dải điều khiển trên cùng: băng cảnh báo, đèn trạng thái, đồng hồ, bánh răng quay. */
export function ControlBar({ section }: { section: string }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="ind-controlbar">
      <div className="ind-hazard-block" />
      <div className="ind-plate">
        <span className="ind-plate-code">MODULE</span>
        <span className="ind-plate-name">{section}</span>
      </div>
      <div className="ind-vent" />
      <div style={{ flex: 1 }} />
      <button className="ind-folder-btn" title="Mở thư mục làm việc H-MMO" onClick={() => (window as any).electron?.ipcRenderer.invoke('workspace:open', 'root')}>📁 THƯ MỤC</button>
      <Led color="#7CFC4A" label="POWER" />
      <Led color="#ff6a00" label="ENGINE" blink />
      <Led color="#ffd23a" label="NET" />
      <div className="ind-clock">
        {pad(now.getHours())}<span className="ind-colon">:</span>{pad(now.getMinutes())}<span className="ind-colon">:</span>{pad(now.getSeconds())}
      </div>
      <div className="ind-gears">
        <Gear size={34} teeth={10} spin={9} />
        <Gear size={22} teeth={8} spin={-6} color="#8a8f96" style={{ marginLeft: -6, marginTop: 14 }} />
      </div>
    </div>
  );
}
