import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Download, Copy, Trash2, FolderOpen } from 'lucide-react';

const ipc = () => (window as any).electron.ipcRenderer;
type LogLine = { t: number; ch: string; msg: string };

const CH_NAMES: Record<string, string> = {
  'download-progress': 'Tải xuống', subtitle: 'Phụ đề', video: 'Biên tập', dubbing: 'Lồng tiếng', voice: 'Giọng đọc',
  transform: 'Hiệu chỉnh', ocr: 'Đọc chữ', system: 'Hệ thống', autoshorts: 'Auto Shorts'
};

export function SystemPage() {
  const [st, setSt] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [filter, setFilter] = useState<'all' | 'error'>('all');
  const end = useRef<HTMLDivElement>(null);

  const refresh = async () => {
    setLoading(true);
    try { setSt(await ipc().invoke('system:status')); } catch (e: any) { setSt({ error: e.message }); }
    setLoading(false);
  };
  useEffect(() => {
    refresh();
    ipc().invoke('logs:get').then((l: LogLine[]) => setLogs(l || [])).catch(() => {});
    const h = (_e: any, line: LogLine) => setLogs((p) => [...p.slice(-2999), line]);
    ipc().on('logs:new', h);
    return () => ipc().removeListener('logs:new', h);
  }, []);
  useEffect(() => end.current?.scrollIntoView(), [logs, filter]);

  const shown = useMemo(() => (filter === 'error' ? logs.filter((l) => /LỖI|ERROR|Error|lỗi|thất bại/.test(l.msg)) : logs), [logs, filter]);
  const fmt = (l: LogLine) => `${new Date(l.t).toLocaleTimeString('vi-VN')} [${CH_NAMES[l.ch] || l.ch}] ${l.msg}`;

  const updateYtdlp = async () => {
    setUpdating(true);
    try { await ipc().invoke('system:updateYtdlp'); await refresh(); }
    catch (e: any) { setLogs((p) => [...p, { t: Date.now(), ch: 'system', msg: `[LỖI] ${e.message}` }]); }
    setUpdating(false);
  };

  const ok = (v: any) => <span style={{ color: v ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>{v ? '●' : '○'}</span>;
  const row = (name: string, value: any, extra?: any) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px dashed #2a2e33', fontSize: 13 }}>
      {ok(value)}<span style={{ width: 170 }}>{name}</span>
      <span style={{ flex: 1, fontFamily: 'Consolas, monospace', color: value ? 'var(--text-secondary)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || 'chưa có'}</span>
      {extra}
    </div>
  );
  const m = st?.modules || {};

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '22px 26px', boxSizing: 'border-box' }}>
      <h2 style={{ margin: 0 }}>Hệ thống</h2>
      <p style={{ margin: '10px 0 18px', color: 'var(--text-muted)', fontSize: 13 }}>Trạng thái công cụ, cập nhật bộ tải video và nhật ký của mọi tab (gửi phần lỗi cho người hỗ trợ khi cần).</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.3fr)', gap: 18, alignItems: 'start' }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <h3 style={{ margin: 0, fontSize: 15, textTransform: 'uppercase', letterSpacing: 1, flex: 1 }}>Công cụ</h3>
            <button className="btn-outline" style={{ padding: '6px 10px' }} onClick={refresh} disabled={loading}><RefreshCw size={14} /></button>
          </div>
          {!st ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Đang kiểm tra...</div> : <>
            {row('yt-dlp (tải video)', st.ytdlp,
              <button className="btn-primary" style={{ padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }} disabled={updating} onClick={updateYtdlp}>
                <Download size={13} /> {updating ? 'Đang cập nhật...' : 'Cập nhật'}
              </button>)}
            {row('ffmpeg (xử lý video)', st.ffmpeg)}
            {row('Python', st.python)}
            {row('Whisper (phụ đề)', m.faster_whisper)}
            {row('RapidOCR (đọc chữ)', m.rapidocr_onnxruntime)}
            {row('VieNeu (giọng đọc)', m.vieneu)}
            {row('Tách giọng (AI)', m.audio_separator)}
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
              Thư viện chưa có sẽ tự cài khi dùng tính năng lần đầu. Khi tải YouTube/Douyin bị lỗi lạ, bấm <b>Cập nhật</b> yt-dlp trước.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
              <span style={{ flex: 1 }}>Electron {st.app?.electron} · Node {st.app?.node}</span>
              <button className="btn-outline" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => ipc().invoke('workspace:open', 'root')}><FolderOpen size={12} /> Thư mục làm việc</button>
            </div>
          </>}
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 15, textTransform: 'uppercase', letterSpacing: 1, flex: 1 }}>Nhật ký ({shown.length})</h3>
            <select value={filter} onChange={(e) => setFilter(e.target.value as any)} style={{ padding: '5px 8px', fontSize: 12 }}>
              <option value="all">Tất cả</option>
              <option value="error">Chỉ lỗi</option>
            </select>
            <button className="btn-outline" title="Copy nhật ký đang hiện" style={{ padding: '6px 10px' }}
              onClick={() => ipc().invoke('logs:copy', shown.slice(-400).map(fmt).join('\n'))}><Copy size={14} /></button>
            <button className="btn-outline" title="Xoá nhật ký" style={{ padding: '6px 10px' }} onClick={async () => { await ipc().invoke('logs:clear'); setLogs([]); }}><Trash2 size={14} /></button>
          </div>
          <div className="log-box" style={{ padding: 12, height: 460, overflowY: 'auto', fontSize: 12 }}>
            {shown.length === 0 && <div style={{ color: 'var(--text-muted)' }}>Chưa có nhật ký.</div>}
            {shown.map((l, i) => <div key={i} style={{ color: /LỖI|ERROR|Error/.test(l.msg) ? 'var(--danger)' : undefined }}>{fmt(l)}</div>)}
            <div ref={end} />
          </div>
        </div>
      </div>
    </div>
  );
}
