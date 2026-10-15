import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  selectVideo: () => ipcRenderer.invoke('dialog:openVideo'),
  selectAudio: () => ipcRenderer.invoke('dialog:openAudio'),
  selectSrt: () => ipcRenderer.invoke('dialog:openSrt'),
  selectDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  selectFile: () => ipcRenderer.invoke('dialog:openFile'),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  processVideo: (options: any) => ipcRenderer.invoke('video:process', options),
  cancelVideo: () => ipcRenderer.invoke('video:cancel'),
  onVideoProgress: (callback: (p: { percent: number; timeText?: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, p: { percent: number; timeText?: string }) => callback(p)
    ipcRenderer.on('video:progress', handler)
    return () => ipcRenderer.removeListener('video:progress', handler)
  },
  onVideoLog: (callback: (log: string) => void) => {
    ipcRenderer.on('video:log', (_event, log) => callback(log))
  },
  generateSubtitle: (options: any) => ipcRenderer.invoke('subtitle:generate', options),
  onSubtitleLog: (callback: (log: string) => void) => {
    ipcRenderer.on('subtitle:log', (_event, log) => callback(log))
  },
  getNeeyuVoices: () => ipcRenderer.invoke('get-neeyu-voices'),
  scanUrl: (url: string) => ipcRenderer.invoke('scan-url', url),
  generateAutoShorts: (options: any) => ipcRenderer.invoke('autoshorts:generate', options),
  fetchGoogleSheet: (url: string) => ipcRenderer.invoke('autoshorts:fetchGsheet', url),
  autoshortsLogs: (callback: (log: string) => void) => {
    ipcRenderer.on('autoshorts:log', (_event, log) => callback(log))
  },
  voiceList: () => ipcRenderer.invoke('voice:list'),
  voicePickAudio: () => ipcRenderer.invoke('voice:pickAudio'),
  voiceAddClone: (opts: any) => ipcRenderer.invoke('voice:addClone', opts),
  voiceDeleteClone: (name: string) => ipcRenderer.invoke('voice:deleteClone', name),
  voicePreview: (opts: any) => ipcRenderer.invoke('voice:preview', opts),
  goiSachPickScript: () => ipcRenderer.invoke('goisach:pickScript'),
  goiSachPickMusic: () => ipcRenderer.invoke('goisach:pickMusic'),
  goiSachPickOutput: () => ipcRenderer.invoke('goisach:pickOutput'),
  goiSachParse: (file: string) => ipcRenderer.invoke('goisach:parse', file),
  goiSachRun: (opts: any) => ipcRenderer.invoke('goisach:run', opts),
  goiSachCancel: () => ipcRenderer.invoke('goisach:cancel'),
  goiSachOpen: (dir: string) => ipcRenderer.invoke('goisach:open', dir),
  onGoiSachProgress: (callback: (p: {progress:number;message:string}) => void) => { const h=(_e: Electron.IpcRendererEvent,p:{progress:number;message:string})=>callback(p); ipcRenderer.on('goisach:progress',h); return ()=>ipcRenderer.removeListener('goisach:progress',h) },
  onVoiceLog: (callback: (log: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, log: string) => callback(log)
    ipcRenderer.on('voice:log', handler)
    return () => ipcRenderer.removeListener('voice:log', handler)
  },
  douyinConnect: () => ipcRenderer.invoke('douyin:connect'),
  douyinCookieStatus: () => ipcRenderer.invoke('douyin:cookieStatus'),
  onDownloadProgress: (callback: (log: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, log: string) => callback(log)
    ipcRenderer.on('download-progress', handler)
    return () => ipcRenderer.removeListener('download-progress', handler)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
