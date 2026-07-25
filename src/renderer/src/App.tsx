import { useCallback, useEffect, useState } from 'react'
import CommandPalette from './components/CommandPalette'
import EmptyWorkspace from './components/EmptyWorkspace'
import DockLayout from './components/layout/DockLayout'
import AiChatPane from './components/panes/AiChatPane'
import CliAgentPane from './components/panes/CliAgentPane'
import ShellPane from './components/panes/ShellPane'
import Sidebar from './components/Sidebar'
import StatusBar from './components/StatusBar'
import TitleBar from './components/TitleBar'
import VoiceModeOverlay from './components/VoiceModeOverlay'
import { useVoiceInput } from './hooks/useVoiceInput'
import type { LayoutNode, Pane } from '@shared/types'
import { useAppStore } from './stores/app-store'

function PaneBody({ pane, workspaceId }: { pane: Pane; workspaceId: string }): JSX.Element {
  if (pane.type === 'shell') {
    return <ShellPane key={pane.id} pane={pane} workspaceId={workspaceId} />
  }

  if (pane.type === 'ai_chat') {
    return <AiChatPane key={pane.id} pane={pane} workspaceId={workspaceId} />
  }

  // cli_agent (exhaustive for PaneType)
  return <CliAgentPane key={pane.id} pane={pane} workspaceId={workspaceId} />
}

function WorkspaceDock(): JSX.Element {
  const activeWorkspace = useAppStore((s) => s.activeWorkspace)
  const setLayout = useAppStore((s) => s.setLayout)
  const focusPane = useAppStore((s) => s.focusPane)
  const addPane = useAppStore((s) => s.addPane)
  const addPaneAsTab = useAppStore((s) => s.addPaneAsTab)

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
    (pane: Pane) => <PaneBody key={pane.id} pane={pane} workspaceId={workspaceId} />,
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
          <button
            type="button"
            className="btn btn--ghost"
            title="New tab next to the focused pane"
            onClick={() => void addPaneAsTab('shell')}
          >
            + Tab
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
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [updateToast, setUpdateToast] = useState<{
    version: string
    current: string
  } | null>(null)
  const voice = useVoiceInput()

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  // Global voice mode: Ctrl+Shift+Space (works over shell, CLI, AI, and forms)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.code === 'Space' || e.key === ' ')) {
        e.preventDefault()
        voice.toggle()
      }
      if (e.key === 'Escape' && voice.active) {
        e.preventDefault()
        voice.stop()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [voice])

  // Startup silent check may push "update available" from main
  useEffect(() => {
    const api = window.archeon
    if (!api?.update?.onAvailable) return
    return api.update.onAvailable((result) => {
      if (!result.updateAvailable || !result.info) return
      const info = result.info as { version?: string }
      if (!info.version) return
      setUpdateToast({ version: info.version, current: result.currentVersion })
    })
  }, [])

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

  const focusNextPane = useAppStore((s) => s.focusNextPane)
  const focusPrevPane = useAppStore((s) => s.focusPrevPane)
  const addPaneAsTabGlobal = useAppStore((s) => s.addPaneAsTab)

  // Global shortcuts: Ctrl+K palette, Ctrl+] / [ focus cycle, Ctrl+T new tab
  // These use modifiers so they are safe while typing in terminals/xterm.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod || e.altKey) return

      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        setPaletteOpen((open) => !open)
        return
      }
      if (e.key === ']' || e.key === '}') {
        e.preventDefault()
        focusNextPane()
        return
      }
      if (e.key === '[' || e.key === '{') {
        e.preventDefault()
        focusPrevPane()
        return
      }
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault()
        void addPaneAsTabGlobal('shell')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [focusNextPane, focusPrevPane, addPaneAsTabGlobal])

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
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <VoiceModeOverlay
        active={voice.active}
        interimText={voice.interim}
        error={voice.error}
      />
      {updateToast ? (
        <div className="update-toast" role="status">
          <p className="update-toast-title">Update {updateToast.version} available</p>
          <p className="update-toast-body">
            You have {updateToast.current}. Open Settings to download and install, or view the
            release notes.
          </p>
          <div className="update-toast-actions">
            <button
              type="button"
              className="btn btn--accent"
              onClick={() => {
                setSettingsOpen(true)
                setUpdateToast(null)
              }}
            >
              Open Settings
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                void window.archeon?.update?.openReleasePage()
              }}
            >
              Release notes
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setUpdateToast(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
