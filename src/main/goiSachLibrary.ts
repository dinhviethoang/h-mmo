import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

type Region = { x: number; y: number; width: number; height: number; label: string }

const iconRoot = 'C:/Users/HOANGDV/tools/lineart-lib/tabler/package/icons/outline'
const iconCatalogPath = path.resolve(iconRoot, '../../icons.json')
type CatalogIcon = { name: string; category?: string; tags?: string[] }
const iconCatalog = new Map<string, CatalogIcon>(Object.values(
  JSON.parse(fs.readFileSync(iconCatalogPath, 'utf8')) as Record<string, CatalogIcon>
).map((icon) => [icon.name, icon]))

// Vietnamese cues map to verified Tabler names. The files are checked at startup,
// so a missing icon can never make a generated scene fail.
const keywordIcons: Record<string, string[]> = {
  'điện thoại': ['device-mobile'], 'điện thoại di động': ['device-mobile'], 'smartphone': ['device-mobile'], 'tin nhắn': ['message'], 'nhắn tin': ['message'], 'tin nhắn thoại': ['message-circle'], 'sếp': ['user-star', 'tie'], 'quản lý': ['user-star', 'tie'], 'lãnh đạo': ['user-star'], 'đồng nghiệp': ['users'], 'đội nhóm': ['users-group'], 'nhóm': ['users'], 'cuộc họp': ['presentation'], 'họp': ['presentation'], 'thuyết trình': ['presentation'], 'lịch': ['calendar'], 'ngày': ['calendar-event'], 'đồng hồ': ['clock'], 'tiền': ['cash', 'coin'], 'tiền mặt': ['cash-banknote'], 'đồng xu': ['coin'], 'xu': ['coin'], 'ví tiền': ['wallet'], 'ví': ['wallet'], 'thẻ': ['credit-card'], 'thẻ tín dụng': ['credit-card'], 'biểu đồ': ['chart-line', 'chart-bar'], 'doanh thu': ['chart-line'], 'trái tim': ['heart'], 'tình yêu': ['heart'], 'nhà': ['home'], 'gia đình': ['home'], 'sách': ['book'], 'cuốn sách': ['book'], 'đọc sách': ['book'], 'ý tưởng': ['bulb'], 'bóng đèn': ['bulb'], 'sáng kiến': ['bulb'], 'mục tiêu': ['target'], 'đích đến': ['target'], 'cúp': ['trophy'], 'chiến thắng': ['trophy'], 'câu hỏi': ['help-circle', 'question-mark'], 'hỏi': ['help'], 'nói chuyện': ['messages'], 'trò chuyện': ['messages'], 'lắng nghe': ['ear'], 'nghe': ['ear'], 'mắt': ['eye'], 'nhìn': ['eye'], 'bàn làm việc': ['desk'], 'bàn': ['desk'], 'máy tính': ['device-laptop'], 'laptop': ['device-laptop'], 'cà phê': ['coffee'], 'giường': ['bed'], 'ngủ': ['bed'], 'trăng': ['moon'], 'đêm': ['moon'], 'mưa': ['cloud-rain'], 'nắng': ['sun'], 'buồn': ['mood-sad'], 'vui': ['mood-happy'], 'hạnh phúc': ['mood-happy'], 'giận': ['mood-angry'], 'tức giận': ['mood-angry'], 'email': ['mail'], 'thư điện tử': ['mail'], 'cảm ơn': ['heart-handshake'], 'biết ơn': ['heart-handshake'], 'bắt tay': ['heart-handshake'], 'ghi chú': ['notes'], 'danh sách': ['list-check'], 'lỗi': ['alert-triangle'], 'sai': ['circle-x'], 'đúng': ['circle-check'], 'chính xác': ['circle-check'], 'cây': ['plant'], 'trồng cây': ['plant'], 'tăng': ['trending-up'], 'phát triển': ['trending-up'], 'giảm': ['trending-down'], 'khóa': ['lock'], 'chìa khóa': ['key'], 'quà': ['gift'], 'tặng': ['gift'], 'thời gian': ['hourglass'], 'chờ': ['hourglass'], 'kế hoạch': ['clipboard-list'], 'lập kế hoạch': ['clipboard-list'], 'bút': ['pencil'], 'viết': ['pencil'], 'công việc': ['briefcase'], 'văn phòng': ['briefcase', 'desk'], 'công sở': ['briefcase'], 'sếp lớn': ['tie'], 'nhân viên': ['user'], 'người': ['user'], 'bạn bè': ['users'], 'cuộc gọi': ['device-mobile'], 'gọi điện': ['device-mobile'], 'máy bàn': ['device-laptop'], 'màn hình': ['device-laptop'], 'họa tiết': ['bulb'], 'công ty': ['building'], 'tòa nhà': ['building'], 'báo cáo': ['report-analytics'], 'phân tích': ['report-analytics'], 'thành tích': ['trophy'], 'huy chương': ['trophy'], 'mặt trời': ['sun'], 'ban ngày': ['sun'], 'mặt trăng': ['moon'], 'thời tiết': ['cloud-rain'], 'mây': ['cloud-rain'], 'cảm xúc': ['heart'], 'kỷ niệm': ['calendar-event'], 'nhật ký': ['notes'], 'tài liệu': ['notes'], 'bài học': ['book'], 'kiến thức': ['book'], 'ý chí': ['target'], 'hy vọng': ['sun'], 'thất bại': ['trending-down'], 'tiến bộ': ['trending-up'], 'khó khăn': ['alert-triangle'], 'vấn đề': ['help-circle'], 'giải pháp': ['bulb'], 'ý kiến': ['messages'], 'thảo luận': ['messages'], 'đối thoại': ['messages'], 'tai nghe': ['ear'], 'quan sát': ['eye'], 'thức khuya': ['moon'], 'buổi sáng': ['sun'], 'buồn ngủ': ['mood-sad', 'bed'], 'ngạc nhiên': ['eye'], 'mỉm cười': ['mood-happy'], 'bực bội': ['mood-angry'], 'tiết kiệm': ['wallet'], 'trống rỗng': ['wallet'], 'hết tiền': ['wallet'], 'thanh toán': ['credit-card'], 'giá tiền': ['coin'], 'lương': ['cash'], 'hợp đồng': ['briefcase'], 'công ty mới': ['building'], 'dự án': ['clipboard-list'], 'bước': ['target'], 'checklist': ['list-check'], 'hoàn thành': ['circle-check'], 'sửa chữa': ['pencil'], 'bảo mật': ['lock'], 'mở khóa': ['key'], 'tặng quà': ['gift'], 'deadline': ['hourglass'], 'thời hạn': ['hourglass'], 'tăng trưởng': ['trending-up'], 'suy giảm': ['trending-down'], 'cây xanh': ['plant'], 'chậu cây': ['plant'], 'chuyện trò': ['message-circle'], 'tâm sự': ['messages'], 'cảm ơn bạn': ['heart-handshake'], 'đọc': ['book'], 'sách vở': ['book'], 'bàn họp': ['presentation'], 'giờ': ['clock'], 'sáng': ['sun'], 'tối': ['moon'], 'cơn mưa': ['cloud-rain'], 'quản trị': ['tie'], 'đồng đội': ['users'], 'thành công': ['trophy'], 'cảm giác': ['heart'], 'trái tim tan vỡ': ['heart']
}

