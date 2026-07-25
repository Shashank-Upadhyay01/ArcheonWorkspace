import type { AgentTask, ChatMessage, ProjectMemoryNote, TokenUsage } from './types'

/**
 * Full durable session blob for a pane (chat + tokens + tasks + compact memory).
 * Backward compatible with older `{ messages: [...] }` files.
 */
export interface AgentSessionState {
  messages: ChatMessage[]
  tokens: TokenUsage
  tasks: AgentTask[]
  /** Rolling compact project memory notes for this pane/project. */
  memoryNotes: ProjectMemoryNote[]
  /** Last model / provider used in this session. */
  model?: string
  providerId?: string
  updatedAt: string
}

export function emptyTokenUsage(limit: number): TokenUsage {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    limit
  }
}

export function emptySessionState(limit = 128_000): AgentSessionState {
  return {
    messages: [],
    tokens: emptyTokenUsage(limit),
    tasks: [],
    memoryNotes: [],
    updatedAt: new Date().toISOString()
  }
}

/**
 * Compact older chat into memory notes: keep last `keepRecent` messages full,
 * distill earlier turns into short bullet notes (local, no API call).
 */
export function compactMessagesToMemory(
  messages: ChatMessage[],
  keepRecent = 12,
  maxNotes = 40
): { messages: ChatMessage[]; notes: ProjectMemoryNote[] } {
  if (messages.length <= keepRecent) {
    return { messages, notes: [] }
  }
  const older = messages.slice(0, messages.length - keepRecent)
  const recent = messages.slice(messages.length - keepRecent)
  const notes: ProjectMemoryNote[] = []
  const now = new Date().toISOString()

  // Group pairs user/assistant into compact lines
  for (let i = 0; i < older.length; i++) {
    const m = older[i]
    const snippet = m.content.replace(/\s+/g, ' ').trim().slice(0, 160)
    if (!snippet) continue
    notes.push({
      id: `mem_${i}_${now}`,
      at: now,
      text:
        m.role === 'user'
          ? `User: ${snippet}`
          : m.role === 'assistant'
            ? `Agent: ${snippet}`
            : snippet,
      source: m.role === 'user' ? 'user' : m.role === 'assistant' ? 'assistant' : 'system'
    })
  }

  // Prefer newest notes if over cap
  const trimmed = notes.length > maxNotes ? notes.slice(notes.length - maxNotes) : notes
  return { messages: recent, notes: trimmed }
}

/** Build system context block from memory notes for the model. */
export function memoryToSystemContext(notes: ProjectMemoryNote[], title?: string): string {
  if (!notes.length) return ''
  const header = title
    ? `## Project memory (${title})\nDurable notes from earlier work in this session:\n`
    : `## Project memory\nDurable notes from earlier work in this session:\n`
  const body = notes
    .slice(-24)
    .map((n) => `- ${n.text}`)
    .join('\n')
  return `${header}${body}\n\nUse this memory; do not ask the user to restate it unless needed.`
}
