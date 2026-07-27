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
  const settings = useAppStore((s) => s.settings)
  const setTheme = useAppStore((s) => s.setTheme)
  const pickProjectRoot = useAppStore((s) => s.pickProjectRoot)
  const setProjectRoot = useAppStore((s) => s.setProjectRoot)
  const applyPreset = useAppStore((s) => s.applyPreset)
  const themeId = settings?.themeId === 'light' ? 'light' : 'default'

  const title = activeWorkspace?.name ?? 'Archeon Workspace'
  const projectRoot = activeWorkspace?.projectRoot
  const projectLabel = projectRoot
    ? projectRoot.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || projectRoot
    : null

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
          {activeWorkspace ? (
            <button
              type="button"
              className={
                projectLabel
                  ? 'titlebar-project titlebar-project--set'
                  : 'titlebar-project'
              }
              title={
                projectRoot
                  ? `Project: ${projectRoot}\nClick to change · Right-click to clear`
                  : 'Open a project folder — Claude, Grok, and shells start here'
              }
              onClick={() => void pickProjectRoot()}
              onContextMenu={(e) => {
                e.preventDefault()
                if (projectRoot) void setProjectRoot(null)
              }}
            >
              <span className="titlebar-project-icon" aria-hidden="true">
                ⌂
              </span>
              <span className="titlebar-project-label">
                {projectLabel ?? 'Open project…'}
              </span>
            </button>
          ) : null}
        </div>
        <div className="titlebar-right">
          <button
            type="button"
            className="titlebar-action"
            title="Claude + Grok + Shell layout"
            disabled={!activeWorkspace}
            onClick={() => void applyPreset('war_room')}
          >
            War room
          </button>
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
            className="titlebar-action"
            aria-label={themeId === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
            title={themeId === 'light' ? 'Dark theme' : 'Light theme'}
            onClick={() => void setTheme(themeId === 'light' ? 'default' : 'light')}
          >
            {themeId === 'light' ? '☾' : '☀'}
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
