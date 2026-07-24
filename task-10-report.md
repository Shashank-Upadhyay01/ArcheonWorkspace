# Task 10 fix report — pane runtime clear + import/export errors

## Fixes

### 1. Clear pane runtime state on workspace switch

**Problem:** `broadcastPaneIds`, `ptySessionByPane`, and `paneRuntimeStatus` were only cleared on `selectWorkspace` / successful import. Stale maps could linger after create, delete-active, or applyPreset.

**Changes (`src/renderer/src/stores/app-store.ts`):**
- `createWorkspace` — clear all three maps after switching to the new workspace
- `deleteWorkspace` — clear when deleting the active workspace (same as `selectWorkspace`)
- `applyPreset` — clear after materializing new panes (old pane ids are invalid)

### 2. Surface export/import errors

**Problem:** IPC failures on export/import were unhandled; user saw no feedback.

**Changes:**
- `exportWorkspace` / `importWorkspace` — try/catch; set `error` to `Export failed: …` / `Import failed: …`; clear `error` on success
- `StatusBar.tsx` — show store `error` in the status pill (truncated + full `title`)

## Verification

- `npm test` — 11 files, 97 tests passed
- `npm run typecheck` — clean

## Commit

`Clear pane runtime state on workspace switch and surface import errors` → `origin feat/archeon-impl`