const defaults: Record<string, string[]> = {
  'công sở': ['briefcase', 'users'], 'công sở (': ['briefcase', 'users'], 'túi tiền': ['wallet', 'coin'], 'đêm khuya': ['moon', 'heart'], 'trưởng thành': ['plant', 'target']
}

function selectIcons(description: string, narration: string, series: string): string[] {
  const text = `${description.toLocaleLowerCase('vi')} ${narration.toLocaleLowerCase('vi')}`
  const desc = description.toLocaleLowerCase('vi')
  const scores = new Map<string, number>()
  for (const [keyword, names] of Object.entries(keywordIcons)) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'iu')
    if (!re.test(text)) continue
    for (const name of names) {
      if (!iconCatalog.has(name) || !fs.existsSync(path.join(iconRoot, `${name}.svg`))) continue
      scores.set(name, (scores.get(name) || 0) + (re.test(desc) ? 3 : 1))
    }
  }
  // Tabler's offline tags also recognize English cues alongside the Vietnamese map.
  for (const icon of iconCatalog.values()) {
    if (!fs.existsSync(path.join(iconRoot, `${icon.name}.svg`))) continue
    const tag = (icon.tags || []).find((candidate) => typeof candidate === 'string' && candidate.length >= 4 && text.includes(candidate.toLocaleLowerCase('en')))
    if (tag) scores.set(icon.name, (scores.get(icon.name) || 0) + (desc.includes(tag.toLocaleLowerCase('en')) ? 2 : 0.5))
  }
  const chosen: string[] = [...scores].sort((a, b) => b[1] - a[1]).map(([name]) => name).slice(0, 3)
  const seriesKey = series.toLocaleLowerCase('vi')
  const fallback = Object.entries(defaults).find(([key]) => seriesKey.includes(key))?.[1] || ['book', 'bulb']
  for (const name of fallback) {
    if (chosen.length >= 3) break
    if (!chosen.includes(name) && fs.existsSync(path.join(iconRoot, `${name}.svg`))) chosen.push(name)
  }
  for (const name of ['book', 'bulb', 'heart', 'users']) {
    if (chosen.length >= 3) break
    if (!chosen.includes(name) && fs.existsSync(path.join(iconRoot, `${name}.svg`))) chosen.push(name)
  }
  return chosen
}

