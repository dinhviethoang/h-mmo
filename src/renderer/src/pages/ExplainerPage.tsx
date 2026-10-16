import { ReactNode, useEffect, useRef, useState } from 'react'

type Script = { file: string; name: string; vid: string }
type Status = {
  vid: string; audio: string; storyboard: string; short: string; outLong: string; outShort: string
  audioLong: number; audioShort: number; storyboardScenes: number; shortScenes: number
  images: { total: number; present: string[]; missing: { name: string; desc: string; scene: number }[] } | null
  hasLayout: boolean; hasShortLayout: boolean; videoLong: string | null; videoShort: string | null; receiverRunning: boolean
}
type Step = 'audio' | 'storyboard' | 'images' | 'render-long' | 'short-storyboard' | 'render-short'
const STEP_NAMES: Record<Step, string> = { audio: 'Giọng đọc', storyboard: 'Phân cảnh', images: 'Hình ảnh', 'render-long': 'Dựng bản dài', 'short-storyboard': 'Phân cảnh Short', 'render-short': 'Dựng Short' }

export function ExplainerPage() {
  const [scripts, setScripts] = useState<Script[]>([]), [script, setScript] = useState(() => localStorage.getItem('explainerScript') || '')
  const [status, setStatus] = useState<Status | null>(null), [running, setRunning] = useState<Step | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: 0, message: '' }), [logs, setLogs] = useState<string[]>([]), [error, setError] = useState('')
  const [receiverOn, setReceiverOn] = useState(false), [settings, setSettings] = useState<any>(null), [showSettings, setShowSettings] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  const refresh = async (f = script) => { if (!f) return; const s = await window.api.explainerStatus(f); setStatus(s); setReceiverOn(s.receiverRunning) }
  useEffect(() => {
    window.api.explainerListScripts().then(list => { setScripts(list); if (!script && list[0]) setScript(list[0].file) })
    window.api.explainerSettings().then(setSettings)
    const offs = [
      window.api.onExplainerProgress(p => setProgress(p)),
      window.api.onExplainerLog(l => setLogs(x => [...x.slice(-400), l])),
      window.api.onExplainerReceiver(on => setReceiverOn(on))
    ]
    return () => offs.forEach(off => off())
  }, [])
  useEffect(() => { if (script) { localStorage.setItem('explainerScript', script); setStatus(null); refresh(script) } }, [script])
  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight) }, [logs])
  // khi đang nhận ảnh từ Muse: tự cập nhật số ảnh mỗi 5 giây
  useEffect(() => { if (!receiverOn || running) return; const t = setInterval(() => refresh(), 5000); return () => clearInterval(t) }, [receiverOn, running, script])

  async function run(step: Step) {
    setRunning(step); setError(''); setProgress({ done: 0, total: 0, message: 'Đang bắt đầu…' }); setLogs(x => [...x, `── ${STEP_NAMES[step]} ──`])
    try { setStatus(await window.api.explainerRun(script, step)); setProgress(p => ({ ...p, message: 'Xong.' })) }
    catch (e: any) { setError(String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')) ; refresh() }
    finally { setRunning(null) }
  }
  async function toggleReceiver() { try { setReceiverOn(await window.api.explainerReceiver(!receiverOn)) } catch (e: any) { setError(String(e?.message || e)) } }
  async function saveSettings() { setSettings(await window.api.explainerSaveSettings(settings)); setShowSettings(false); setScripts(await window.api.explainerListScripts()); refresh() }

  const btn = { padding: '8px 12px', borderRadius: 8, border: '1px solid #39435b', background: '#25314f', color: '#f6ebd9', cursor: 'pointer' } as const
  const primary = { ...btn, background: '#e8b04b', color: '#302c3b', fontWeight: 700 } as const
  const field = { padding: 8, borderRadius: 8, border: '1px solid #39435b', background: '#18223b', color: '#f6ebd9', minWidth: 260 } as const
  const s = status, img = s?.images
  const cards: { step: Step; ok: boolean; info: string; extra?: ReactNode }[] = s ? [
    { step: 'audio', ok: s.audioLong > 0, info: `Bản dài ${s.audioLong} file · Short ${s.audioShort} file`, extra: <button style={btn} onClick={() => window.api.explainerOpen(s.audio)}>Mở thư mục</button> },
    { step: 'storyboard', ok: s.storyboardScenes > 0, info: s.storyboardScenes ? `${s.storyboardScenes} cảnh` : 'Chưa có (Antigravity viết từ kịch bản)' },
    { step: 'images', ok: !!img && img.total > 0 && img.missing.length === 0, info: img ? `${img.present.length}/${img.total} hình` : 'Cần phân cảnh trước',
      extra: <><button style={{ ...btn, background: receiverOn ? '#2f6b4f' : btn.background }} onClick={toggleReceiver}>{receiverOn ? 'Đang nhận ảnh Muse · Tắt' : 'Bật nhận ảnh từ Muse'}</button><button style={btn} onClick={() => window.api.explainerOpen(settings?.imageDir)}>Mở thư mục ảnh</button></> },
    { step: 'render-long', ok: !!s.videoLong, info: s.videoLong ? 'Đã có video' : 'Chưa dựng', extra: s.videoLong ? <><button style={btn} onClick={() => window.api.explainerOpen(s.videoLong!)}>Mở video</button><button style={btn} onClick={() => window.api.explainerOpen(s.outLong)}>Mở thư mục</button></> : undefined },
    { step: 'render-short', ok: !!s.videoShort, info: `${s.videoShort ? 'Đã có video' : 'Chưa dựng'} · ${s.shortScenes ? `phân cảnh Short ${s.shortScenes} cảnh` : 'phân cảnh Short sẽ tự viết khi dựng'}`,
      extra: <>
        <button style={btn} disabled={!!running || !s.storyboardScenes} onClick={() => run('short-storyboard')}>{running === 'short-storyboard' ? 'Đang viết…' : s.shortScenes ? 'Viết lại phân cảnh Short' : 'Chỉ viết phân cảnh Short'}</button>
        {s.shortScenes > 0 && <button style={btn} onClick={() => window.api.explainerOpen(s.short)}>Sửa phân cảnh</button>}
        {s.videoShort && <><button style={btn} onClick={() => window.api.explainerOpen(s.videoShort!)}>Mở video</button><button style={btn} onClick={() => window.api.explainerOpen(s.outShort)}>Mở thư mục</button></>}
      </> }
  ] : []
  const pct = progress.total ? Math.round(progress.done / progress.total * 100) : 0

  return <div style={{ height: '100%', overflow: 'auto', padding: 24, color: '#f6ebd9', background: '#1e2a4a', fontFamily: 'Nunito, Segoe UI, sans-serif' }}>
    <h2 style={{ marginTop: 0 }}>Video vẽ tay · Whiteboard explainer</h2>
    <p style={{ color: '#c4cce0' }}>Kịch bản → giọng đọc → phân cảnh → hình clip-art → dựng video dài 16:9 và Short 9:16 (có logo). Bước đã xong sẽ được bỏ qua khi chạy lại.</p>
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
      <select style={field} value={script} onChange={e => setScript(e.target.value)}>
        {!scripts.length && <option value="">Không tìm thấy kịch bản .md</option>}
        {scripts.map(x => <option key={x.file} value={x.file}>{x.vid} · {x.name}</option>)}
      </select>
      <button style={btn} onClick={() => refresh()}>Làm mới</button>
      <button style={btn} onClick={() => setShowSettings(v => !v)}>Cài đặt</button>
    </div>
    {showSettings && settings && <div style={{ display: 'grid', gap: 8, padding: 14, borderRadius: 8, background: '#263454', marginBottom: 16 }}>
      {([['scriptDir', 'Thư mục kịch bản'], ['videoRoot', 'Thư mục video gốc'], ['imageDir', 'Thư mục ảnh clip-art'], ['python', 'Python (venv srt-whiteboard)'], ['voice', 'Giọng đọc (vieneu:default hoặc edge:vi-VN-HoaiMyNeural)']] as const).map(([k, label]) =>
        <label key={k} style={{ display: 'flex', gap: 10, alignItems: 'center' }}><span style={{ width: 300 }}>{label}</span><input style={{ ...field, flex: 1 }} value={settings[k]} onChange={e => setSettings({ ...settings, [k]: e.target.value })} /></label>)}
      <div><button style={primary} onClick={saveSettings}>Lưu cài đặt</button></div>
    </div>}

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginBottom: 16 }}>
      {cards.map((c, i) => <div key={c.step} style={{ padding: 14, borderRadius: 8, background: '#263454', borderLeft: `4px solid ${c.ok ? '#6cc59a' : '#e8b04b'}` }}>
        <div style={{ fontWeight: 700, fontSize: 17 }}>{i + 1}. {STEP_NAMES[c.step]} {c.ok && <span style={{ color: '#6cc59a' }}>✓</span>}</div>
        <div style={{ color: '#c4cce0', margin: '6px 0 10px' }}>{c.info}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={primary} disabled={!!running || !script} onClick={() => run(c.step)}>{running === c.step ? 'Đang chạy…' : c.ok ? 'Chạy lại' : 'Chạy'}</button>
          {c.extra}
        </div>
      </div>)}
    </div>

    {(running || progress.message) && <div style={{ marginBottom: 12 }}>
      <progress value={pct} max={100} style={{ width: '100%', height: 16 }} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
        <span style={{ flex: 1 }}>{running ? STEP_NAMES[running] + ' · ' : ''}{progress.total ? `${progress.done}/${progress.total} · ` : ''}{progress.message}</span>
        <button style={btn} disabled={!running} onClick={() => window.api.explainerCancel()}>Dừng</button>
      </div>
    </div>}
    {error && <div style={{ padding: 10, borderRadius: 8, background: '#5a2a35', color: '#ffd6dc', marginBottom: 12, whiteSpace: 'pre-wrap' }}>{error}</div>}

    {img && img.missing.length > 0 && <>
      <h3>Hình còn thiếu · {img.missing.length}</h3>
      <div style={{ display: 'grid', gap: 6, marginBottom: 16 }}>{img.missing.map(m => <div key={m.name} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 8, borderRadius: 8, background: '#263454' }}>
        <b style={{ width: 120 }}>{m.name}</b><span style={{ flex: 1, opacity: .85 }}>Cảnh {m.scene}: {m.desc}</span>
        <button style={btn} onClick={() => navigator.clipboard.writeText(m.desc)}>Chép mô tả</button>
      </div>)}</div>
    </>}

    <h3>Nhật ký</h3>
    <div ref={logRef} style={{ height: 220, overflow: 'auto', padding: 10, borderRadius: 8, background: '#121a2e', fontFamily: 'Consolas, monospace', fontSize: 12, whiteSpace: 'pre-wrap' }}>{logs.join('\n')}</div>
  </div>
}
