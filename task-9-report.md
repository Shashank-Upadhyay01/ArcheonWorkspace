# Task 9 fix report — profile env preserve + quote-aware args

## Fixes

### 1. ProfileEditor: preserve `defaults.env` on save

**Problem:** Save used `emptyCliDefaults()` and only set `command` / `args` / `cwd`, wiping any existing `env`.

**Changes:**
- `src/renderer/src/components/ProfileEditor.tsx`
  - Loads and saves env via `envToText` / `parseEnvText`
  - Simple KEY=value env textarea (comments/blank lines ignored)
- `src/shared/profiles.ts` — `envToText`, `parseEnvText`
- CSS: `.profile-editor-env` for the textarea

### 2. Quote-aware args join/parse (shared)

**Problem:** Plain `args.join(' ')` broke multi-word tokens on round-trip; parse logic was duplicated.

**Changes:**
- `src/shared/shell-args.ts` — `joinArgs` / `parseArgs`
- `ProfileEditor` + `CliAgentPane` use the shared helpers
- `tests/shell-args.test.ts` + env tests in `profiles.test.ts`

## Verification

- `npm test` — 11 files, 97 tests passed
- `npm run typecheck` — clean

## Commit

`Preserve CLI profile env and fix args quoting` → `origin feat/archeon-impl`
