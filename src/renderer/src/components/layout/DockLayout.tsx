import { useCallback, type ReactNode } from 'react'
import { setTabsActive, updateSplitSizes } from '@shared/layout'
import type { LayoutNode, Pane, Workspace } from '@shared/types'
import PaneChrome from './PaneChrome'
import SplitPane from './SplitPane'
import TabGroup from './TabGroup'

export interface DockLayoutProps {
  workspace: Workspace
  onChangeLayout: (layout: LayoutNode) => void
  onFocusPane: (id: string) => void
  renderPane: (pane: Pane) => ReactNode
}

interface DockNodeProps {
  node: LayoutNode
  path: number[]
  workspace: Workspace
  onChangeLayout: (layout: LayoutNode) => void
  onFocusPane: (id: string) => void
  renderPane: (pane: Pane) => ReactNode
}

function DockNode({
  node,
  path,
  workspace,
  onChangeLayout,
  onFocusPane,
  renderPane
}: DockNodeProps): JSX.Element {
  const handleResize = useCallback(
    (sizes: number[]) => {
      onChangeLayout(updateSplitSizes(workspace.layout, path, sizes))
    },
    [onChangeLayout, path, workspace.layout]
  )

  if (node.type === 'leaf') {
    const pane = workspace.panes[node.paneId]
    if (!pane) {
      return <div className="pane-missing">Missing pane {node.paneId}</div>
    }
    return (
      <PaneChrome
        pane={pane}
        focused={workspace.activePaneId === pane.id}
        onFocus={() => onFocusPane(pane.id)}
      >
        {renderPane(pane)}
      </PaneChrome>
    )
  }

  if (node.type === 'tabs') {
    const anchor = node.tabs[0] ?? ''
    return (
      <TabGroup
        tabIds={node.tabs}
        active={node.active}
        panes={workspace.panes}
        activePaneId={workspace.activePaneId}
        onSelectTab={(index) => {
          if (!anchor) return
          onChangeLayout(setTabsActive(workspace.layout, anchor, index))
        }}
        onFocusPane={onFocusPane}
        renderPane={renderPane}
      />
    )
  }

  // split
  return (
    <SplitPane direction={node.direction} sizes={node.sizes} onResize={handleResize}>
      {node.children.map((child, i) => (
        <DockNode
          key={`${path.join('.')}-${i}`}
          node={child}
          path={[...path, i]}
          workspace={workspace}
          onChangeLayout={onChangeLayout}
          onFocusPane={onFocusPane}
          renderPane={renderPane}
        />
      ))}
    </SplitPane>
  )
}

export default function DockLayout({
  workspace,
  onChangeLayout,
  onFocusPane,
  renderPane
}: DockLayoutProps): JSX.Element {
  return (
    <div className="dock-layout">
      <DockNode
        node={workspace.layout}
        path={[]}
        workspace={workspace}
        onChangeLayout={onChangeLayout}
        onFocusPane={onFocusPane}
        renderPane={renderPane}
      />
    </div>
  )
}
