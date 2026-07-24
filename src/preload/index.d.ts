export interface ArcheonApi {
  versions: {
    node: string
    chrome: string
    electron: string
  }
}

declare global {
  interface Window {
    archeon: ArcheonApi
  }
}

export {}
