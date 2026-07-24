import type { LayoutNode, LayoutPreset } from './types'
import { layoutNodeSchema } from './schemas'

/** Normalize sizes so they sum to 1 (stable when sum is ~0). */
function normalizeSizes(sizes: number[]): number[] {
  if (sizes.length === 0) return []
  const sum = sizes.reduce((a, b) => a + b, 0)
  if (sum <= 0) {
    const equal = 1 / sizes.length
    return sizes.map(() => equal)
  }
  return sizes.map((s) => s / sum)
}

export function createLeaf(paneId: string): LayoutNode {
  return { type: 'leaf', paneId }
}

/** Whether this node contains the given pane id (leaf or tabs entry). */
function nodeContainsPane(node: LayoutNode, paneId: string): boolean {
  if (node.type === 'leaf') return node.paneId === paneId
  if (node.type === 'tabs') return node.tabs.includes(paneId)
  return node.children.some((c) => nodeContainsPane(c, paneId))
}

/**
 * Split the leaf/tabs node that owns `targetPaneId` into a split:
 * original node first (left/top), new leaf second (right/bottom).
 * `ratio` is the fractional size of the first child (default 0.5).
 */
export function splitNode(
  root: LayoutNode,
  targetPaneId: string,
  direction: 'h' | 'v',
  newPaneId: string,
  ratio = 0.5
): LayoutNode {
  const r = Math.min(1, Math.max(0, ratio))
  const sizes = normalizeSizes([r, 1 - r])

  function replace(node: LayoutNode): LayoutNode {
    if (node.type === 'leaf') {
      if (node.paneId !== targetPaneId) return node
      return {
        type: 'split',
        direction,
        sizes: [...sizes],
        children: [node, createLeaf(newPaneId)]
      }
    }

    if (node.type === 'tabs') {
      if (!node.tabs.includes(targetPaneId)) return node
      return {
        type: 'split',
        direction,
        sizes: [...sizes],
        children: [{ ...node, tabs: [...node.tabs] }, createLeaf(newPaneId)]
      }
    }

    // split: recurse into the child that contains the target
    return {
      type: 'split',
      direction: node.direction,
      sizes: [...node.sizes],
      children: node.children.map((child) =>
        nodeContainsPane(child, targetPaneId) ? replace(child) : child
      )
    }
  }

  if (!nodeContainsPane(root, targetPaneId)) {
    return root
  }

  return replace(root)
}

/**
 * Close a pane. Collapses splits with one remaining child (hoist).
 * Tabs with one remaining pane become a leaf. Returns null if the tree is empty.
 */
export function closePane(root: LayoutNode, paneId: string): LayoutNode | null {
  // No-op identity: missing pane must return the same root reference.
  if (!nodeContainsPane(root, paneId)) {
    return root
  }

  function close(node: LayoutNode): LayoutNode | null {
    if (node.type === 'leaf') {
      return node.paneId === paneId ? null : node
    }

    if (node.type === 'tabs') {
      if (!node.tabs.includes(paneId)) {
        return node
      }
      const tabs = node.tabs.filter((id) => id !== paneId)
      if (tabs.length === 0) return null
      if (tabs.length === 1) return createLeaf(tabs[0])
      let active = node.active
      const closedIndex = node.tabs.indexOf(paneId)
      if (closedIndex < active) active -= 1
      else if (closedIndex === active) active = Math.min(active, tabs.length - 1)
      active = Math.max(0, Math.min(active, tabs.length - 1))
      return { type: 'tabs', active, tabs }
    }

    // split
    const nextChildren: LayoutNode[] = []
    const nextSizes: number[] = []
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i]
      const result = close(child)
      if (result !== null) {
        nextChildren.push(result)
        nextSizes.push(node.sizes[i] ?? 0)
      }
    }

    if (nextChildren.length === 0) return null
    if (nextChildren.length === 1) return nextChildren[0]

    return {
      type: 'split',
      direction: node.direction,
      sizes: normalizeSizes(nextSizes),
      children: nextChildren
    }
  }

  return close(root)
}

/**
 * Path of child indices from root to the node that owns `paneId`.
 * For a leaf at root, returns []. For tabs, path points at the tabs node.
 */
export function findPanePath(root: LayoutNode, paneId: string): number[] | null {
  function walk(node: LayoutNode, path: number[]): number[] | null {
    if (node.type === 'leaf') {
      return node.paneId === paneId ? path : null
    }
    if (node.type === 'tabs') {
      return node.tabs.includes(paneId) ? path : null
    }
    for (let i = 0; i < node.children.length; i++) {
      const found = walk(node.children[i], [...path, i])
      if (found) return found
    }
    return null
  }

  return walk(root, [])
}