function layout(sceneIndex: number): Array<{ x: number; y: number; size: number }> {
  switch (Math.abs(sceneIndex) % 4) {
    case 0: return [{ x: 280, y: 610, size: 520 }, { x: 105, y: 1170, size: 260 }, { x: 715, y: 1170, size: 260 }]
    case 1: return [{ x: 115, y: 770, size: 480 }, { x: 650, y: 630, size: 250 }, { x: 650, y: 1120, size: 250 }]
    case 2: return [{ x: 300, y: 590, size: 480 }, { x: 110, y: 1120, size: 250 }, { x: 720, y: 1120, size: 250 }]
    default: return [{ x: 300, y: 930, size: 480 }, { x: 105, y: 630, size: 250 }, { x: 725, y: 630, size: 250 }]
  }
}

export async function buildLibraryLineArt(opts: {
  description: string; narration: string; series: string; expression: string; sceneIndex: number; outPng: string
}): Promise<{ png: string; regions: Region[] }> {
  const names = selectIcons(opts.description, opts.narration, opts.series)
  const boxes = layout(opts.sceneIndex)
  const regions = names.map((name, i) => ({ x: boxes[i].x, y: boxes[i].y, width: boxes[i].size, height: boxes[i].size, label: name }))
  await fs.promises.mkdir(path.dirname(path.resolve(opts.outPng)), { recursive: true })
  const python = 'C:/Users/HOANGDV/tools/srt-whiteboard-animation/.venv/Scripts/python.exe'
  const renderer = path.resolve(process.cwd(), 'engines/wb_draw_icons.py')
  const payload = JSON.stringify({ icons: names.map((name, i) => ({ name, ...boxes[i] })), output: opts.outPng })
  await new Promise<void>((resolve, reject) => {
    const child = spawn(python, [renderer], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'], env: { ...process.env, PYTHONUTF8: '1' } })
    let error = ''
    child.stderr.on('data', (chunk) => { error = (error + chunk.toString()).slice(-2000) })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(error || `Line art renderer exited ${code}`)))
    child.stdin.end(payload, 'utf8')
  })
  if (!fs.existsSync(opts.outPng)) throw new Error(`Line art renderer did not create ${opts.outPng}`)
  return { png: opts.outPng, regions }
}
