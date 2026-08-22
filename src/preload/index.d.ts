import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      selectVideo: () => Promise<string | null>
      selectSrt: () => Promise<any>
      selectDirectory: () => Promise<string | null>
      selectFile: () => Promise<string | null>
      readFile: (filePath: string) => Promise<any>
      processVideo: (options: any) => Promise<any>
      onVideoLog: (callback: (log: string) => void) => void
      generateSubtitle: (options: any) => Promise<any>
      onSubtitleLog: (callback: (log: string) => void) => void
      getNeeyuVoices: () => Promise<any>
      scanUrl: (url: string) => Promise<any>
      downloadVideos: (urls: string[], savePath: string, cookie: string) => Promise<any>
      generateAutoShorts: (options: any) => Promise<any>,
      autoshortsLogs: (callback: (log: string) => void) => void,
      onDownloadProgress: (callback: (log: string) => void) => void
    }
  }
}
