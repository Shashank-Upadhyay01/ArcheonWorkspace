export default function App(): JSX.Element {
  const versions = typeof window !== 'undefined' ? window.archeon?.versions : undefined

  return (
    <div className="app-shell">
      <header className="app-titlebar">
        <div className="app-brand">
          <span className="app-brand-mark" aria-hidden="true" />
          <h1 className="app-title">Archeon Workspace</h1>
        </div>
        <p className="app-subtitle">Multi-agent terminal workspace</p>
      </header>

      <main className="app-main">
        <section className="app-panel">
          <h2>Scaffold ready</h2>
          <p>
            Electron + React shell is up. Dock layout, PTY panes, and AI chat land in later
            tasks.
          </p>
          {versions ? (
            <dl className="version-list">
              <div>
                <dt>Electron</dt>
                <dd>{versions.electron}</dd>
              </div>
              <div>
                <dt>Chrome</dt>
                <dd>{versions.chrome}</dd>
              </div>
              <div>
                <dt>Node</dt>
                <dd>{versions.node}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted">Preload bridge not available in this context.</p>
          )}
        </section>
      </main>
    </div>
  )
}
