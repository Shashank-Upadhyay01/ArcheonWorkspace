import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentTask, ChatMessage, Pane, ProjectMemoryNote, TokenUsage } from '@shared/types'
import { createId } from '@shared/ids'
import {
  compactMessagesToMemory,
  emptyTokenUsage,
  memoryToSystemContext
} from '@shared/session-state'
import { estimateTokens, tokenLimitForModel } from '@shared/token-budget'
import { getArcheonApi } from '../../lib/ipc'
import { useAppStore } from '../../stores/app-store'
import AgentTaskStrip from '../AgentTaskStrip'
import TokenUsageBar from '../TokenUsageBar'

export interface AiChatPaneProps {
  pane: Pane
  workspaceId: string
}

function apiKeySecretName(providerId: string): string {
  return `apiKey:${providerId}`
}

/** Parse simple task markers from assistant text: `- [ ] task` / `- [x] task` */
function extractTasksFromText(text: string, existing: AgentTask[]): AgentTask[] {
  const lines = text.split('\n')
  const now = new Date().toISOString()
  const found: AgentTask[] = [...existing]
  const titles = new Set(existing.map((t) => t.title.toLowerCase()))

  for (const line of lines) {
    const m = line.match(/^\s*[-*]\s*\[([ xX])\]\s+(.+)$/)
    if (!m) continue
    const done = m[1].toLowerCase() === 'x'
    const title = m[2].trim().slice(0, 120)
    if (!title) continue
    const key = title.toLowerCase()
    const prev = found.find((t) => t.title.toLowerCase() === key)
    if (prev) {
      if (done && !prev.done) {
        prev.done = true
        prev.completedAt = now
      }
    } else if (!titles.has(key)) {
      found.push({
        id: createId('task'),
        title,
        done,
        createdAt: now,
        completedAt: done ? now : undefined
      })
      titles.add(key)
    }
  }
  return found
}

