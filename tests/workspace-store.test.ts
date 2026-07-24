import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { WorkspaceStore } from '../src/main/workspace-store'
import { getUserDataPaths } from '../src/main/paths'
import { createAutosave } from '../src/main/autosave'
import type { Workspace } from '../src/shared/types'

let dir: string
let store: WorkspaceStore

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archeon-'))
  store = new WorkspaceStore(dir)
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('getUserDataPaths', () => {
  it('maps userData root to expected subpaths', () => {
    const p = getUserDataPaths('/data/archeon')
    expect(p.workspacesDir).toBe(path.join('/data/archeon', 'workspaces'))
    expect(p.profilesPath).toBe(path.join('/data/archeon', 'profiles.json'))
    expect(p.presetsPath).toBe(path.join('/data/archeon', 'presets.json'))
    expect(p.sessionsDir).toBe(path.join('/data/archeon', 'sessions'))
    expect(p.recoveryDir).toBe(path.join('/data/archeon', 'recovery'))
    expect(p.settingsPath).toBe(path.join('/data/archeon', 'settings.json'))
  })
})

describe('WorkspaceStore', () => {
  it('creates a default workspace with one shell leaf', () => {
    const ws = store.create('Main')
    expect(ws.name).toBe('Main')
    expect(Object.keys(ws.panes).length).toBe(1)
    expect(store.list().map((w) => w.id)).toContain(ws.id)

    const pane = Object.values(ws.panes)[0]
    expect(pane.type).toBe('shell')
    expect(pane.shell?.shellId).toBe('default')
    expect(pane.shell?.cwd).toBe(os.homedir())
    expect(ws.layout).toEqual({ type: 'leaf', paneId: pane.id })
    expect(ws.activePaneId).toBe(pane.id)
  })

  it('round-trips save and get', () => {
    const ws = store.create('A')
    ws.name = 'Renamed'
    store.save(ws)
    expect(store.get(ws.id)?.name).toBe('Renamed')
  })

  it('save strips unknown extra keys', () => {
    const ws = store.create('Strip')
    // @ts-expect-error intentional unknown field
    ws.extraField = 'should-not-persist'
    store.save(ws)
    const got = store.get(ws.id)!
    expect(got).not.toHaveProperty('extraField')
    const paths = getUserDataPaths(dir)
    const raw = JSON.parse(
      fs.readFileSync(path.join(paths.workspacesDir, `${ws.id}.json`), 'utf8')
    ) as Record<string, unknown>
    expect(raw).not.toHaveProperty('extraField')
  })

  it('get returns an independent copy', () => {
    const ws = store.create('Clone')
    const a = store.get(ws.id)!
    a.name = 'Mutated'
    expect(store.get(ws.id)?.name).toBe('Clone')
  })

  it('writes and reads recovery snapshot', () => {
    const ws = store.create('R')
    store.writeRecovery({ activeWorkspaceId: ws.id, workspaces: [ws] })
    const snap = store.readRecovery()
    expect(snap?.activeWorkspaceId).toBe(ws.id)
  })

  it('persists workspaces to disk and reloads via loadAll', () => {
    const ws = store.create('Persisted')
    const paths = getUserDataPaths(dir)
    const file = path.join(paths.workspacesDir, `${ws.id}.json`)
    expect(fs.existsSync(file)).toBe(true)

    const reloaded = new WorkspaceStore(dir)
    expect(reloaded.get(ws.id)?.name).toBe('Persisted')
    expect(reloaded.loadAll().map((w) => w.id)).toContain(ws.id)
  })

  it('deletes workspace files and drops from list', () => {
    const ws = store.create('Doomed')
    store.delete(ws.id)
    expect(store.get(ws.id)).toBeNull()
    expect(store.list().map((w) => w.id)).not.toContain(ws.id)
  })

  it('tracks active workspace', () => {
    const a = store.create('A')
    const b = store.create('B')
    store.setActive(b.id)
    expect(store.getActive()?.id).toBe(b.id)
    store.setActive(a.id)
    expect(store.getActive()?.id).toBe(a.id)
  })

  it('loads empty profiles and presets when files are missing', () => {
    expect(store.loadProfiles()).toEqual([])
    expect(store.loadPresets()).toEqual([])
  })

  it('exports workspace JSON without secret-like fields', () => {
    const ws = store.create('Export')
    const pane = Object.values(ws.panes)[0]
    pane.cli = {
      command: 'run',
      args: [],
      env: { API_KEY: 'secret-value', PATH: '/usr/bin' },
      cwd: os.homedir()
    }
    // @ts-expect-error intentional accidental secret on pane
    pane.apiKey = 'should-not-export'
    store.save(ws)

    const json = store.exportWorkspace(ws.id)
    expect(json).toBeTruthy()
    expect(json).not.toContain('secret-value')
    expect(json).not.toContain('should-not-export')
    expect(json).not.toMatch(/"apiKey"/)
    const parsed = JSON.parse(json!) as Workspace
    expect(parsed.name).toBe('Export')
  })

  it('imports workspace with new ids to avoid collisions', () => {
    const original = store.create('Original')
    const json = store.exportWorkspace(original.id)!
    const imported = store.importWorkspace(json)
    expect(imported.id).not.toBe(original.id)
    expect(imported.name).toBe('Original')
    expect(Object.keys(imported.panes).length).toBe(1)
    const origPaneId = Object.keys(original.panes)[0]
    const newPaneId = Object.keys(imported.panes)[0]
    expect(newPaneId).not.toBe(origPaneId)
    expect(store.list().length).toBe(2)
  })

  it('uses injectable now() for timestamps', () => {
    const fixed = new Date('2026-01-15T12:00:00.000Z')
    const timed = new WorkspaceStore(dir, () => fixed)
    const ws = timed.create('Timed')
    expect(ws.createdAt).toBe(fixed.toISOString())
    expect(ws.updatedAt).toBe(fixed.toISOString())
  })
})

describe('createAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces saveFn until ms elapses after last touch', () => {
    const saveFn = vi.fn()
    const auto = createAutosave(saveFn, 1000)
    auto.touch()
    auto.touch()
    expect(saveFn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(999)
    expect(saveFn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(saveFn).toHaveBeenCalledTimes(1)
    auto.dispose()
  })

  it('flush invokes saveFn immediately and clears pending timer', () => {
    const saveFn = vi.fn()
    const auto = createAutosave(saveFn, 5000)
    auto.touch()
    auto.flush()
    expect(saveFn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5000)
    expect(saveFn).toHaveBeenCalledTimes(1)
    auto.dispose()
  })
})
