import { describe, it, expect } from 'vitest'
import {
  createLeaf,
  splitNode,
  closePane,
  collectPaneIds,
  findPanePath,
  replaceLeafWithTabs,
  serializeLayout,
  deserializeLayout,
  builtinPresets
} from '../src/shared/layout'
import type { LayoutNode } from '../src/shared/types'

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

  it('nested close hoists through intermediate splits', () => {
    // ((a | b) / c) — close b, then a should leave c
    let root = createLeaf('a')
    root = splitNode(root, 'a', 'h', 'b')
    root = splitNode(root, 'a', 'v', 'c')
    // tree is roughly: split(v, [split(h, [a,b])?, c]) depending on which leaf owned the split
    const afterB = closePane(root, 'b')
    expect(afterB).not.toBeNull()
    expect(collectPaneIds(afterB!).sort()).toEqual(['a', 'c'])
    const afterA = closePane(afterB!, 'a')
    expect(afterA).toEqual({ type: 'leaf', paneId: 'c' })
  })

  it('closePane returns same root reference when pane is missing', () => {
    const root = splitNode(createLeaf('a'), 'a', 'h', 'b')
    const after = closePane(root, 'missing')
    expect(after).toBe(root)
  })

  it('findPanePath returns child-index path to leaf and tabs', () => {
    let root = createLeaf('a')
    root = splitNode(root, 'a', 'h', 'b')
    root = splitNode(root, 'b', 'v', 'c')
    expect(findPanePath(root, 'a')).toEqual([0])
    expect(findPanePath(createLeaf('only'), 'only')).toEqual([])
    expect(findPanePath(root, 'missing')).toBeNull()

    const withTabs = replaceLeafWithTabs(createLeaf('x'), 'x', ['x', 'y'], 0)
    expect(findPanePath(withTabs, 'y')).toEqual([])
  })

  it('serde round-trips layout trees via JSON + schema', () => {
    let root: LayoutNode = createLeaf('a')
    root = splitNode(root, 'a', 'h', 'b', 0.4)
    root = replaceLeafWithTabs(root, 'b', ['b', 'c'], 1)
    const json = serializeLayout(root)
    const restored = deserializeLayout(json)
    expect(restored).toEqual(root)
  })

  it('replaceLeafWithTabs empty tabPaneIds returns same root', () => {
    const root = createLeaf('a')
    expect(replaceLeafWithTabs(root, 'a', [], 0)).toBe(root)
  })

  it('replaceLeafWithTabs returns same root when leaf not found', () => {
    const root = splitNode(createLeaf('a'), 'a', 'h', 'b')
    expect(replaceLeafWithTabs(root, 'missing', ['m', 'n'], 0)).toBe(root)
  })

  it('replaceLeafWithTabs converts leaf to tabs group', () => {
    const root = createLeaf('a')
    const next = replaceLeafWithTabs(root, 'a', ['a', 'b'], 1)
    expect(next).toEqual({ type: 'tabs', active: 1, tabs: ['a', 'b'] })
    expect(root).toEqual({ type: 'leaf', paneId: 'a' })
  })

  it('splitNode does not mutate the input tree', () => {
    const root = createLeaf('a')
    const snapshot = structuredClone(root)
    const next = splitNode(root, 'a', 'h', 'b')
    expect(root).toEqual(snapshot)
    expect(next).not.toBe(root)
    expect(root).toEqual({ type: 'leaf', paneId: 'a' })
  })
})
