import { useRef, useState, type ReactNode } from 'react'
import type { Pane } from '@shared/types'
import { useAppStore } from '../../stores/app-store'
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
  const closePane = useAppStore((s) => s.closePane)
  const addPaneAsTab = useAppStore((s) => s.addPaneAsTab)
  const reorderPaneTabs = useAppStore((s) => s.reorderPaneTabs)
  const dragFrom = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

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
            <div
              key={id}
              className={[
                'tab-group-tab',
                selected ? 'tab-group-tab--active' : '',
                dragOver === i ? 'tab-group-tab--drag-over' : ''
              ]
                .filter(Boolean)
                .join(' ')}
              role="tab"
              aria-selected={selected}
              draggable
              onDragStart={(e) => {
                dragFrom.current = i
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', id)
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (dragOver !== i) setDragOver(i)
              }}
              onDragLeave={() => {
                if (dragOver === i) setDragOver(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                const from = dragFrom.current
                dragFrom.current = null
                setDragOver(null)
                if (from === null || from === i) return
                reorderPaneTabs(id, from, i)
              }}
              onDragEnd={() => {
                dragFrom.current = null
                setDragOver(null)
              }}
            >
              <button
                type="button"
                className="tab-group-tab-main"
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
              <button
                type="button"
                className="tab-group-tab-close"
                aria-label={`Close ${pane?.name ?? 'tab'}`}
                title="Close tab"
                onClick={(e) => {
                  e.stopPropagation()
                  void closePane(id)
                }}
              >
                ×
              </button>
            </div>
          )
        })}
        <button
          type="button"
          className="tab-group-add"
          title="New tab (same type as active)"
          aria-label="New tab"
          onClick={() => {
            const type = activePane?.type ?? 'shell'
            void addPaneAsTab(type, activeId)
          }}
        >
          +
        </button>
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
