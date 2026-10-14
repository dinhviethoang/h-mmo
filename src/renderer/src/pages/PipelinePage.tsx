import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Zap, Play, Square, RotateCcw, Trash2, FolderOpen, Film, Link2, Plus } from 'lucide-react';
import { pipeline, STEPS, DEFAULT_CONFIG, type PipeConfig, type Job, type StepState } from '../lib/pipeline';

// Tab "Dây chuyền 1 chạm": dán link / chọn file -> tự chạy hết các bước, hàng loạt.
const CFG_KEY = 'hmmo-pipeline-config';
const ipc = () => (window as any).electron.ipcRenderer;
const loadCfg = (): PipeConfig => {
  try { const c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); return { ...DEFAULT_CONFIG, ...c, steps: { ...DEFAULT_CONFIG.steps, ...c.steps } }; }
  catch { return DEFAULT_CONFIG; }
};
const ST_COLOR: Record<StepState, string> = { pending: '#3a3f46', running: '#ff6a00', done: '#22c55e', skipped: '#2a2e33', error: '#ef4444' };
const JOB_TEXT: Record<Job['status'], string> = { queued: 'Chờ', running: 'Đang chạy', done: 'Xong', error: 'Lỗi', cancelled: 'Đã dừng' };
const VCOLOR: Record<string, string> = { excellent: '#22c55e', good: '#84cc16', acceptable: '#fbbf24', poor: '#f97316', unusable: '#ef4444' };

function useStore<T>(get: () => T): T {
  return useSyncExternalStore(pipeline.subscribe, get);
}

