# Archeon Workspace — Design Specification

**Date:** 2026-07-24  
**Product name:** Archeon Workspace  
**Repository:** https://github.com/Shashank-Upadhyay01/ArcheonWorkspace.git  
**Owner:** Shashank-Upadhyay01 (`iamshashank1o1@gmail.com`)  
**Status:** Approved for implementation planning  

---

## 1. Vision

Archeon Workspace is a **cross-platform desktop multi-agent terminal cockpit**. Users open named workspaces, arrange **shell**, **built-in AI chat**, and **CLI agent** panes in a dockable layout, apply layout presets, and **fully resume** where they left off.

**Primary platforms:** Windows and Linux (first-class).  
**Stack:** Electron + React + TypeScript + Vite.

---

## 2. Goals & non-goals

### Goals (v1)

- Multiple named panes per workspace: real terminals, AI chat, CLI agent wrappers
- Freeform dockable layout (split, tabs, resize) plus built-in and user layout presets
- Multiple workspaces with switcher; full session resume after quit or crash
- Agent profiles (name, color, defaults) and an agent roster sidebar
- Command palette for power-user navigation
- Broadcast input to selected shells
- Secure API key storage; workspace export/import without secrets
- Polished “mission control” UI
- Installers for Windows and Linux via electron-builder
- Human-style git history on the provided GitHub remote

### Non-goals (v1)

- Cloud sync / multi-user collaboration
- Plugin marketplace
- Full multi-agent message bus / automated orchestration between agents
- macOS as a promised first-class target (Electron may run; not a v1 deliverable)
- Mobile

---

## 3. Architecture

```
┌─────────────────────────────────────────────────┐
│  Renderer (React + TypeScript)                  │
│  Workspace chrome · Dock layout · Pane hosts    │
│  Shell pane · AI Chat pane · CLI Agent pane     │
└──────────────────────┬──────────────────────────┘
                       │ typed IPC
┌──────────────────────▼──────────────────────────┐
│  Main process (Electron)                        │
│  WorkspaceStore · LayoutEngine · PTYManager     │
│  AgentProcessManager · AIClient · Autosave      │
│  SecureStore · Crash recovery                   │
└─────────────────────────────────────────────────┘
```

### Process boundaries

| Concern | Process | Notes |
|---------|---------|--------|
| UI, layout interactions, xterm views | Renderer | No Node PTY access directly |
| PTY spawn/resize/write/kill | Main | `node-pty` |
| CLI agent child processes | Main | Same PTY path as shells when terminal-backed |
| AI HTTP streaming | Main | Keys never exposed to renderer long-term; stream via IPC |
| Persistence I/O | Main | `userData` paths |
| Secrets | Main | Electron `safeStorage` |

### Cross-platform rules

