import { create } from 'zustand'
import { nextAgentColor } from '@shared/colors'
import { createId } from '@shared/ids'
import { createLeaf, splitNode } from '@shared/layout'
import type { AppSettings, Pane, PaneType, Workspace } from '@shared/types'
import type { WorkspaceSummary } from '../../../preload/index.d'
import { getArcheonApi } from '../lib/ipc'

export type AutosaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

interface AppState {
  workspaces: WorkspaceSummary[]
  activeWorkspace: Workspace | null
  settings: AppSettings | null
  sidebarCollapsed: boolean
  dirty: boolean
  autosaveStatus: AutosaveStatus
  ready: boolean
  error: string | null

  bootstrap: () => Promise<void>
  refreshList: () => Promise<void>
  createWorkspace: (name: string) => Promise<void>
  selectWorkspace: (id: string) => Promise<void>
  renameWorkspace: (id: string, name: string) => Promise<void>
  deleteWorkspace: (id: string) => Promise<void>
  setSidebarCollapsed: (collapsed: boolean) => void
  markDirty: () => void
  flushSave: () => Promise<void>
  addPane: (type: PaneType) => Promise<void>
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>
}

const DEFAULT_SETTINGS: AppSettings = {
  themeId: 'default',
  autosaveMs: 1000,
  providers: []
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function clearSaveTimer(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
}

function paneDefaults(type: PaneType, id: string, color: string): Pane {
  const base: Pane = {
    id,
    name: type === 'shell' ? 'Shell' : type === 'ai_chat' ? 'AI Chat' : 'CLI Agent',
    color,
    type
  }

  if (type === 'shell') {
    return {
      ...base,
      shell: {
        shellId: 'default',
        cwd: '.'
      }
    }
  }

  if (type === 'ai_chat') {
    return {
      ...base,
      aiChat: {
        providerId: 'default',
        model: 'default',
        systemPrompt: '',
        threadId: createId('thread')
      }
    }
  }

  return {
    ...base,
    cli: {
      command: '',
      args: [],
      env: {},
      cwd: '.'
    }
  }
}

/** Create an empty workspace shell (no panes) so EmptyWorkspace CTAs are usable. */
function toEmptyWorkspace(ws: Workspace): Workspace {
  return {
    ...ws,
    panes: {},
    layout: createLeaf('__empty__'),
    activePaneId: undefined
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  workspaces: [],
  activeWorkspace: null,
  settings: null,
  sidebarCollapsed: false,
  dirty: false,
  autosaveStatus: 'idle',
  ready: false,
  error: null,

  async bootstrap() {
    try {
      const api = getArcheonApi()
      const [list, settings] = await Promise.all([api.workspace.list(), api.settings.get()])
      let active: Workspace | null = null
      const activeId = settings.defaultWorkspaceId
      if (activeId) {
        active = await api.workspace.get(activeId)
      }
      if (!active && list.length > 0) {
        active = await api.workspace.get(list[0].id)
        if (active) {
          await api.workspace.setActive(active.id)
        }
      }
      set({
        workspaces: list,
        settings,
        activeWorkspace: active,
        sidebarCollapsed: active?.sidebarCollapsed ?? false,
        ready: true,
        error: null
      })
    } catch (err) {
      set({
        ready: true,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  },

  async refreshList() {
    const api = getArcheonApi()
    const list = await api.workspace.list()
    set({ workspaces: list })
  },

  async createWorkspace(name: string) {
    const api = getArcheonApi()
    const created = await api.workspace.create(name.trim() || 'Untitled')
    // Start empty so mission-control empty state CTAs are visible
    const empty = toEmptyWorkspace(created)
    await api.workspace.save(empty)
    await api.workspace.setActive(empty.id)
    const list = await api.workspace.list()
    const fresh = await api.workspace.get(empty.id)
    set({
      workspaces: list,
      activeWorkspace: fresh,
      dirty: false,
      autosaveStatus: 'saved',
      sidebarCollapsed: fresh?.sidebarCollapsed ?? false
    })
  },

  async selectWorkspace(id: string) {
    const api = getArcheonApi()
    // Flush pending edits on current workspace first
    await get().flushSave()
    await api.workspace.setActive(id)
    const ws = await api.workspace.get(id)
    set({
      activeWorkspace: ws,
      dirty: false,
      autosaveStatus: 'idle',
      sidebarCollapsed: ws?.sidebarCollapsed ?? get().sidebarCollapsed
    })
  },

  async renameWorkspace(id: string, name: string) {
    const api = getArcheonApi()
    const trimmed = name.trim()
    if (!trimmed) return

    const current = get().activeWorkspace
    let target = current?.id === id ? current : await api.workspace.get(id)
    if (!target) return

    target = { ...target, name: trimmed }
    await api.workspace.save(target)
    const list = await api.workspace.list()
    set({
      workspaces: list,
      activeWorkspace: get().activeWorkspace?.id === id ? target : get().activeWorkspace,
      dirty: false,
      autosaveStatus: 'saved'
    })
  },

  async deleteWorkspace(id: string) {
    const api = getArcheonApi()
    clearSaveTimer()
    await api.workspace.delete(id)
    const list = await api.workspace.list()
    let nextActive: Workspace | null = null
    if (get().activeWorkspace?.id === id) {
      if (list.length > 0) {
        nextActive = await api.workspace.get(list[0].id)
        if (nextActive) {
          await api.workspace.setActive(nextActive.id)
        }
      }
    } else {
      nextActive = get().activeWorkspace
    }
    set({
      workspaces: list,
      activeWorkspace: nextActive,
      dirty: false,
      autosaveStatus: 'idle',
      sidebarCollapsed: nextActive?.sidebarCollapsed ?? false
    })
  },

  setSidebarCollapsed(collapsed: boolean) {
    set({ sidebarCollapsed: collapsed })
    const ws = get().activeWorkspace
    if (!ws) return
    const next = { ...ws, sidebarCollapsed: collapsed }
    set({ activeWorkspace: next })
    get().markDirty()
  },

  markDirty() {
    const ms = get().settings?.autosaveMs ?? DEFAULT_SETTINGS.autosaveMs
    set({ dirty: true, autosaveStatus: 'dirty' })
    clearSaveTimer()
    saveTimer = setTimeout(() => {
      saveTimer = null
      void get().flushSave()
    }, ms)
  },

  async flushSave() {
    clearSaveTimer()
    const ws = get().activeWorkspace
    if (!ws || !get().dirty) {
      return
    }
    set({ autosaveStatus: 'saving' })
    try {
      const api = getArcheonApi()
      await api.workspace.save(ws)
      const list = await api.workspace.list()
      // Reload to pick up server-side updatedAt
      const fresh = await api.workspace.get(ws.id)
      set({
        workspaces: list,
        activeWorkspace: fresh ?? ws,
        dirty: false,
        autosaveStatus: 'saved'
      })
    } catch (err) {
      set({
        autosaveStatus: 'error',
        error: err instanceof Error ? err.message : String(err)
      })
    }
  },

  async addPane(type: PaneType) {
    const ws = get().activeWorkspace
    if (!ws) return

    const usedColors = Object.values(ws.panes).map((p) => p.color)
    const paneId = createId('pane')
    const pane = paneDefaults(type, paneId, nextAgentColor(usedColors))
    const paneCount = Object.keys(ws.panes).length

    let next: Workspace
    if (paneCount === 0) {
      next = {
        ...ws,
        panes: { [paneId]: pane },
        layout: createLeaf(paneId),
        activePaneId: paneId
      }
    } else {
      const anchor = ws.activePaneId ?? Object.keys(ws.panes)[0]
      next = {
        ...ws,
        panes: { ...ws.panes, [paneId]: pane },
        layout: splitNode(ws.layout, anchor, 'h', paneId),
        activePaneId: paneId
      }
    }

    set({ activeWorkspace: next, dirty: true, autosaveStatus: 'dirty' })
    // Persist promptly so pane creations survive refresh
    await get().flushSave()
  },

  async updateSettings(partial: Partial<AppSettings>) {
    const api = getArcheonApi()
    const settings = await api.settings.set(partial)
    set({ settings })
  }
}))
