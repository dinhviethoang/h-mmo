import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Mic, Play, Trash2, Plus, FolderOpen, RefreshCw } from 'lucide-react';

type Preset = { label: string; id: string };
type Clone = { name: string; file: string; createdAt: number };

const api = () => (window as any).api;
const fileUrl = (p: string) => `hmmo-media://f/${encodeURIComponent(p)}`;

const C = {
  card: { background: '#1b1f27', border: '1px solid #2a2f3a', borderRadius: 10, padding: 18 } as const,
  input: { background: '#111', color: '#fff', border: '1px solid #374151', borderRadius: 6, padding: '8px 10px', outline: 'none', fontSize: 14 } as const,
  btn: { background: '#f97316', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 } as const,
  ghost: { background: 'transparent', color: '#d1d5db', border: '1px solid #374151', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 } as const,
  label: { fontSize: 13, color: '#9ca3af', marginBottom: 6, display: 'block' } as const,
  h3: { margin: '0 0 12px', fontSize: 16, color: '#fff' } as const
};

export function VoicePage() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [clones, setClones] = useState<Clone[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<string[]>(['Sẵn sàng.']);
  const [previewText, setPreviewText] = useState('Xin chào các bạn, chào mừng đến với kênh của mình. Hôm nay mình sẽ kể cho các bạn nghe một câu chuyện thú vị.');
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  // form clone
  const [cloneName, setCloneName] = useState('');
  const [cloneSource, setCloneSource] = useState<string | null>(null);
  const [cloneStart, setCloneStart] = useState(0);
  const [cloneDur, setCloneDur] = useState(8);
  const logEnd = useRef<HTMLDivElement>(null);

  const addLog = (m: string) => setLogs((p) => [...p.slice(-200), m]);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await api().voiceList();
      setPresets(r.presets || []);
      setClones(r.clones || []);
      if (r.error) addLog(`[LỖI] ${r.error}`);
    } catch (e: any) {
      addLog(`[LỖI] ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api().onVoiceLog(addLog);
    refresh();
  }, []);
  useEffect(() => logEnd.current?.scrollIntoView({ behavior: 'smooth' }), [logs]);

  const preview = async (voiceId: string) => {
    if (busy) return;
    setBusy(true);
    setPlayingId(voiceId);
    try {
      const out = await api().voicePreview({ voiceId, text: previewText });
      setAudioSrc(fileUrl(out) + `?t=${Date.now()}`);
    } catch (e: any) {
      addLog(`[LỖI] ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const pickSource = async () => {
    const f = await api().voicePickAudio();
    if (f) {
      setCloneSource(f);
      if (!cloneName) setCloneName(f.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, '').slice(0, 40));
    }
  };

  const saveClone = async () => {
    try {
      const r = await api().voiceAddClone({ name: cloneName, source: cloneSource, start: cloneStart, duration: cloneDur });
      addLog(`Đã thêm giọng "${r.name}". Bấm "Nghe thử" để kiểm tra.`);
      setCloneName('');
      setCloneSource(null);
      setCloneStart(0);
      refresh();
    } catch (e: any) {
      addLog(`[LỖI] ${e.message}`);
    }
  };

  const removeClone = async (name: string) => {
    if (!confirm(`Xoá giọng "${name}"?`)) return;
    await api().voiceDeleteClone(name);
    refresh();
  };

  const row = (id: string, title: string, sub: string, extra?: ReactNode) => (
    <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: playingId === id ? '#2a1d12' : '#14171d', border: `1px solid ${playingId === id ? '#f97316' : '#232833'}` }}>
      <Mic size={16} color="#f97316" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#fff', fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        <div style={{ color: '#6b7280', fontSize: 12 }}>{sub}</div>
      </div>
      <button style={C.ghost} disabled={busy} onClick={() => preview(id)}>
        <Play size={14} /> {busy && playingId === id ? 'Đang tạo...' : 'Nghe thử'}
      </button>
      {extra}
    </div>
  );

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '24px 28px', color: '#e5e7eb', boxSizing: 'border-box' }}>
      <h2 style={{ margin: 0, color: '#fff' }}>Giọng đọc</h2>
      <p style={{ margin: '4px 0 20px', color: '#9ca3af', fontSize: 14 }}>
        Giọng tiếng Việt chạy trên máy (VieNeu-TTS) và clone giọng từ 3–15 giây mẫu. Giọng ở đây dùng được trong tab Biên tập video → Lồng tiếng.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 18 }}>
        {/* Cột trái: clone + nghe thử */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={C.card}>
            <h3 style={C.h3}>Clone giọng mới</h3>
            <label style={C.label}>File mẫu (âm thanh hoặc video có giọng nói rõ, ít nhạc nền)</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div style={{ ...C.input, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: cloneSource ? '#fff' : '#6b7280' }} title={cloneSource || ''}>
                {cloneSource || 'Chưa chọn file'}
              </div>
              <button style={C.ghost} onClick={pickSource}><FolderOpen size={14} /> Chọn</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={C.label}>Tên giọng</label>
                <input style={{ ...C.input, width: '100%', boxSizing: 'border-box' }} value={cloneName} onChange={(e) => setCloneName(e.target.value)} placeholder="VD: Giọng nam kể chuyện" />
              </div>
              <div>
                <label style={C.label}>Bắt đầu (giây)</label>
                <input type="number" min={0} style={{ ...C.input, width: '100%', boxSizing: 'border-box' }} value={cloneStart} onChange={(e) => setCloneStart(Number(e.target.value))} />
              </div>
              <div>
                <label style={C.label}>Độ dài (3–15s)</label>
                <input type="number" min={3} max={15} style={{ ...C.input, width: '100%', boxSizing: 'border-box' }} value={cloneDur} onChange={(e) => setCloneDur(Number(e.target.value))} />
              </div>
            </div>
            <button style={{ ...C.btn, opacity: cloneSource && cloneName ? 1 : 0.5 }} disabled={!cloneSource || !cloneName} onClick={saveClone}>
              <Plus size={14} /> Lưu giọng
            </button>
            <p style={{ color: '#6b7280', fontSize: 12, margin: '10px 0 0' }}>
              Chỉ clone giọng của bạn hoặc người đã đồng ý. Mẫu tốt nhất: 6–10 giây, một người nói, không nhạc nền.
            </p>
          </div>

          <div style={C.card}>
            <h3 style={C.h3}>Câu nghe thử</h3>
            <textarea style={{ ...C.input, width: '100%', minHeight: 80, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} value={previewText} onChange={(e) => setPreviewText(e.target.value)} />
            {audioSrc && <audio key={audioSrc} src={audioSrc} controls autoPlay style={{ width: '100%', marginTop: 12 }} />}
          </div>

          <div style={{ ...C.card, padding: 12 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#9ca3af', maxHeight: 140, overflowY: 'auto' }}>
              {logs.map((l, i) => (
                <div key={i} style={{ color: l.startsWith('[LỖI]') ? '#f87171' : undefined }}>{l}</div>
              ))}
              <div ref={logEnd} />
            </div>
          </div>
        </div>

        {/* Cột phải: danh sách giọng */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={C.card}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ ...C.h3, margin: 0, flex: 1 }}>Giọng đã clone ({clones.length})</h3>
              <button style={C.ghost} onClick={refresh} disabled={loading}><RefreshCw size={14} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {clones.length === 0 && <div style={{ color: '#6b7280', fontSize: 13 }}>Chưa có giọng clone nào.</div>}
              {clones.map((c) =>
                row(`vieneu:clone:${c.name}`, c.name, `Clone · ${new Date(c.createdAt).toLocaleDateString('vi-VN')}`,
                  <button style={{ ...C.ghost, color: '#f87171' }} onClick={() => removeClone(c.name)} title="Xoá"><Trash2 size={14} /></button>)
              )}
            </div>
          </div>

          <div style={C.card}>
            <h3 style={C.h3}>Giọng có sẵn ({presets.length})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {loading && presets.length === 0 && <div style={{ color: '#6b7280', fontSize: 13 }}>Đang tải danh sách giọng (lần đầu có thể cài VieNeu, 1–3 phút)...</div>}
              {presets.map((p) => row(`vieneu:preset:${p.id}`, p.label, 'VieNeu-TTS'))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
