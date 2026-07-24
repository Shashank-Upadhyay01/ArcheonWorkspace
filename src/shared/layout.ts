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
  function close(node: LayoutNode): LayoutNode | null {
    if (node.type === 'leaf') {
      return node.paneId === paneId ? null : node
    }

    if (node.type === 'tabs') {
      if (!node.tabs.includes(paneId)) {
        return { type: 'tabs', active: node.active, tabs: [...node.tabs] }
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
      children: node.children.map(replace)
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
