import type { ReactNode } from 'react'
import type { Pane } from '@shared/types'
import PaneChrome from './PaneChrome'

export interface TabGroupProps {
  tabIds: string[]
  active: number
  panes: Record<string, Pane>
  activePaneId?: string
  onSelectTab: (index: number) => void
  onFocusPane: (id: string) => void
  renderPane: (pane: Pane) => ReactNode
}

export default function TabGroup({
  tabIds,
  active,
  panes,
  activePaneId,
  onSelectTab,
  onFocusPane,
  renderPane
}: TabGroupProps): JSX.Element {
  const safeActive = Math.max(0, Math.min(active, tabIds.length - 1))
  const activeId = tabIds[safeActive]
  const activePane = activeId ? panes[activeId] : undefined

  return (
    <div className="tab-group">
      <div className="tab-group-bar" role="tablist">
        {tabIds.map((id, i) => {
          const pane = panes[id]
          const selected = i === safeActive
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={selected ? 'tab-group-tab tab-group-tab--active' : 'tab-group-tab'}
              onClick={() => {
                onSelectTab(i)
                onFocusPane(id)
              }}
            >
              <span
                className="tab-group-tab-dot"
                style={{ background: pane?.color ?? 'var(--accent)' }}
                aria-hidden="true"
              />
              <span className="tab-group-tab-label">{pane?.name ?? id}</span>
            </button>
          )
        })}
      </div>
      <div className="tab-group-panel" role="tabpanel">
        {activePane ? (
          <PaneChrome
            pane={activePane}
            focused={activePaneId === activePane.id}
            onFocus={() => onFocusPane(activePane.id)}
          >
            {renderPane(activePane)}
          </PaneChrome>
        ) : (
          <div className="pane-missing">Missing pane</div>
        )}
      </div>
    </div>
  )
}
