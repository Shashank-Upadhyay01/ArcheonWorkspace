import { describe, it, expect } from 'vitest'
import {
  createLeaf,
  splitNode,
  closePane,
  collectPaneIds,
  builtinPresets
} from '../src/shared/layout'

describe('layout engine', () => {
  it('creates a leaf', () => {
    expect(createLeaf('a')).toEqual({ type: 'leaf', paneId: 'a' })
  })

  it('splits a leaf horizontally into two leaves', () => {
    const root = createLeaf('a')
    const next = splitNode(root, 'a', 'h', 'b', 0.5)
    expect(next.type).toBe('split')
    if (next.type === 'split') {
      expect(next.direction).toBe('h')
      expect(collectPaneIds(next).sort()).toEqual(['a', 'b'])
      expect(next.sizes).toEqual([0.5, 0.5])
    }
  })

  it('closes a pane and collapses split to sibling', () => {
    let root = createLeaf('a')
    root = splitNode(root, 'a', 'h', 'b')
    const after = closePane(root, 'b')
    expect(after).toEqual({ type: 'leaf', paneId: 'a' })
  })

  it('returns null when closing the last pane', () => {
    expect(closePane(createLeaf('a'), 'a')).toBeNull()
  })

  it('exposes six built-in presets', () => {
    const ids = builtinPresets().map((p) => p.id)
    expect(ids).toEqual(['focus', 'pair', 'stack', 'quad', 'war_room', 'ide'])
  })
})
