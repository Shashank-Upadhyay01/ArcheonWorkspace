import { describe, it, expect } from 'vitest'
import {
  buildApiMessages,
  dataFromSseEvent,
  extractDeltaContent,
  parseSseDataPayload,
  resolveProviderBaseUrl,
  splitSseBuffer
} from '../src/main/ai-client'

describe('resolveProviderBaseUrl', () => {
  it('defaults xai to api.x.ai', () => {
    expect(resolveProviderBaseUrl('xai')).toBe('https://api.x.ai/v1')
  })

  it('defaults openai-compatible to api.openai.com', () => {
    expect(resolveProviderBaseUrl('openai-compatible')).toBe('https://api.openai.com/v1')
  })

  it('strips trailing slashes from explicit baseUrl', () => {
    expect(resolveProviderBaseUrl('custom', 'https://example.com/v1/')).toBe(
      'https://example.com/v1'
    )
  })

  it('prefers explicit baseUrl over provider defaults', () => {
    expect(resolveProviderBaseUrl('xai', 'https://proxy.local/v1')).toBe('https://proxy.local/v1')
  })
})

describe('buildApiMessages', () => {
  it('prepends system prompt and drops embedded system roles', () => {
    const out = buildApiMessages(
      [
        { role: 'system', content: 'ignore me' },
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' }
      ],
      '  You are helpful.  '
    )
    expect(out).toEqual([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' }
    ])
  })

  it('omits system when prompt empty', () => {
    const out = buildApiMessages([{ role: 'user', content: 'hi' }], '   ')
    expect(out).toEqual([{ role: 'user', content: 'hi' }])
  })
})

describe('extractDeltaContent', () => {
  it('reads OpenAI stream delta content', () => {
    expect(
      extractDeltaContent({
        choices: [{ delta: { content: 'Hel' } }]
      })
    ).toBe('Hel')
  })

  it('returns null for role-only deltas', () => {
    expect(
      extractDeltaContent({
        choices: [{ delta: { role: 'assistant' } }]
      })
    ).toBeNull()
  })

  it('reads non-stream message.content', () => {
    expect(
      extractDeltaContent({
        choices: [{ message: { role: 'assistant', content: 'full' } }]
      })
    ).toBe('full')
  })

  it('returns null for empty / malformed payloads', () => {
    expect(extractDeltaContent(null)).toBeNull()
    expect(extractDeltaContent({})).toBeNull()
    expect(extractDeltaContent({ choices: [] })).toBeNull()
  })
})

describe('SSE helpers', () => {
  it('splits buffer on blank lines and keeps remainder', () => {
    const { events, rest } = splitSseBuffer('data: {"a":1}\n\ndata: {"b":2}\n\ndata: partial')
    expect(events).toHaveLength(2)
    expect(events[0]).toContain('data: {"a":1}')
    expect(rest).toBe('data: partial')
  })

  it('normalizes CRLF event boundaries', () => {
    const { events, rest } = splitSseBuffer('data: hi\r\n\r\ndata: there\r\n\r\n')
    expect(events).toHaveLength(2)
    expect(rest).toBe('')
  })

  it('extracts multi-line data fields from an event block', () => {
    expect(dataFromSseEvent('event: message\ndata: hello\ndata: world\n')).toBe('hello\nworld')
  })

  it('parses [DONE] and delta payloads', () => {
    expect(parseSseDataPayload('[DONE]')).toEqual({ done: true })
    expect(parseSseDataPayload('{"choices":[{"delta":{"content":"x"}}]}')).toEqual({
      text: 'x'
    })
    expect(parseSseDataPayload('')).toBeNull()
    expect(parseSseDataPayload('not-json')).toBeNull()
  })
})
