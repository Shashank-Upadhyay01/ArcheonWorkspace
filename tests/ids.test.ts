import { describe, it, expect } from 'vitest'
import { createId } from '../src/shared/ids'

describe('createId', () => {
  it('returns a non-empty string', () => {
    expect(createId().length).toBeGreaterThan(8)
  })
  it('returns unique values', () => {
    expect(createId()).not.toBe(createId())
  })
})
