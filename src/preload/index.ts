import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  selectVideo: () => ipcRenderer.invoke('dialog:openVideo'),
  selectSrt: () => ipcRenderer.invoke('dialog:openSrt'),
  selectDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  selectFile: () => ipcRenderer.invoke('dialog:openFile'),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  processVideo: (options: any) => ipcRenderer.invoke('video:process', options),
  onVideoLog: (callback: (log: string) => void) => {
    ipcRenderer.on('video:log', (_event, log) => callback(log))
  },
  generateSubtitle: (options: any) => ipcRenderer.invoke('subtitle:generate', options),
  onSubtitleLog: (callback: (log: string) => void) => {
    ipcRenderer.on('subtitle:log', (_event, log) => callback(log))
  },
  getNeeyuVoices: () => ipcRenderer.invoke('get-neeyu-voices'),
  scanUrl: (url: string) => ipcRenderer.invoke('scan-url', url),
  downloadVideos: (urls: string[], savePath: string, cookie: string) => ipcRenderer.invoke('download-videos', urls, savePath, cookie),
  generateAutoShorts: (options: any) => ipcRenderer.invoke('autoshorts:generate', options),
  autoshortsLogs: (callback: (log: string) => void) => {
    ipcRenderer.on('autoshorts:log', (_event, log) => callback(log))
  },
  onDownloadProgress: (callback: (log: string) => void) => {
    ipcRenderer.removeAllListeners('download-progress');
    ipcRenderer.on('download-progress', (_event, log) => callback(log))
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
