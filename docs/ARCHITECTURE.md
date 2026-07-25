# Archeon Workspace — Architecture

## Design principle

**Use the best engine for hard systems. Own the product.**

Archeon is a multi-agent terminal workspace. Reimplementing Chromium, a full
VT terminal, or OS PTY plumbing would not make a better product — it would
delay features and add bugs. The right engines stay; everything that defines
*Archeon* (layouts, workspaces, agents, AI, UI chrome) is custom code.

## Layer map

```
┌─────────────────────────────────────────────────────────┐
│  Product (custom)                                       │
│  Dock layout · workspaces · presets · roster · palette  │
│  AI chat · CLI profiles · broadcast · themes · resume   │
└───────────────────────────┬─────────────────────────────┘
                            │ typed IPC
┌───────────────────────────▼─────────────────────────────┐
│  Engines (libraries)                                    │
│  Electron (window/process) · React (UI)                 │
│  xterm.js (terminal paint) · node-pty (OS shells)       │
│  Zod (schema) · Zustand (thin client state)             │
└─────────────────────────────────────────────────────────┘
```

## Keep (engines)

| Library | Why it stays |
|---------|----------------|
| **Electron** | Mature multi-process desktop, Win + Linux, IPC, packaging |
| **React** | Best fit for complex interactive chrome |
| **xterm.js** | Production terminal emulator; decades of edge cases solved |
| **node-pty** | Cross-platform PTY; correct shell behavior |
| **Zod** | Safe load of user JSON; small, typed |
| **Zustand** | Tiny store; no Redux ceremony |

## Own (custom)

| Area | Location |
|------|----------|
| Layout tree (split/tabs/presets) | `src/shared/layout.ts` |
| Persistence & recovery | `src/main/workspace-store.ts` |
| PTY session manager | `src/main/pty-manager.ts` |
| Secure API keys | `src/main/secure-store.ts` |
| AI streaming client | `src/main/ai-client.ts` |
| Product UI | `src/renderer/src/components/**` |
| App state glue | `src/renderer/src/stores/app-store.ts` |
| Terminal product defaults | `src/renderer/src/lib/terminal.ts` |

## Dependency policy

1. **No framework kits** for layout (no VS Code grid packages, no dockable-lib that owns state).
2. **No second state library** (no Redux + MobX + Zustand).
3. Prefer **platform APIs** when enough (e.g. `crypto.randomUUID` instead of `uuid`).
4. Prefer **one shared terminal factory** over copy-pasted xterm setup.
5. Every new dependency must justify why custom code would be worse.

## What we will not rewrite from scratch

- Windowing / Chromium (Electron)
- Full VT100/xterm protocol (xterm.js)
- OS PTY layer (node-pty)

Those are multi-year projects. Archeon’s value is the **workspace product** on top.

## Auto-update

Custom module (`src/main/updater.ts`) — **not** `electron-updater`:

- Feed: GitHub Releases API for `Shashank-Upadhyay01/ArcheonWorkspace`
- Semver compare in `src/shared/semver.ts`
- Asset pick in `src/shared/update-assets.ts`
- Download + install orchestration in main; UI in Settings

## Future options (only if needed)

| Goal | Option |
|------|--------|
| Smaller binary | Evaluate Tauri later; keep same product code shape |
| Signed updates | Code-signing cert + optional signature verify on download |
| Delta patches | Possible later; full installer is simpler and safer for v1 |

---

*Last updated: 2026-07-26*
