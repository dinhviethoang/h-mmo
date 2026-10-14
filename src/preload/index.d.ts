import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      selectVideo: () => Promise<string | null>
      selectAudio: () => Promise<string | null>
      selectSrt: () => Promise<any>
      selectDirectory: () => Promise<string | null>
      selectFile: () => Promise<string | null>
      readFile: (filePath: string) => Promise<any>
      processVideo: (options: any) => Promise<any>
      cancelVideo: () => Promise<boolean>
      onVideoProgress: (callback: (p: { percent: number; timeText?: string }) => void) => () => void
      onVideoLog: (callback: (log: string) => void) => void
      generateSubtitle: (options: any) => Promise<any>
      onSubtitleLog: (callback: (log: string) => void) => void
      getNeeyuVoices: () => Promise<any>
      scanUrl: (url: string) => Promise<any>
      generateAutoShorts: (options: any) => Promise<any>
      fetchGoogleSheet: (url: string) => Promise<string>
      autoshortsLogs: (callback: (log: string) => void) => void
      voiceList: () => Promise<any>
      voicePickAudio: () => Promise<string | null>
      voiceAddClone: (opts: any) => Promise<any>
      voiceDeleteClone: (name: string) => Promise<any>
      voicePreview: (opts: any) => Promise<any>
      onVoiceLog: (callback: (log: string) => void) => () => void
      douyinConnect: () => Promise<any>
      douyinCookieStatus: () => Promise<any>
      onDownloadProgress: (callback: (log: string) => void) => () => void
    }
  }
}
