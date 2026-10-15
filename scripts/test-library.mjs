import { transform } from 'esbuild'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'artifacts', 'goisach', 'lib-test')
await fs.mkdir(outDir, { recursive: true })
const source = await fs.readFile(path.join(root, 'src', 'main', 'goiSachLibrary.ts'), 'utf8')
const compiled = await transform(source, { loader: 'ts', format: 'cjs', target: 'node22' })
const moduleFile = path.join(outDir, '_library.cjs')
await fs.writeFile(moduleFile, compiled.code)
try {
  const imported = await import(pathToFileURL(moduleFile).href)
  const { buildLibraryLineArt } = imported.default ?? imported
  const samples = [
    { description: 'Linh vật nhìn tin nhắn trên điện thoại rồi nhíu mày', narration: 'Một thông báo khiến cô ấy phải suy nghĩ.', series: 'Công Sở' },
    { description: 'Hai đồng nghiệp xem biểu đồ trong cuộc họp', narration: 'Cùng thảo luận về kết quả.', series: 'Công Sở' },
    { description: 'Ví tiền trống cuối tháng và lịch', narration: 'Đến ngày cuối tháng, tiền đã cạn.', series: 'Túi Tiền' },
    { description: 'Bóng đèn ý tưởng cạnh cuốn sách', narration: 'Một ý tưởng mới bắt đầu từ việc đọc.', series: 'Trưởng Thành' }
  ]
  for (let i = 0; i < samples.length; i++) {
    const result = await buildLibraryLineArt({ ...samples[i], expression: 'suy-nghi', sceneIndex: i, outPng: path.join(outDir, `lib-${i + 1}.png`) })
    console.log(JSON.stringify(result))
  }
} finally {
  await fs.rm(moduleFile, { force: true })
}
