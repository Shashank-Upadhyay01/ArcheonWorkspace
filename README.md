# Archeon Workspace

Multi-agent terminal desktop app for Windows and Linux. Dockable shell panes, AI chat, and CLI agent workspaces with layout presets and full session resume.

## Platforms

- **Windows** and **Linux** (first-class)
- Node.js **20+**

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
| `npm run dist:win` | Package Windows installers |
| `npm run dist:linux` | Package Linux AppImage / deb |

## Screenshot

_Screenshot placeholder — app chrome after scaffold._

## Design

See the product design spec:

- [Archeon Workspace design](docs/superpowers/specs/2026-07-24-archeon-workspace-design.md)
- [Implementation plan](docs/superpowers/plans/2026-07-24-archeon-workspace.md)

## License

MIT
