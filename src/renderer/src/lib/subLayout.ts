// Dàn trang phụ đề dùng chung cho tab Biên tập video và Dây chuyền 1 chạm:
// đo độ rộng chữ thật bằng canvas (đúng font), ngắt dòng, tối đa 2 dòng/lần hiện, chia thời gian theo độ dài chữ.

export const EM = 0.87; // cỡ chữ ASS -> cỡ chữ CSS tương đương (libass tính cỡ theo chiều cao dòng)
export type Word = { w: string; s: number; e: number; n?: boolean };
export type Cue = { start: number; end: number; lines: Word[][] };
export type SrtItem = { startMs: number; endMs: number; text: string };
export type LayoutOpts = { fontSize: number; fontFamily: string; borderWidth: number; addBg: boolean; autoOptimize: boolean };
export type StyleOpts = LayoutOpts & {
  textColor: string; borderColor: string; highlightColor: string; subStyle: 'sentence' | 'word' | 'highlight';
  enableBounce: boolean; position: 'bottom' | 'center' | 'top'; marginPct: number;
};

export const CJK = /[぀-ヿ㐀-鿿가-힯豈-﫿]/;

/** Ngắt dòng theo độ rộng đo thật của font, gom tối đa 2 dòng/lần hiện, chia thời gian theo độ dài chữ. */
export function layoutCues(subs: SrtItem[], o: LayoutOpts, VW: number, VH: number): Cue[] {
  const size = (o.fontSize * VH) / 720;
  const bord = o.addBg ? size * 0.25 : (o.borderWidth * VH) / 720;
  const maxW = VW * 0.9 - bord * 2;
  const ctx = document.createElement('canvas').getContext('2d')!;
  ctx.font = `700 ${size * EM}px "${o.fontFamily}", Arial, sans-serif`;
  const width = (t: string) => ctx.measureText(t).width;
  const space = width(' ');
  const out: Cue[] = [];
  for (const sub of subs) {
    // tách từ; chữ Trung/Nhật/Hàn tách từng ký tự (không có dấu cách)
    const toks: { w: string; n?: boolean }[] = [];
    for (const raw of sub.text.split(/\s+/).filter(Boolean)) {
      if (CJK.test(raw)) Array.from(raw).forEach((ch, i) => toks.push({ w: ch, n: i > 0 ? true : undefined }));
      else toks.push({ w: raw });
    }
    if (!toks.length) continue;
    const total = toks.reduce((a, t) => a + Math.max(1, t.w.length), 0);
    let t = sub.startMs;
    const words: Word[] = toks.map((tk) => {
      const d = ((sub.endMs - sub.startMs) * Math.max(1, tk.w.length)) / total;
      const w = { w: tk.w, s: t, e: t + d, n: tk.n };
      t += d;
      return w;
    });
    // ngắt dòng
    const lines: Word[][] = [];
    let line: Word[] = [], lw = 0;
    for (const w of words) {
      const ww = width(w.w), add = line.length && !w.n ? space : 0;
      if (line.length && lw + add + ww > maxW) { lines.push(line); line = [{ ...w, n: undefined }]; lw = ww; }
      else { line.push(line.length ? w : { ...w, n: undefined }); lw += add + ww; }
    }
    if (line.length) lines.push(line);
    // tối đa 2 dòng mỗi lần hiện
    const per = o.autoOptimize ? 2 : lines.length;
    for (let i = 0; i < lines.length; i += per) {
      const chunk = lines.slice(i, i + per);
      const first = chunk[0][0], lastL = chunk[chunk.length - 1];
      const isLast = i + per >= lines.length;
      out.push({ start: i === 0 ? sub.startMs : first.s, end: isLast ? sub.endMs : lastL[lastL.length - 1].e, lines: chunk });
    }
  }
  return out;
}


/** Đọc nội dung file .srt -> danh sách câu (ms). */
export function parseSrtText(content: string): SrtItem[] {
  const toMs = (s: string) => {
    const [hms, ms = '0'] = s.trim().replace(',', '.').split('.');
    const [h, m, sec] = hms.split(':').map(Number);
    return (h * 3600 + m * 60 + sec) * 1000 + Number(ms.padEnd(3, '0').slice(0, 3));
  };
  const out: SrtItem[] = [];
  for (const block of (content || '').replace(/^\uFEFF/, '').replace(/\r/g, '').trim().split(/\n\s*\n/)) {
    const lines = block.split('\n');
    const ti = lines.findIndex((l) => l.includes('-->'));
    if (ti < 0) continue;
    const [a, b] = lines[ti].split('-->');
    const text = lines.slice(ti + 1).join(' ').replace(/<[^>]+>/g, '').trim();
    if (text) out.push({ startMs: toMs(a), endMs: toMs(b), text });
  }
  return out;
}

/** Kiểu phụ đề gửi sang bộ xuất video (đơn vị điểm ảnh của video). */
export function burnStyleOf(o: StyleOpts, VH: number) {
  return {
    font: o.fontFamily, size: (o.fontSize * VH) / 720, color: o.textColor, outlineColor: o.borderColor,
    border: (o.borderWidth * VH) / 720, addBg: o.addBg, highlightColor: o.highlightColor, mode: o.subStyle,
    bounce: o.enableBounce, position: o.position, marginV: (o.marginPct * VH) / 100
  };
}
