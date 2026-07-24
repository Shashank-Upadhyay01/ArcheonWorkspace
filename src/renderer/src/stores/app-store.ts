import { create } from 'zustand'
import { nextAgentColor } from '@shared/colors'
import { createId } from '@shared/ids'
import {
  builtinPresets,
  closePane as closePaneInTree,
  collectPaneIds,
  createLeaf,
  placeholderPaneId,
  remapLayoutIds,
  splitNode
} from '@shared/layout'
import {
  bumpSaveGeneration,
  shouldClearDirtyAfterFlush
} from '@shared/save-generation'
import { parseCliDefaults } from '@shared/profiles'
import type {
  AgentProfile,
  AppSettings,
  LayoutNode,
  LayoutPreset,
  Pane,
  PaneType,
  Workspace
} from '@shared/types'
import type { WorkspaceSummary } from '../../../preload/index.d'
import { getArcheonApi } from '../lib/ipc'

export type AutosaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

interface AppState {
  workspaces: WorkspaceSummary[]
  activeWorkspace: Workspace | null
  settings: AppSettings | null
  userPresets: LayoutPreset[]
  /** User-saved agent profiles (built-ins live in shared/profiles). */
  userProfiles: AgentProfile[]
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
  addPane: (type: PaneType, direction?: 'h' | 'v', anchorPaneId?: string) => Promise<void>
  closePane: (id: string) => Promise<void>
  renamePane: (id: string, name: string) => void
  setPaneColor: (id: string, color: string) => void
  setLayout: (layout: LayoutNode) => void
  focusPane: (id: string) => void
  applyPreset: (presetId: string) => Promise<void>
  saveUserPreset: (name: string) => Promise<void>
  refreshUserPresets: () => Promise<void>
  refreshUserProfiles: () => Promise<void>
  upsertProfile: (profile: AgentProfile) => Promise<void>
  deleteProfile: (id: string) => Promise<void>
  /** Apply a profile's defaults onto an existing cli_agent pane (or create one). */
  applyProfile: (profile: AgentProfile, paneId?: string) => Promise<void>
  updatePaneCli: (
    paneId: string,
    partial: Partial<NonNullable<Pane['cli']>> & { profileId?: string; name?: string; color?: string }
  ) => void
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>
}