export function PipelinePage({ onNavigate }: { onNavigate?: (p: string) => void }) {
  const jobs = useStore(() => pipeline.jobs);
  const running = useStore(() => pipeline.running);
  const logs = useStore(() => pipeline.logs);
  const [cfg, setCfg] = useState<PipeConfig>(loadCfg);
  const [links, setLinks] = useState('');
  const [voices, setVoices] = useState<{ presets: { label: string; id: string }[]; clones: { name: string }[] }>({ presets: [], clones: [] });
  const logEnd = useRef<HTMLDivElement>(null);

  useEffect(() => { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch { /* bỏ qua */ } }, [cfg]);
  useEffect(() => logEnd.current?.scrollIntoView({ behavior: 'smooth' }), [logs]);
  useEffect(() => {
    (window as any).api.voiceList?.().then((r: any) => {
      setVoices({ presets: r.presets || [], clones: r.clones || [] });
      setCfg((c) => (c.voiceId ? c : { ...c, voiceId: r.clones?.[0] ? `vieneu:clone:${r.clones[0].name}` : r.presets?.[0] ? `vieneu:preset:${r.presets[0].id}` : '' }));
    }).catch(() => {});
  }, []);

  const set = <K extends keyof PipeConfig>(k: K, v: PipeConfig[K]) => setCfg((p) => ({ ...p, [k]: v }));
  const setStep = (k: keyof PipeConfig['steps'], v: boolean) => setCfg((p) => ({ ...p, steps: { ...p.steps, [k]: v } }));

  const addLinks = () => {
    const list = Array.from(new Set(links.split(/[\s,]+/).filter((s) => /^https?:\/\//i.test(s))));
    if (!list.length) return;
    pipeline.add(list, cfg);
    setLinks('');
  };
  const addFiles = async () => {
    const list: string[] = await ipc().invoke('transform:pickVideos').catch(() => []);
    if (list?.length) pipeline.add(list, cfg);
  };

  const queued = jobs.filter((j) => j.status === 'queued').length;
  const card = (title: string, children: ReactNode, right?: ReactNode) => (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15, textTransform: 'uppercase', letterSpacing: 1, flex: 1 }}>{title}</h3>{right}
      </div>
      {children}
    </div>
  );
  const row = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 } as const;
  const label = { width: 120, flexShrink: 0, fontSize: 13, color: 'var(--text-secondary)' } as const;
  const sel = { flex: 1, padding: '6px 8px' } as const;
  const stepBox = (k: keyof PipeConfig['steps'], title: string, desc: string, children?: ReactNode) => (
    <div style={{ borderLeft: `3px solid ${cfg.steps[k] ? 'var(--accent)' : '#333'}`, padding: '6px 0 6px 10px', marginBottom: 10 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
        <input type="checkbox" checked={cfg.steps[k]} onChange={(e) => setStep(k, e.target.checked)} /> {title}
      </label>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 6px 24px' }}>{desc}</div>
      {cfg.steps[k] && children && <div style={{ marginLeft: 24 }}>{children}</div>}
    </div>
  );
  const link = (to: string, text: string) => <a style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={() => onNavigate?.(to)}>{text}</a>;

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '22px 26px', boxSizing: 'border-box' }}>
      <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><Zap size={22} color="var(--accent)" /> Dây chuyền 1 chạm</h2>
      <p style={{ margin: '10px 0 18px', color: 'var(--text-muted)', fontSize: 13 }}>
        Dán link hoặc chọn video → H-MMO tự tải, hiệu chỉnh, tạo phụ đề + dịch, lồng tiếng, che logo, ghép phụ đề và xuất ra <b>4. Hoàn thành</b> — chạy hàng loạt.
        Các bước dùng đúng thiết lập bạn đã lưu ở từng tab. Chuyển tab khác vẫn chạy tiếp; lỗi ở bước nào thì bấm ↻ để chạy tiếp từ bước đó.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.25fr)', gap: 18, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {card('① Nguồn video', <>
            <textarea rows={4} value={links} onChange={(e) => setLinks(e.target.value)} placeholder="Dán 1 hoặc nhiều link YouTube / Douyin / TikTok... (mỗi dòng 1 link)"
              style={{ width: '100%', boxSizing: 'border-box', background: '#111', color: '#e5e7eb', border: '1px solid #333', padding: 8, fontSize: 13, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn-outline" style={{ padding: '7px 12px', display: 'flex', gap: 6, alignItems: 'center' }} onClick={addLinks}><Link2 size={14} /> Thêm link vào hàng đợi</button>
              <button className="btn-outline" style={{ padding: '7px 12px', display: 'flex', gap: 6, alignItems: 'center' }} onClick={addFiles}><Plus size={14} /> Thêm file từ máy</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Thiết lập bên dưới được "chụp" lại lúc thêm vào hàng đợi.</div>
          </>)}

          {card('② Các bước', <>
            {stepBox('download', 'Tải video', 'Chỉ áp dụng cho link. Douyin dùng cookie đã kết nối ở tab Douyin.', (
              <div style={row}><span style={label}>Chất lượng</span>
                <select value={cfg.quality} onChange={(e) => set('quality', e.target.value)} style={sel}>
                  <option value="best">Cao nhất</option><option value="1080">1080p</option><option value="720">720p</option><option value="480">480p</option>
                </select>
              </div>
            ))}
            {stepBox('transform', 'Hiệu chỉnh', 'Crop/zoom, lật, tốc độ, màu, logo, tỷ lệ khung, giảm giọng gốc... theo thiết lập đang lưu.', (
              <div style={{ fontSize: 12 }}>Chỉnh thông số ở {link('transform', 'tab Hiệu chỉnh video')}.</div>
            ))}
            {stepBox('subtitle', 'Phụ đề + dịch', 'Nhận diện lời nói thành phụ đề, rồi dịch sang tiếng Việt (gọn để vừa lồng tiếng).', <>
              <div style={row}><span style={label}>Nhận diện</span>
                <select value={cfg.stt} onChange={(e) => set('stt', e.target.value)} style={sel}>
                  <option value="Whisper (offline)">Whisper (offline, miễn phí)</option><option value="Gemini AI (online)">Gemini AI (online)</option>
                </select>
              </div>
              {cfg.stt.startsWith('Whisper') && <div style={row}><span style={label}>Độ chính xác</span>
                <select value={cfg.accuracy} onChange={(e) => set('accuracy', e.target.value)} style={sel}>
                  <option>Nhanh</option><option>Cân bằng</option><option>Chính xác cao</option>
                </select>
              </div>}
              <div style={row}><span style={label}>Ngôn ngữ gốc</span>
                <select value={cfg.lang} onChange={(e) => set('lang', e.target.value)} style={sel}>
                  {['Tự nhận diện', 'Tiếng Trung', 'Tiếng Anh', 'Tiếng Nhật', 'Tiếng Hàn', 'Tiếng Việt'].map((l) => <option key={l}>{l}</option>)}
                </select>
              </div>
              <div style={row}><span style={label}>Dịch tiếng Việt</span>
                <select value={cfg.translate} onChange={(e) => set('translate', e.target.value as any)} style={sel}>
                  <option value="google">Google (miễn phí)</option><option value="gemini">Gemini AI (hay hơn, cần key)</option><option value="none">Không dịch</option>
                </select>
              </div>
            </>)}
            {stepBox('dub', 'Lồng tiếng', 'Đọc phụ đề bằng giọng VieNeu, tự khớp thời gian (theo thiết lập ở tab Biên tập video).', (
              <div style={row}><span style={label}>Giọng đọc</span>
                <select value={cfg.voiceId} onChange={(e) => set('voiceId', e.target.value)} style={sel}>
                  {!cfg.voiceId && <option value="">— chọn giọng —</option>}
                  {voices.clones.length > 0 && <optgroup label="Giọng clone">{voices.clones.map((c) => <option key={c.name} value={`vieneu:clone:${c.name}`}>{c.name}</option>)}</optgroup>}
                  {voices.presets.length > 0 && <optgroup label="Giọng có sẵn">{voices.presets.map((p) => <option key={p.id} value={`vieneu:preset:${p.id}`}>{p.label}</option>)}</optgroup>}
                </select>
              </div>
            ))}
            {stepBox('export', 'Xuất video hoàn chỉnh', 'Ghép phụ đề có kiểu chữ, vùng che logo, trộn tiếng — kiểu dáng lấy từ tab Biên tập video.', <>
              <label style={{ fontSize: 13, display: 'flex', gap: 8, marginBottom: 4 }}><input type="checkbox" checked={cfg.burnSubs} onChange={(e) => set('burnSubs', e.target.checked)} /> Ghép phụ đề lên hình</label>
              <label style={{ fontSize: 13, display: 'flex', gap: 8, marginBottom: 4 }}><input type="checkbox" checked={cfg.useBlur} onChange={(e) => set('useBlur', e.target.checked)} /> Dùng các vùng che đã đặt ở tab Biên tập</label>
              <label style={{ fontSize: 13, display: 'flex', gap: 8, marginBottom: 4 }}><input type="checkbox" checked={cfg.flip} onChange={(e) => set('flip', e.target.checked)} /> Lật ngang</label>
              <div style={{ fontSize: 12 }}>Chỉnh kiểu chữ / vùng che ở {link('editor', 'tab Biên tập video')}.</div>
            </>)}
            {stepBox('review', 'Chấm chất lượng (AI)', 'Gemini chấm video cuối cùng và báo lỗi trước khi đăng.', (
              <div style={row}><span style={label}>Mức độ</span>
                <select value={cfg.reviewMode} onChange={(e) => set('reviewMode', e.target.value as any)} style={sel}>
                  <option value="light">Nhanh</option><option value="deep">Kỹ</option>
                </select>
              </div>
            ))}
          </>)}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {card(`Hàng đợi (${jobs.length})`, <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {!running
                ? <button className="btn-primary" style={{ flex: 1, padding: '11px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} disabled={!queued} onClick={() => pipeline.start()}>
                    <Play size={16} /> Chạy {queued || ''} video
                  </button>
                : <button className="btn-primary" style={{ flex: 1, padding: '11px 14px', background: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={() => pipeline.cancel()}>
                    <Square size={14} /> Dừng sau bước hiện tại
                  </button>}
              <button className="btn-outline" style={{ padding: '8px 12px' }} title="Xoá các video đã xong khỏi danh sách" onClick={() => pipeline.clearFinished()}>Dọn xong</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 460, overflowY: 'auto' }}>
              {jobs.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Chưa có video nào. Dán link hoặc thêm file ở bên trái.</div>}
              {jobs.map((j, i) => (
                <div key={j.id} style={{ background: 'rgba(255,255,255,0.03)', padding: '8px 10px', borderLeft: `3px solid ${j.status === 'error' ? '#ef4444' : j.status === 'done' ? '#22c55e' : j.status === 'running' ? 'var(--accent)' : '#333'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <span style={{ fontFamily: 'Consolas, monospace', color: 'var(--accent)' }}>#{i + 1}</span>
                    <Film size={13} color="var(--accent)" />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={j.source}>{j.title}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{JOB_TEXT[j.status]}</span>
                    {j.review && <span style={{ fontWeight: 700, color: VCOLOR[j.review.verdict] }} title={j.review.verdictText}>{j.review.overall.toFixed(1)}</span>}
                    {(j.status === 'error' || j.status === 'cancelled') && <button title="Chạy tiếp từ bước lỗi" onClick={() => { pipeline.retry(j.id); if (!running) pipeline.start(); }}><RotateCcw size={13} /></button>}
                    {j.status === 'done' && <button title="Chạy lại từ đầu" onClick={() => pipeline.restart(j.id)}><RotateCcw size={13} /></button>}
                    {j.files.final && <button title="Mở thư mục" onClick={() => ipc().invoke('assemble:reveal', j.files.final)}><FolderOpen size={13} /></button>}
                    {j.status !== 'running' && <button title="Bỏ khỏi danh sách" style={{ color: 'var(--text-muted)' }} onClick={() => pipeline.remove(j.id)}><Trash2 size={13} /></button>}
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    {STEPS.map((s) => (
                      <span key={s.key} title={`${s.label}: ${j.steps[s.key]}`} style={{ flex: 1, textAlign: 'center', fontSize: 10, padding: '2px 0',
                        background: ST_COLOR[j.steps[s.key]], color: j.steps[s.key] === 'skipped' ? '#666' : '#111', fontWeight: 700,
                        textDecoration: j.steps[s.key] === 'skipped' ? 'line-through' : undefined }}>{s.label}</span>
                    ))}
                  </div>
                  {j.error && <div style={{ fontSize: 12, color: '#f87171', marginTop: 4 }}>{j.error}</div>}
                </div>
              ))}
            </div>
          </>)}
          {card('Nhật ký', <div className="log-box" style={{ padding: 10, height: 260, overflowY: 'auto', fontSize: 12 }}>
            {logs.length === 0 && <div style={{ color: 'var(--text-muted)' }}>Chưa chạy.</div>}
            {logs.map((l, i) => <div key={i} style={{ color: /LỖI/.test(l) ? 'var(--danger)' : /✔/.test(l) ? '#22c55e' : undefined }}>{l}</div>)}
            <div ref={logEnd} />
          </div>, <button className="btn-outline" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => pipeline.clearLogs()}>Xoá</button>)}
        </div>
      </div>
    </div>
  );
}