- Shell defaults: Windows → PowerShell (fallback cmd / Git Bash if present); Linux → `$SHELL` or bash/zsh/fish detection
- Paths via Node `path` / `path.posix`/`path.win32` as appropriate; never hardcode `C:\`
- PTY: `node-pty` with platform-specific shell executable resolution
- Packaging: `electron-builder` → Windows NSIS/portable + Linux AppImage + `.deb`
- CI (near-term): GitHub Actions lint/typecheck on `ubuntu-latest` and `windows-latest`

---

## 4. Core concepts

### Workspace

Named container holding:

- Layout tree
- Pane map
- Active pane id
- UI chrome prefs (sidebar collapsed, theme override)
- Timestamps

### Pane

One leaf unit in the layout, typed as:

| Type | Role |
|------|------|
| `shell` | Real interactive shell via PTY + xterm.js |
| `ai_chat` | Built-in streaming AI chat with history |
| `cli_agent` | Named CLI agent (claude, codex, grok, aider, custom) in a real terminal |

Every pane has: `id`, `name`, `color`, `type`, optional `profileId`.

### Agent profile

Reusable definition: name, color, icon, kind, and type-specific defaults (shell binary, AI model/system prompt, CLI command/args/env/cwd).

### Layout preset

Named layout tree (built-in or user-saved). Applying a preset can either:

- **Fresh panes** from templates, or
- **Structure only** (keep existing pane identities where possible — v1 may implement fresh-first, structure-preserving as stretch)

### Session snapshot

Everything required to resume: workspace metadata, layout, pane state, scrollback/chat refs, last-focused pane.

---

## 5. Features (v1 detail)

### 5.1 Layout engine

- Horizontal / vertical splits
- Tab groups on a leaf
- Drag resize; drag reorder tabs
- Focus next/prev pane shortcuts
- Serialize layout to a stable JSON tree for persistence and presets

**Built-in presets**

| Id | Description |
|----|-------------|
| `focus` | Single full-area pane |
| `pair` | Two columns |
| `stack` | Two rows |
| `quad` | 2×2 grid |
| `war_room` | Large main + vertical side strip |
| `ide` | Main + bottom + side (classic IDE) |

Users can **save current layout as preset** and **apply preset** from sidebar or command palette.

### 5.2 Shell panes

- Spawn platform shell with configurable cwd
- Full xterm.js: scrollback, selection, copy/paste, fit-on-resize
- Rename, recolor, change shell profile
- Broadcast mode: multi-select shells → one input fans out

### 5.3 AI chat panes

- Streaming replies over IPC
- Configurable provider (OpenAI-compatible + xAI first), model, system prompt
- Thread history persisted per pane
- New thread / clear / copy
- API keys only in secure store

### 5.4 CLI agent panes

- Profile-driven command + args + env + cwd
- Real PTY terminal UI (same visual density as shells)
- Status: running / exited (exit code) / needs attention (simple heuristics)
- On resume: restore metadata; prompt to relaunch last command (do not auto-restart destructive agents without confirmation)

### 5.5 Workspaces & resume

- Create, rename, delete, switch workspaces
- Pin default workspace on launch
- Autosave: debounced (~2s) + on quit
- Crash recovery via `recovery/last-snapshot.json`
- Resume behavior:
  - **Layout + names + colors:** exact restore
  - **Shell:** restore cwd + scrollback; **re-spawn** shell process
  - **AI chat:** restore full thread
  - **CLI agent:** restore config; optional relaunch prompt

### 5.6 Command palette

Shortcut: **Ctrl+K** (Windows/Linux). Actions include:

- New shell / AI / CLI pane
- Rename pane, apply color
- Switch workspace
- Apply / save preset
- Open settings, focus agent by name

### 5.7 Agent roster

Collapsible left sidebar section listing all panes in the active workspace with:

- Color chip, name, type icon
- Status indicator
- Click → focus pane

Also: workspaces list + presets list in the same rail.

### 5.8 Export / import

- Export workspace JSON **without** API keys or absolute secret paths
- Import validates against schema; reject invalid / path-traversal payloads

### 5.9 Themes

- Default: dark mission-control cockpit
- Light theme secondary
- Agent color used as left rail accent on each pane

---

## 6. UI / UX design

### Aesthetic

**Mission control:** deep charcoal canvas, cool cyan/teal accents, monospaced utility labels, restrained glass for chrome only, dense terminals. Identity via **left color rail** per pane—not noisy rainbow UI.

### Typography

- UI: IBM Plex Sans (or equivalent licensed webfont)
- Mono / terminal chrome labels: IBM Plex Mono or JetBrains Mono

### Chrome map

```
┌─ titlebar (workspace name · dirty · window controls) ──────────┐
│ [sidebar]  │  DOCK LAYOUT (panes)                              │
│ workspaces │  ┌─pane header: color · name · type · ··· ─┐     │
│ agents     │  │ terminal / chat / cli                     │     │
│ presets    │  └───────────────────────────────────────────┘   │
│            │  status bar: cwd · shell · model · autosave       │
└────────────┴──────────────────────────────────────────────────┘
```

### Interaction principles

- Empty workspace: clear CTAs — Create shell / AI agent / CLI agent + preset cards
- Motion: short layout transitions; honor `prefers-reduced-motion`
- Keyboard-first parity for common actions
- Errors: specific and actionable (e.g. “Shell not found: pwsh — pick another shell in Settings”)

---

## 7. Data model

```ts
type PaneType = 'shell' | 'ai_chat' | 'cli_agent';

interface Workspace {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  layout: LayoutNode;
  panes: Record<string, Pane>;
  activePaneId?: string;
  sidebarCollapsed?: boolean;
  themeId?: string;
}

type LayoutNode =
  | { type: 'split'; direction: 'h' | 'v'; sizes: number[]; children: LayoutNode[] }
  | { type: 'tabs'; active: number; tabs: string[] } // pane ids
  | { type: 'leaf'; paneId: string };

interface Pane {
  id: string;
  name: string;
  color: string;
  type: PaneType;
  profileId?: string;
  shell?: {
    shellId: string;
    cwd: string;
    scrollbackRef?: string;
  };
  aiChat?: {
    providerId: string;
    model: string;
    systemPrompt: string;
    threadId: string;
  };
  cli?: {
    command: string;
    args: string[];
    env: Record<string, string>;
    cwd: string;
    lastExitCode?: number | null;
  };
}

interface AgentProfile {
  id: string;
  name: string;
  color: string;
  icon?: string;
  kind: PaneType;
  defaults: Record<string, unknown>;
}

interface LayoutPreset {
  id: string;
  name: string;
  builtIn: boolean;
  layout: LayoutNode;
  paneTemplates?: Array<Partial<Pane> & { type: PaneType }>;
}

