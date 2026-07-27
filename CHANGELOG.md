# Changelog

All notable changes to Archeon Workspace are documented in this file.

## [0.4.1] — 2026-07-27

### Project folder + War Room preset

- Workspace `projectRoot` — shells/CLI agents start in that folder
- Title bar project chip + empty-state “Open project”
- **War Room** preset: Claude Code + Grok Build + Shell (and stacked variant)
- Command palette: open project, apply war room

## [0.4.0] — 2026-07-27

### Local on-device ASR (Whisper-tiny)

- Voice mode uses **local Whisper-tiny.en** (no cloud ASR API)
- Our pipeline: mic → Web Audio → FFT waveform → energy VAD → PCM → resample 16 kHz → Whisper
- First use downloads model weights into browser cache (~40MB); progress shown in voice overlay
- Pluggable path remains for future custom-trained models

## [0.3.2] — 2026-07-27

### From-scratch store + voice DSP

- **Removed Zustand** — custom `createStore` + `useSyncExternalStore`
- **Voice rebuilt**: Web Audio mic capture, FFT/RMS waveform bars, energy VAD (not fake sines)
- Pluggable `SpeechBackend` (system speech default; local model slot documented)
- Policy doc: `docs/FROM-SCRATCH.md`

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