export default function AiChatPane({ pane, workspaceId }: AiChatPaneProps): JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const setPaneRuntimeStatus = useAppStore((s) => s.setPaneRuntimeStatus)
  const providerId = pane.aiChat?.providerId || settings?.defaultProviderId || 'xai'
  const model = pane.aiChat?.model || settings?.defaultModel || 'grok-2-latest'
  const baseSystem = pane.aiChat?.systemPrompt ?? ''
  const agentName = pane.name
  const agentColor = pane.color
  const limit = pane.aiChat?.contextLimit ?? tokenLimitForModel(model)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [tokens, setTokens] = useState<TokenUsage>(() => emptyTokenUsage(limit))
  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [memoryNotes, setMemoryNotes] = useState<ProjectMemoryNote[]>([])

  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const requestIdRef = useRef<string | null>(null)
  const streamAccRef = useRef('')
  const disposedRef = useRef(false)
  const sessionRef = useRef({
    messages: [] as ChatMessage[],
    tokens: emptyTokenUsage(limit),
    tasks: [] as AgentTask[],
    memoryNotes: [] as ProjectMemoryNote[]
  })
  const focusRequest = useAppStore((s) => s.focusRequest)

  useEffect(() => {
    if (!focusRequest || focusRequest.paneId !== pane.id) return
    inputRef.current?.focus()
  }, [focusRequest, pane.id])

  const persistSession = useCallback(
    (partial?: {
      messages?: ChatMessage[]
      tokens?: TokenUsage
      tasks?: AgentTask[]
      memoryNotes?: ProjectMemoryNote[]
    }) => {
      const next = {
        messages: partial?.messages ?? sessionRef.current.messages,
        tokens: partial?.tokens ?? sessionRef.current.tokens,
        tasks: partial?.tasks ?? sessionRef.current.tasks,
        memoryNotes: partial?.memoryNotes ?? sessionRef.current.memoryNotes,
        model,
        providerId,
        updatedAt: new Date().toISOString()
      }
      sessionRef.current = {
        messages: next.messages,
        tokens: next.tokens,
        tasks: next.tasks,
        memoryNotes: next.memoryNotes
      }
      try {
        const api = getArcheonApi()
        void api.session
          .saveChat({
            workspaceId,
            paneId: pane.id,
            thread: next
          })
          .catch(() => {
            /* best-effort */
          })
      } catch {
        /* bridge missing */
      }
    },
    [workspaceId, pane.id, model, providerId]
  )

  useEffect(() => {
    disposedRef.current = false
    setMessages([])
    setStreamText('')
    setStreaming(false)
    setError(null)
    setLoaded(false)
    setHasKey(null)
    setTokens(emptyTokenUsage(limit))
    setTasks([])
    setMemoryNotes([])
    streamAccRef.current = ''
    sessionRef.current = {
      messages: [],
      tokens: emptyTokenUsage(limit),
      tasks: [],
      memoryNotes: []
    }
    const prevReq = requestIdRef.current
    requestIdRef.current = null
    if (prevReq) {
      try {
        getArcheonApi().ai.cancel(prevReq)
      } catch {
        /* bridge missing */
      }
    }
    setPaneRuntimeStatus(pane.id, 'idle')

    let api: ReturnType<typeof getArcheonApi>
    try {
      api = getArcheonApi()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setLoaded(true)
      setPaneRuntimeStatus(pane.id, 'error')
      return
    }

    void (async () => {
      try {
        const thread = await api.session.loadChat({ workspaceId, paneId: pane.id })
        if (disposedRef.current) return
        const msgs = thread?.messages ?? []
        const tok = thread?.tokens ?? emptyTokenUsage(limit)
        if (thread?.tokens) tok.limit = thread.tokens.limit || limit
        else tok.limit = limit
        const tsk = thread?.tasks ?? []
        const mem = thread?.memoryNotes ?? []
        setMessages(msgs)
        setTokens(tok)
        setTasks(tsk)
        setMemoryNotes(mem)
        sessionRef.current = { messages: msgs, tokens: tok, tasks: tsk, memoryNotes: mem }
      } catch {
        if (!disposedRef.current) setMessages([])
      }
      try {
        const present = await api.secrets.has(apiKeySecretName(providerId))
        if (!disposedRef.current) setHasKey(present)
      } catch (err) {
        if (!disposedRef.current) {
          const msg = err instanceof Error ? err.message : String(err)
          if (msg.includes('unavailable') || msg.includes('SecretsUnavailable')) {
            setError(msg)
            setHasKey(false)
          } else {
            setHasKey(false)
          }
        }
      }
      if (!disposedRef.current) setLoaded(true)
    })()

    return () => {
      disposedRef.current = true
      const activeReq = requestIdRef.current
      if (activeReq) {
        try {
          getArcheonApi().ai.cancel(activeReq)
        } catch {
          /* bridge missing */
        }
        requestIdRef.current = null
      }
      setPaneRuntimeStatus(pane.id, null)
    }
  }, [workspaceId, pane.id, providerId, limit, setPaneRuntimeStatus])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, streamText, streaming])

  const clearThread = useCallback(() => {
    if (streaming) return
    // Compact current history into durable memory before clearing the visible thread
    const { notes } = compactMessagesToMemory(sessionRef.current.messages, 0, 40)
    const mergedNotes = [...sessionRef.current.memoryNotes, ...notes].slice(-60)
    const tok = emptyTokenUsage(limit)
    setMessages([])
    setError(null)
    setStreamText('')
    setTasks([])
    setTokens(tok)
    setMemoryNotes(mergedNotes)
    persistSession({
      messages: [],
      tokens: tok,
      tasks: [],
      memoryNotes: mergedNotes
    })
  }, [streaming, limit, persistSession])

  const stop = useCallback(() => {
    const requestId = requestIdRef.current
    if (!requestId) return
    try {
      getArcheonApi().ai.cancel(requestId)
    } catch {
      /* bridge missing */
    }
  }, [])

  const send = useCallback(async () => {
    const text = draft.trim()
    if (!text || streaming) return

    let api: ReturnType<typeof getArcheonApi>
    try {
      api = getArcheonApi()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return
    }

    // Auto-compact long threads into project memory
    let workingMessages = messages
    let workingMemory = memoryNotes
    if (messages.length > 24) {
      const packed = compactMessagesToMemory(messages, 12, 40)
      workingMessages = packed.messages
      workingMemory = [...memoryNotes, ...packed.notes].slice(-60)
      setMemoryNotes(workingMemory)
      setMessages(workingMessages)
    }

    const userMsg: ChatMessage = { role: 'user', content: text }
    const history = [...workingMessages, userMsg]
    setMessages(history)
    setDraft('')
    setError(null)
    setStreaming(true)
    setPaneRuntimeStatus(pane.id, 'streaming')
    setStreamText('')
    streamAccRef.current = ''

    const memoryBlock = memoryToSystemContext(workingMemory, pane.name)
    const systemPrompt = [baseSystem.trim(), memoryBlock].filter(Boolean).join('\n\n')

    const requestId = createId('req')
    requestIdRef.current = requestId
    let finished = false
    let lastUsage: TokenUsage | null = null

    const finalize = (errorMessage?: string): void => {
      if (finished || requestIdRef.current !== requestId) return
      finished = true
      if (errorMessage) {
        setError((prev) => prev ?? errorMessage)
      }
      const finalText = streamAccRef.current
      let nextMessages = history
      let nextTasks = sessionRef.current.tasks
      if (finalText) {
        nextMessages = [...history, { role: 'assistant', content: finalText }]
        setMessages(nextMessages)
        nextTasks = extractTasksFromText(finalText, sessionRef.current.tasks)
        setTasks(nextTasks)
      }

      let nextTokens = sessionRef.current.tokens
      if (lastUsage) {
        nextTokens = {
          promptTokens: sessionRef.current.tokens.promptTokens + lastUsage.promptTokens,
          completionTokens:
            sessionRef.current.tokens.completionTokens + lastUsage.completionTokens,
          totalTokens: sessionRef.current.tokens.totalTokens + lastUsage.totalTokens,
          limit
        }
        setTokens(nextTokens)
      } else {
        // Local estimate when API omits usage
        const est =
          estimateTokens(history.map((m) => m.content).join('\n')) +
          estimateTokens(finalText)
        nextTokens = {
          ...sessionRef.current.tokens,
          totalTokens: sessionRef.current.tokens.totalTokens + est,
          completionTokens: sessionRef.current.tokens.completionTokens + estimateTokens(finalText),
          limit
        }
        setTokens(nextTokens)
      }

      persistSession({
        messages: nextMessages,
        tokens: nextTokens,
        tasks: nextTasks,
        memoryNotes: workingMemory
      })

      setStreamText('')
      streamAccRef.current = ''
      setStreaming(false)
      setPaneRuntimeStatus(pane.id, errorMessage ? 'error' : 'idle')
      requestIdRef.current = null
    }

    const unsub = api.ai.onChunk((ev) => {
      if (ev.requestId !== requestId) return
      if (ev.text) {
        streamAccRef.current += ev.text
        setStreamText(streamAccRef.current)
      }
      if (ev.usage) {
        lastUsage = {
          promptTokens: ev.usage.promptTokens,
          completionTokens: ev.usage.completionTokens,
          totalTokens: ev.usage.totalTokens,
          limit
        }
      }
      if (ev.done) {
        finalize(ev.error)
      }
    })

    try {
      await api.ai.chat({
        requestId,
        providerId,
        model,
        systemPrompt,
        messages: history
      })
      finalize()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      finalize(msg)
    } finally {
      unsub()
    }
  }, [
    draft,
    streaming,
    messages,
    memoryNotes,
    providerId,
    model,
    baseSystem,
    limit,
    persistSession,
    pane.id,
    pane.name,
    setPaneRuntimeStatus
  ])

  const providerLabel =
    settings?.providers.find((p) => p.id === providerId)?.label ?? providerId

  const toggleTask = (id: string): void => {
    const now = new Date().toISOString()
    const next = tasks.map((t) =>
      t.id === id
        ? {
            ...t,
            done: !t.done,
            completedAt: !t.done ? now : undefined
          }
        : t
    )
    setTasks(next)
    persistSession({ tasks: next })
  }

  const addTask = (): void => {
    const title = window.prompt('Task title')
    if (!title?.trim()) return
    const task: AgentTask = {
      id: createId('task'),
      title: title.trim().slice(0, 120),
      done: false,
      createdAt: new Date().toISOString()
    }
    const next = [...tasks, task]
    setTasks(next)
    persistSession({ tasks: next })
  }

  return (
    <div className="ai-chat-pane">
      <div className="ai-chat-header" style={{ borderLeftColor: agentColor }}>
        <div className="ai-chat-header-main">
          <span className="ai-chat-agent-dot" style={{ background: agentColor }} aria-hidden="true" />
          <span className="ai-chat-agent-name">{agentName}</span>
          <span className="ai-chat-model" title={`${providerLabel} · ${model}`}>
            {providerLabel} · {model}
          </span>
          {memoryNotes.length > 0 ? (
            <span className="ai-chat-memory-badge" title={`${memoryNotes.length} durable memory notes`}>
              Memory {memoryNotes.length}
            </span>
          ) : null}
        </div>
        <div className="ai-chat-header-actions">
          {streaming ? (
            <button type="button" className="btn btn--ghost ai-chat-stop" onClick={stop} title="Stop">
              Stop
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn--ghost"
            onClick={addTask}
            title="Add task"
          >
            + Task
          </button>
          <button
            type="button"
            className="btn btn--ghost ai-chat-clear"
            disabled={messages.length === 0 && !streamText}
            onClick={() => {
              const text = messages
                .map((m) => `${m.role === 'user' ? 'You' : agentName}: ${m.content}`)
                .concat(streamText ? [`${agentName}: ${streamText}`] : [])
                .join('\n\n')
              void navigator.clipboard.writeText(text).catch(() => {
                setError('Could not copy to clipboard')
              })
            }}
            title="Copy conversation"
          >
            Copy
          </button>
          <button
            type="button"
            className="btn btn--ghost ai-chat-clear"
            disabled={streaming || (messages.length === 0 && memoryNotes.length === 0)}
            onClick={clearThread}
            title="New thread — compact current chat into project memory"
          >
            New thread
          </button>
        </div>
      </div>

      <div className="ai-chat-session-meta">
        <TokenUsageBar used={tokens.totalTokens} limit={tokens.limit || limit} />
        <AgentTaskStrip tasks={tasks} />
      </div>

      {tasks.length > 0 ? (
        <div className="ai-chat-task-panel">
          {tasks.map((t) => (
            <button
              key={t.id}
              type="button"
              className={t.done ? 'ai-task-row ai-task-row--done' : 'ai-task-row'}
              onClick={() => toggleTask(t.id)}
            >
              <span className="ai-task-tick">{t.done ? '✓' : '○'}</span>
              <span>{t.title}</span>
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="ai-chat-banner ai-chat-banner--error" role="alert">
          {error}
        </div>
      ) : null}

      {hasKey === false && !error ? (
        <div className="ai-chat-banner ai-chat-banner--warn" role="status">
          No API key for {providerLabel}. Open Settings and save a key.
        </div>
      ) : null}

      <div className="ai-chat-messages" aria-live="polite">
        {!loaded ? (
          <p className="ai-chat-empty">Loading session…</p>
        ) : messages.length === 0 && !streaming ? (
          <p className="ai-chat-empty">
            Session resumes with model, memory, tokens, and tasks. Chat is saved forever for this
            pane. Use checklist items like <code>- [ ] task</code> in replies to track progress.
            Voice: <kbd>Ctrl+Shift+Space</kbd>.
          </p>
        ) : (
          messages.map((m, i) => (
            <div
              key={`${m.role}-${i}-${m.content.slice(0, 24)}`}
              className={`ai-chat-bubble ai-chat-bubble--${m.role}`}
            >
              <div className="ai-chat-bubble-role">{m.role === 'user' ? 'You' : agentName}</div>
              <div className="ai-chat-bubble-body">{m.content}</div>
            </div>
          ))
        )}
        {streaming ? (
          <div className="ai-chat-bubble ai-chat-bubble--assistant ai-chat-bubble--streaming">
            <div className="ai-chat-bubble-role">{agentName}</div>
            <div className="ai-chat-bubble-body">
              {streamText || <span className="ai-chat-typing">Thinking…</span>}
            </div>
          </div>
        ) : null}
        <div ref={messagesEndRef} />
      </div>

      <form
        className="ai-chat-composer"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <textarea
          ref={inputRef}
          className="ai-chat-input"
          rows={2}
          placeholder="Message… (Ctrl+Shift+Space for voice)"
          value={draft}
          disabled={streaming}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
        />
        {streaming ? (
          <button type="button" className="btn btn--ghost ai-chat-send" onClick={stop}>
            Stop
          </button>
        ) : (
          <button type="submit" className="btn btn--accent ai-chat-send" disabled={!draft.trim()}>
            Send
          </button>
        )}
      </form>
    </div>
  )
}
