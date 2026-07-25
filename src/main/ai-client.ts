/**
 * OpenAI-compatible chat completions client with SSE streaming.
 * Used for both generic openai-compatible providers and xAI (OpenAI-compatible API).
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatStreamParams {
  providerId: string
  model: string
  systemPrompt?: string
  messages: ChatMessage[]
  apiKey: string
  /** Override provider base URL (no trailing slash). */
  baseUrl?: string
  /** Optional abort signal to cancel fetch / stream mid-flight. */
  signal?: AbortSignal
}

export class AiClientError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** True when the caller aborted via AbortSignal. */
    readonly cancelled = false
  ) {
    super(message)
    this.name = 'AiClientError'
  }
}

const XAI_BASE = 'https://api.x.ai/v1'
const OPENAI_BASE = 'https://api.openai.com/v1'

/**
 * Resolve chat completions base URL for a provider.
 * `xai` defaults to xAI; others require baseUrl or fall back to OpenAI.
 */
export function resolveProviderBaseUrl(providerId: string, baseUrl?: string): string {
  const trimmed = baseUrl?.trim().replace(/\/+$/, '')
  if (trimmed) return trimmed
  if (providerId === 'xai') return XAI_BASE
  if (providerId === 'openai' || providerId === 'openai-compatible') return OPENAI_BASE
  return OPENAI_BASE
}

/**
 * Build the messages array sent to the API (prepend system prompt when set).
 */
export function buildApiMessages(
  messages: ChatMessage[],
  systemPrompt?: string
): ChatMessage[] {
  const out: ChatMessage[] = []
  const sys = systemPrompt?.trim()
  if (sys) {
    out.push({ role: 'system', content: sys })
  }
  for (const m of messages) {
    if (m.role === 'system') continue
    out.push({ role: m.role, content: m.content })
  }
  return out
}

/**
 * Extract assistant text delta from an OpenAI-compatible chat chunk JSON object.
 * Returns null for role-only / empty deltas; empty string is not emitted.
 */
export function extractDeltaContent(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== 'object') return null
  const choices = (parsed as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const first = choices[0]
  if (!first || typeof first !== 'object') return null
  const delta = (first as { delta?: unknown }).delta
  if (!delta || typeof delta !== 'object') {
    // Non-stream style: message.content
    const message = (first as { message?: unknown }).message
    if (message && typeof message === 'object') {
      const content = (message as { content?: unknown }).content
      if (typeof content === 'string' && content.length > 0) return content
    }
    return null
  }
  const content = (delta as { content?: unknown }).content
  if (typeof content === 'string' && content.length > 0) return content
  return null
}

export interface StreamUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

/**
 * Extract token usage from an OpenAI-compatible chunk (often on the final chunk).
 */
export function extractUsage(parsed: unknown): StreamUsage | null {
  if (!parsed || typeof parsed !== 'object') return null
  const usage = (parsed as { usage?: unknown }).usage
  if (!usage || typeof usage !== 'object') return null
  const u = usage as {
    prompt_tokens?: unknown
    completion_tokens?: unknown
    total_tokens?: unknown
  }
  const promptTokens = typeof u.prompt_tokens === 'number' ? u.prompt_tokens : 0
  const completionTokens = typeof u.completion_tokens === 'number' ? u.completion_tokens : 0
  const totalTokens =
    typeof u.total_tokens === 'number' ? u.total_tokens : promptTokens + completionTokens
  if (promptTokens === 0 && completionTokens === 0 && totalTokens === 0) return null
  return { promptTokens, completionTokens, totalTokens }
}

export type SseParseResult =
  | { done: true; usage?: StreamUsage }
  | { text: string }
  | { usage: StreamUsage }
  | null

/**
 * Parse one SSE `data:` payload body. Returns:
 * - `{ done: true }` for `[DONE]`
 * - `{ text }` when delta content present
 * - `{ usage }` when usage-only payload
 * - `null` for keep-alives / empty / unparseable without error
 */
export function parseSseDataPayload(data: string): SseParseResult {
  const trimmed = data.trim()
  if (!trimmed || trimmed === ':') return null
  if (trimmed === '[DONE]') return { done: true }
  try {
    const parsed: unknown = JSON.parse(trimmed)
    const usage = extractUsage(parsed)
    const text = extractDeltaContent(parsed)
    if (text !== null && usage) return { text } // text takes priority; usage may also be sent
    if (text !== null) return { text }
    if (usage) return { usage }
    return null
  } catch {
    return null
  }
}

