// "Dây chuyền 1 chạm": chạy lần lượt Tải → Hiệu chỉnh → Phụ đề (+dịch) → Lồng tiếng → Xuất (phụ đề, vùng che) → Chấm điểm
// cho từng video, dùng lại đúng các bộ xử lý của từng tab. Trạng thái nằm ở cấp module nên chuyển tab không làm dừng.
// Mỗi video nhớ kết quả từng bước -> chạy lại sẽ tiếp tục từ bước bị lỗi.

import { layoutCues, parseSrtText, burnStyleOf } from './subLayout';
import { loadEditorOpts } from '../pages/EditorPage';
import { loadTransformOpts } from '../pages/TransformPage';

export type StepKey = 'download' | 'transform' | 'subtitle' | 'dub' | 'export' | 'review';
export const STEPS: { key: StepKey; label: string }[] = [
  { key: 'download', label: 'Tải' },
  { key: 'transform', label: 'Hiệu chỉnh' },
  { key: 'subtitle', label: 'Phụ đề' },
  { key: 'dub', label: 'Lồng tiếng' },
  { key: 'export', label: 'Xuất' },
  { key: 'review', label: 'Chấm điểm' }
];
export type StepState = 'pending' | 'running' | 'done' | 'skipped' | 'error';

export type PipeConfig = {
  steps: Record<StepKey, boolean>;
  quality: string;
  stt: string;        // 'Whisper (offline)' | 'Gemini AI (online)'
  accuracy: string;   // 'Nhanh' | 'Cân bằng' | 'Chính xác cao'
  lang: string;       // 'Tự nhận diện' | 'Tiếng Trung' ...
  translate: 'none' | 'google' | 'gemini';
  voiceId: string;
  burnSubs: boolean;
  useBlur: boolean;
  flip: boolean;
  reviewMode: 'light' | 'deep';
};
export const DEFAULT_CONFIG: PipeConfig = {
  steps: { download: true, transform: true, subtitle: true, dub: true, export: true, review: false },
  quality: 'best', stt: 'Whisper (offline)', accuracy: 'Cân bằng', lang: 'Tự nhận diện', translate: 'google',
  voiceId: '', burnSubs: true, useBlur: true, flip: false, reviewMode: 'light'
};

export type JobFiles = { src?: string; edited?: string; srt?: string; final?: string; pcm?: string };
export type Job = {
  id: string;
  source: string; // link hoặc đường dẫn file
  title: string;
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
  steps: Record<StepKey, StepState>;
  files: JobFiles;
  error?: string;
  review?: { overall: number; verdict: string; verdictText: string };
  config: PipeConfig; // thiết lập lúc thêm vào (chạy lại vẫn dùng đúng thiết lập đó)
  at: number;
};

const JOBS_KEY = 'hmmo-pipeline-jobs';
const ipc = () => (window as any).electron.ipcRenderer;
const isUrl = (s: string) => /^https?:\/\//i.test(s);
const baseName = (p: string) => p.split(/[\\/]/).pop() || p;
const freshSteps = (): Record<StepKey, StepState> => ({ download: 'pending', transform: 'pending', subtitle: 'pending', dub: 'pending', export: 'pending', review: 'pending' });

// ---------- kho trạng thái ----------
let jobs: Job[] = (() => {
  try {
    const j = JSON.parse(localStorage.getItem(JOBS_KEY) || '[]') as Job[];
    // việc đang chạy dở khi tắt app -> coi như lỗi để chạy tiếp
    return j.map((x) => (x.status === 'running' ? { ...x, status: 'error', error: 'Bị dừng giữa chừng (app đã tắt)' } : x));
  } catch { return []; }
})();
let running = false;
let cancelReq = false;
let logs: string[] = [];
const subs = new Set<() => void>();
const emit = () => {
  try { localStorage.setItem(JOBS_KEY, JSON.stringify(jobs.slice(-200))); } catch { /* bỏ qua */ }
  subs.forEach((f) => f());
};
export const pipeline = {
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
  get jobs() { return jobs; },
  get running() { return running; },
  get logs() { return logs; },
  add(sources: string[], config: PipeConfig) {
    const now = Date.now();
    const add = sources.map((s, i) => ({
      id: `${now}-${i}-${Math.random().toString(36).slice(2, 7)}`, source: s, title: isUrl(s) ? s : baseName(s),
      status: 'queued' as const, steps: freshSteps(), files: isUrl(s) ? {} : { src: s }, config: JSON.parse(JSON.stringify(config)), at: now
    }));
    jobs = [...jobs, ...add];
    emit();
  },
  remove(id: string) { jobs = jobs.filter((j) => j.id !== id || j.status === 'running'); emit(); },
  clearFinished() { jobs = jobs.filter((j) => j.status !== 'done'); emit(); },
  retry(id: string) { jobs = jobs.map((j) => (j.id === id && j.status !== 'running' ? { ...j, status: 'queued', error: undefined } : j)); emit(); },
  restart(id: string) { jobs = jobs.map((j) => (j.id === id && j.status !== 'running' ? { ...j, status: 'queued', error: undefined, steps: freshSteps(), files: isUrl(j.source) ? {} : { src: j.source }, review: undefined } : j)); emit(); },
  cancel() { cancelReq = true; ipc().invoke('download:cancel').catch(() => {}); log('Sẽ dừng sau bước đang chạy...'); },
  clearLogs() { logs = []; emit(); },
  start() { if (!running) void runAll(); }
};

