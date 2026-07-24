import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from '../shared/ipc'
import type { AppSettings, Workspace } from '../shared/types'

const archeonApi = {
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  },
  workspace: {
    list: () => ipcRenderer.invoke(IpcChannels.workspaceList),
    get: (id: string) => ipcRenderer.invoke(IpcChannels.workspaceGet, id),
    create: (name: string) => ipcRenderer.invoke(IpcChannels.workspaceCreate, name),
    save: (ws: Workspace) => ipcRenderer.invoke(IpcChannels.workspaceSave, ws),
    delete: (id: string) => ipcRenderer.invoke(IpcChannels.workspaceDelete, id),
    setActive: (id: string) => ipcRenderer.invoke(IpcChannels.workspaceSetActive, id),
    export: (id: string) => ipcRenderer.invoke(IpcChannels.exportWorkspace, id),
    import: (json: string) => ipcRenderer.invoke(IpcChannels.importWorkspace, json)
  },
  settings: {
    get: () => ipcRenderer.invoke(IpcChannels.settingsGet),
    set: (partial: Partial<AppSettings>) => ipcRenderer.invoke(IpcChannels.settingsSet, partial)
  }
}

contextBridge.exposeInMainWorld('archeon', archeonApi)
