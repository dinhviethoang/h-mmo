const fs = require('fs');

let content = fs.readFileSync('src/preload/index.ts', 'utf8');
if (!content.includes('generateAutoShorts')) {
  content = content.replace(
    "onDownloadProgress: (callback: (log: string) => void) => {",
    "generateAutoShorts: (options: any) => ipcRenderer.invoke('autoshorts:generate', options),\n  autoshortsLogs: (callback: (log: string) => void) => {\n    ipcRenderer.on('autoshorts:log', (_event, log) => callback(log))\n  },\n  onDownloadProgress: (callback: (log: string) => void) => {"
  );
  fs.writeFileSync('src/preload/index.ts', content, 'utf8');
}

let dts = fs.readFileSync('src/preload/index.d.ts', 'utf8');
if (!dts.includes('generateAutoShorts')) {
  dts = dts.replace(
    "onDownloadProgress: (callback: (log: string) => void) => void",
    "generateAutoShorts: (options: any) => Promise<any>,\n      autoshortsLogs: (callback: (log: string) => void) => void,\n      onDownloadProgress: (callback: (log: string) => void) => void"
  );
  fs.writeFileSync('src/preload/index.d.ts', dts, 'utf8');
}
