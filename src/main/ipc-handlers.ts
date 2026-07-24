import { ipcMain } from 'electron'
import { IpcChannels } from '../shared/ipc'
import type { AppSettings, LayoutPreset, Workspace } from '../shared/types'
import type { WorkspaceStore } from './workspace-store'

/**
 * Register workspace + settings IPC handlers against a live WorkspaceStore.
 * Call once after the store is constructed on app ready.
 */
export function registerIpcHandlers(store: WorkspaceStore): void {
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
}
