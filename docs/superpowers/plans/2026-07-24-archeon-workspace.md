# Archeon Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Archeon Workspace — a cross-platform Electron desktop app for multi-pane shell, AI chat, and CLI agent workspaces with dock layouts, presets, and full session resume on Windows and Linux.

**Architecture:** Electron main process owns PTY, persistence, secure secrets, and AI HTTP; React renderer owns dock UI and xterm views; typed IPC bridges them. Layout is a serializable split/tabs/leaf tree. Workspaces, profiles, and sessions live under Electron `userData`.

**Tech Stack:** Electron, React 18, TypeScript (strict), Vite (electron-vite), Zustand, Zod, xterm.js, node-pty, electron-builder, Vitest, IBM Plex Sans/Mono.

**Spec:** `docs/superpowers/specs/2026-07-24-archeon-workspace-design.md`  
**Remote:** `https://github.com/Shashank-Upadhyay01/ArcheonWorkspace.git`  
**Git author (local):** `Shashank-Upadhyay01` / `iamshashank1o1@gmail.com`

## Global Constraints

- Platforms: Windows and Linux first-class (no Windows-only APIs or hard-coded `C:\` paths)
- Node 20+
- TypeScript strict; Zod for all persisted JSON
- Secrets only via Electron `safeStorage` (refuse plain-text keys by default)
- Commits: small, imperative, human-style; author as above; push to `origin/main` after meaningful slices
- Product name: **Archeon Workspace**
- TDD for pure logic (layout, schemas, store reducers); manual smoke for PTY/UI
- Prefer focused files; shared types in `src/shared/`

## File map (target)

```
package.json
electron.vite.config.ts
electron-builder.yml
tsconfig.json
tsconfig.node.json
tsconfig.web.json
.gitignore
README.md
.github/workflows/ci.yml
src/
  shared/
    types.ts
    schemas.ts
    layout.ts
    ids.ts
    colors.ts
    ipc.ts
  main/
    index.ts
    paths.ts
    secure-store.ts
    workspace-store.ts
    autosave.ts
    pty-manager.ts
    ai-client.ts
    ipc-handlers.ts
  preload/
    index.ts
    index.d.ts
  renderer/
    index.html
    src/
      main.tsx
      App.tsx
      styles/
        global.css
        tokens.css
      stores/
        app-store.ts
      lib/
        ipc.ts
      components/
        TitleBar.tsx
        Sidebar.tsx
        StatusBar.tsx
        CommandPalette.tsx
        EmptyWorkspace.tsx
        layout/
          DockLayout.tsx
          SplitPane.tsx
          TabGroup.tsx
          PaneChrome.tsx
        panes/
          ShellPane.tsx
          AiChatPane.tsx
          CliAgentPane.tsx
tests/
  layout.test.ts
  schemas.test.ts
  workspace-store.test.ts
  ids.test.ts
```

---

### Task 1: Project scaffold + README + CI stub

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`, `.gitignore`, `README.md`, `electron-builder.yml`, `src/main/index.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`, `src/renderer/index.html`, `src/renderer/src/main.tsx`, `src/renderer/src/App.tsx`, `src/renderer/src/styles/tokens.css`, `src/renderer/src/styles/global.css`, `.github/workflows/ci.yml`

**Interfaces:**
- Produces: runnable `npm run dev` window titled "Archeon Workspace"; scripts `dev`, `build`, `typecheck`, `test`, `dist:win`, `dist:linux`

- [ ] **Step 1: Scaffold package.json and configs**

Create `package.json`:

```json
{
  "name": "archeon-workspace",
  "version": "0.1.0",
  "description": "Multi-agent terminal workspace for Windows and Linux",
  "main": "./out/main/index.js",
  "author": "Shashank-Upadhyay01",
  "license": "MIT",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "typecheck": "tsc -p tsconfig.web.json --noEmit && tsc -p tsconfig.node.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "dist": "npm run build && electron-builder",
    "dist:win": "npm run build && electron-builder --win",
    "dist:linux": "npm run build && electron-builder --linux",
    "postinstall": "electron-builder install-app-deps"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "@xterm/addon-fit": "^0.10.0",
    "@xterm/addon-web-links": "^0.11.0",
    "electron-store": "^10.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "uuid": "^11.0.0",
    "xterm": "^5.3.0",
    "zod": "^3.24.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@types/uuid": "^10.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "electron": "^33.2.0",
    "electron-builder": "^25.1.8",
    "electron-vite": "^2.3.0",
    "typescript": "^5.7.2",
    "vite": "^5.4.11",
    "vitest": "^2.1.8"
  }
}
```

Create `electron.vite.config.ts`:

```ts
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html') }
      }
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@renderer': resolve('src/renderer/src')
      }
    }
  }
})
```

Create TypeScript configs (`tsconfig.json` references node + web; node covers main/preload/shared/tests; web covers renderer). Enable `strict: true`, path aliases `@shared/*`, `@renderer/*`.

Create `.gitignore`:

```
node_modules
out
dist
release
*.log
.DS_Store
.env
.env.*
coverage
```

- [ ] **Step 2: Minimal main / preload / renderer**

`src/main/index.ts` — BrowserWindow with `title: 'Archeon Workspace'`, `webPreferences.preload`, load renderer URL in dev / file in prod, `backgroundColor: '#0e1116'`.

`src/preload/index.ts` — expose empty `window.archeon = { versions: { ...process.versions } }` via `contextBridge` (expand in later tasks).

`src/renderer/src/App.tsx` — full-viewport shell with title "Archeon Workspace" using design tokens (charcoal bg `#0e1116`, accent `#3d co` → use `#3dd6c6`).

`tokens.css` palette:

```css
:root {
  --bg-canvas: #0e1116;
  --bg-panel: #151a22;
  --bg-elevated: #1c2330;
  --border: #2a3344;
  --text: #e8eef7;
  --text-muted: #8b97a8;
  --accent: #3dd6c6;
  --accent-dim: #2a9e92;
  --danger: #f07178;
  --warning: #e6b450;
  --font-ui: "IBM Plex Sans", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
  --radius: 8px;
  --sidebar-width: 240px;
}
```

Load Google fonts or self-host IBM Plex Sans + Mono in `index.html`.

- [ ] **Step 3: electron-builder + CI + README**

`electron-builder.yml`:

```yaml
appId: com.archeon.workspace
productName: Archeon Workspace
directories:
  output: release
files:
  - out/**/*
  - package.json
win:
  target:
    - nsis
    - portable
linux:
  target:
    - AppImage
    - deb
  category: Development
```

`.github/workflows/ci.yml` — on push/PR: matrix `ubuntu-latest` + `windows-latest`, Node 20, `npm ci`, `npm run typecheck`, `npm test`.

`README.md` — product blurb, Windows/Linux, install Node 20+, `npm install`, `npm run dev`, screenshot placeholder, link to design spec.

- [ ] **Step 4: Install and verify**

```bash
npm install
npm run typecheck
npm run dev
```

Expected: app window opens with Archeon chrome placeholder; no type errors.

- [ ] **Step 5: Commit and push**

```bash
git add -A
git commit -m "Scaffold Electron React app for Archeon Workspace"
git push origin main
```

---

### Task 2: Shared types, IDs, colors, Zod schemas

**Files:**
- Create: `src/shared/types.ts`, `src/shared/ids.ts`, `src/shared/colors.ts`, `src/shared/schemas.ts`, `src/shared/ipc.ts`, `tests/ids.test.ts`, `tests/schemas.test.ts`
- Modify: `package.json` (ensure vitest config via `vitest.config.ts`)

**Interfaces:**
- Produces: types `Workspace`, `Pane`, `LayoutNode`, `AgentProfile`, `LayoutPreset`, `AppSettings`, `PaneType`; `createId()`, `AGENT_COLORS`, Zod parsers `parseWorkspace`, `parseAppSettings`, etc.; IPC channel name constants

- [ ] **Step 1: Write failing tests**

`tests/ids.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createId } from '../src/shared/ids'

describe('createId', () => {
  it('returns a non-empty string', () => {
    expect(createId().length).toBeGreaterThan(8)
  })
  it('returns unique values', () => {
    expect(createId()).not.toBe(createId())
  })
})
```

`tests/schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { workspaceSchema, parseWorkspace } from '../src/shared/schemas'

const validWorkspace = {
  id: 'ws_1',
  name: 'Default',
  createdAt: '2026-07-24T00:00:00.000Z',
  updatedAt: '2026-07-24T00:00:00.000Z',
  layout: { type: 'leaf', paneId: 'p1' },
  panes: {
    p1: {
      id: 'p1',
      name: 'Shell',
      color: '#3dd6c6',
      type: 'shell',
      shell: { shellId: 'default', cwd: '/tmp' }
    }
  },
  activePaneId: 'p1'
}

describe('workspaceSchema', () => {
  it('accepts a valid workspace', () => {
    expect(parseWorkspace(validWorkspace).id).toBe('ws_1')
  })
  it('rejects missing name', () => {
    const { name, ...bad } = validWorkspace
    expect(() => parseWorkspace(bad)).toThrow()
  })
  it('rejects invalid pane type', () => {
    const bad = structuredClone(validWorkspace)
    ;(bad.panes.p1 as { type: string }).type = 'magic'
    expect(() => parseWorkspace(bad)).toThrow()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test
```

Expected: FAIL module not found / cannot find schemas

- [ ] **Step 3: Implement shared modules**

`src/shared/ids.ts`:

```ts
import { v4 as uuidv4 } from 'uuid'

export function createId(prefix?: string): string {
  const id = uuidv4()
  return prefix ? `${prefix}_${id}` : id
}
```

`src/shared/colors.ts` — export `AGENT_COLORS: string[]` of 8–10 muted-bright hex colors suitable on dark UI; `nextAgentColor(used: string[]): string`.

`src/shared/types.ts` — exact types from design spec Section 7 (`PaneType`, `LayoutNode`, `Pane`, `Workspace`, `AgentProfile`, `LayoutPreset`, `AppSettings`).

`src/shared/schemas.ts` — Zod mirrors of those types; export `parseWorkspace(data: unknown): Workspace`, `parseLayoutPreset`, `parseAppSettings`, `safeParseWorkspace`.

`src/shared/ipc.ts`:

```ts
export const IpcChannels = {
  workspaceList: 'workspace:list',
  workspaceGet: 'workspace:get',
  workspaceSave: 'workspace:save',
  workspaceCreate: 'workspace:create',
  workspaceDelete: 'workspace:delete',
  workspaceSetActive: 'workspace:setActive',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  ptySpawn: 'pty:spawn',
  ptyWrite: 'pty:write',
  ptyResize: 'pty:resize',
  ptyKill: 'pty:kill',
  ptyData: 'pty:data', // main → renderer event
  ptyExit: 'pty:exit',
  aiChat: 'ai:chat',
  aiChatChunk: 'ai:chatChunk',
  secretsSet: 'secrets:set',
  secretsHas: 'secrets:has',
  secretsDelete: 'secrets:delete',
  appReadyState: 'app:readyState',
  exportWorkspace: 'workspace:export',
  importWorkspace: 'workspace:import'
} as const
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test
```

- [ ] **Step 5: Commit and push**

```bash
git add src/shared tests vitest.config.ts package.json
git commit -m "Add shared types, schemas, and IPC channel map"
git push origin main
```

---

### Task 3: Layout engine (pure logic)

**Files:**
- Create: `src/shared/layout.ts`, `tests/layout.test.ts`

**Interfaces:**
- Consumes: `LayoutNode`, `createId` from shared
- Produces:
  - `createLeaf(paneId: string): LayoutNode`
  - `splitNode(root, targetPaneId, direction: 'h'|'v', newPaneId, ratio?: number): LayoutNode`
  - `closePane(root, paneId): LayoutNode | null`
  - `findPanePath(root, paneId): number[] | null`
  - `collectPaneIds(root): string[]`
  - `replaceLeafWithTabs(root, paneId, tabPaneIds, activeIndex): LayoutNode`
  - `serializeLayout(root): string` / `deserializeLayout(json): LayoutNode` (JSON round-trip via schema)
  - Built-in preset builders: `builtinPresets(): LayoutPreset[]` with ids `focus|pair|stack|quad|war_room|ide` (templates use placeholder pane ids resolved when applied)

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest'
import {
  createLeaf,
  splitNode,
  closePane,
  collectPaneIds,
  builtinPresets
} from '../src/shared/layout'

describe('layout engine', () => {
  it('creates a leaf', () => {
    expect(createLeaf('a')).toEqual({ type: 'leaf', paneId: 'a' })
  })

  it('splits a leaf horizontally into two leaves', () => {
    const root = createLeaf('a')
    const next = splitNode(root, 'a', 'h', 'b', 0.5)
    expect(next.type).toBe('split')
    if (next.type === 'split') {
      expect(next.direction).toBe('h')
      expect(collectPaneIds(next).sort()).toEqual(['a', 'b'])
      expect(next.sizes).toEqual([0.5, 0.5])
    }
  })

  it('closes a pane and collapses split to sibling', () => {
    let root = createLeaf('a')
    root = splitNode(root, 'a', 'h', 'b')
    const after = closePane(root, 'b')
    expect(after).toEqual({ type: 'leaf', paneId: 'a' })
  })

  it('returns null when closing the last pane', () => {
    expect(closePane(createLeaf('a'), 'a')).toBeNull()
  })

  it('exposes six built-in presets', () => {
    const ids = builtinPresets().map((p) => p.id)
    expect(ids).toEqual(['focus', 'pair', 'stack', 'quad', 'war_room', 'ide'])
  })
})
```

- [ ] **Step 2: Run tests — FAIL**

```bash
npm test -- tests/layout.test.ts
```

- [ ] **Step 3: Implement `src/shared/layout.ts`**

Implement immutable tree updates (return new trees). On `closePane`, if parent is split with one remaining child, hoist that child. Clamp `sizes` to sum 1. Preset layouts use temporary pane ids like `__p0`… that application code replaces when materializing panes.

- [ ] **Step 4: Run tests — PASS**

```bash
npm test -- tests/layout.test.ts
```

- [ ] **Step 5: Commit and push**

```bash
git add src/shared/layout.ts tests/layout.test.ts
git commit -m "Add dock layout tree engine and built-in presets"
git push origin main
```

---

### Task 4: Main-process workspace persistence

**Files:**
- Create: `src/main/paths.ts`, `src/main/workspace-store.ts`, `src/main/autosave.ts`, `tests/workspace-store.test.ts`
- Note: tests for store should use a temp directory injection — `WorkspaceStore` constructor takes `rootDir: string` and optional `now: () => Date`

**Interfaces:**
- Consumes: schemas, types, `createId`
- Produces:
  - `class WorkspaceStore { list(); get(id); create(name); save(ws); delete(id); setActive(id); getActive(); loadAll(); writeRecovery(snapshot); readRecovery(); exportWorkspace(id); importWorkspace(json) }`
  - `getUserDataPaths(userData: string)` → `{ workspacesDir, profilesPath, presetsPath, sessionsDir, recoveryDir, settingsPath }`
  - Autosave: `createAutosave(saveFn, ms)` → `{ touch(); flush(); dispose() }`

- [ ] **Step 1: Write failing tests using temp dir**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { WorkspaceStore } from '../src/main/workspace-store'

let dir: string
let store: WorkspaceStore

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archeon-'))
  store = new WorkspaceStore(dir)
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('WorkspaceStore', () => {
  it('creates a default workspace with one shell leaf', () => {
    const ws = store.create('Main')
    expect(ws.name).toBe('Main')
    expect(Object.keys(ws.panes).length).toBe(1)
    expect(store.list().map((w) => w.id)).toContain(ws.id)
  })

  it('round-trips save and get', () => {
    const ws = store.create('A')
    ws.name = 'Renamed'
    store.save(ws)
    expect(store.get(ws.id)?.name).toBe('Renamed')
  })

  it('writes and reads recovery snapshot', () => {
    const ws = store.create('R')
    store.writeRecovery({ activeWorkspaceId: ws.id, workspaces: [ws] })
    const snap = store.readRecovery()
    expect(snap?.activeWorkspaceId).toBe(ws.id)
  })
})
```

- [ ] **Step 2: Run — FAIL**

```bash
npm test -- tests/workspace-store.test.ts
```

- [ ] **Step 3: Implement store**

- Atomic writes: write `*.tmp` then rename
- Default new workspace: one `shell` pane, leaf layout, color from `nextAgentColor([])`, cwd = `os.homedir()`, `shellId: 'default'`
- `profiles.json` / `presets.json` load with empty defaults if missing
- Export strips any accidental secret fields; import runs `parseWorkspace` and assigns new ids to avoid collisions

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit and push**

```bash
git commit -m "Add workspace persistence store with crash recovery"
git push origin main
```

---

### Task 5: IPC bridge + renderer app store + chrome UI

**Files:**
- Create: `src/main/ipc-handlers.ts`, `src/renderer/src/lib/ipc.ts`, `src/renderer/src/stores/app-store.ts`, `src/renderer/src/components/TitleBar.tsx`, `Sidebar.tsx`, `StatusBar.tsx`, `EmptyWorkspace.tsx`
- Modify: `src/main/index.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`, `src/renderer/src/App.tsx`, `src/renderer/src/styles/global.css`

**Interfaces:**
- Preload exposes:

```ts
interface ArcheonApi {
  workspace: {
    list(): Promise<WorkspaceSummary[]>
    get(id: string): Promise<Workspace | null>
    create(name: string): Promise<Workspace>
    save(ws: Workspace): Promise<void>
    delete(id: string): Promise<void>
    setActive(id: string): Promise<void>
    export(id: string): Promise<string>
    import(json: string): Promise<Workspace>
  }
  settings: {
    get(): Promise<AppSettings>
    set(partial: Partial<AppSettings>): Promise<AppSettings>
  }
  on?: never // events via separate subscribe helpers in later tasks
}
```

- Renderer Zustand store: `workspaces`, `activeWorkspace`, `settings`, `sidebarCollapsed`, actions that call IPC and update local state; `markDirty` + debounced save via main autosave on save calls

- [ ] **Step 1: Wire IPC handlers in main** for workspace + settings; load store on app ready; pass `app.getPath('userData')` into `WorkspaceStore`.

- [ ] **Step 2: Preload contextBridge** mapping channels; add `src/preload/index.d.ts` for `Window.archeon`.

- [ ] **Step 3: Build UI chrome**

- Custom-feeling title bar region (workspace name + dirty dot)
- Left sidebar: Workspaces list (create/rename/delete), Agents (placeholder empty until panes), Presets (list built-ins)
- Main area: if no panes → `EmptyWorkspace` with three CTAs (Shell / AI / CLI) — wiring can create panes in store with leaf/split updates even before PTY
- Status bar: autosave status text, platform

Use design tokens; no generic purple-gradient look.

- [ ] **Step 4: Manual verify**

```bash
npm run dev
```

Expected: create workspace, see it in sidebar, empty state CTAs visible, restart app sees workspace list persisted.

- [ ] **Step 5: Commit and push**

```bash
git commit -m "Wire workspace IPC and mission-control app chrome"
git push origin main
```

---

### Task 6: Dock layout UI

**Files:**
- Create: `src/renderer/src/components/layout/DockLayout.tsx`, `SplitPane.tsx`, `TabGroup.tsx`, `PaneChrome.tsx`
- Modify: `App.tsx`, `app-store.ts`, `layout.ts` if helpers needed

**Interfaces:**
- `DockLayout` props: `workspace: Workspace`, `onChangeLayout(layout)`, `onFocusPane(id)`, `renderPane(pane: Pane): ReactNode`
- `PaneChrome`: name editable on double-click, color rail, type icon, menu (split H/V, close)
- Splitters: drag to resize; update `sizes` array (normalize to sum 1)

- [ ] **Step 1: Implement recursive `DockLayout`**

```tsx
// pseudocode structure
function DockNode({ node }: { node: LayoutNode }) {
  if (node.type === 'leaf') return <PaneChrome paneId={node.paneId}>{renderPane(...)}</PaneChrome>
  if (node.type === 'tabs') return <TabGroup ... />
  return (
    <SplitPane direction={node.direction} sizes={node.sizes} onResize={...}>
      {node.children.map(...)}
    </SplitPane>
  )
}
```

- [ ] **Step 2: Store actions**

- `addPane(type, direction?)` — create pane, `splitNode` or replace empty
- `closePane(id)`
- `renamePane(id, name)`
- `setPaneColor(id, color)`
- `applyPreset(presetId)` — materialize new panes from templates, replace layout
- `saveUserPreset(name)`

- [ ] **Step 3: Sidebar presets section** applies built-ins; empty state CTAs call `addPane`.

- [ ] **Step 4: Manual verify** — split to 2×2, resize, close pane collapses, apply Quad preset, restart restores layout JSON.

- [ ] **Step 5: Commit and push**

```bash
git commit -m "Add dockable multi-pane layout UI and presets"
git push origin main
```

---

### Task 7: Shell panes (node-pty + xterm)

**Files:**
- Create: `src/main/pty-manager.ts`, `src/renderer/src/components/panes/ShellPane.tsx`
- Modify: `ipc-handlers.ts`, `preload`, `ipc.ts` shared, `package.json` (node-pty)

**Interfaces:**
- `PtyManager.spawn({ paneId, shellId, cwd, cols, rows }): { sessionId }`
- `write(sessionId, data)`, `resize(sessionId, cols, rows)`, `kill(sessionId)`
- Events to renderer: `pty:data` `{ sessionId, data }`, `pty:exit` `{ sessionId, exitCode }`
- Shell resolution:

```ts
function resolveShell(shellId: string, platform: NodeJS.Platform): { file: string; args: string[] } {
  if (platform === 'win32') {
    if (shellId === 'powershell' || shellId === 'default') {
      return { file: 'powershell.exe', args: ['-NoLogo'] }
    }
    if (shellId === 'cmd') return { file: 'cmd.exe', args: [] }
    if (shellId === 'bash') return { file: 'bash.exe', args: ['-l'] } // Git Bash if on PATH
  }
  // linux
  const file = process.env.SHELL || '/bin/bash'
  return { file, args: ['-l'] }
}
```

- [ ] **Step 1: Add dependency**

```bash
npm install node-pty
```

`postinstall` already rebuilds native modules via electron-builder.

- [ ] **Step 2: Implement PtyManager** — Map sessionId → IPty; kill all on quit; handle spawn errors with structured error to renderer.

- [ ] **Step 3: ShellPane** — create xterm Terminal + FitAddon; on mount spawn PTY; on data write to term; on term data write to PTY; ResizeObserver → fit + pty resize; dispose on unmount.

- [ ] **Step 4: Persist scrollback** — periodically serialize `term.buffer` active lines to session file via IPC `session:saveScrollback` / load on mount (cap ~5000 lines).

- [ ] **Step 5: Manual smoke**

Windows: PowerShell prompt works, resize, multi-pane two shells.  
(Linux smoke on CI machine or later.)

- [ ] **Step 6: Commit and push**

```bash
git commit -m "Add real shell panes with node-pty and xterm"
git push origin main
```

---

### Task 8: Secure store + AI chat panes

**Files:**
- Create: `src/main/secure-store.ts`, `src/main/ai-client.ts`, `src/renderer/src/components/panes/AiChatPane.tsx`
- Modify: IPC, preload, settings UI (simple modal or sidebar Settings)

**Interfaces:**
- `SecureStore.set(key, value)`, `get`, `has`, `delete` using `safeStorage.encryptString` → file under `userData/secrets/`
- If `safeStorage.isEncryptionAvailable()` is false: operations throw `SecretsUnavailableError`; UI shows warning
- `AIClient.chatStream({ providerId, model, systemPrompt, messages, apiKey }): AsyncIterable<string>`
- Providers: `openai-compatible` (baseUrl + key), `xai` (baseUrl `https://api.x.ai/v1`, OpenAI-compatible chat completions)

- [ ] **Step 1: Implement secure store + settings UI fields** for API key (write-only input), provider, default model.

- [ ] **Step 2: AI IPC** — renderer starts chat; main streams chunks via `webContents.send('ai:chatChunk', { requestId, text })` and final `{ done: true }`.

- [ ] **Step 3: AiChatPane UI** — message list, composer, streaming bubble, agent name/color rail, model label; persist thread in `sessions/{ws}/panes/{paneId}.json` as `{ messages: ChatMessage[] }`.

- [ ] **Step 4: Manual verify** — without key, clear error; with key, streaming works; restart restores thread.

- [ ] **Step 5: Commit and push**

```bash
git commit -m "Add secure API keys and streaming AI chat panes"
git push origin main
```

---

### Task 9: CLI agent panes + profiles

**Files:**
- Create: `src/renderer/src/components/panes/CliAgentPane.tsx`, profile editor in sidebar or modal
- Modify: `workspace-store` for `profiles.json`, `PtyManager` spawn with custom command, `ShellPane` patterns reuse for terminal view

**Interfaces:**
- Profile: `{ id, name, color, kind: 'cli_agent', defaults: { command, args, env, cwd } }`
- Built-in profile templates (not auto-spawned): Claude Code, Codex, Aider, Custom — commands as strings user can edit (`claude`, `codex`, `aider`, …)
- On resume: if pane type `cli_agent`, show banner “Relaunch agent?” rather than auto-start

- [ ] **Step 1: Profile CRUD** in main store + renderer sidebar section “Profiles”

- [ ] **Step 2: CliAgentPane** — header with status (running/exited); start/stop; embeds same xterm path as shell but spawn args from profile

- [ ] **Step 3: Manual verify** — custom profile `echo` / `powershell -Command` works; exit code shows; resume prompts relaunch

- [ ] **Step 4: Commit and push**

```bash
git commit -m "Add CLI agent panes and reusable agent profiles"
git push origin main
```

---

### Task 10: Command palette, roster, broadcast, export/import polish

**Files:**
- Create: `src/renderer/src/components/CommandPalette.tsx`
- Modify: `Sidebar.tsx` (roster live status), `ShellPane.tsx` / store for broadcast, export/import menu items

**Interfaces:**
- Command palette: Ctrl+K toggles; fuzzy filter commands:
  - New Shell / AI / CLI pane
  - Apply preset:*
  - Switch workspace:*
  - Focus pane:*
  - Toggle broadcast
  - Export / Import workspace
  - Open settings
- Broadcast: store `broadcastPaneIds: string[]`; when enabled, input in any selected shell writes to all selected PTY sessions
- Roster: each pane status — shell/cli from pty exit map; AI idle/streaming

- [ ] **Step 1: Implement CommandPalette** with keyboard nav (↑↓ Enter Esc)

- [ ] **Step 2: Broadcast multi-select** in roster (checkbox) + status bar indicator “Broadcast: N shells”

- [ ] **Step 3: Export/import** via IPC + file dialogs (`dialog.showSaveDialog` / `showOpenDialog` in main)

- [ ] **Step 4: Manual verify** full success criteria from spec §16

- [ ] **Step 5: Commit and push**

```bash
git commit -m "Add command palette, agent roster, and broadcast input"
git push origin main
```

---

### Task 11: Packaging polish + final README

**Files:**
- Modify: `electron-builder.yml`, `README.md`, `package.json` version if needed
- Create: app icon assets if time (`build/icon.png` 512×512 simple mark — teal glyph on charcoal)

- [ ] **Step 1: Ensure `npm run build` succeeds on Windows**

```bash
npm run typecheck
npm test
npm run build
```

- [ ] **Step 2: Document Linux notes** in README (libsecret for safeStorage, AppImage permissions, `node-pty` build tools `build-essential python3`)

- [ ] **Step 3: Commit and push**

```bash
git commit -m "Polish packaging config and project README"
git push origin main
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Electron + React + TS, Win/Linux | 1, 7, 11 |
| Shell / AI / CLI panes | 7, 8, 9 |
| Dock layout + presets | 3, 6 |
| Multi-workspace + resume | 4, 5, 7 scrollback, 8 threads |
| Autosave + crash recovery | 4, 5 |
| Command palette | 10 |
| Agent roster | 5, 10 |
| Profiles | 9 |
| Broadcast | 10 |
| Themes / mission-control UI | 1, 5, 6 |
| Export/import sans secrets | 4, 10 |
| Secure API keys | 8 |
| electron-builder Win+Linux | 1, 11 |
| CI Ubuntu+Windows | 1 |
| Human git commits to given remote | every task push |

## Placeholder / consistency self-review

- IPC channel names unified in `src/shared/ipc.ts` and reused by main + preload
- Layout helpers named `splitNode` / `closePane` / `collectPaneIds` consistently across tasks 3 and 6
- `WorkspaceStore` constructed with injectable `rootDir` for tests
- No TBD steps remaining

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-24-archeon-workspace.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration  
2. **Inline Execution** — execute tasks in this session with checkpoints  

Which approach?
