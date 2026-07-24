import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from '../shared/ipc'
import type { AppSettings, LayoutPreset, Workspace } from '../shared/types'

export interface PtySpawnOptions {
  paneId: string
  shellId: string
  cwd: string
  cols: number
  rows: number
}

export interface PtyDataEvent {
  sessionId: string
  data: string
}

export interface PtyExitEvent {
  sessionId: string
  exitCode: number
}

export interface ScrollbackKey {
  workspaceId: string
  paneId: string
}

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
  },
  presets: {
    list: () => ipcRenderer.invoke(IpcChannels.presetsList),
    save: (presets: LayoutPreset[]) => ipcRenderer.invoke(IpcChannels.presetsSave, presets),
    upsert: (preset: LayoutPreset) => ipcRenderer.invoke(IpcChannels.presetsUpsert, preset)
  },
  pty: {
    spawn: (opts: PtySpawnOptions): Promise<{ sessionId: string }> =>
      ipcRenderer.invoke(IpcChannels.ptySpawn, opts),
    write: (sessionId: string, data: string): void => {
      ipcRenderer.send(IpcChannels.ptyWrite, sessionId, data)
    },
    resize: (sessionId: string, cols: number, rows: number): void => {
      ipcRenderer.send(IpcChannels.ptyResize, sessionId, cols, rows)
    },
    kill: (sessionId: string): Promise<void> => ipcRenderer.invoke(IpcChannels.ptyKill, sessionId),
    onData: (cb: (event: PtyDataEvent) => void): (() => void) => {
      const handler = (_e: Electron.IpcRendererEvent, payload: PtyDataEvent): void => {
        cb(payload)
      }
      ipcRenderer.on(IpcChannels.ptyData, handler)
      return () => {
        ipcRenderer.removeListener(IpcChannels.ptyData, handler)
      }
    },
    onExit: (cb: (event: PtyExitEvent) => void): (() => void) => {
      const handler = (_e: Electron.IpcRendererEvent, payload: PtyExitEvent): void => {
        cb(payload)
      }
      ipcRenderer.on(IpcChannels.ptyExit, handler)
      return () => {
        ipcRenderer.removeListener(IpcChannels.ptyExit, handler)
      }
    }
  },
  session: {
    saveScrollback: (key: ScrollbackKey & { text: string }): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.sessionSaveScrollback, key),
    loadScrollback: (key: ScrollbackKey): Promise<string | null> =>
      ipcRenderer.invoke(IpcChannels.sessionLoadScrollback, key)
  },
  app: {
    /** Subscribe to main's pre-close flush request. Returns unsubscribe. */
    onBeforeQuitSave: (cb: () => void): (() => void) => {
      const handler = (): void => {
        cb()
      }
      ipcRenderer.on(IpcChannels.appBeforeQuitSave, handler)
      return () => {
        ipcRenderer.removeListener(IpcChannels.appBeforeQuitSave, handler)
      }
    },
    /** Tell main that renderer flush finished so the window may close. */
    ackBeforeQuitSave: (): void => {
      ipcRenderer.send(IpcChannels.appBeforeQuitSaveDone)
    }
  }
}

contextBridge.exposeInMainWorld('archeon', archeonApi)
