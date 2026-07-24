import { useAppStore } from '../stores/app-store'
import SettingsModal from './SettingsModal'

export default function TitleBar(): JSX.Element {
  const activeWorkspace = useAppStore((s) => s.activeWorkspace)
  const dirty = useAppStore((s) => s.dirty)
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  const setSidebarCollapsed = useAppStore((s) => s.setSidebarCollapsed)
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)
  const exportWorkspace = useAppStore((s) => s.exportWorkspace)
  const importWorkspace = useAppStore((s) => s.importWorkspace)

  const title = activeWorkspace?.name ?? 'Archeon Workspace'

  return (
    <>
      <header className="titlebar" role="banner">
        <div className="titlebar-left">
          <button
            type="button"
            className="titlebar-toggle"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            <span className="titlebar-toggle-icon" aria-hidden="true">
              {sidebarCollapsed ? '›' : '‹'}
            </span>
          </button>
          <div className="titlebar-brand">
            <span className="titlebar-mark" aria-hidden="true" />
            <span className="titlebar-product">Archeon</span>
          </div>
          <span className="titlebar-divider" aria-hidden="true" />
          <h1 className="titlebar-workspace">
            {title}
            {dirty ? (
              <span
                className="titlebar-dirty"
                title="Unsaved changes"
                aria-label="Unsaved changes"
              />
            ) : null}
          </h1>
        </div>
        <div className="titlebar-right">
          <button
            type="button"
            className="titlebar-action"
            aria-label="Export workspace"
            title="Export workspace"
            disabled={!activeWorkspace}
            onClick={() => void exportWorkspace()}
          >
            Export
          </button>
          <button
            type="button"
            className="titlebar-action"
            aria-label="Import workspace"
            title="Import workspace"
            onClick={() => void importWorkspace()}
          >
            Import
          </button>
          <button
            type="button"
            className="titlebar-settings"
            aria-label="Open settings"
            title="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            ⚙
          </button>
          <span className="titlebar-tag">Workspace</span>
        </div>
      </header>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}
