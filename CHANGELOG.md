# Changelog

All notable changes to Archeon Workspace are documented in this file.

## [0.3.0] — 2026-07-26

### Agent sessions, tokens, voice, tasks

- **Token usage bar** per AI session (used / limit / remaining) with API usage when available
- **Durable session state**: messages, model, token totals, tasks, compact project memory
- **Auto-compact**: long threads fold into memory notes; still sent as system context
- **Task progress**: checklist parsing (`- [ ]` / `- [x]`), ticks in session UI, + Task button
- **Voice mode**: `Ctrl+Shift+Space` dictation anywhere (shell/CLI/AI), liquid-glass waveform overlay
- Session files remain backward-compatible with older `{ messages }` JSON

## [0.2.1] — 2026-07-26

### Custom auto-updater (no electron-updater)

- Check GitHub Releases for newer versions
- Download installer with progress; launch setup / open package
- Settings UI + command palette + startup toast when an update is available
- Pure semver + asset-picker unit tests

## [0.2.0] — 2026-07-25

### Complete v1 product surface

- **Windows + Linux packaging** via electron-builder (setup/portable, AppImage/deb)
- **CI** typecheck/test/build on Ubuntu + Windows; package artifacts on `main` / tags / manual run
- **Offline fonts** (IBM Plex Sans/Mono via `@fontsource`)
- **Tabs** — open as tab, drag reorder, close, Ctrl+T
- **Light / dark themes**
- **Keyboard** — Ctrl+K palette, Ctrl+] / [ focus cycle
- **Shell restart**, AI stream cancel / Stop, New thread + Copy conversation
- **Duplicate pane**, save layout preset from palette
- Secure API keys, workspace export/import, broadcast input, agent profiles
- Architecture policy: engines for hard systems, product code owned (`docs/ARCHITECTURE.md`)

## [0.1.0] — 2026-07-24

### Initial release

- Electron + React multi-agent terminal workspace scaffold
- Shell (node-pty + xterm), AI chat, CLI agent panes
- Dock layouts, presets, multi-workspace persistence
- Command palette, roster, mission-control UI
