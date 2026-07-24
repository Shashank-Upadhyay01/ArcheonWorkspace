import { FitAddon } from '@xterm/addon-fit'
import { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import type { Pane } from '@shared/types'
import { getArcheonApi } from '../../lib/ipc'
import 'xterm/css/xterm.css'

const SCROLLBACK_CAP = 5000
const SCROLLBACK_SAVE_MS = 5000

export interface ShellPaneProps {
  pane: Pane
  workspaceId: string
}

function serializeScrollback(term: Terminal): string {
  const buffer = term.buffer.active
  const len = buffer.length
  const start = Math.max(0, len - SCROLLBACK_CAP)
  const lines: string[] = []
  for (let i = start; i < len; i++) {
    const line = buffer.getLine(i)
    if (line) {
      lines.push(line.translateToString(true))
    }
  }
  // Drop trailing empty line noise from the active cursor row when idle
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  return lines.join('\n')
}

export default function ShellPane({ pane, workspaceId }: ShellPaneProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const disposedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [exited, setExited] = useState<number | null>(null)

  useEffect(() => {
    disposedRef.current = false
    const host = hostRef.current
    if (!host) return

    let api: ReturnType<typeof getArcheonApi>
    try {
      api = getArcheonApi()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return
    }

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'IBM Plex Mono, ui-monospace, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      theme: {
        background: '#0e1116',
        foreground: '#e8eef7',
        cursor: '#3dd6c6',
        cursorAccent: '#0e1116',
        selectionBackground: 'rgba(61, 214, 198, 0.28)',
        black: '#0e1116',
        red: '#f07178',
        green: '#3dd6c6',
        yellow: '#e6b450',
        blue: '#6cb6ff',
        magenta: '#c792ea',
        cyan: '#89ddff',
        white: '#e8eef7',
        brightBlack: '#8b97a8',
        brightRed: '#f07178',
        brightGreen: '#3dd6c6',
        brightYellow: '#e6b450',
        brightBlue: '#6cb6ff',
        brightMagenta: '#c792ea',
        brightCyan: '#89ddff',
        brightWhite: '#ffffff'
      },
      allowProposedApi: true,
      scrollback: SCROLLBACK_CAP
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
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
      const text = serializeScrollback(termRef.current)
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

        const { sessionId } = await api.pty.spawn({
          paneId: pane.id,
          shellId,
          cwd,
          cols,
          rows
        })
        if (disposedRef.current) {
          void api.pty.kill(sessionId)
          return
        }
        sessionIdRef.current = sessionId

        unsubData = api.pty.onData((ev) => {
          if (ev.sessionId !== sessionIdRef.current) return
          term.write(ev.data)
        })

        unsubExit = api.pty.onExit((ev) => {
          if (ev.sessionId !== sessionIdRef.current) return
          sessionIdRef.current = null
          setExited(ev.exitCode)
          term.writeln('')
          term.writeln(`\x1b[90m[process exited with code ${ev.exitCode}]\x1b[0m`)
          persistScrollback()
        })

        dataDisposable = term.onData((data) => {
          const sid = sessionIdRef.current
          if (sid) api.pty.write(sid, data)
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
        term.writeln(`\x1b[31mFailed to start shell: ${message}\x1b[0m`)
      }
    }

    void boot()

    return () => {
      disposedRef.current = true
      if (saveTimer) clearInterval(saveTimer)
      persistScrollback()
      resizeObserver?.disconnect()
      dataDisposable?.dispose()
      unsubData?.()
      unsubExit?.()
      const sid = sessionIdRef.current
      sessionIdRef.current = null
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
    // Re-mount when identity of the pane shell binding changes
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: remount on pane/workspace id
  }, [pane.id, workspaceId, pane.shell?.shellId, pane.shell?.cwd])

  return (
    <div className="shell-pane">
      {error ? (
        <div className="shell-pane-banner shell-pane-banner--error" role="alert">
          {error}
        </div>
      ) : null}
      {exited !== null ? (
        <div className="shell-pane-banner shell-pane-banner--exit">
          Shell exited ({exited}). Close the pane or re-open a new shell.
        </div>
      ) : null}
      <div className="shell-pane-term" ref={hostRef} />
    </div>
  )
}
