import { app, ipcMain, shell } from 'electron'
import fs from 'fs'
import path from 'path'

// Thư mục làm việc của H-MMO, mặc định: Videos\H-MMO
//   1. Video gốc      <- video tải về (YouTube, Douyin)
//   2. Đã hiệu chỉnh  <- video xuất từ tab Hiệu chỉnh video
//   3. Phụ đề         <- file .srt tạo từ tab Tạo phụ đề
//   4. Hoàn thành     <- video xuất từ tab Biên tập video
export type WorkspaceKey = 'root' | 'goc' | 'hieuchinh' | 'phude' | 'hoanthanh'

const NAMES: Record<Exclude<WorkspaceKey, 'root'>, string> = {
  goc: '1. Video gốc',
  hieuchinh: '2. Đã hiệu chỉnh',
  phude: '3. Phụ đề',
  hoanthanh: '4. Hoàn thành'
}

const configFile = () => path.join(app.getPath('userData'), 'workspace.json')

export function workspaceRoot(): string {
  try {
    const r = JSON.parse(fs.readFileSync(configFile(), 'utf8')).root
    if (r) return r
  } catch { /* dùng mặc định */ }
  return path.join(app.getPath('videos'), 'H-MMO')
}

export function workspaceDir(key: WorkspaceKey): string {
  const dir = key === 'root' ? workspaceRoot() : path.join(workspaceRoot(), NAMES[key])
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function ensureWorkspace(): Record<WorkspaceKey, string> {
  return {
    root: workspaceDir('root'),
    goc: workspaceDir('goc'),
    hieuchinh: workspaceDir('hieuchinh'),
    phude: workspaceDir('phude'),
    hoanthanh: workspaceDir('hoanthanh')
  }
}

export function setupWorkspace(): void {
  ensureWorkspace()
  ipcMain.handle('workspace:paths', () => ensureWorkspace())
  ipcMain.handle('workspace:open', (_e, key: WorkspaceKey = 'root') => shell.openPath(workspaceDir(key)))
  ipcMain.handle('workspace:setRoot', (_e, root: string) => {
    if (!root) return ensureWorkspace()
    fs.writeFileSync(configFile(), JSON.stringify({ root }), 'utf8')
    return ensureWorkspace()
  })
}
