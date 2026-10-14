import { net } from 'electron'

// Dịch phụ đề SRT sang tiếng Việt (hoặc ngôn ngữ khác).
//  - 'google': Google Translate miễn phí (không cần key), dịch theo lô, giữ nguyên mốc thời gian
//  - 'gemini': dùng hàm gọi Gemini truyền vào (có key)

export type Cue = { idx: number; time: string; text: string }

export function parseSrtCues(srt: string): Cue[] {
  const out: Cue[] = []
  for (const block of srt.replace(/\r\n/g, '\n').trim().split(/\n\s*\n/)) {
    const lines = block.split('\n')
    const ti = lines.findIndex((l) => l.includes('-->'))
    if (ti < 0) continue
    out.push({ idx: out.length + 1, time: lines[ti].trim(), text: lines.slice(ti + 1).join('\n').trim() })
  }
  return out
}

export function buildSrt(cues: Cue[]): string {
  return cues.map((c, i) => `${i + 1}\n${c.time}\n${c.text}\n`).join('\n')
}

async function googleOnce(text: string, target: string, source = 'auto'): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${target}&dt=t&q=${encodeURIComponent(text)}`
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await net.fetch(url)
      if (r.status === 429) throw new Error('Google giới hạn tốc độ (429)')
      if (!r.ok) throw new Error(`Google Translate lỗi HTTP ${r.status}`)
      const j: any = await r.json()
      return (j[0] || []).map((p: any) => p[0]).join('')
    } catch (e) {
      if (attempt === 2) throw e
      await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)))
    }
  }
  return text
}

const SEP = '\n⟦§⟧\n' // dấu phân cách câu, Google giữ nguyên ký tự này

/** Dịch danh sách câu bằng Google miễn phí, gom nhiều câu/lần gọi (< ~4000 ký tự). */
export async function googleTranslateLines(lines: string[], target = 'vi', log?: (m: string) => void): Promise<string[]> {
  const out: string[] = new Array(lines.length)
  let batch: number[] = []
  let size = 0
  const flush = async () => {
    if (!batch.length) return
    const joined = batch.map((i) => lines[i].replace(/\n/g, ' ')).join(SEP)
    const res = await googleOnce(joined, target)
    const parts = res.split(/\s*⟦\s*§\s*⟧\s*/)
    if (parts.length === batch.length) {
      batch.forEach((i, k) => (out[i] = parts[k].trim()))
    } else {
      // Google gộp/lệch dấu phân cách -> dịch từng câu cho chắc
      for (const i of batch) out[i] = (await googleOnce(lines[i], target)).trim()
    }
    log?.(`Đã dịch ${out.filter((x) => x !== undefined).length}/${lines.length} câu...`)
    batch = []
    size = 0
    await new Promise((r) => setTimeout(r, 300))
  }
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) { out[i] = ''; continue }
    if (size + lines[i].length > 3800) await flush()
    batch.push(i)
    size += lines[i].length + SEP.length
  }
  await flush()
  return out
}

/** Dịch nguyên file SRT bằng Google, giữ nguyên số thứ tự & mốc thời gian. */
export async function googleTranslateSrt(srt: string, target = 'vi', log?: (m: string) => void): Promise<string> {
  const cues = parseSrtCues(srt)
  const tr = await googleTranslateLines(cues.map((c) => c.text), target, log)
  return buildSrt(cues.map((c, i) => ({ ...c, text: tr[i] || c.text })))
}
