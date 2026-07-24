# Task 8 fix report — AI pane isolation + secrets has-check

## Fixes

### 1. AI chat pane isolation on `pane.id` / workspace change

**Problem:** Switching panes could leave prior messages, stream text, or errors visible because React reused the pane component instance and the load effect only applied messages when the loaded thread was non-empty.

**Changes:**
- `src/renderer/src/App.tsx`
  - `key={pane.id}` on `PaneBody` from `renderPane`
  - `key={pane.id}` on `ShellPane`, `AiChatPane`, and the CLI placeholder
- `src/renderer/src/components/panes/AiChatPane.tsx`
  - Load effect always resets: messages, stream, streaming, error, loaded, hasKey, refs
  - Always `setMessages(thread?.messages ?? [])` (empty thread clears prior state)

### 2. `SecureStore.has` decrypt-aware

**Problem:** `has()` returned true for any non-empty file on disk, even if `get()` would fail to decrypt and return `null`.

**Change:** `src/main/secure-store.ts` — `has(key)` is now `return this.get(key) !== null` so it matches successful decrypt semantics.

## Verification

- `npm test` — 9 files, 75 tests passed
- `npm run typecheck` — clean

## Commit

`Fix AI chat pane isolation and secrets has-check` → `origin feat/archeon-impl`
