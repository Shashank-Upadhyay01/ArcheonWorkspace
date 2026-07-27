import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from '../shared/ipc'
import type {
  AgentProfile,
  AppSettings,
  ChatMessage,
  LayoutPreset,
  Workspace
} from '../shared/types'

export interface PtySpawnOptions {
  paneId: string
  shellId?: string
  cwd: string
  cols: number
  rows: number
  command?: string
  args?: string[]
  env?: Record<string, string>
}

export interface PtyDataEvent {
  sessionId: string
  data: string
}

export interface PtyExitEvent {
  sessionId: string
  exitCode: number
}

export interface PtyLoginUrlEvent {
  sessionId: string
  paneId?: string
  url: string
}

export interface ScrollbackKey {
  workspaceId: string
  paneId: string
}

export interface ChatThreadKey {
  workspaceId: string
  paneId: string
}

export interface ChatThread {
  messages: ChatMessage[]
}

export interface AiChatRequest {
  requestId: string
  providerId: string
  model: string
  systemPrompt?: string
  messages: ChatMessage[]
}

export interface AiChatChunkEvent {
  requestId: string
  text?: string
  done?: boolean
  error?: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
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
    export: (
      id: string
    ): Promise<{ canceled: true } | { canceled: false; path: string }> =>
      ipcRenderer.invoke(IpcChannels.exportWorkspace, id),
    import: (): Promise<
      { canceled: true } | { canceled: false; workspace: Workspace }
    > => ipcRenderer.invoke(IpcChannels.importWorkspace)
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
  profiles: {
    list: (): Promise<AgentProfile[]> => ipcRenderer.invoke(IpcChannels.profilesList),
    save: (profiles: AgentProfile[]): Promise<AgentProfile[]> =>
      ipcRenderer.invoke(IpcChannels.profilesSave, profiles),
    upsert: (profile: AgentProfile): Promise<AgentProfile[]> =>
      ipcRenderer.invoke(IpcChannels.profilesUpsert, profile),
    delete: (id: string): Promise<AgentProfile[]> =>
      ipcRenderer.invoke(IpcChannels.profilesDelete, id)
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
    },
    onLoginUrl: (cb: (event: PtyLoginUrlEvent) => void): (() => void) => {
      const handler = (_e: Electron.IpcRendererEvent, payload: PtyLoginUrlEvent): void => {
        cb(payload)
      }
      ipcRenderer.on(IpcChannels.ptyLoginUrl, handler)
      return () => {
        ipcRenderer.removeListener(IpcChannels.ptyLoginUrl, handler)
      }
    }
  },
  session: {
    saveScrollback: (key: ScrollbackKey & { text: string }): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.sessionSaveScrollback, key),
    loadScrollback: (key: ScrollbackKey): Promise<string | null> =>
      ipcRenderer.invoke(IpcChannels.sessionLoadScrollback, key),
    saveChat: (key: ChatThreadKey & { thread: ChatThread }): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.sessionSaveChat, key),
    loadChat: (key: ChatThreadKey): Promise<ChatThread | null> =>
      ipcRenderer.invoke(IpcChannels.sessionLoadChat, key)
  },
  secrets: {
    set: (key: string, value: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.secretsSet, key, value),
    has: (key: string): Promise<boolean> => ipcRenderer.invoke(IpcChannels.secretsHas, key),
    delete: (key: string): Promise<void> => ipcRenderer.invoke(IpcChannels.secretsDelete, key)
  },
  ai: {
    chat: (req: AiChatRequest): Promise<{ ok: true; cancelled?: boolean }> =>
      ipcRenderer.invoke(IpcChannels.aiChat, req),
    /** Abort an in-flight stream by requestId (main AbortController). */
    cancel: (requestId: string): void => {
      if (typeof requestId === 'string' && requestId) {
        ipcRenderer.send(IpcChannels.aiChatCancel, requestId)
      }
    },
    onChunk: (cb: (event: AiChatChunkEvent) => void): (() => void) => {
      const handler = (_e: Electron.IpcRendererEvent, payload: AiChatChunkEvent): void => {
        cb(payload)
      }
      ipcRenderer.on(IpcChannels.aiChatChunk, handler)
      return () => {
        ipcRenderer.removeListener(IpcChannels.aiChatChunk, handler)
      }
    }
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
  },
  shell: {
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.shellOpenExternal, url)
  },
  update: {
    check: () => ipcRenderer.invoke(IpcChannels.updateCheck),
    download: () => ipcRenderer.invoke(IpcChannels.updateDownload),
    install: () => ipcRenderer.invoke(IpcChannels.updateInstall),
    openReleasePage: () => ipcRenderer.invoke(IpcChannels.updateOpenRelease),
    onProgress: (cb: (p: { transferred: number; total: number; percent: number }) => void) => {
      const handler = (
        _e: Electron.IpcRendererEvent,
        p: { transferred: number; total: number; percent: number }
      ): void => {
        cb(p)
      }
      ipcRenderer.on(IpcChannels.updateProgress, handler)
      return () => {
        ipcRenderer.removeListener(IpcChannels.updateProgress, handler)
      }
    },
    onAvailable: (
      cb: (result: {
        updateAvailable: boolean
        currentVersion: string
        info?: unknown
        message?: string
      }) => void
    ) => {
      const handler = (
        _e: Electron.IpcRendererEvent,
        result: {
          updateAvailable: boolean
          currentVersion: string
          info?: unknown
          message?: string
        }
      ): void => {
        cb(result)
      }
      ipcRenderer.on(IpcChannels.updateAvailable, handler)
      return () => {
        ipcRenderer.removeListener(IpcChannels.updateAvailable, handler)
      }
    }
  }
}

contextBridge.exposeInMainWorld('archeon', archeonApi)
