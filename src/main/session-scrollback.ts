import fs from 'fs'
import path from 'path'

const MAX_SCROLLBACK_LINES = 5000

/** Allowed id segment for workspace/pane path components (no path traversal). */
const SAFE_ID_RE = /^[A-Za-z0-9._-]+$/

export interface ScrollbackKey {
  workspaceId: string
  paneId: string
}

export class ScrollbackPathError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScrollbackPathError'
  }
}

/** Reject unsafe workspace/pane ids (path traversal, separators, empty). */
export function assertSafeScrollbackKey(key: ScrollbackKey): void {
  if (!SAFE_ID_RE.test(key.workspaceId)) {
    throw new ScrollbackPathError(`Invalid workspaceId for scrollback: ${key.workspaceId}`)
  }
  if (!SAFE_ID_RE.test(key.paneId)) {
    throw new ScrollbackPathError(`Invalid paneId for scrollback: ${key.paneId}`)
  }
}

/**
 * Build absolute scrollback file path and ensure it stays under sessionsDir.
 */
export function scrollbackPath(sessionsDir: string, key: ScrollbackKey): string {
  assertSafeScrollbackKey(key)
  const root = path.resolve(sessionsDir)
  const file = path.resolve(
    root,
    key.workspaceId,
    'panes',
    `${key.paneId}.scrollback.txt`
  )
  const relative = path.relative(root, file)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new ScrollbackPathError(`Scrollback path escapes sessionsDir: ${file}`)
  }
  return file
}

/** Cap stored scrollback to the last N lines. */
export function capScrollbackText(text: string, maxLines = MAX_SCROLLBACK_LINES): string {
  if (!text) return ''
  const lines = text.split('\n')
  if (lines.length <= maxLines) return text
  return lines.slice(lines.length - maxLines).join('\n')
}

export function saveScrollback(
  sessionsDir: string,
  key: ScrollbackKey,
  text: string
): void {
  const file = scrollbackPath(sessionsDir, key)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const capped = capScrollbackText(text)
  fs.writeFileSync(file, capped, 'utf8')
}

export function loadScrollback(
  sessionsDir: string,
  key: ScrollbackKey
): string | null {
  const file = scrollbackPath(sessionsDir, key)
  if (!fs.existsSync(file)) return null
  try {
    const raw = fs.readFileSync(file, 'utf8')
    return capScrollbackText(raw)
  } catch {
    return null
  }
}