function log(m: string) { logs = [...logs.slice(-800), m]; emit(); }
function patch(id: string, p: Partial<Job> | ((j: Job) => Partial<Job>)) {
  jobs = jobs.map((j) => (j.id === id ? { ...j, ...(typeof p === 'function' ? p(j) : p) } : j));
  emit();
}
const setStep = (id: string, k: StepKey, s: StepState) => patch(id, (j) => ({ steps: { ...j.steps, [k]: s } }));
const clean = (e: any) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

// ---------- font riêng (để đo chữ đúng font khi dàn trang phụ đề) ----------
let fontsLoaded = false;
async function ensureFonts() {
  if (fontsLoaded) return;
  fontsLoaded = true;
  try {
    for (const f of (await ipc().invoke('fonts:list')) || []) {
      if ([...(document as any).fonts].some((x: FontFace) => x.family === f.family)) continue;
      const data = await ipc().invoke('fonts:data', f.file);
      if (!data) continue;
      const face = new FontFace(f.family, new Uint8Array(data));
      await face.load();
      (document as any).fonts.add(face);
    }
  } catch { /* bỏ qua */ }
}

// ---------- từng bước ----------
async function stepDownload(j: Job): Promise<string> {
  const douyin = /douyin\.com|iesdouyin\.com/i.test(j.source);
  let cookie = 'none';
  try { cookie = JSON.parse(localStorage.getItem(`hmmo-dl-${douyin ? 'Douyin' : 'YouTube'}`) || '{}').cookie || 'none'; } catch { /* mặc định */ }
  let file = '';
  let err = '';
  const h = (_e: any, u: any) => { if (u?.id === j.id) { if (u.file) file = u.file; if (u.error) err = u.error; } };
  ipc().on('download:item', h);
  try {
    await ipc().invoke('download:start', [{ id: j.id, url: j.source, title: j.title }], {
      savePath: 'Downloads', cookie, quality: j.config.quality, mode: 'video', audioFormat: 'mp3', template: 'title',
      concurrency: 1, embedThumb: false, embedMeta: false, skipDownloaded: false
    });
  } finally { ipc().removeListener('download:item', h); }
  if (!file) throw new Error(err || 'Tải không thành công (không nhận được file).');
  return file;
}

async function stepTransform(src: string): Promise<string> {
  const done: string[] = await ipc().invoke('transform:run', [src], loadTransformOpts(), '', '_edit');
  if (!done?.length) throw new Error('Hiệu chỉnh thất bại (xem nhật ký).');
  return done[0];
}

async function stepSubtitle(video: string, c: PipeConfig): Promise<string> {
  const apiKey = localStorage.getItem('geminiApiKey') || '';
  if ((c.stt.startsWith('Gemini') || c.translate === 'gemini') && !apiKey) throw new Error('Chưa có API Key Gemini (nhập ở tab Tạo phụ đề).');
  const out: string = await (window as any).api.generateSubtitle({
    videoPath: video, apiKey, translateEnabled: c.translate !== 'none',
    aiEngine: c.translate === 'gemini' ? 'Gemini AI' : 'Google (Miễn phí)', sttEngine: c.stt, accuracy: c.accuracy, lang: c.lang
  });
  // có bản dịch thì dùng bản dịch, không thì dùng phụ đề gốc
  if (out && (await (window as any).api.readFile(out)) != null) return out;
  const orig = String(out || '').replace(/_vi\.srt$/i, '.srt');
  if ((await (window as any).api.readFile(orig)) != null) return orig;
  throw new Error('Không tạo được phụ đề.');
}

async function stepDub(video: string, srt: string, c: PipeConfig): Promise<string> {
  const e = loadEditorOpts();
  const voiceId = c.voiceId || e.voiceId;
  if (!voiceId || voiceId === 'google-free') throw new Error('Chưa chọn giọng đọc cho dây chuyền.');
  return await ipc().invoke('dubbing:generate', {
    videoPath: video, srtPath: srt, voiceId, previewMode: false, flipVideo: false,
    fit: { enabled: e.fitEnabled, maxRate: e.fitMaxRate, borrowGap: e.fitBorrowGap }
  });
}

