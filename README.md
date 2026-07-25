# Archeon Workspace

Multi-agent terminal desktop app for **Windows** and **Linux**. Dockable shell panes, AI chat, and CLI agent workspaces with layout presets, multi-workspace resume, command palette, and secure API key storage.

## Platforms

- **Windows** and **Linux** (first-class)
- Node.js **20+**

## Features

- Dockable shell / AI / CLI panes with split layout and presets
- Multi-workspace switcher with **session autosave + quit flush**
- Crash recovery snapshot written on every workspace save (and on quit); empty-disk boot rehydrates workspaces from the last snapshot (no separate restore UI)
- Terminal PTY sessions with scrollback restore
- AI chat panes (OpenAI-compatible APIs) with secure key storage and stream cancel (Stop)
- CLI agent panes with profile env, args, and working directory
- Command palette (`Ctrl+K` / `Cmd+K`), agent roster, broadcast input
- Export / import workspaces (secrets stripped)

## Architecture (libraries vs custom)

**Best approach used here:** hard engines from the ecosystem; product logic custom.

| Keep (engines) | Own (product) |
|----------------|---------------|
| Electron, React, xterm.js, node-pty | Dock layouts, workspaces, presets |
| Zod, Zustand | AI chat, CLI agents, secure keys |
| electron-builder | Command palette, roster, broadcast, themes |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full policy.  
We intentionally do **not** reimplement Chromium, a VT terminal, or OS PTYs from scratch.

## Quick start

```bash
npm install
npm run dev
```

This opens an Electron window titled **Archeon Workspace**.

Fonts (IBM Plex Sans / Mono) are **bundled offline** via `@fontsource` — no Google Fonts CDN.

### CI

GitHub Actions runs typecheck, tests, and production build on **Ubuntu + Windows**.  
Pushes to `main` (and tags / manual **workflow_dispatch**) also package:

| Artifact set | Contents |
|--------------|----------|
| `archeon-windows-x64` | NSIS setup + portable `.exe` |
| `archeon-linux-x64` | AppImage + `.deb` |

Download from the Actions run → Artifacts.

### Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start Electron + Vite in development |
| `npm run build` | Production build (`out/`) |
| `npm run typecheck` | Strict TypeScript checks (main + renderer) |
| `npm test` | Run Vitest unit tests |
| `npm run dist:win` | Package Windows NSIS + portable |
| `npm run dist:linux` | Package Linux AppImage + deb |

## Packaging

```bash
npm run dist:win    # Windows NSIS setup + portable (x64)
npm run dist:linux  # Linux AppImage + deb (x64) — run on Linux
```

Artifacts land in `release/` (gitignored).

| Platform | Artifacts (example) |
| --- | --- |
| Windows | `Archeon Workspace-0.2.0-win-x64-setup.exe`, `…-portable.exe`, `win-unpacked/` |
| Linux | `Archeon Workspace-0.2.0-linux-x64.AppImage`, `.deb` |

Config: [`electron-builder.yml`](electron-builder.yml). Icon: `build/icon.png`.

**Smoke-tested (Windows):** production build + `electron-builder --win --x64` succeeds; `release/win-unpacked/Archeon Workspace.exe` launches; `node-pty` prebuilds unpack under `app.asar.unpacked`.

### Windows notes

- **No Visual Studio required** for normal package: `npmRebuild: false` uses **node-pty prebuilds**.
- Optional full native rebuild: Visual Studio Build Tools (“Desktop development with C++”), then `npx electron-builder install-app-deps`.
- **Code signing is off** for local builds (`signAndEditExecutable: false`) so packaging works without symlink privileges / Developer Mode. For public releases, enable signing and a cert.
- If packaging ever fails on winCodeSign symlinks, enable Windows **Developer Mode** or run as admin, or keep signing disabled for unsigned smoke builds.
- API keys use Electron `safeStorage` (DPAPI).

### Linux notes

**Build / native deps** (`node-pty`):

```bash
sudo apt install build-essential python3   # Debian/Ubuntu
# or equivalent: gcc, make, python3 on other distros
npm install
```

**Secure API keys** (`safeStorage`):

- Electron encrypts secrets via the system keyring when available.
- Install **libsecret** (and a running keyring such as GNOME Keyring or KWallet):

```bash
sudo apt install libsecret-1-0 libsecret-1-dev
```

- If encryption is unavailable, Archeon refuses to store keys in plain text and shows a warning in Settings.

**AppImage**:

```bash
chmod +x "Archeon Workspace-*-linux-x64.AppImage"
./"Archeon Workspace-*-linux-x64.AppImage"
```

If the AppImage fails to start, ensure FUSE is available (`libfuse2` on older Ubuntu, or `fuse3` / AppImage runtime support on newer releases).

**`.deb`**:

```bash
sudo dpkg -i "Archeon Workspace-*-linux-x64.deb"
# if needed:
sudo apt -f install
```

## Development

```bash
npm run typecheck
npm test
npm run build
```

CI runs typecheck + tests on `ubuntu-latest` and `windows-latest` (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

## Design

- [Product design spec](docs/superpowers/specs/2026-07-24-archeon-workspace-design.md)
- [Implementation plan](docs/superpowers/plans/2026-07-24-archeon-workspace.md)

## Auto-update (built from scratch)

Archeon does **not** use `electron-updater`. It ships a small custom updater:

1. App queries **GitHub Releases** (`latest`) for this repo  
2. Compares versions (semver)  
3. Picks the right installer for your OS (Windows setup.exe, Linux AppImage/deb)  
4. Downloads into user data (`…/updates/`) with progress  
5. Launches the installer (app quits on Windows so files can be replaced)

| UI | Action |
|----|--------|
| **Settings → App updates** | Check / Download & install / Open releases |
| **Ctrl+K → Check for updates** | Opens Settings and checks |
| Startup (after ~8s) | Silent check; toast if a newer release exists |

**Your workspaces and API keys are not in the install folder** — they stay under Electron `userData` across upgrades.

**How to ship an update for users:**

1. Bump `version` in `package.json`  
2. Tag e.g. `v0.3.0` and push  
3. CI builds installers — attach them to a **GitHub Release** (title `v0.3.0`) with the setup/portable/AppImage/deb assets  
4. Installed apps will see the new release on next check  

Override feed repo with env `ARCHEON_UPDATE_REPO=owner/name` if needed.

Until a **public GitHub Release** exists with assets, Check for updates will say there is nothing to install (or no releases yet).

## Version

Current: **0.3.0** — sessions, tokens, voice, tasks + auto-updater. See [CHANGELOG.md](CHANGELOG.md).

### Agent sessions & voice

| Feature | How |
|---------|-----|
| Token bar | On each AI pane — usage vs model context window |
| Forever memory | Chat + compact notes persist per pane; New thread folds history into memory |
| Tasks | Ask the model for `- [ ]` checklists, or **+ Task**; ticks show progress |
| Voice | **Ctrl+Shift+Space** anywhere you type; liquid-glass waveform while listening |

## License

[MIT](LICENSE)
