/// <reference types="vite/client" />

interface Window {
  api: {
    selectVideo: () => Promise<string | null>
    selectSrt: () => Promise<string | null>
    selectDirectory: () => Promise<string | null>
    processVideo: (options: any) => Promise<string>
    onVideoLog: (callback: (log: string) => void) => void
    generateSubtitle: (options: { 
      videoPath: string, 
      apiKey: string,
      accuracy?: string,
      lang?: string,
      translateEnabled?: boolean,
      aiEngine?: string
    }) => Promise<string>
    onSubtitleLog: (callback: (log: string) => void) => void
  }
}
