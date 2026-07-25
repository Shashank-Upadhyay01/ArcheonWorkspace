import { describe, it, expect } from 'vitest'
import {
  estimateTokens,
  remainingTokens,
  tokenLimitForModel,
  usagePercent
} from '../src/shared/token-budget'
import {
  compactMessagesToMemory,
  memoryToSystemContext
} from '../src/shared/session-state'

describe('token-budget', () => {
  it('resolves known model limits', () => {
    expect(tokenLimitForModel('grok-2-latest')).toBe(131_072)
    expect(tokenLimitForModel('gpt-4o')).toBe(128_000)
  })

  it('falls back for unknown models', () => {
    expect(tokenLimitForModel('mystery-model')).toBe(128_000)
  })

  it('computes percent and remaining', () => {
    expect(usagePercent(50, 100)).toBe(50)
    expect(remainingTokens(30, 100)).toBe(70)
    expect(usagePercent(200, 100)).toBe(100)
  })

  it('estimates tokens from text length', () => {
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('a'.repeat(40))).toBe(10)
  })
})

describe('session compact memory', () => {
  it('keeps recent messages and creates notes from older ones', () => {
    const messages = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `msg ${i} ` + 'x'.repeat(20)
    }))
    const { messages: kept, notes } = compactMessagesToMemory(messages, 6, 40)
    expect(kept).toHaveLength(6)
    expect(notes.length).toBeGreaterThan(0)
    expect(memoryToSystemContext(notes)).toContain('Project memory')
  })
})
