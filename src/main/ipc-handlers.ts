import { ipcMain } from 'electron'
import { IpcChannels } from '../shared/ipc'
import type { AppSettings, LayoutPreset, Workspace } from '../shared/types'
import type { PtyManager, PtySpawnOptions } from './pty-manager'
import { loadScrollback, saveScrollback } from './session-scrollback'
import type { WorkspaceStore } from './workspace-store'

export interface IpcHandlerDeps {
  store: WorkspaceStore
  pty: PtyManager
  sessionsDir: string
}

/**
 * Register workspace + settings + PTY + session IPC handlers.
 * Call once after the store / PtyManager are constructed on app ready.
 */
export function registerIpcHandlers(deps: IpcHandlerDeps): void {
  const { store, pty, sessionsDir } = deps

  ipcMain.handle(IpcChannels.workspaceList, () => store.list())

  ipcMain.handle(IpcChannels.workspaceGet, (_event, id: string) => store.get(id))

  ipcMain.handle(IpcChannels.workspaceCreate, (_event, name: string) => store.create(name))

  ipcMain.handle(IpcChannels.workspaceSave, (_event, ws: Workspace) => {
    store.save(ws)
  })

  ipcMain.handle(IpcChannels.workspaceDelete, (_event, id: string) => {
    store.delete(id)
  })

  ipcMain.handle(IpcChannels.workspaceSetActive, (_event, id: string) => {
    store.setActive(id)
  })

  ipcMain.handle(IpcChannels.exportWorkspace, (_event, id: string) => {
    const json = store.exportWorkspace(id)
    if (json === null) {
      throw new Error(`Unknown workspace: ${id}`)
    }
    return json
  })

  ipcMain.handle(IpcChannels.importWorkspace, (_event, json: string) =>
    store.importWorkspace(json)
  )

  ipcMain.handle(IpcChannels.settingsGet, () => store.getSettings())

  ipcMain.handle(IpcChannels.settingsSet, (_event, partial: Partial<AppSettings>) =>
    store.setSettings(partial)
  )

  ipcMain.handle(IpcChannels.presetsList, () => store.loadPresets())

  ipcMain.handle(IpcChannels.presetsSave, (_event, presets: LayoutPreset[]) =>
    store.savePresets(presets)
  )

  ipcMain.handle(IpcChannels.presetsUpsert, (_event, preset: LayoutPreset) =>
    store.upsertPreset(preset)
  )

  // ── PTY ────────────────────────────────────────────────────
  ipcMain.handle(IpcChannels.ptySpawn, (_event, opts: PtySpawnOptions) => pty.spawn(opts))

  // High-frequency: fire-and-forget
  ipcMain.on(IpcChannels.ptyWrite, (_event, sessionId: string, data: string) => {
    if (typeof sessionId === 'string' && typeof data === 'string') {
      pty.write(sessionId, data)
    }
  })

  ipcMain.on(
    IpcChannels.ptyResize,
    (_event, sessionId: string, cols: number, rows: number) => {
      if (typeof sessionId === 'string') {
        pty.resize(sessionId, Number(cols) || 80, Number(rows) || 24)
      }
    }
  )

  ipcMain.handle(IpcChannels.ptyKill, (_event, sessionId: string) => {
    if (typeof sessionId === 'string') {
      pty.kill(sessionId)
    }
  })

  // ── Scrollback ─────────────────────────────────────────────
  ipcMain.handle(
    IpcChannels.sessionSaveScrollback,
    (
      _event,
      payload: { workspaceId: string; paneId: string; text: string }
    ) => {
      if (!payload?.workspaceId || !payload?.paneId) return
      saveScrollback(
        sessionsDir,
        { workspaceId: payload.workspaceId, paneId: payload.paneId },
        typeof payload.text === 'string' ? payload.text : ''
      )
    }
  )

  ipcMain.handle(
    IpcChannels.sessionLoadScrollback,
    (_event, payload: { workspaceId: string; paneId: string }) => {
      if (!payload?.workspaceId || !payload?.paneId) return null
      return loadScrollback(sessionsDir, {
        workspaceId: payload.workspaceId,
        paneId: payload.paneId
      })
    }
  )
}
