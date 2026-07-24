import { useCallback, useEffect } from 'react'
import EmptyWorkspace from './components/EmptyWorkspace'
import DockLayout from './components/layout/DockLayout'
import ShellPane from './components/panes/ShellPane'
import Sidebar from './components/Sidebar'
import StatusBar from './components/StatusBar'
import TitleBar from './components/TitleBar'
import type { LayoutNode, Pane } from '@shared/types'
import { useAppStore } from './stores/app-store'

function PaneBody({ pane, workspaceId }: { pane: Pane; workspaceId: string }): JSX.Element {
  if (pane.type === 'shell') {
    return <ShellPane pane={pane} workspaceId={workspaceId} />
  }

  return (
    <div className="pane-body-placeholder">
      <p className="pane-body-placeholder-meta">{pane.type.replace('_', ' ')}</p>
      <p className="pane-body-placeholder-hint">
        {pane.type === 'ai_chat'
          ? 'AI chat stream will attach here later.'
          : 'CLI agent process will attach here later.'}
      </p>
    </div>
  )
}

function WorkspaceDock(): JSX.Element {
  const activeWorkspace = useAppStore((s) => s.activeWorkspace)
  const setLayout = useAppStore((s) => s.setLayout)
  const focusPane = useAppStore((s) => s.focusPane)
  const addPane = useAppStore((s) => s.addPane)

  const onChangeLayout = useCallback(
    (layout: LayoutNode) => {
      setLayout(layout)
    },
    [setLayout]
  )

  const onFocusPane = useCallback(
    (id: string) => {
      focusPane(id)
    },
    [focusPane]
  )

  const workspaceId = activeWorkspace?.id ?? ''

  const renderPane = useCallback(
    (pane: Pane) => <PaneBody pane={pane} workspaceId={workspaceId} />,
    [workspaceId]
  )

  if (!activeWorkspace) return <EmptyWorkspace hasWorkspace={false} />

  return (
    <div className="workspace-main workspace-main--dock">
      <div className="workspace-toolbar">
        <span className="workspace-toolbar-label">Layout</span>
        <div className="workspace-toolbar-actions">
          <button type="button" className="btn btn--ghost" onClick={() => void addPane('shell')}>
            + Shell
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => void addPane('ai_chat')}>
            + AI
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => void addPane('cli_agent')}
          >
            + CLI
          </button>
        </div>
      </div>
      <div className="dock-host">
        <DockLayout
          workspace={activeWorkspace}
          onChangeLayout={onChangeLayout}
          onFocusPane={onFocusPane}
          renderPane={renderPane}
        />
      </div>
    </div>
  )
}

export default function App(): JSX.Element {
  const bootstrap = useAppStore((s) => s.bootstrap)
  const flushSave = useAppStore((s) => s.flushSave)
  const ready = useAppStore((s) => s.ready)
  const error = useAppStore((s) => s.error)
  const activeWorkspace = useAppStore((s) => s.activeWorkspace)

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  // Main sends app:before-quit-save on window close; flush then ack so close can proceed.
  useEffect(() => {
    const api = window.archeon
    if (!api?.app?.onBeforeQuitSave) return

    const unsubscribe = api.app.onBeforeQuitSave(() => {
      void (async () => {
        try {
          await flushSave()
        } finally {
          api.app.ackBeforeQuitSave()
        }
      })()
    })

    return unsubscribe
  }, [flushSave])

  const paneCount = activeWorkspace ? Object.keys(activeWorkspace.panes).length : 0
  const showEmpty = !activeWorkspace || paneCount === 0

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-body">
        <Sidebar />
        <main className="app-content" role="main">
          {!ready ? (
            <div className="app-loading">
              <span className="app-loading-dot" aria-hidden="true" />
              Loading workspace…
            </div>
          ) : error && !activeWorkspace ? (
            <div className="app-error">
              <h2>Bridge unavailable</h2>
              <p>{error}</p>
            </div>
          ) : showEmpty ? (
            <EmptyWorkspace hasWorkspace={Boolean(activeWorkspace)} />
          ) : (
            <WorkspaceDock />
          )}
        </main>
      </div>
      <StatusBar />
    </div>
  )
}
