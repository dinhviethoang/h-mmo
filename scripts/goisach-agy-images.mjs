#!/usr/bin/env node
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const value = (key, fallback = '') => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1] }
const help = `Cách dùng: node scripts/goisach-agy-images.mjs --script <kich-ban.md> --out <thư mục ảnh> [--only shorts|long] [--limit N] [--force]`
if (args.includes('--help') || args.includes('-h')) { console.log(help); process.exit(0) }
const script = value('--script'), out = value('--out'), only = value('--only', 'shorts'), limit = Number(value('--limit', '0')) || 0, force = args.includes('--force')
if (!script || !out || !fs.existsSync(script) || !['shorts', 'long'].includes(only) || (value('--limit') && (!Number.isInteger(limit) || limit < 1))) {
  console.error(help); process.exit(2)
}

// Load the same TypeScript engine/parser used by goisach-render.mjs.
require.extensions['.ts'] = (module, filename) => {
  const ts = require('typescript'), source = fs.readFileSync(filename, 'utf8')
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename)
}
const { parseScript } = require(path.join(root, 'src', 'main', 'goiSachEngine.ts'))
const { ffmpegPath } = require(path.join(root, 'src', 'main', 'tools.ts'))
const allScenes = parseScript(path.resolve(script))
const scenes = allScenes.filter(s => s.shorts === (only === 'shorts')).slice(0, limit || undefined)
if (!scenes.length) { console.error(`Không tìm thấy cảnh ${only} trong kịch bản.`); process.exit(2) }
fs.mkdirSync(out, { recursive: true })

// Keep row ordering aligned with parseScript's table traversal, including the matching [HÌNH: ...] description.
const md = fs.readFileSync(script, 'utf8').replace(/^\uFEFF/, '')
const shortAt = md.search(/^##\s+K.{0,3}CH B.{0,4}N YOUTUBE SHORTS/im)
const tableMd = only === 'shorts' ? (shortAt < 0 ? '' : md.slice(shortAt)) : (shortAt < 0 ? md : md.slice(0, shortAt))
const rowDescriptions = []
for (const line of tableMd.split(/\r?\n/)) {
  if (!/^\|/.test(line)) continue
  const cells = line.trim().replace(/\|$/, '').split('|').slice(1).map(x => x.trim())
  if (cells.length < 3 || /mốc thời gian|thời gian/i.test(cells[0]) || !cells[cells.length - 1]) continue
  const image = cells.slice(1, -1).join(' | ')
  const match = image.match(/\[H[^:\]]{1,4}NH:\s*(.*?)\s*\]/i)
  rowDescriptions.push(match?.[1]?.trim() || '')
}
const brain = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'brain')
const delegate = 'C:/Users/HOANGDV/.claude/hooks/delegate.js'
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const isImage = name => /\.(?:png|jpe?g|webp)$/i.test(name)
function findImages(dir, newerThan, hits = []) {
  if (!fs.existsSync(dir)) return hits
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return hits }
  for (const entry of entries) {
    const file = path.join(dir, entry.name)
    try {
      if (entry.isDirectory()) findImages(file, newerThan, hits)
      else if (entry.isFile() && isImage(entry.name) && fs.statSync(file).mtimeMs >= newerThan) hits.push(file)
    } catch {}
  }
  return hits
}
async function waitForImage(dest, started) {
  let last = '', stable = 0
  for (let elapsed = 0; elapsed < 240000; elapsed += 3000) {
    const candidates = [...findImages(out, started), ...findImages(brain, started)]
      .filter(file => path.resolve(file) !== path.resolve(dest))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    const candidate = candidates[0]
    if (candidate) {
      let size = 0
      try { size = fs.statSync(candidate).size } catch {}
      if (size > 0 && candidate === last) stable++
      else { last = candidate; stable = 0 }
      if (stable >= 1) return candidate
    } else { last = ''; stable = 0 }
    await pause(3000)
  }
  return null
}
function callDelegate(prompt) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [delegate, 'agy', '--write', '--cwd', out, prompt], { windowsHide: true, stdio: 'inherit' })
    child.on('error', error => { console.error(`Không chạy được delegate: ${error.message}`); resolve() })
    child.on('close', () => resolve())
  })
}
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), args, { windowsHide: true, stdio: 'inherit' })
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg thoát với mã ${code}`)))
  })
}
const missing = []
for (let i = 0; i < scenes.length; i++) {
  const scene = scenes[i], n = String(i + 1).padStart(2, '0'), dest = path.join(out, `scene-${n}.png`)
  if (fs.existsSync(dest) && !force) { console.log(`[${i + 1}/${scenes.length}] Đã có ${path.basename(dest)}, bỏ qua`); continue }
  let desc = rowDescriptions[i] || scene.narration
  desc = desc.replace(/\bLinh\s*vật\b/gi, 'một người trẻ').replace(/\[[^\]]*(?:Linh\s*vật|biểu\s*cảm|Chữ\s+to)[^\]]*\]/gi, '').trim()
  desc = desc.replace(/\bbiểu\s*cảm\s*:\s*[^|,;]+/gi, '').replace(/\bChữ\s+to\s*:\s*[^|,;]+/gi, '').replace(/\s*\|\s*/g, ', ').trim()
  const prompt = `CHỈ GỌI NGAY công cụ tạo ảnh (generate image) MỘT LẦN để vẽ 1 ảnh tên scene-${n}. TUYỆT ĐỐI KHÔNG chạy lệnh shell, không liệt kê thư mục, không đọc/ghi file nào khác, không hỏi lại; tạo ảnh xong thì kết thúc. Nội dung: ${desc}. Phong cách: tranh line-art bảng trắng vẽ tay tối giản, nét mực xám đậm sạch, nền giấy màu be ấm #F5EBD7, vài điểm màu nhấn cam/xanh nhạt, nhiều khoảng trống, chủ thể tách rời không chồng nhau, nhân vật người Việt trẻ, KHÔNG có chữ/ký tự/watermark, khung dọc 9:16, chủ thể nằm ở khoảng giữa khung (chừa trống 25% trên và 20% dưới).`
  let converted = false
  for (let attempt = 1; attempt <= 2 && !converted; attempt++) {
    console.log(`[${i + 1}/${scenes.length}] Tạo ảnh cảnh ${n}${attempt === 2 ? ' (thử lại)' : ''}...`)
    const started = Date.now()
    await callDelegate(prompt)
    const found = await waitForImage(dest, started)
    if (!found) { console.warn(`Cảnh ${n}: quá hạn 240 giây, không tìm thấy ảnh.`); continue }
    try {
      await runFfmpeg(['-y', '-i', found, '-vf', "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=#F5EBD7", '-frames:v', '1', dest])
      converted = true
      console.log(`[${i + 1}/${scenes.length}] Đã lưu ${dest}`)
    } catch (error) { console.warn(`Cảnh ${n}: chuẩn hóa ảnh lỗi: ${error.message}`) }
  }
  if (!converted) missing.push(n)
}
if (missing.length) { console.error(`Thiếu ảnh các cảnh: ${missing.join(', ')}`); process.exitCode = 3 }
