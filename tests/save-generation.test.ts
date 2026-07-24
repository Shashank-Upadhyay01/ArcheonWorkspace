import { describe, it, expect } from 'vitest'
import {
  bumpSaveGeneration,
  shouldClearDirtyAfterFlush
} from '../src/shared/save-generation'

describe('save generation guard', () => {
  it('bumps generation monotonically', () => {
    expect(bumpSaveGeneration(0)).toBe(1)
    expect(bumpSaveGeneration(1)).toBe(2)
    expect(bumpSaveGeneration(41)).toBe(42)
  })

  it('clears dirty only when captured gen still matches', () => {
    expect(shouldClearDirtyAfterFlush(3, 3)).toBe(true)
    expect(shouldClearDirtyAfterFlush(0, 0)).toBe(true)
  })

  it('keeps dirty when a newer markDirty ran during await', () => {
    // flush started at gen 1; markDirty bumped to 2 mid-flight
    expect(shouldClearDirtyAfterFlush(1, 2)).toBe(false)
    expect(shouldClearDirtyAfterFlush(5, 6)).toBe(false)
  })

  it('simulates markDirty → flush → markDirty race', () => {
    let gen = 0
    // user edit
    gen = bumpSaveGeneration(gen)
    const captured = gen
    // concurrent edit while save in flight
    gen = bumpSaveGeneration(gen)
    expect(shouldClearDirtyAfterFlush(captured, gen)).toBe(false)
    // second flush after re-dirty captures latest
    const captured2 = gen
    expect(shouldClearDirtyAfterFlush(captured2, gen)).toBe(true)
  })
})
