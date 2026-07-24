# Archeon Workspace

Multi-agent terminal desktop app for **Windows** and **Linux**. Dockable shell panes, AI chat, and CLI agent workspaces with layout presets, multi-workspace resume, command palette, and secure API key storage.

## Platforms

- **Windows** and **Linux** (first-class)
- Node.js **20+**

## Features

- Dockable shell / AI / CLI panes with split layout and presets
- Multi-workspace switcher with autosave and crash recovery
- Terminal PTY sessions with scrollback restore
- AI chat panes (OpenAI-compatible APIs) with secure key storage
- CLI agent panes with profile env, args, and working directory
- Command palette (`Ctrl+K` / `Cmd+K`), agent roster, broadcast input
- Export / import workspaces (secrets stripped)

## Quick start

```bash
npm install
npm run dev
```

This opens an Electron window titled **Archeon Workspace**.

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

Artifacts land in `release/` after `npm run dist:win` or `npm run dist:linux`.

| Platform | Targets |
| --- | --- |
| Windows | NSIS installer, portable `.exe` (x64) |
| Linux | AppImage, `.deb` (x64) |

Config: [`electron-builder.yml`](electron-builder.yml). Optional icon assets under `build/` (`icon.png` 512×512; Windows also uses generated `.ico` when present).

### Windows notes

- Requires Node 20+ and a C++ toolchain if `node-pty` needs to rebuild (Visual Studio Build Tools with “Desktop development with C++”).
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

## License

MIT