export function collectPaneIds(root: LayoutNode): string[] {
  if (root.type === 'leaf') return [root.paneId]
  if (root.type === 'tabs') return [...root.tabs]
  return root.children.flatMap(collectPaneIds)
}

/**
 * Replace the leaf with `paneId` by a tabs group.
 * `tabPaneIds` should include the original pane if it remains a tab.
 */
export function replaceLeafWithTabs(
  root: LayoutNode,
  paneId: string,
  tabPaneIds: string[],
  activeIndex: number
): LayoutNode {
  // Empty tab list: leave layout unchanged.
  if (tabPaneIds.length === 0) {
    return root
  }

  // No-op identity: only replace when a matching leaf exists.
  function isLeaf(node: LayoutNode, id: string): boolean {
    if (node.type === 'leaf') return node.paneId === id
    if (node.type === 'tabs') return false
    return node.children.some((c) => isLeaf(c, id))
  }
  if (!isLeaf(root, paneId)) {
    return root
  }

  const active = Math.max(0, Math.min(activeIndex, Math.max(0, tabPaneIds.length - 1)))
  const tabsNode: LayoutNode = {
    type: 'tabs',
    active,
    tabs: [...tabPaneIds]
  }

  function replace(node: LayoutNode): LayoutNode {
    if (node.type === 'leaf') {
      return node.paneId === paneId ? tabsNode : node
    }
    if (node.type === 'tabs') {
      return node
    }
    return {
      type: 'split',
      direction: node.direction,
      sizes: [...node.sizes],
      children: node.children.map((child) =>
        isLeaf(child, paneId) ? replace(child) : child
      )
    }
  }

  return replace(root)
}

export function serializeLayout(root: LayoutNode): string {
  return JSON.stringify(root)
}

export function deserializeLayout(json: string): LayoutNode {
  const data: unknown = JSON.parse(json)
  return layoutNodeSchema.parse(data) as LayoutNode
}

/**
 * Replace `sizes` on the split node at `path` (child indices from root).
 * Empty path updates the root when it is a split. No-op if path is invalid.
 */
export function updateSplitSizes(
  root: LayoutNode,
  path: number[],
  sizes: number[]
): LayoutNode {
  const nextSizes = normalizeSizes(sizes)

  function replace(node: LayoutNode, remaining: number[]): LayoutNode {
    if (remaining.length === 0) {
      if (node.type !== 'split') return node
      if (nextSizes.length !== node.children.length) return node
      return {
        type: 'split',
        direction: node.direction,
        sizes: nextSizes,
        children: node.children
      }
    }

    if (node.type !== 'split') return node
    const [idx, ...rest] = remaining
    if (idx < 0 || idx >= node.children.length) return node
    return {
      type: 'split',
      direction: node.direction,
      sizes: [...node.sizes],
      children: node.children.map((child, i) =>
        i === idx ? replace(child, rest) : child
      )
    }
  }

  return replace(root, path)
}

/** Set active tab index on the tabs node that contains any of `tabs` or matches path by pane. */
export function setTabsActive(
  root: LayoutNode,
  paneIdInGroup: string,
  activeIndex: number
): LayoutNode {
  function replace(node: LayoutNode): LayoutNode {
    if (node.type === 'leaf') return node
    if (node.type === 'tabs') {
      if (!node.tabs.includes(paneIdInGroup)) return node
      const active = Math.max(0, Math.min(activeIndex, node.tabs.length - 1))
      return { type: 'tabs', active, tabs: [...node.tabs] }
    }
    return {
      type: 'split',
      direction: node.direction,
      sizes: [...node.sizes],
      children: node.children.map(replace)
    }
  }
  return replace(root)
}

/**
 * Open `newPaneId` as a tab next to `anchorPaneId`.
 * - Leaf anchor → becomes a tabs group `[anchor, new]`.
 * - Tabs group containing anchor → appends `newPaneId` and selects it.
 * No-op (same root reference) if anchor is missing or new id already in group.
 */
export function openAsTab(
  root: LayoutNode,
  anchorPaneId: string,
  newPaneId: string
): LayoutNode {
  if (!nodeContainsPane(root, anchorPaneId)) return root
  if (anchorPaneId === newPaneId) return root

  function replace(node: LayoutNode): LayoutNode {
    if (node.type === 'leaf') {
      if (node.paneId !== anchorPaneId) return node
      return { type: 'tabs', active: 1, tabs: [anchorPaneId, newPaneId] }
    }
    if (node.type === 'tabs') {
      if (!node.tabs.includes(anchorPaneId)) return node
      if (node.tabs.includes(newPaneId)) return node
      const tabs = [...node.tabs, newPaneId]
      return { type: 'tabs', active: tabs.length - 1, tabs }
    }
    return {
      type: 'split',
      direction: node.direction,
      sizes: [...node.sizes],
      children: node.children.map(replace)
    }
  }

  return replace(root)
}

