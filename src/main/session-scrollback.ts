import fs from 'fs'
import path from 'path'

const MAX_SCROLLBACK_LINES = 5000

export interface ScrollbackKey {
  workspaceId: string
  paneId: string
}

function scrollbackPath(sessionsDir: string, key: ScrollbackKey): string {
  return path.join(sessionsDir, key.workspaceId, 'panes', `${key.paneId}.scrollback.txt`)
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