export type ChatStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'usage'; usage: StreamUsage }

/**
 * Split an SSE buffer into complete events (double-newline delimited) + remainder.
 */
export function splitSseBuffer(buffer: string): { events: string[]; rest: string } {
  // Normalize CRLF → LF for consistent splitting
  const normalized = buffer.replace(/\r\n/g, '\n')
  const parts = normalized.split('\n\n')
  const rest = parts.pop() ?? ''
  return { events: parts.filter((e) => e.length > 0), rest }
}

/**
 * From a single SSE event block, collect `data:` lines (joined with newline per SSE spec).
 */
export function dataFromSseEvent(eventBlock: string): string | null {
  const lines = eventBlock.split('\n')
  const dataLines: string[] = []
  for (const line of lines) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''))
    }
  }
  if (dataLines.length === 0) return null
  return dataLines.join('\n')
}

export class AIClient {
  /**
   * Stream assistant events (text deltas + optional usage).
   */
  async *chatStream(params: ChatStreamParams): AsyncIterable<ChatStreamEvent> {
    const { providerId, model, systemPrompt, messages, apiKey, baseUrl, signal } = params
    if (!apiKey?.trim()) {
      throw new AiClientError('API key is missing')
    }
    if (!model?.trim()) {
      throw new AiClientError('Model is required')
    }
    if (signal?.aborted) {
      throw new AiClientError('Request cancelled', undefined, true)
    }

    const base = resolveProviderBaseUrl(providerId, baseUrl)
    const url = `${base}/chat/completions`
    const body = {
      model: model.trim(),
      messages: buildApiMessages(messages, systemPrompt),
      stream: true,
      // Ask OpenAI-compatible APIs to include usage on the final chunk when supported
      stream_options: { include_usage: true }
    }

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`
        },
        body: JSON.stringify(body),
        signal
      })
    } catch (err) {
      if (isAbortError(err) || signal?.aborted) {
        throw new AiClientError('Request cancelled', undefined, true)
      }
      throw new AiClientError(
        `Failed to reach AI provider: ${err instanceof Error ? err.message : String(err)}`
      )
    }

    if (!response.ok) {
      let detail = ''
      try {
        detail = (await response.text()).slice(0, 400)
      } catch {
        /* ignore */
      }
      throw new AiClientError(
        `AI provider error ${response.status}${detail ? `: ${detail}` : ''}`,
        response.status
      )
    }

    if (!response.body) {
      throw new AiClientError('AI provider returned an empty body')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    const onAbort = (): void => {
      try {
        void reader.cancel()
      } catch {
        /* ignore */
      }
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    try {
      while (true) {
        if (signal?.aborted) {
          throw new AiClientError('Request cancelled', undefined, true)
        }
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const { events, rest } = splitSseBuffer(buffer)
        buffer = rest
        for (const event of events) {
          const data = dataFromSseEvent(event)
          if (data === null) continue
          const parsed = parseSseDataPayload(data)
          if (!parsed) continue
          if ('done' in parsed) {
            if (parsed.usage) yield { type: 'usage', usage: parsed.usage }
            return
          }
          if ('usage' in parsed && parsed.usage) {
            yield { type: 'usage', usage: parsed.usage }
            continue
          }
          if ('text' in parsed) {
            yield { type: 'text', text: parsed.text }
          }
        }
      }
      // Flush trailing buffer (some servers omit final blank line)
      if (buffer.trim() && !signal?.aborted) {
        const data = dataFromSseEvent(buffer) ?? buffer.trim()
        const parsed = parseSseDataPayload(data.startsWith('data:') ? data.slice(5) : data)
        if (parsed && 'text' in parsed) {
          yield { type: 'text', text: parsed.text }
        }
        if (parsed && 'usage' in parsed && parsed.usage) {
          yield { type: 'usage', usage: parsed.usage }
        }
      }
    } catch (err) {
      if (isAbortError(err) || signal?.aborted) {
        throw new AiClientError('Request cancelled', undefined, true)
      }
      throw err
    } finally {
      signal?.removeEventListener('abort', onAbort)
      try {
        reader.releaseLock()
      } catch {
        /* ignore */
      }
    }
  }
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const name = (err as { name?: string }).name
  return name === 'AbortError' || name === 'TimeoutError'
}
