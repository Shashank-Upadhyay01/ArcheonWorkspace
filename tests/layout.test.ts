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
  builtinPresets,
  updateSplitSizes,
  remapLayoutIds,
  setTabsActive,
  openAsTab,
  reorderTabs
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

  it('updateSplitSizes normalizes sizes on root split', () => {
    let root = createLeaf('a')
    root = splitNode(root, 'a', 'h', 'b')
    const next = updateSplitSizes(root, [], [0.7, 0.3])
    expect(next.type).toBe('split')
    if (next.type === 'split') {
      expect(next.sizes[0]).toBeCloseTo(0.7)
      expect(next.sizes[1]).toBeCloseTo(0.3)
    }
  })

  it('updateSplitSizes reaches nested split via path', () => {
    // (a | b) / c  — path [0] targets horizontal pair
    let root = createLeaf('a')
    root = splitNode(root, 'a', 'h', 'b')
    root = splitNode(root, 'a', 'v', 'c')
    // After split on a: structure is split-v of [split-h(a,b), c] or similar
    // Actually splitNode replaces the node containing a — if root is split-h(a,b),
    // splitting a vertically yields split-h(split-v(a,c), b)
    expect(root.type).toBe('split')
    if (root.type === 'split') {
      const next = updateSplitSizes(root, [0], [0.25, 0.75])
      if (next.type === 'split' && next.children[0].type === 'split') {
        expect(next.children[0].sizes[0]).toBeCloseTo(0.25)
        expect(next.children[0].sizes[1]).toBeCloseTo(0.75)
      }
    }
  })

  it('remapLayoutIds rewrites leaves and tabs', () => {
    const root: LayoutNode = {
      type: 'split',
      direction: 'h',
      sizes: [0.5, 0.5],
      children: [
        { type: 'leaf', paneId: '__p0' },
        { type: 'tabs', active: 0, tabs: ['__p1', '__p2'] }
      ]
    }
    const map = new Map([
      ['__p0', 'real0'],
      ['__p1', 'real1'],
      ['__p2', 'real2']
    ])
    const next = remapLayoutIds(root, map)
    expect(collectPaneIds(next).sort()).toEqual(['real0', 'real1', 'real2'])
  })

  it('setTabsActive updates active index', () => {
    const root = replaceLeafWithTabs(createLeaf('a'), 'a', ['a', 'b', 'c'], 0)
    const next = setTabsActive(root, 'b', 2)
    expect(next).toEqual({ type: 'tabs', active: 2, tabs: ['a', 'b', 'c'] })
  })

  it('openAsTab converts leaf to tabs with new pane selected', () => {
    const root = createLeaf('a')
    const next = openAsTab(root, 'a', 'b')
    expect(next).toEqual({ type: 'tabs', active: 1, tabs: ['a', 'b'] })
  })

  it('openAsTab appends to existing tabs group', () => {
    let root = openAsTab(createLeaf('a'), 'a', 'b')
    root = openAsTab(root, 'a', 'c')
    expect(root).toEqual({ type: 'tabs', active: 2, tabs: ['a', 'b', 'c'] })
  })

  it('openAsTab missing anchor returns same root', () => {
    const root = createLeaf('a')
    expect(openAsTab(root, 'missing', 'b')).toBe(root)
  })

  it('reorderTabs moves a tab and keeps active pane', () => {
    const root = replaceLeafWithTabs(createLeaf('a'), 'a', ['a', 'b', 'c'], 1)
    const next = reorderTabs(root, 'a', 0, 2)
    expect(next).toEqual({ type: 'tabs', active: 0, tabs: ['b', 'c', 'a'] })
  })
})
