import { useEffect } from 'react'
import EmptyWorkspace from './components/EmptyWorkspace'
import Sidebar from './components/Sidebar'
import StatusBar from './components/StatusBar'
import TitleBar from './components/TitleBar'
import { useAppStore } from './stores/app-store'

function PanePlaceholder(): JSX.Element {
  const activeWorkspace = useAppStore((s) => s.activeWorkspace)
  const addPane = useAppStore((s) => s.addPane)
  const panes = activeWorkspace ? Object.values(activeWorkspace.panes) : []

  return (
    <div className="workspace-main">
      <div className="workspace-toolbar">
        <span className="workspace-toolbar-label">Panes</span>
        <div className="workspace-toolbar-actions">
          <button type="button" className="btn btn--ghost" onClick={() => void addPane('shell')}>
            + Shell
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => void addPane('ai_chat')}>
            + AI
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => void addPane('cli_agent')}>
            + CLI
          </button>
        </div>
      </div>
      <div className="pane-grid">
        {panes.map((pane) => (
          <article key={pane.id} className="pane-card">
            <div className="pane-card-rail" style={{ background: pane.color }} />
            <div className="pane-card-body">
              <h3 className="pane-card-title">{pane.name}</h3>
              <p className="pane-card-meta">{pane.type.replace('_', ' ')}</p>
              <p className="pane-card-hint">Dock layout renders here in the next task.</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

export default function App(): JSX.Element {
  const bootstrap = useAppStore((s) => s.bootstrap)
  const ready = useAppStore((s) => s.ready)
  const error = useAppStore((s) => s.error)
  const activeWorkspace = useAppStore((s) => s.activeWorkspace)

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

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
            <PanePlaceholder />
          )}
        </main>
      </div>
      <StatusBar />
    </div>
  )
}