async function stepExport(video: string, srt: string | undefined, pcm: string | undefined, c: PipeConfig): Promise<string> {
  const e = loadEditorOpts();
  const info = await ipc().invoke('assemble:probe', video);
  const VW = info?.w || 1080, VH = info?.h || 1920;
  let assCues: any = null;
  if (c.burnSubs && srt) {
    await ensureFonts();
    assCues = layoutCues(parseSrtText((await (window as any).api.readFile(srt)) || ''), e, VW, VH);
  }
  return await (window as any).api.processVideo({
    videoPath: video, dubbedAudioPath: pcm || null, srtPath: srt || null,
    blurRegions: c.useBlur && e.enableBlur ? e.blurRegions : [],
    assCues, burnStyle: burnStyleOf(e, VH), applySubtitles: !!(c.burnSubs && srt),
    fontSize: e.fontSize, textColor: e.textColor, borderColor: e.borderColor, borderWidth: e.borderWidth, addBg: e.addBg, fontFamily: e.fontFamily,
    bgVolume: e.bgVolume / 100, dubVolume: e.dubVolume / 100, flipVideo: c.flip, previewMode: false, noReveal: true
  });
}

// ---------- vòng chạy ----------
const LOG_CHANNELS = ['download-progress', 'transform:log', 'subtitle:log', 'dubbing:log', 'video:log', 'review:log'];

async function runAll() {
  running = true;
  cancelReq = false;
  emit();
  let cur = '';
  const fwd = (_e: any, m: string) => { if (typeof m === 'string' && !/^\[CMD\]/.test(m)) log(`${cur} ${m}`); };
  LOG_CHANNELS.forEach((ch) => ipc().on(ch, fwd));
  try {
    for (;;) {
      if (cancelReq) break;
      const j = jobs.find((x) => x.status === 'queued');
      if (!j) break;
      const idx = jobs.indexOf(j) + 1;
      cur = `[#${idx}]`;
      patch(j.id, { status: 'running', error: undefined });
      log(`${cur} ▶ Bắt đầu: ${j.title}`);
      try {
        await runJob(j.id, cur);
        patch(j.id, { status: 'done' });
        log(`${cur} ✔ Hoàn tất${jobs.find((x) => x.id === j.id)?.files.final ? ': ' + jobs.find((x) => x.id === j.id)!.files.final : ''}`);
      } catch (e: any) {
        const cancelled = cancelReq && /huỷ|cancel/i.test(clean(e));
        patch(j.id, { status: cancelled ? 'cancelled' : 'error', error: clean(e) });
        log(`${cur} [LỖI] ${clean(e)}`);
      }
    }
  } finally {
    LOG_CHANNELS.forEach((ch) => ipc().removeListener(ch, fwd));
    running = false;
    log(cancelReq ? '■ Đã dừng dây chuyền.' : '■ Dây chuyền đã chạy xong hàng đợi.');
    cancelReq = false;
    emit();
  }
}

async function runJob(id: string, cur: string) {
  const get = () => jobs.find((x) => x.id === id)!;
  const c = get().config;
  const order: StepKey[] = ['download', 'transform', 'subtitle', 'dub', 'export', 'review'];
  for (const k of order) {
    const j = get();
    if (j.steps[k] === 'done' || j.steps[k] === 'skipped') continue;
    if (cancelReq) throw new Error('Đã huỷ');
    const enabled = c.steps[k] && !(k === 'download' && !isUrl(j.source)) && !(k === 'dub' && !c.steps.subtitle && !j.files.srt);
    if (!enabled) { setStep(id, k, 'skipped'); continue; }
    setStep(id, k, 'running');
    log(`${cur} — ${STEPS.find((s) => s.key === k)!.label}...`);
    try {
      const f = j.files;
      const video = f.edited || f.src || '';
      if (k === 'download') {
        const src = await stepDownload(j);
        patch(id, (x) => ({ files: { ...x.files, src }, title: baseName(src) }));
      } else if (k === 'transform') {
        const edited = await stepTransform(f.src!);
        patch(id, (x) => ({ files: { ...x.files, edited } }));
      } else if (k === 'subtitle') {
        const srt = await stepSubtitle(video, c);
        patch(id, (x) => ({ files: { ...x.files, srt } }));
      } else if (k === 'dub') {
        const pcm = await stepDub(video, f.srt!, c);
        patch(id, (x) => ({ files: { ...x.files, pcm } }));
      } else if (k === 'export') {
        const final = await stepExport(video, f.srt, c.steps.dub ? f.pcm : undefined, c);
        patch(id, (x) => ({ files: { ...x.files, final } }));
      } else if (k === 'review') {
        const apiKey = localStorage.getItem('geminiApiKey') || '';
        if (!apiKey) throw new Error('Chưa có API Key Gemini để chấm điểm.');
        const r = await ipc().invoke('review:run', { video: f.final || video, mode: c.reviewMode, apiKey });
        patch(id, { review: { overall: r.overall, verdict: r.verdict, verdictText: r.verdictText } });
      }
      if (k !== 'download' && k !== 'review' && !get().files.src) throw new Error('Thiếu video nguồn.');
      setStep(id, k, 'done');
    } catch (e) {
      setStep(id, k, 'error');
      // chấm điểm là bước phụ: lỗi thì báo nhưng video vẫn tính là xong
      if (k === 'review') { patch(id, { error: 'Chấm điểm: ' + clean(e) }); log(`${cur} ⚠ Bỏ qua chấm điểm: ${clean(e)}`); continue; }
      throw e;
    }
  }
}