interface AppSettings {
  defaultShellId?: string;
  themeId: string;
  autosaveMs: number;
  defaultWorkspaceId?: string;
  providers: Array<{ id: string; baseUrl?: string; label: string }>;
  // keys live in SecureStore, not here
}
```

---

## 8. Persistence layout

Electron `app.getPath('userData')`:

```
userData/
  settings.json
  workspaces/
    {id}.json
  profiles.json
  presets.json              # user presets only; built-ins in code
  sessions/
    {workspaceId}/
      panes/{paneId}.json   # scrollback metadata, chat threads
  recovery/
    last-snapshot.json
```

Secrets: Electron `safeStorage` (DPAPI on Windows; libsecret/keyring on Linux when available). If encryption is unavailable, show a clear warning and refuse to store keys in plain text unless the user explicitly opts into a documented insecure fallback (default: refuse).

---

## 9. Security

- API keys never written into workspace export JSON
- Main-process-only secret access
- Import schema validation
- CLI agents run with the same OS user privileges as the app (documented risk)
- No remote code execution from imported layouts (data only)

---

## 10. Tech stack (concrete)

| Layer | Choice |
|-------|--------|
| Electron | Latest stable LTS-compatible |
| Bundler | Vite + electron-vite (or equivalent dual-main/renderer setup) |
| UI | React 18+ , TypeScript strict |
| State | Zustand (renderer) + main-process store mirrored via IPC |
| Terminal | xterm.js + fit/webgl or canvas addon as appropriate |
| PTY | node-pty |
| Layout | Custom dock tree (or thin wrapper around a maintained dock library if it meets serialize needs) |
| Validation | Zod for persistence schemas |
| Package | electron-builder |
| Test | Vitest for pure logic (layout serde, schemas) |

---

## 11. Repository & git workflow

**Remote:** `https://github.com/Shashank-Upadhyay01/ArcheonWorkspace.git`  
**Default branch:** `main`  
**Author (local repo config):**

- `user.name` = `Shashank-Upadhyay01`
- `user.email` = `iamshashank1o1@gmail.com`

### Human-style commits

- Small, feature-sized commits
- Imperative subject lines: `Add dock layout engine`, `Persist workspace snapshots`
- No AI watermark spam; no empty commits; no force-push to `main` unless recovering from a documented mistake
- Prefer feature branches for larger slices; merge via PR when useful, direct push to `main` acceptable early while solo

### Suggested early commit sequence

1. Design spec + README skeleton  
2. Electron + React + TS scaffold  
3. App chrome + empty workspace  
4. Layout engine + presets  
5. Shell panes (PTY)  
6. Persistence + resume  
7. AI chat panes  
8. CLI agent panes  
9. Command palette + roster polish  
10. Packaging Windows + Linux  

---

## 12. Build & run

```bash
npm install
npm run dev          # Electron + Vite HMR
npm run typecheck
npm run test
npm run dist:win     # Windows artifacts
npm run dist:linux   # AppImage / deb
```

**Engines:** Node 20+

---

## 13. Testing strategy (v1)

- Unit: layout serialize/deserialize round-trip; preset application; Zod schemas
- Unit: workspace merge / autosave debounce helpers
- Manual smoke: PTY on Windows PowerShell and Linux bash
- Manual: kill app mid-session → recovery snapshot restores layout + AI history
- Manual: export/import workspace round-trip without secrets

---

## 14. Implementation phases

| Phase | Deliverable |
|-------|-------------|
| P0 | Scaffold, README, git remote, design committed |
| P1 | Chrome, sidebar, multi-workspace shell (no PTY yet) |
| P2 | Dock layout + presets |
| P3 | Shell PTY panes |
| P4 | Persistence, autosave, crash recovery, resume |
| P5 | AI chat panes + secure keys |
| P6 | CLI agent panes + profiles |
| P7 | Command palette, broadcast, polish, themes |
| P8 | electron-builder Win + Linux; basic CI |

---

## 15. Open decisions (resolved)

| Decision | Resolution |
|----------|------------|
| Product form | Desktop Electron app |
| Pane types | Shell + AI chat + CLI agent |
| Layout model | Dockable tree (Approach A) |
| Platforms | Windows + Linux first-class |
| Repo | Shashank-Upadhyay01/ArcheonWorkspace |
| Product name | Archeon Workspace |

---

## 16. Success criteria

A user can:

1. Create a workspace, add multiple named shell/AI/CLI panes, and rearrange via splits/tabs  
2. Apply a built-in preset and save a custom preset  
3. Quit and reopen the app to the same layout, names, chat history, and shell cwd/scrollback  
4. Use the same project on Ubuntu and Windows with OS-appropriate shells  
5. Configure an API key securely and chat in an AI pane  
6. Launch a CLI agent profile in a pane  
7. Find actions via Ctrl+K and agents via the roster  

---

*End of design specification.*
