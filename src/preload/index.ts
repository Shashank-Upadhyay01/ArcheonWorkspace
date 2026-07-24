import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('archeon', {
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  }
})
