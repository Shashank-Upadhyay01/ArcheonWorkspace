import { createStore } from '../lib/create-store'
import { nextAgentColor } from '@shared/colors'
import { createId } from '@shared/ids'
import {
  builtinPresets,
  closePane as closePaneInTree,
  collectPaneIds,
  createLeaf,
  openAsTab,
  orderedPaneIds,
  placeholderPaneId,
  remapLayoutIds,
  reorderTabs,
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

/** Live roster status for a pane (not persisted). */
export type PaneRuntimeStatus =
  | 'idle'
  | 'running'
  | 'exited'
  | 'streaming'
  | 'error'

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
  /** Settings modal open (command palette / title bar). */
  settingsOpen: boolean
  /** Shell pane ids selected for broadcast input. */
  broadcastPaneIds: string[]
  /** Live paneId → PTY sessionId for active shells/CLI agents. */
  ptySessionByPane: Record<string, string>
  /** Live roster status by pane id. */
  paneRuntimeStatus: Record<string, PaneRuntimeStatus>
  /**
   * Bumped when focusPane wants a pane to take input focus (terminal / composer).
   * Panes watch `seq` for their id and call term.focus() / input.focus().
   */
  focusRequest: { paneId: string; seq: number } | null

  bootstrap: () => Promise<void>
  refreshList: () => Promise<void>
  createWorkspace: (name: string) => Promise<void>
  selectWorkspace: (id: string) => Promise<void>
  renameWorkspace: (id: string, name: string) => Promise<void>
  deleteWorkspace: (id: string) => Promise<void>
  setSidebarCollapsed: (collapsed: boolean) => void
  setSettingsOpen: (open: boolean) => void
  markDirty: () => void
  flushSave: () => Promise<void>
  addPane: (type: PaneType, direction?: 'h' | 'v', anchorPaneId?: string) => Promise<void>
  /** Create a new pane as a tab next to the anchor (active pane by default). */
  addPaneAsTab: (type: PaneType, anchorPaneId?: string) => Promise<void>
  /** Clone a pane as a split to the right of the source. */
  duplicatePane: (paneId: string) => Promise<void>
  closePane: (id: string) => Promise<void>
  renamePane: (id: string, name: string) => void
  setPaneColor: (id: string, color: string) => void
  setLayout: (layout: LayoutNode) => void
  focusPane: (id: string) => void
  focusNextPane: () => void
  focusPrevPane: () => void
  reorderPaneTabs: (paneIdInGroup: string, fromIndex: number, toIndex: number) => void
  applyPreset: (presetId: string) => Promise<void>
  /** Bind workspace (and shell/CLI panes) to a project folder. */
  setProjectRoot: (path: string | null) => Promise<void>
  /** Open folder dialog and set project root. */
  pickProjectRoot: () => Promise<void>
  setTheme: (themeId: 'default' | 'light') => Promise<void>
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
  toggleBroadcastPane: (paneId: string) => void
  setBroadcastPaneIds: (ids: string[]) => void
  clearBroadcast: () => void
  /** Toggle: clear selection, or select all shell panes when empty. */
  toggleBroadcastMode: () => void
  registerPtySession: (paneId: string, sessionId: string | null) => void
  setPaneRuntimeStatus: (paneId: string, status: PaneRuntimeStatus | null) => void
  exportWorkspace: () => Promise<{ canceled: boolean; path?: string }>
  importWorkspace: () => Promise<{ canceled: boolean }>
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
 * cwd: prefer workspace projectRoot; empty string means "resolve to homedir" in main.
 */
function paneDefaults(
  type: PaneType,
  id: string,
  color: string,
  settings?: AppSettings | null,
  projectRoot?: string
): Pane {
  const cwd = projectRoot?.trim() || ''
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
        cwd
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
        systemPrompt: projectRoot
          ? `Project folder: ${projectRoot}\nPrefer paths relative to this project when suggesting files.`
          : '',
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
      cwd
    }
  }
}

