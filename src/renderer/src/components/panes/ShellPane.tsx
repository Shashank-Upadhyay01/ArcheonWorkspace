import { FitAddon } from '@xterm/addon-fit'
import { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import type { Pane } from '@shared/types'
import { getArcheonApi } from '../../lib/ipc'
import { writePtyInput } from '../../lib/pty-input'
import {
  createProductTerminal,
  serializeTerminalScrollback
} from '../../lib/terminal'
import { useAppStore } from '../../stores/app-store'
import 'xterm/css/xterm.css'

const SCROLLBACK_CAP = 5000
const SCROLLBACK_SAVE_MS = 5000

export interface ShellPaneProps {
  pane: Pane
  workspaceId: string
}

export default function ShellPane({ pane, workspaceId }: ShellPaneProps): JSX.Element {
  const registerPtySession = useAppStore((s) => s.registerPtySession)
  const setPaneRuntimeStatus = useAppStore((s) => s.setPaneRuntimeStatus)
  const focusRequest = useAppStore((s) => s.focusRequest)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const disposedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [exited, setExited] = useState<number | null>(null)
  const [restartKey, setRestartKey] = useState(0)

  // Respond to store focusPane requests (sidebar / command palette / chrome click)
  useEffect(() => {
    if (!focusRequest || focusRequest.paneId !== pane.id) return
    termRef.current?.focus()
  }, [focusRequest, pane.id])

  useEffect(() => {
    disposedRef.current = false
    setError(null)
    setExited(null)
    setPaneRuntimeStatus(pane.id, 'idle')
    const host = hostRef.current
    if (!host) return

    let api: ReturnType<typeof getArcheonApi>
    try {
      api = getArcheonApi()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPaneRuntimeStatus(pane.id, 'error')
      return
    }

    const { term, fitAddon } = createProductTerminal()
    term.open(host)
    termRef.current = term
    fitRef.current = fitAddon

    const shellId = pane.shell?.shellId || 'default'
    const cwd = pane.shell?.cwd ?? ''

    let unsubData: (() => void) | undefined
    let unsubExit: (() => void) | undefined
    let saveTimer: ReturnType<typeof setInterval> | undefined
    let resizeObserver: ResizeObserver | undefined
    let dataDisposable: { dispose: () => void } | undefined

    const persistScrollback = (): void => {
      if (!termRef.current || disposedRef.current) return
      const text = serializeTerminalScrollback(termRef.current, SCROLLBACK_CAP)
      void api.session
        .saveScrollback({ workspaceId, paneId: pane.id, text })
        .catch(() => {
          /* best-effort */
        })
    }

    const fitAndResize = (): void => {
      if (disposedRef.current || !fitRef.current || !termRef.current) return
      try {
        fitRef.current.fit()
      } catch {
        return
      }
      const cols = termRef.current.cols
      const rows = termRef.current.rows
      const sid = sessionIdRef.current
      if (sid) {
        api.pty.resize(sid, cols, rows)
      }
    }

    const boot = async (): Promise<void> => {
      try {
        const prior = await api.session.loadScrollback({ workspaceId, paneId: pane.id })
        if (disposedRef.current) return
        if (prior) {
          // Restore as plain text history; shell will re-prompt below
          term.writeln('\x1b[90m// restored scrollback\x1b[0m')
          for (const line of prior.split('\n')) {
            term.writeln(line)
          }
          term.writeln('')
        }

        // Initial fit before spawn so cols/rows match the pane
        try {
          fitAddon.fit()
        } catch {
          /* host may be 0-sized briefly */
        }

        const cols = Math.max(2, term.cols || 80)
        const rows = Math.max(1, term.rows || 24)

        // Subscribe before spawn so early PTY output is not lost.
        // sessionId is set after spawn; handlers filter until it matches.
        let sessionId = ''
        unsubData = api.pty.onData((ev) => {
          if (!sessionId || ev.sessionId !== sessionId) return
          term.write(ev.data)
        })

        unsubExit = api.pty.onExit((ev) => {
          if (!sessionId || ev.sessionId !== sessionId) return
          sessionIdRef.current = null
          registerPtySession(pane.id, null)
          setPaneRuntimeStatus(pane.id, 'exited')
          setExited(ev.exitCode)
          term.writeln('')
          term.writeln(`\x1b[90m[process exited with code ${ev.exitCode}]\x1b[0m`)
          persistScrollback()
        })

        const result = await api.pty.spawn({
          paneId: pane.id,
          shellId,
          cwd,
          cols,
          rows
        })
        sessionId = result.sessionId
        sessionIdRef.current = sessionId
        registerPtySession(pane.id, sessionId)
        setPaneRuntimeStatus(pane.id, 'running')
        if (disposedRef.current) {
          void api.pty.kill(sessionId)
          registerPtySession(pane.id, null)
          return
        }

        dataDisposable = term.onData((data) => {
          const sid = sessionIdRef.current
          if (sid) writePtyInput(pane.id, sid, data)
        })

        resizeObserver = new ResizeObserver(() => {
          fitAndResize()
        })
        resizeObserver.observe(host)
        // One more fit after layout settles
        requestAnimationFrame(() => fitAndResize())

        saveTimer = setInterval(persistScrollback, SCROLLBACK_SAVE_MS)
        term.focus()
      } catch (err) {
        if (disposedRef.current) return
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
        setPaneRuntimeStatus(pane.id, 'error')
        term.writeln(`\x1b[31mFailed to start shell: ${message}\x1b[0m`)
      }
    }

    void boot()

    return () => {
      // Clear timer, persist while still mounted, then mark disposed and tear down
      if (saveTimer) clearInterval(saveTimer)
      persistScrollback()
      disposedRef.current = true
      resizeObserver?.disconnect()
      dataDisposable?.dispose()
      unsubData?.()
      unsubExit?.()
      const sid = sessionIdRef.current
      sessionIdRef.current = null
      registerPtySession(pane.id, null)
      setPaneRuntimeStatus(pane.id, null)
      if (sid) {
        void api.pty.kill(sid)
      }
      try {
        term.dispose()
      } catch {
        /* ignore */
      }
      termRef.current = null
      fitRef.current = null
    }
    // Re-mount when identity of the pane shell binding changes or user restarts
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: remount on pane/workspace id / restart
  }, [pane.id, workspaceId, pane.shell?.shellId, pane.shell?.cwd, restartKey])

  return (
    <div className="shell-pane">
      {error ? (
        <div className="shell-pane-banner shell-pane-banner--error" role="alert">
          {error}
          <button
            type="button"
            className="shell-pane-restart"
            onClick={() => setRestartKey((k) => k + 1)}
          >
            Restart shell
          </button>
        </div>
      ) : null}
      {exited !== null ? (
        <div className="shell-pane-banner shell-pane-banner--exit">
          Shell exited ({exited}).
          <button
            type="button"
            className="shell-pane-restart"
            onClick={() => setRestartKey((k) => k + 1)}
          >
            Restart shell
          </button>
        </div>
      ) : null}
      <div className="shell-pane-term" ref={hostRef} />
    </div>
  )
}
