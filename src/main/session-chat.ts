import fs from 'fs'
import path from 'path'
import { z } from 'zod'

/** Allowed id segment for workspace/pane path components (no path traversal). */
const SAFE_ID_RE = /^[A-Za-z0-9._-]+$/

export interface ChatThreadKey {
  workspaceId: string
  paneId: string
}

export interface PersistedChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatThread {
  messages: PersistedChatMessage[]
}

export class ChatThreadPathError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ChatThreadPathError'
  }
}

const chatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string()
})

const chatThreadSchema = z.object({
  messages: z.array(chatMessageSchema)
})

/** Reject unsafe workspace/pane ids (path traversal, separators, empty). */
export function assertSafeChatThreadKey(key: ChatThreadKey): void {
  if (!SAFE_ID_RE.test(key.workspaceId)) {
    throw new ChatThreadPathError(`Invalid workspaceId for chat thread: ${key.workspaceId}`)
  }
  if (!SAFE_ID_RE.test(key.paneId)) {
    throw new ChatThreadPathError(`Invalid paneId for chat thread: ${key.paneId}`)
  }
}

/**
 * Build absolute chat thread file path and ensure it stays under sessionsDir.
 * Path: sessions/{ws}/panes/{paneId}.json
 */
export function chatThreadPath(sessionsDir: string, key: ChatThreadKey): string {
  assertSafeChatThreadKey(key)
  const root = path.resolve(sessionsDir)
  const file = path.resolve(root, key.workspaceId, 'panes', `${key.paneId}.json`)
  const relative = path.relative(root, file)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new ChatThreadPathError(`Chat thread path escapes sessionsDir: ${file}`)
  }
  return file
}

export function saveChatThread(
  sessionsDir: string,
  key: ChatThreadKey,
  thread: ChatThread
): void {
  const file = chatThreadPath(sessionsDir, key)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const validated = chatThreadSchema.parse(thread)
  fs.writeFileSync(file, JSON.stringify(validated, null, 2), 'utf8')
}

export function loadChatThread(
  sessionsDir: string,
  key: ChatThreadKey
): ChatThread | null {
  const file = chatThreadPath(sessionsDir, key)
  if (!fs.existsSync(file)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
    const parsed = chatThreadSchema.safeParse(raw)
    if (!parsed.success) return null
    return parsed.data
  } catch {
    return null
  }
}