/** Apply project root as cwd on all shell/CLI panes (bind agents to the project). */
function bindPanesToProjectRoot(
  panes: Record<string, Pane>,
  projectRoot: string
): Record<string, Pane> {
  const root = projectRoot.trim()
  const next: Record<string, Pane> = {}
  for (const [id, pane] of Object.entries(panes)) {
    if (pane.type === 'shell' && pane.shell) {
      next[id] = { ...pane, shell: { ...pane.shell, cwd: root } }
    } else if (pane.type === 'cli_agent' && pane.cli) {
      next[id] = { ...pane, cli: { ...pane.cli, cwd: root } }
    } else if (pane.type === 'ai_chat' && pane.aiChat) {
      const hint = root
        ? `Project folder: ${root}\nPrefer paths relative to this project when suggesting files.`
        : ''
      const prev = pane.aiChat.systemPrompt || ''
      const stripped = prev.replace(/^Project folder:.*(\nPrefer paths.*)?\n?/m, '').trim()
      next[id] = {
        ...pane,
        aiChat: {
          ...pane.aiChat,
          systemPrompt: [hint, stripped].filter(Boolean).join('\n\n')
        }
      }
    } else {
      next[id] = pane
    }
  }
  return next
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

/** Schedule a single debounced flushSave from the current autosaveMs. */
function scheduleDebouncedSave(get: () => AppState): void {
  const ms = get().settings?.autosaveMs ?? DEFAULT_SETTINGS.autosaveMs
  clearSaveTimer()
  saveTimer = setTimeout(() => {
    saveTimer = null
    void get().flushSave()
  }, ms)
}

/**
 * Apply a dirty workspace mutation: one generation bump + debounce schedule.
 * Callers must not also call markDirty() (that would double-bump).
 */
function dirtyWorkspace(
  set: (partial: Partial<AppState>) => void,
  get: () => AppState,
  next: Workspace
): void {
  saveGeneration = bumpSaveGeneration(saveGeneration)
  set({ activeWorkspace: next, dirty: true, autosaveStatus: 'dirty' })
  scheduleDebouncedSave(get)
}

/**
 * Materialize a preset into real pane records + remapped layout.
 * Placeholder ids `__p0`… map 1:1 to `paneTemplates` by index.
 */
function materializePreset(
  preset: LayoutPreset,
  usedColors: string[] = [],
  settings?: AppSettings | null,
  projectRoot?: string
): { layout: LayoutNode; panes: Record<string, Pane>; activePaneId: string } {
  const templates = preset.paneTemplates ?? [{ type: 'shell' as PaneType }]
  const idMap = new Map<string, string>()
  const panes: Record<string, Pane> = {}
  const colors = [...usedColors]
  const root = projectRoot?.trim() || ''

  for (let i = 0; i < templates.length; i++) {
    const tpl = templates[i]
    const paneId = createId('pane')
    const color = tpl.color ?? nextAgentColor(colors)
    colors.push(color)
    const base = paneDefaults(tpl.type, paneId, color, settings, root)
    const pane: Pane = {
      ...base,
      ...tpl,
      id: paneId,
      name: tpl.name ?? base.name,
      color,
      type: tpl.type
    }
    // Ensure type-specific defaults when template only sets type
    if (pane.type === 'shell') {
      pane.shell = {
        shellId: pane.shell?.shellId ?? settings?.defaultShellId ?? 'default',
        cwd: root || pane.shell?.cwd || ''
      }
    }
    if (pane.type === 'cli_agent') {
      pane.cli = {
        command: pane.cli?.command ?? '',
        args: pane.cli?.args ?? [],
        env: pane.cli?.env ?? {},
        cwd: root || pane.cli?.cwd || '',
        lastExitCode: pane.cli?.lastExitCode ?? null
      }
    }
    if (pane.type === 'ai_chat') {
      pane.aiChat = {
        providerId:
          pane.aiChat?.providerId ??
          settings?.defaultProviderId ??
          DEFAULT_SETTINGS.defaultProviderId ??
          'xai',
        model:
          pane.aiChat?.model ??
          settings?.defaultModel ??
          DEFAULT_SETTINGS.defaultModel ??
          'grok-2-latest',
        systemPrompt:
          pane.aiChat?.systemPrompt ||
          (root
            ? `Project folder: ${root}\nPrefer paths relative to this project when suggesting files.`
            : ''),
        threadId: pane.aiChat?.threadId ?? createId('thread'),
        contextLimit: pane.aiChat?.contextLimit
      }
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

export const useAppStore = createStore<AppState>((set, get) => ({
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
  settingsOpen: false,
  broadcastPaneIds: [],
  ptySessionByPane: {},
  paneRuntimeStatus: {},
  focusRequest: null,

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
      document.documentElement.dataset.theme =
        settings.themeId === 'light' ? 'light' : 'dark'
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
    const cwd = ws.projectRoot?.trim() || defaults.cwd || ''
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
              cwd,
              lastExitCode: pane.cli?.lastExitCode ?? null
            }
          }
        }
      }
      dirtyWorkspace(set, get, next)
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
        cwd
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
    dirtyWorkspace(set, get, next)
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
    dirtyWorkspace(set, get, next)
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
      sidebarCollapsed: fresh?.sidebarCollapsed ?? false,
      // New workspace has different panes — drop live runtime maps
      broadcastPaneIds: [],
      ptySessionByPane: {},
      paneRuntimeStatus: {}
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
      sidebarCollapsed: ws?.sidebarCollapsed ?? get().sidebarCollapsed,
      broadcastPaneIds: [],
      ptySessionByPane: {},
      paneRuntimeStatus: {}
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
        sidebarCollapsed: nextActive?.sidebarCollapsed ?? false,
        // Active workspace changed — same cleanup as selectWorkspace
        broadcastPaneIds: [],
        ptySessionByPane: {},
        paneRuntimeStatus: {}
      })
    } else {
      // Non-active delete: keep active dirty / autosave / workspace intact
      set({ workspaces: list })
    }
  },

  setSidebarCollapsed(collapsed: boolean) {
    const ws = get().activeWorkspace
    if (!ws) {
      set({ sidebarCollapsed: collapsed })
      return
    }
    const next = { ...ws, sidebarCollapsed: collapsed }
    set({ sidebarCollapsed: collapsed })
    dirtyWorkspace(set, get, next)
  },

  setSettingsOpen(open: boolean) {
    set({ settingsOpen: open })
  },

  toggleBroadcastPane(paneId: string) {
    const ws = get().activeWorkspace
    if (!ws || !ws.panes[paneId] || ws.panes[paneId].type !== 'shell') return
    const current = get().broadcastPaneIds
    const next = current.includes(paneId)
      ? current.filter((id) => id !== paneId)
      : [...current, paneId]
    set({ broadcastPaneIds: next })
  },

  setBroadcastPaneIds(ids: string[]) {
    const ws = get().activeWorkspace
    if (!ws) {
      set({ broadcastPaneIds: [] })
      return
    }
    const valid = ids.filter((id) => ws.panes[id]?.type === 'shell')
    set({ broadcastPaneIds: valid })
  },

  clearBroadcast() {
    set({ broadcastPaneIds: [] })
  },

  toggleBroadcastMode() {
    const ws = get().activeWorkspace
    if (!ws) {
      set({ broadcastPaneIds: [] })
      return
    }
    if (get().broadcastPaneIds.length > 0) {
      set({ broadcastPaneIds: [] })
      return
    }
    const shellIds = Object.values(ws.panes)
      .filter((p) => p.type === 'shell')
      .map((p) => p.id)
    set({ broadcastPaneIds: shellIds })
  },

  registerPtySession(paneId: string, sessionId: string | null) {
    const map = { ...get().ptySessionByPane }
    if (sessionId) {
      map[paneId] = sessionId
    } else {
      delete map[paneId]
    }
    set({ ptySessionByPane: map })
  },

  setPaneRuntimeStatus(paneId: string, status: PaneRuntimeStatus | null) {
    const map = { ...get().paneRuntimeStatus }
    if (status) {
      map[paneId] = status
    } else {
      delete map[paneId]
    }
    set({ paneRuntimeStatus: map })
  },

  async exportWorkspace() {
    const ws = get().activeWorkspace
    if (!ws) return { canceled: true }
    await get().flushSave()
    const api = getArcheonApi()
    try {
      const result = await api.workspace.export(ws.id)
      if (!result.canceled) {
        set({ error: null })
      }
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ error: `Export failed: ${message}` })
      return { canceled: true }
    }
  },

  async importWorkspace() {
    const api = getArcheonApi()
    await get().flushSave()
    try {
      const result = await api.workspace.import()
      if (result.canceled || !result.workspace) {
        return { canceled: true }
      }
      await api.workspace.setActive(result.workspace.id)
      const list = await api.workspace.list()
      const fresh = await api.workspace.get(result.workspace.id)
      set({
        workspaces: list,
        activeWorkspace: fresh,
        dirty: false,
        autosaveStatus: 'saved',
        sidebarCollapsed: fresh?.sidebarCollapsed ?? false,
        broadcastPaneIds: [],
        ptySessionByPane: {},
        paneRuntimeStatus: {},
        error: null
      })
      return { canceled: false }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ error: `Import failed: ${message}` })
      return { canceled: true }
    }
  },

  markDirty() {
    // Standalone dirty bump (e.g. external callers). Prefer dirtyWorkspace for
    // workspace mutations so generation is only bumped once per edit.
    saveGeneration = bumpSaveGeneration(saveGeneration)
    set({ dirty: true, autosaveStatus: 'dirty' })
    scheduleDebouncedSave(get)
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
    const pane = paneDefaults(
      type,
      paneId,
      nextAgentColor(usedColors),
      get().settings,
      ws.projectRoot
    )
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
      let layout = splitNode(ws.layout, anchor, direction, paneId)
      // If split was a no-op (anchor missing), fall back to first layout pane
      if (layout === ws.layout) {
        const ids = orderedPaneIds(ws.layout)
        const fallback = ids[0]
        if (fallback) {
          layout = splitNode(ws.layout, fallback, direction, paneId)
        }
      }
      next = {
        ...ws,
        panes: { ...ws.panes, [paneId]: pane },
        layout,
        activePaneId: paneId
      }
    }

    dirtyWorkspace(set, get, next)
    // Persist promptly so pane creations survive refresh
    await get().flushSave()
  },

  async addPaneAsTab(type: PaneType, anchorPaneId?: string) {
    const ws = get().activeWorkspace
    if (!ws) return

    const usedColors = Object.values(ws.panes).map((p) => p.color)
    const paneId = createId('pane')
    const pane = paneDefaults(
      type,
      paneId,
      nextAgentColor(usedColors),
      get().settings,
      ws.projectRoot
    )
    const paneCount = Object.keys(ws.panes).length

    if (paneCount === 0) {
      const next: Workspace = {
        ...ws,
        panes: { [paneId]: pane },
        layout: createLeaf(paneId),
        activePaneId: paneId
      }
      dirtyWorkspace(set, get, next)
      await get().flushSave()
      return
    }

    const anchor = anchorPaneId ?? ws.activePaneId ?? Object.keys(ws.panes)[0]
    let layout = openAsTab(ws.layout, anchor, paneId)
    if (layout === ws.layout) {
      const ids = orderedPaneIds(ws.layout)
      const fallback = ids[0]
      if (fallback) layout = openAsTab(ws.layout, fallback, paneId)
    }
    // If still no-op, split instead of failing silently
    if (layout === ws.layout) {
      await get().addPane(type, 'h', anchor)
      return
    }

    const next: Workspace = {
      ...ws,
      panes: { ...ws.panes, [paneId]: pane },
      layout,
      activePaneId: paneId
    }
    dirtyWorkspace(set, get, next)
    await get().flushSave()
  },

  reorderPaneTabs(paneIdInGroup: string, fromIndex: number, toIndex: number) {
    const ws = get().activeWorkspace
    if (!ws) return
    const layout = reorderTabs(ws.layout, paneIdInGroup, fromIndex, toIndex)
    if (layout === ws.layout) return
    dirtyWorkspace(set, get, { ...ws, layout })
  },

  async duplicatePane(paneId: string) {
    const ws = get().activeWorkspace
    if (!ws || !ws.panes[paneId]) return
    const source = ws.panes[paneId]
    const newId = createId('pane')
    const clone: Pane = structuredClone(source)
    clone.id = newId
    clone.name = `${source.name} copy`
    if (clone.aiChat) {
      clone.aiChat = { ...clone.aiChat, threadId: createId('thread') }
    }
    let layout = splitNode(ws.layout, paneId, 'h', newId)
    if (layout === ws.layout) {
      const ids = orderedPaneIds(ws.layout)
      const fallback = ids[0]
      if (fallback) layout = splitNode(ws.layout, fallback, 'h', newId)
    }
    if (layout === ws.layout) return
    const next: Workspace = {
      ...ws,
      panes: { ...ws.panes, [newId]: clone },
      layout,
      activePaneId: newId
    }
    dirtyWorkspace(set, get, next)
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

    const { [id]: _sess, ...restSessions } = get().ptySessionByPane
    const { [id]: _st, ...restStatus } = get().paneRuntimeStatus
    set({
      broadcastPaneIds: get().broadcastPaneIds.filter((pid) => pid !== id),
      ptySessionByPane: restSessions,
      paneRuntimeStatus: restStatus
    })

    dirtyWorkspace(set, get, next)
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
    dirtyWorkspace(set, get, next)
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
    dirtyWorkspace(set, get, next)
  },

  setLayout(layout: LayoutNode) {
    const ws = get().activeWorkspace
    if (!ws) return
    const next: Workspace = { ...ws, layout }
    dirtyWorkspace(set, get, next)
  },

  focusPane(id: string) {
    const ws = get().activeWorkspace
    if (!ws || !ws.panes[id]) return
    const seq = (get().focusRequest?.seq ?? 0) + 1
    // Always request input focus so re-clicking the active pane still focuses the term
    if (ws.activePaneId !== id) {
      // Focus is UI state worth persisting — mark dirty so resume restores it
      const next: Workspace = { ...ws, activePaneId: id }
      dirtyWorkspace(set, get, next)
    }
    set({ focusRequest: { paneId: id, seq } })
  },

  focusNextPane() {
    const ws = get().activeWorkspace
    if (!ws) return
    const ids = orderedPaneIds(ws.layout)
    if (ids.length === 0) return
    const current = ws.activePaneId ?? ids[0]
    const idx = Math.max(0, ids.indexOf(current))
    const nextId = ids[(idx + 1) % ids.length]
    get().focusPane(nextId)
  },

  focusPrevPane() {
    const ws = get().activeWorkspace
    if (!ws) return
    const ids = orderedPaneIds(ws.layout)
    if (ids.length === 0) return
    const current = ws.activePaneId ?? ids[0]
    const idx = Math.max(0, ids.indexOf(current))
    const nextId = ids[(idx - 1 + ids.length) % ids.length]
    get().focusPane(nextId)
  },

  async setTheme(themeId: 'default' | 'light') {
    await get().updateSettings({ themeId })
    document.documentElement.dataset.theme = themeId === 'light' ? 'light' : 'dark'
  },

  async applyPreset(presetId: string) {
    const ws = get().activeWorkspace
    if (!ws) return
    const preset = findPreset(presetId, get().userPresets)
    if (!preset) return

    const { layout, panes, activePaneId } = materializePreset(
      preset,
      [],
      get().settings,
      ws.projectRoot
    )
    const next: Workspace = {
      ...ws,
      panes,
      layout,
      activePaneId
    }
    dirtyWorkspace(set, get, next)
    // Preset replaces all panes — drop stale broadcast/PTY/runtime maps
    set({
      broadcastPaneIds: [],
      ptySessionByPane: {},
      paneRuntimeStatus: {}
    })
    await get().flushSave()
  },

  async setProjectRoot(path: string | null) {
    const ws = get().activeWorkspace
    if (!ws) return
    const root = path?.trim() || undefined
    const panes = root ? bindPanesToProjectRoot(ws.panes, root) : ws.panes
    // If clearing root, leave pane cwds as-is (user may have customized)
    const next: Workspace = {
      ...ws,
      projectRoot: root,
      panes
    }
    dirtyWorkspace(set, get, next)
    await get().flushSave()
  },

  async pickProjectRoot() {
    const api = getArcheonApi()
    const ws = get().activeWorkspace
    const result = await api.dialog.openFolder(ws?.projectRoot)
    if (result.canceled || !result.path) return
    await get().setProjectRoot(result.path)
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
    if (partial.themeId !== undefined) {
      document.documentElement.dataset.theme =
        settings.themeId === 'light' ? 'light' : 'dark'
    }
  }
}))