/**
 * Reorder tabs in the group that contains `paneIdInGroup`.
 * No-op (same root) if indices are invalid or group is missing.
 */
export function reorderTabs(
  root: LayoutNode,
  paneIdInGroup: string,
  fromIndex: number,
  toIndex: number
): LayoutNode {
  if (fromIndex === toIndex) return root

  function replace(node: LayoutNode): LayoutNode {
    if (node.type === 'leaf') return node
    if (node.type === 'tabs') {
      if (!node.tabs.includes(paneIdInGroup)) return node
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= node.tabs.length ||
        toIndex >= node.tabs.length
      ) {
        return node
      }
      const tabs = [...node.tabs]
      const [moved] = tabs.splice(fromIndex, 1)
      tabs.splice(toIndex, 0, moved)
      const activeId = node.tabs[node.active]
      const active = Math.max(0, tabs.indexOf(activeId ?? moved))
      return { type: 'tabs', active, tabs }
    }
    return {
      type: 'split',
      direction: node.direction,
      sizes: [...node.sizes],
      children: node.children.map(replace)
    }
  }

  return replace(root)
}

/** All pane ids in document order (depth-first). */
export function orderedPaneIds(root: LayoutNode): string[] {
  return collectPaneIds(root)
}

/**
 * Remap leaf/tabs pane ids via `idMap`. Unmapped ids stay as-is.
 */
export function remapLayoutIds(
  node: LayoutNode,
  idMap: Map<string, string>
): LayoutNode {
  if (node.type === 'leaf') {
    return { type: 'leaf', paneId: idMap.get(node.paneId) ?? node.paneId }
  }
  if (node.type === 'tabs') {
    return {
      type: 'tabs',
      active: node.active,
      tabs: node.tabs.map((id) => idMap.get(id) ?? id)
    }
  }
  return {
    type: 'split',
    direction: node.direction,
    sizes: [...node.sizes],
    children: node.children.map((c) => remapLayoutIds(c, idMap))
  }
}

/** Placeholder ids used in built-in presets: `__p0`, `__p1`, … */
export function placeholderPaneId(index: number): string {
  return `__p${index}`
}

function leaf(id: string): LayoutNode {
  return createLeaf(id)
}

function split(
  direction: 'h' | 'v',
  sizes: number[],
  children: LayoutNode[]
): LayoutNode {
  return {
    type: 'split',
    direction,
    sizes: normalizeSizes(sizes),
    children
  }
}

/**
 * Built-in layout presets. Placeholder pane ids (`__p0` …) are replaced
 * when application code materializes real panes from templates.
 */
export function builtinPresets(): LayoutPreset[] {
  return [
    {
      id: 'focus',
      name: 'Focus',
      builtIn: true,
      layout: leaf('__p0'),
      paneTemplates: [{ type: 'shell' }]
    },
    {
      id: 'pair',
      name: 'Pair',
      builtIn: true,
      layout: split('h', [0.5, 0.5], [leaf('__p0'), leaf('__p1')]),
      paneTemplates: [{ type: 'shell' }, { type: 'shell' }]
    },
    {
      id: 'stack',
      name: 'Stack',
      builtIn: true,
      layout: split('v', [0.5, 0.5], [leaf('__p0'), leaf('__p1')]),
      paneTemplates: [{ type: 'shell' }, { type: 'shell' }]
    },
    {
      id: 'quad',
      name: 'Quad',
      builtIn: true,
      layout: split(
        'v',
        [0.5, 0.5],
        [
          split('h', [0.5, 0.5], [leaf('__p0'), leaf('__p1')]),
          split('h', [0.5, 0.5], [leaf('__p2'), leaf('__p3')])
        ]
      ),
      paneTemplates: [
        { type: 'shell' },
        { type: 'shell' },
        { type: 'shell' },
        { type: 'shell' }
      ]
    },
    {
      id: 'war_room',
      name: 'War Room',
      builtIn: true,
      // Large main + vertical side strip of stacked panes
      layout: split(
        'h',
        [0.7, 0.3],
        [
          leaf('__p0'),
          split('v', [0.5, 0.5], [leaf('__p1'), leaf('__p2')])
        ]
      ),
      paneTemplates: [{ type: 'shell' }, { type: 'ai_chat' }, { type: 'cli_agent' }]
    },
    {
      id: 'ide',
      name: 'IDE',
      builtIn: true,
      // Main editor + bottom panel + side panel
      layout: split(
        'h',
        [0.75, 0.25],
        [
          split('v', [0.7, 0.3], [leaf('__p0'), leaf('__p1')]),
          leaf('__p2')
        ]
      ),
      paneTemplates: [{ type: 'shell' }, { type: 'shell' }, { type: 'ai_chat' }]
    }
  ]
}
