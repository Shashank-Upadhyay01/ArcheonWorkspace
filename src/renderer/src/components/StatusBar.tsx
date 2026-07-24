import { useAppStore } from '../stores/app-store'

function platformLabel(): string {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('windows')) return 'Windows'
  if (ua.includes('linux')) return 'Linux'
  if (ua.includes('mac')) return 'macOS'
  return navigator.platform || 'unknown'
}

function autosaveLabel(status: string, dirty: boolean): string {
  switch (status) {
    case 'dirty':
      return 'Unsaved changes…'
    case 'saving':
      return 'Saving…'
    case 'saved':
      return 'All changes saved'
    case 'error':
      return 'Save failed'
    default:
      return dirty ? 'Unsaved changes…' : 'Ready'
  }
}

export default function StatusBar(): JSX.Element {
  const autosaveStatus = useAppStore((s) => s.autosaveStatus)
  const dirty = useAppStore((s) => s.dirty)
  const error = useAppStore((s) => s.error)
  const activeWorkspace = useAppStore((s) => s.activeWorkspace)
  const broadcastPaneIds = useAppStore((s) => s.broadcastPaneIds)
  const paneCount = activeWorkspace ? Object.keys(activeWorkspace.panes).length : 0
  const broadcastCount = broadcastPaneIds.length

  return (
    <footer className="statusbar" role="contentinfo">
      <div className="statusbar-left">
        <span
          className={
            autosaveStatus === 'error' || error
              ? 'statusbar-pill statusbar-pill--error'
              : dirty || autosaveStatus === 'dirty' || autosaveStatus === 'saving'
                ? 'statusbar-pill statusbar-pill--warn'
                : 'statusbar-pill'
          }
          title={error ?? undefined}
        >
          {error
            ? error.length > 48
              ? `${error.slice(0, 45)}…`
              : error
            : autosaveLabel(autosaveStatus, dirty)}
        </span>
        {activeWorkspace ? (
          <span className="statusbar-meta">
            {paneCount} pane{paneCount === 1 ? '' : 's'}
          </span>
        ) : null}
        {broadcastCount > 0 ? (
          <span
            className="statusbar-pill statusbar-pill--broadcast"
            title="Input in a selected shell is sent to all selected shells"
          >
            Broadcast: {broadcastCount} shell{broadcastCount === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>
      <div className="statusbar-right">
        <span className="statusbar-meta" title="Command palette">
          Ctrl+K
        </span>
        <span className="statusbar-meta">{platformLabel()}</span>
        <span className="statusbar-meta statusbar-meta--accent">Archeon Workspace</span>
      </div>
    </footer>
  )
}
