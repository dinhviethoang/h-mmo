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
      goiSachPickScript: () => Promise<string | null>
      goiSachPickMusic: () => Promise<string | null>
      goiSachPickOutput: () => Promise<string | null>
      goiSachParse: (file: string) => Promise<any[]>
      goiSachRun: (opts: any) => Promise<string>
      goiSachCancel: () => Promise<boolean>
      goiSachOpen: (dir: string) => Promise<string>
      explainerSettings: () => Promise<any>
      explainerSaveSettings: (s: any) => Promise<any>
      explainerListScripts: () => Promise<{ file: string; name: string; vid: string }[]>
      explainerStatus: (script: string) => Promise<any>
      explainerRun: (script: string, step: string) => Promise<any>
      explainerCancel: () => Promise<boolean>
      explainerReceiver: (on: boolean) => Promise<boolean>
      explainerOpen: (target: string) => Promise<string>
      onExplainerProgress: (callback: (p: {step:string;done:number;total:number;message:string}) => void) => () => void
      onExplainerLog: (callback: (line: string) => void) => () => void
      onExplainerReceiver: (callback: (on: boolean) => void) => () => void
      onGoiSachProgress: (callback: (p: {progress:number;message:string}) => void) => () => void
      onVoiceLog: (callback: (log: string) => void) => () => void
      douyinConnect: () => Promise<any>
      douyinCookieStatus: () => Promise<any>
      onDownloadProgress: (callback: (log: string) => void) => () => void
    }
  }
}
