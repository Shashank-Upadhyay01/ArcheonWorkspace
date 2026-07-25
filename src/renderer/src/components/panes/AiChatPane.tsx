import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage, Pane } from '@shared/types'
import { createId } from '@shared/ids'
import { getArcheonApi } from '../../lib/ipc'
import { useAppStore } from '../../stores/app-store'

export interface AiChatPaneProps {
  pane: Pane
  workspaceId: string
}

function apiKeySecretName(providerId: string): string {
  return `apiKey:${providerId}`
}

export default function AiChatPane({ pane, workspaceId }: AiChatPaneProps): JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const setPaneRuntimeStatus = useAppStore((s) => s.setPaneRuntimeStatus)
  const providerId = pane.aiChat?.providerId || settings?.defaultProviderId || 'xai'
  const model = pane.aiChat?.model || settings?.defaultModel || 'grok-2-latest'
  const systemPrompt = pane.aiChat?.systemPrompt ?? ''
  const agentName = pane.name
  const agentColor = pane.color

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [hasKey, setHasKey] = useState<boolean | null>(null)

  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const requestIdRef = useRef<string | null>(null)
  const streamAccRef = useRef('')
  const disposedRef = useRef(false)
  const focusRequest = useAppStore((s) => s.focusRequest)

  // Respond to store focusPane requests
  useEffect(() => {
    if (!focusRequest || focusRequest.paneId !== pane.id) return
    inputRef.current?.focus()
  }, [focusRequest, pane.id])

  // Load thread + key status whenever pane/workspace changes; always reset local UI state.
  useEffect(() => {
    disposedRef.current = false
    setMessages([])
    setStreamText('')
    setStreaming(false)
    setError(null)
    setLoaded(false)
    setHasKey(null)
    streamAccRef.current = ''
    // Cancel any in-flight stream from a previous mount of this pane id
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
        setMessages(thread?.messages ?? [])
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
  }, [workspaceId, pane.id, providerId, setPaneRuntimeStatus])

  // Auto-scroll on new content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, streamText, streaming])

  const persist = useCallback(
    (next: ChatMessage[]) => {
      try {
        const api = getArcheonApi()
        void api.session
          .saveChat({
            workspaceId,
            paneId: pane.id,
            thread: { messages: next }
          })
          .catch(() => {
            /* best-effort */
          })
      } catch {
        /* bridge missing */
      }
    },
    [workspaceId, pane.id]
  )

  const clearThread = useCallback(() => {
    if (streaming) return
    setMessages([])
    setError(null)
    setStreamText('')
    persist([])
  }, [streaming, persist])

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

    const userMsg: ChatMessage = { role: 'user', content: text }
    const history = [...messages, userMsg]
    setMessages(history)
    setDraft('')
    setError(null)
    setStreaming(true)
    setPaneRuntimeStatus(pane.id, 'streaming')
    setStreamText('')
    streamAccRef.current = ''

    const requestId = createId('req')
    requestIdRef.current = requestId
    let finished = false

    const finalize = (errorMessage?: string): void => {
      if (finished || requestIdRef.current !== requestId) return
      finished = true
      if (errorMessage) {
        setError((prev) => prev ?? errorMessage)
      }
      const finalText = streamAccRef.current
      if (finalText) {
        const withAssistant: ChatMessage[] = [
          ...history,
          { role: 'assistant', content: finalText }
        ]
        setMessages(withAssistant)
        persist(withAssistant)
      } else {
        persist(history)
      }
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
      // If main resolved without a done chunk, still finalize once.
      finalize()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      finalize(msg)
    } finally {
      unsub()
    }
  }, [draft, streaming, messages, providerId, model, systemPrompt, persist, pane.id, setPaneRuntimeStatus])

  const providerLabel =
    settings?.providers.find((p) => p.id === providerId)?.label ?? providerId

  return (
    <div className="ai-chat-pane">
      <div className="ai-chat-header" style={{ borderLeftColor: agentColor }}>
        <div className="ai-chat-header-main">
          <span className="ai-chat-agent-dot" style={{ background: agentColor }} aria-hidden="true" />
          <span className="ai-chat-agent-name">{agentName}</span>
          <span className="ai-chat-model" title={`${providerLabel} · ${model}`}>
            {providerLabel} · {model}
          </span>
        </div>
        <div className="ai-chat-header-actions">
          {streaming ? (
            <button
              type="button"
              className="btn btn--ghost ai-chat-stop"
              onClick={stop}
              title="Stop generation"
            >
              Stop
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn--ghost ai-chat-clear"
            disabled={messages.length === 0 && !streamText}
            onClick={() => {
              const text = messages
                .map((m) => `${m.role === 'user' ? 'You' : agentName}: ${m.content}`)
                .concat(
                  streamText
                    ? [`${agentName}: ${streamText}`]
                    : []
                )
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
            disabled={streaming || messages.length === 0}
            onClick={clearThread}
            title="New thread (clear history)"
          >
            New thread
          </button>
        </div>
      </div>

      {error ? (
        <div className="ai-chat-banner ai-chat-banner--error" role="alert">
          {error}
        </div>
      ) : null}

      {hasKey === false && !error ? (
        <div className="ai-chat-banner ai-chat-banner--warn" role="status">
          No API key for {providerLabel}. Open Settings (gear in title bar) and save a key.
        </div>
      ) : null}

      <div className="ai-chat-messages" aria-live="polite">
        {!loaded ? (
          <p className="ai-chat-empty">Loading thread…</p>
        ) : messages.length === 0 && !streaming ? (
          <p className="ai-chat-empty">
            Start a conversation. Messages stream from the main process; history is restored on
            reopen.
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
          placeholder="Message…"
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
          <button
            type="submit"
            className="btn btn--accent ai-chat-send"
            disabled={!draft.trim()}
          >
            Send
          </button>
        )}
      </form>
    </div>
  )
}
