import fs from 'fs'
import os from 'os'
import path from 'path'
import { nextAgentColor } from '../shared/colors'
import { createId } from '../shared/ids'
import { createLeaf } from '../shared/layout'
import {
  agentProfileSchema,
  layoutPresetSchema,
  parseWorkspace,
  appSettingsSchema
} from '../shared/schemas'
import type {
  AgentProfile,
  AppSettings,
  LayoutNode,
  LayoutPreset,
  Pane,
  Workspace
} from '../shared/types'
import { getUserDataPaths, type UserDataPaths } from './paths'

export interface WorkspaceSummary {
  id: string
  name: string
  updatedAt: string
}

export interface RecoverySnapshot {
  activeWorkspaceId?: string
  workspaces: Workspace[]
}

const DEFAULT_SETTINGS: AppSettings = {
  themeId: 'default',
  autosaveMs: 1000,
  providers: []
}

const SECRET_KEY_RE = /^(api[_-]?key|secret|token|password|authorization|auth|credential|private[_-]?key)$/i

/** Atomically write UTF-8 content (write `*.tmp` then rename). */
function atomicWrite(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.tmp`
  fs.writeFileSync(tmp, content, 'utf8')
  try {
    fs.renameSync(tmp, filePath)
  } catch {
    // Windows cannot rename over an existing destination
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    fs.renameSync(tmp, filePath)
  }
}

function atomicWriteJson(filePath: string, data: unknown): void {
  atomicWrite(filePath, JSON.stringify(data, null, 2))
}

function readJsonFile(filePath: string): unknown | null {
  if (!fs.existsSync(filePath)) return null
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
  } catch {
    return null
  }
}

function stripSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripSecrets)
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_RE.test(k)) continue
      // Never export process env bags (may hold credentials)
      if (k === 'env' && v !== null && typeof v === 'object' && !Array.isArray(v)) {
        out[k] = {}
        continue
      }
      out[k] = stripSecrets(v)
    }
    return out
  }
  return value
}

function remapLayout(node: LayoutNode, idMap: Map<string, string>): LayoutNode {
  if (node.type === 'leaf') {
    return { type: 'leaf', paneId: idMap.get(node.paneId) ?? node.paneId }
  }
  if (node.type === 'tabs') {
    return {
      type: 'tabs',
      active: node.active,
      tabs: node.tabs.map((id) => idMap.get(id) ?? id)
    }
  }
  return {
    type: 'split',
    direction: node.direction,
    sizes: [...node.sizes],
    children: node.children.map((c) => remapLayout(c, idMap))
  }
}

/**
 * File-backed workspace persistence. Injectable `rootDir` (no Electron APIs).
 * Optional `now` for deterministic timestamps in tests.
 */
export class WorkspaceStore {
  private readonly paths: UserDataPaths
  private readonly now: () => Date
  private workspaces = new Map<string, Workspace>()
  private activeId: string | undefined
  private settings: AppSettings = { ...DEFAULT_SETTINGS }

  constructor(rootDir: string, now: () => Date = () => new Date()) {
    this.paths = getUserDataPaths(rootDir)
    this.now = now
    this.ensureDirs()
    this.loadSettings()
    this.loadAll()
  }

  private ensureDirs(): void {
    fs.mkdirSync(this.paths.workspacesDir, { recursive: true })
    fs.mkdirSync(this.paths.sessionsDir, { recursive: true })
    fs.mkdirSync(this.paths.recoveryDir, { recursive: true })
  }

  private workspacePath(id: string): string {
    return path.join(this.paths.workspacesDir, `${id}.json`)
  }

  private recoveryPath(): string {
    return path.join(this.paths.recoveryDir, 'last-snapshot.json')
  }

  private loadSettings(): void {
    const raw = readJsonFile(this.paths.settingsPath)
    if (raw === null) {
      this.settings = { ...DEFAULT_SETTINGS }
      this.activeId = undefined
      return
    }
    const parsed = appSettingsSchema.safeParse(raw)
    if (parsed.success) {
      this.settings = parsed.data as AppSettings
      this.activeId = this.settings.defaultWorkspaceId
    } else {
      this.settings = { ...DEFAULT_SETTINGS }
      this.activeId = undefined
    }
  }

  private persistSettings(): void {
    atomicWriteJson(this.paths.settingsPath, this.settings)
  }

  /** Scan workspaces dir and refresh in-memory cache. */
  loadAll(): Workspace[] {
    this.workspaces.clear()
    if (!fs.existsSync(this.paths.workspacesDir)) {
      return []
    }
    const files = fs.readdirSync(this.paths.workspacesDir).filter((f) => f.endsWith('.json'))
    for (const file of files) {
      const raw = readJsonFile(path.join(this.paths.workspacesDir, file))
      if (raw === null) continue
      try {
        const ws = parseWorkspace(raw)
        this.workspaces.set(ws.id, ws)
      } catch {
        // skip corrupt workspace files
      }
    }
    return Array.from(this.workspaces.values())
  }

  list(): WorkspaceSummary[] {
    return Array.from(this.workspaces.values())
      .map((w) => ({ id: w.id, name: w.name, updatedAt: w.updatedAt }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  get(id: string): Workspace | null {
    const ws = this.workspaces.get(id)
    return ws ? structuredClone(ws) : null
  }

  create(name: string): Workspace {
    const ts = this.now().toISOString()
    const paneId = createId('pane')
    const color = nextAgentColor([])
    const pane: Pane = {
      id: paneId,
      name: 'Shell',
      color,
      type: 'shell',
      shell: {
        shellId: 'default',
        cwd: os.homedir()
      }
    }
    const ws: Workspace = {
      id: createId('ws'),
      name,
      createdAt: ts,
      updatedAt: ts,
      layout: createLeaf(paneId),
      panes: { [paneId]: pane },
      activePaneId: paneId
    }
    this.save(ws)
    if (!this.activeId) {
      this.setActive(ws.id)
    }
    return structuredClone(ws)
  }

  save(ws: Workspace): void {
    // Parse result is the stored object (strips unknown keys)
    const next = parseWorkspace({
      ...ws,
      updatedAt: this.now().toISOString(),
      panes: { ...ws.panes }
    })
    this.workspaces.set(next.id, next)
    atomicWriteJson(this.workspacePath(next.id), next)
  }

  delete(id: string): void {
    this.workspaces.delete(id)
    const file = this.workspacePath(id)
    if (fs.existsSync(file)) {
      fs.unlinkSync(file)
    }
    if (this.activeId === id) {
      this.activeId = undefined
      this.settings = { ...this.settings, defaultWorkspaceId: undefined }
      this.persistSettings()
    }
  }

  setActive(id: string): void {
    if (!this.workspaces.has(id)) {
      throw new Error(`Unknown workspace: ${id}`)
    }
    this.activeId = id
    this.settings = { ...this.settings, defaultWorkspaceId: id }
    this.persistSettings()
  }

  getActive(): Workspace | null {
    if (!this.activeId) return null
    return this.get(this.activeId)
  }

  writeRecovery(snapshot: RecoverySnapshot): void {
    atomicWriteJson(this.recoveryPath(), snapshot)
  }

  readRecovery(): RecoverySnapshot | null {
    const raw = readJsonFile(this.recoveryPath())
    if (raw === null || typeof raw !== 'object') return null
    const obj = raw as { activeWorkspaceId?: string; workspaces?: unknown }
    const workspaces: Workspace[] = []
    if (Array.isArray(obj.workspaces)) {
      for (const item of obj.workspaces) {
        try {
          workspaces.push(parseWorkspace(item))
        } catch {
          // skip invalid entries
        }
      }
    }
    return {
      activeWorkspaceId: obj.activeWorkspaceId,
      workspaces
    }
  }

  exportWorkspace(id: string): string | null {
    const ws = this.get(id)
    if (!ws) return null
    return JSON.stringify(stripSecrets(ws), null, 2)
  }

  importWorkspace(json: string): Workspace {
    const raw = JSON.parse(json) as unknown
    const parsed = parseWorkspace(raw)
    const idMap = new Map<string, string>()
    const newPanes: Record<string, Pane> = {}

    for (const [oldId, pane] of Object.entries(parsed.panes)) {
      const newId = createId('pane')
      idMap.set(oldId, newId)
      newPanes[newId] = { ...pane, id: newId }
    }

    const ts = this.now().toISOString()
    const ws: Workspace = {
      ...parsed,
      id: createId('ws'),
      createdAt: ts,
      updatedAt: ts,
      panes: newPanes,
      layout: remapLayout(parsed.layout, idMap),
      activePaneId: parsed.activePaneId
        ? (idMap.get(parsed.activePaneId) ?? parsed.activePaneId)
        : undefined
    }

    this.save(ws)
    return structuredClone(ws)
  }

  /** Load agent profiles; empty array when file is missing or invalid. */
  loadProfiles(): AgentProfile[] {
    const raw = readJsonFile(this.paths.profilesPath)
    if (raw === null) return []
    if (!Array.isArray(raw)) return []
    const out: AgentProfile[] = []
    for (const item of raw) {
      const r = agentProfileSchema.safeParse(item)
      if (r.success) out.push(r.data as AgentProfile)
    }
    return out
  }

  /** Load user layout presets; empty array when file is missing or invalid. */
  loadPresets(): LayoutPreset[] {
    const raw = readJsonFile(this.paths.presetsPath)
    if (raw === null) return []
    if (!Array.isArray(raw)) return []
    const out: LayoutPreset[] = []
    for (const item of raw) {
      const r = layoutPresetSchema.safeParse(item)
      if (r.success) out.push(r.data as LayoutPreset)
    }
    return out
  }

  getSettings(): AppSettings {
    return { ...this.settings, providers: [...this.settings.providers] }
  }

  setSettings(partial: Partial<AppSettings>): AppSettings {
    this.settings = { ...this.settings, ...partial }
    // re-validate
    const parsed = appSettingsSchema.parse(this.settings) as AppSettings
    this.settings = parsed
    if (parsed.defaultWorkspaceId !== undefined) {
      this.activeId = parsed.defaultWorkspaceId
    }
    this.persistSettings()
    return this.getSettings()
  }
}