const DEFAULT_SETTINGS: AppSettings = {
  themeId: 'default',
  autosaveMs: 1000,
  defaultProviderId: 'xai',
  defaultModel: 'grok-2-latest',
  providers: [
    { id: 'xai', label: 'xAI', baseUrl: 'https://api.x.ai/v1' },
    {
      id: 'openai-compatible',
      label: 'OpenAI-compatible',
      baseUrl: 'https://api.openai.com/v1'
    }
  ]
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
/** Bumped on every dirtying mutation; flush only clears dirty if gen still matches. */
let saveGeneration = 0

function clearSaveTimer(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
}

/**
 * cwd: empty string means "resolve to homedir later" (PTY task).
 * Renderer has no os.homedir(); main/Task 7 maps '' → home.
 */
function paneDefaults(
  type: PaneType,
  id: string,
  color: string,
  settings?: AppSettings | null
): Pane {
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
        shellId: settings?.defaultShellId ?? 'default',
        cwd: ''
      }
    }
  }

  if (type === 'ai_chat') {
    return {
      ...base,
      aiChat: {
        providerId:
          settings?.defaultProviderId ?? DEFAULT_SETTINGS.defaultProviderId ?? 'xai',
        model: settings?.defaultModel ?? DEFAULT_SETTINGS.defaultModel ?? 'grok-2-latest',
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
      cwd: ''
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

function dirtyWorkspace(set: (partial: Partial<AppState>) => void, next: Workspace): void {
  saveGeneration = bumpSaveGeneration(saveGeneration)
  set({ activeWorkspace: next, dirty: true, autosaveStatus: 'dirty' })
}

/**
 * Materialize a preset into real pane records + remapped layout.
 * Placeholder ids `__p0`… map 1:1 to `paneTemplates` by index.
 */
function materializePreset(
  preset: LayoutPreset,
  usedColors: string[] = [],
  settings?: AppSettings | null
): { layout: LayoutNode; panes: Record<string, Pane>; activePaneId: string } {
  const templates = preset.paneTemplates ?? [{ type: 'shell' as PaneType }]
  const idMap = new Map<string, string>()
  const panes: Record<string, Pane> = {}
  const colors = [...usedColors]

  for (let i = 0; i < templates.length; i++) {
    const tpl = templates[i]
    const paneId = createId('pane')
    const color = tpl.color ?? nextAgentColor(colors)
    colors.push(color)
    const base = paneDefaults(tpl.type, paneId, color, settings)
    const pane: Pane = {
      ...base,
      ...tpl,
      id: paneId,
      name: tpl.name ?? base.name,
      color,
      type: tpl.type
    }
    // Ensure type-specific defaults when template only sets type
    if (pane.type === 'shell' && !pane.shell) {
      pane.shell = { shellId: settings?.defaultShellId ?? 'default', cwd: '' }
    }
    if (pane.type === 'ai_chat' && !pane.aiChat) {
      pane.aiChat = {
        providerId:
          settings?.defaultProviderId ?? DEFAULT_SETTINGS.defaultProviderId ?? 'xai',
        model: settings?.defaultModel ?? DEFAULT_SETTINGS.defaultModel ?? 'grok-2-latest',
        systemPrompt: '',
        threadId: createId('thread')
      }
    }
    if (pane.type === 'cli_agent' && !pane.cli) {
      pane.cli = { command: '', args: [], env: {}, cwd: '' }
    }
    panes[paneId] = pane
    idMap.set(placeholderPaneId(i), paneId)
  }

  // Also map any leaf ids that match templates by order from collectPaneIds
  const placeholders = collectPaneIds(preset.layout)
  placeholders.forEach((ph, i) => {
    if (!idMap.has(ph) && i < templates.length) {
      const mapped = idMap.get(placeholderPaneId(i))
      if (mapped) idMap.set(ph, mapped)
    }
  })

  const layout = remapLayoutIds(preset.layout, idMap)
  const firstId = collectPaneIds(layout)[0] ?? Object.keys(panes)[0]
  return { layout, panes, activePaneId: firstId }
}

/** Snapshot current workspace layout as a user preset with placeholder pane ids. */
function workspaceToPreset(ws: Workspace, name: string): LayoutPreset {
  const orderedIds = collectPaneIds(ws.layout)
  const idMap = new Map<string, string>()
  const paneTemplates: Array<Partial<Pane> & { type: PaneType }> = []

  orderedIds.forEach((id, i) => {
    const ph = placeholderPaneId(i)
    idMap.set(id, ph)
    const pane = ws.panes[id]
    if (pane) {
      paneTemplates.push({
        type: pane.type,
        name: pane.name,
        color: pane.color
      })
    } else {
      paneTemplates.push({ type: 'shell' })
    }
  })

  return {
    id: createId('preset'),
    name,
    builtIn: false,
    layout: remapLayoutIds(ws.layout, idMap),
    paneTemplates
  }
}

function findPreset(presetId: string, userPresets: LayoutPreset[]): LayoutPreset | undefined {
  return builtinPresets().find((p) => p.id === presetId) ?? userPresets.find((p) => p.id === presetId)
}

export const useAppStore = create<AppState>((set, get) => ({
  workspaces: [],
  activeWorkspace: null,
  settings: null,
  userPresets: [],
  userProfiles: [],
  sidebarCollapsed: false,
  dirty: false,
  autosaveStatus: 'idle',
  ready: false,
  error: null,

  async bootstrap() {
    try {
      const api = getArcheonApi()
      const [list, settings, userPresets, userProfiles] = await Promise.all([
        api.workspace.list(),
        api.settings.get(),
        api.presets.list(),
        api.profiles.list()
      ])
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
        userPresets,
        userProfiles,
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

  async refreshUserPresets() {
    const api = getArcheonApi()
    const userPresets = await api.presets.list()
    set({ userPresets })
  },

  async refreshUserProfiles() {
    const api = getArcheonApi()
    const userProfiles = await api.profiles.list()
    set({ userProfiles })
  },

  async upsertProfile(profile: AgentProfile) {
    const api = getArcheonApi()
    const userProfiles = await api.profiles.upsert(profile)
    set({ userProfiles })
  },

  async deleteProfile(id: string) {
    const api = getArcheonApi()
    const userProfiles = await api.profiles.delete(id)
    set({ userProfiles })
  },

  async applyProfile(profile: AgentProfile, paneId?: string) {
    const ws = get().activeWorkspace
    if (!ws) return

    const defaults = parseCliDefaults(profile.defaults)
    const targetId =
      paneId ??
      (ws.activePaneId && ws.panes[ws.activePaneId]?.type === 'cli_agent'
        ? ws.activePaneId
        : undefined)

    if (targetId && ws.panes[targetId]?.type === 'cli_agent') {
      const pane = ws.panes[targetId]
      const next: Workspace = {
        ...ws,
        panes: {
          ...ws.panes,
          [targetId]: {
            ...pane,
            name: profile.name,
            color: profile.color,
            profileId: profile.id,
            cli: {
              command: defaults.command,
              args: [...defaults.args],
              env: { ...defaults.env },
              cwd: defaults.cwd,
              lastExitCode: pane.cli?.lastExitCode ?? null
            }
          }
        }
      }
      dirtyWorkspace(set, next)
      await get().flushSave()
      return
    }

    // Create a new cli_agent pane pre-filled from the profile
    const usedColors = Object.values(ws.panes).map((p) => p.color)
    const newId = createId('pane')
    const pane: Pane = {
      id: newId,
      name: profile.name,
      color: profile.color || nextAgentColor(usedColors),
      type: 'cli_agent',
      profileId: profile.id,
      cli: {
        command: defaults.command,
        args: [...defaults.args],
        env: { ...defaults.env },
        cwd: defaults.cwd
      }
    }
    const paneCount = Object.keys(ws.panes).length
    let next: Workspace
    if (paneCount === 0) {
      next = {
        ...ws,
        panes: { [newId]: pane },
        layout: createLeaf(newId),
        activePaneId: newId
      }
    } else {
      const anchor = ws.activePaneId ?? Object.keys(ws.panes)[0]
      next = {
        ...ws,
        panes: { ...ws.panes, [newId]: pane },
        layout: splitNode(ws.layout, anchor, 'h', newId),
        activePaneId: newId
      }
    }
    dirtyWorkspace(set, next)
    await get().flushSave()
  },

  updatePaneCli(paneId, partial) {
    const ws = get().activeWorkspace
    if (!ws || !ws.panes[paneId]) return
    const pane = ws.panes[paneId]
    if (pane.type !== 'cli_agent') return

    const { profileId, name, color, ...cliPartial } = partial
    const nextCli = {
      command: pane.cli?.command ?? '',
      args: pane.cli?.args ?? [],
      env: pane.cli?.env ?? {},
      cwd: pane.cli?.cwd ?? '',
      lastExitCode: pane.cli?.lastExitCode,
      ...cliPartial
    }
    const next: Workspace = {
      ...ws,
      panes: {
        ...ws.panes,
        [paneId]: {
          ...pane,
          ...(name !== undefined ? { name } : {}),
          ...(color !== undefined ? { color } : {}),
          ...(profileId !== undefined ? { profileId } : {}),
          cli: nextCli
        }
      }
    }
    dirtyWorkspace(set, next)
    get().markDirty()
  },

  async createWorkspace(name: string) {
    const api = getArcheonApi()
    // Persist any dirty active workspace before switching away
    await get().flushSave()
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

    // Always flush active dirty state first so rename never drops pending edits
    await get().flushSave()

    const current = get().activeWorkspace
    const isActive = current?.id === id
    let target = isActive ? current : await api.workspace.get(id)
    if (!target) return

    target = { ...target, name: trimmed }
    await api.workspace.save(target)
    const list = await api.workspace.list()

    if (isActive) {
      set({
        workspaces: list,
        activeWorkspace: target,
        dirty: false,
        autosaveStatus: 'saved'
      })
    } else {
      // Non-active rename: leave active dirty / autosave state intact
      set({ workspaces: list })
    }
  },

  async deleteWorkspace(id: string) {
    const api = getArcheonApi()
    const wasActive = get().activeWorkspace?.id === id

    // Flush dirty active workspace before delete (whether active or not)
    await get().flushSave()

    await api.workspace.delete(id)
    const list = await api.workspace.list()

    if (wasActive) {
      let nextActive: Workspace | null = null
      if (list.length > 0) {
        nextActive = await api.workspace.get(list[0].id)
        if (nextActive) {
          await api.workspace.setActive(nextActive.id)
        }
      }
      set({
        workspaces: list,
        activeWorkspace: nextActive,
        dirty: false,
        autosaveStatus: 'idle',
        sidebarCollapsed: nextActive?.sidebarCollapsed ?? false
      })
    } else {
      // Non-active delete: keep active dirty / autosave / workspace intact
      set({ workspaces: list })
    }
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
    saveGeneration = bumpSaveGeneration(saveGeneration)
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
    const gen = saveGeneration
    set({ autosaveStatus: 'saving' })
    try {
      const api = getArcheonApi()
      await api.workspace.save(ws)
      const list = await api.workspace.list()

      if (shouldClearDirtyAfterFlush(gen, saveGeneration)) {
        // No newer edits while save was in flight — safe to clear dirty
        const fresh = await api.workspace.get(ws.id)
        set({
          workspaces: list,
          activeWorkspace: fresh ?? ws,
          dirty: false,
          autosaveStatus: 'saved'
        })
      } else {
        // Newer local edits exist; keep dirty and re-flush latest snapshot
        set({
          workspaces: list,
          autosaveStatus: 'dirty'
        })
        void get().flushSave()
      }
    } catch (err) {
      set({
        autosaveStatus: 'error',
        error: err instanceof Error ? err.message : String(err)
      })
    }
  },

  async addPane(type: PaneType, direction: 'h' | 'v' = 'h', anchorPaneId?: string) {
    const ws = get().activeWorkspace
    if (!ws) return

    const usedColors = Object.values(ws.panes).map((p) => p.color)
    const paneId = createId('pane')
    const pane = paneDefaults(type, paneId, nextAgentColor(usedColors), get().settings)
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
      const anchor = anchorPaneId ?? ws.activePaneId ?? Object.keys(ws.panes)[0]
      next = {
        ...ws,
        panes: { ...ws.panes, [paneId]: pane },
        layout: splitNode(ws.layout, anchor, direction, paneId),
        activePaneId: paneId
      }
    }

    dirtyWorkspace(set, next)
    // Persist promptly so pane creations survive refresh
    await get().flushSave()
  },

  async closePane(id: string) {
    const ws = get().activeWorkspace
    if (!ws || !ws.panes[id]) return

    const layoutResult = closePaneInTree(ws.layout, id)
    const { [id]: _removed, ...restPanes } = ws.panes

    let next: Workspace
    if (layoutResult === null || Object.keys(restPanes).length === 0) {
      next = toEmptyWorkspace(ws)
    } else {
      const remainingIds = collectPaneIds(layoutResult)
      const activePaneId =
        ws.activePaneId && remainingIds.includes(ws.activePaneId)
          ? ws.activePaneId
          : remainingIds[0]
      // Drop any orphan pane records not referenced by layout
      const panes: Record<string, Pane> = {}
      for (const pid of remainingIds) {
        if (restPanes[pid]) panes[pid] = restPanes[pid]
      }
      next = {
        ...ws,
        panes,
        layout: layoutResult,
        activePaneId
      }
    }

    dirtyWorkspace(set, next)
    await get().flushSave()
  },

  renamePane(id: string, name: string) {
    const ws = get().activeWorkspace
    if (!ws || !ws.panes[id]) return
    const trimmed = name.trim()
    if (!trimmed || trimmed === ws.panes[id].name) return
    const next: Workspace = {
      ...ws,
      panes: {
        ...ws.panes,
        [id]: { ...ws.panes[id], name: trimmed }
      }
    }
    dirtyWorkspace(set, next)
    get().markDirty()
  },

  setPaneColor(id: string, color: string) {
    const ws = get().activeWorkspace
    if (!ws || !ws.panes[id]) return
    if (ws.panes[id].color === color) return
    const next: Workspace = {
      ...ws,
      panes: {
        ...ws.panes,
        [id]: { ...ws.panes[id], color }
      }
    }
    dirtyWorkspace(set, next)
    get().markDirty()
  },

  setLayout(layout: LayoutNode) {
    const ws = get().activeWorkspace
    if (!ws) return
    const next: Workspace = { ...ws, layout }
    dirtyWorkspace(set, next)
    get().markDirty()
  },

  focusPane(id: string) {
    const ws = get().activeWorkspace
    if (!ws || !ws.panes[id]) return
    if (ws.activePaneId === id) return
    // Focus is UI state worth persuming — mark dirty so resume restores it
    const next: Workspace = { ...ws, activePaneId: id }
    dirtyWorkspace(set, next)
    get().markDirty()
  },

  async applyPreset(presetId: string) {
    const ws = get().activeWorkspace
    if (!ws) return
    const preset = findPreset(presetId, get().userPresets)
    if (!preset) return

    const { layout, panes, activePaneId } = materializePreset(
      preset,
      [],
      get().settings
    )
    const next: Workspace = {
      ...ws,
      panes,
      layout,
      activePaneId
    }
    dirtyWorkspace(set, next)
    await get().flushSave()
  },

  async saveUserPreset(name: string) {
    const ws = get().activeWorkspace
    if (!ws) return
    const trimmed = name.trim()
    if (!trimmed) return
    if (Object.keys(ws.panes).length === 0) return

    const preset = workspaceToPreset(ws, trimmed)
    const api = getArcheonApi()
    const userPresets = await api.presets.upsert(preset)
    set({ userPresets })
  },

  async updateSettings(partial: Partial<AppSettings>) {
    const api = getArcheonApi()
    const settings = await api.settings.set(partial)
    set({ settings })
  }
}))
