import { FitAddon } from '@xterm/addon-fit'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import type { Pane } from '@shared/types'
import { getArcheonApi } from '../../lib/ipc'
import { useAppStore } from '../../stores/app-store'
import 'xterm/css/xterm.css'

const SCROLLBACK_CAP = 5000
const SCROLLBACK_SAVE_MS = 5000

export type CliAgentStatus = 'idle' | 'running' | 'exited' | 'error'

export interface CliAgentPaneProps {
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
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  return lines.join('\n')
}

function argsToString(args: string[]): string {
  return args.join(' ')
}

function stringToArgs(s: string): string[] {
  const trimmed = s.trim()
  if (!trimmed) return []
  // Simple whitespace split; quoted tokens kept as-is for common cases
  const tokens: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(trimmed)) !== null) {
    tokens.push(m[1] ?? m[2] ?? m[3] ?? '')
  }
  return tokens
}

export default function CliAgentPane({ pane, workspaceId }: CliAgentPaneProps): JSX.Element {
  const updatePaneCli = useAppStore((s) => s.updatePaneCli)

  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const disposedRef = useRef(false)
  const unsubDataRef = useRef<(() => void) | undefined>()
  const unsubExitRef = useRef<(() => void) | undefined>()
  const dataDisposableRef = useRef<{ dispose: () => void } | undefined>()
  const resizeObserverRef = useRef<ResizeObserver | undefined>()
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | undefined>()

  const [status, setStatus] = useState<CliAgentStatus>('idle')
  const [exitCode, setExitCode] = useState<number | null>(pane.cli?.lastExitCode ?? null)
  const [error, setError] = useState<string | null>(null)
  const [command, setCommand] = useState(pane.cli?.command ?? '')
  const [argsText, setArgsText] = useState(argsToString(pane.cli?.args ?? []))
  const [cwd, setCwd] = useState(pane.cli?.cwd ?? '')
  /** After mount we never auto-start; user must confirm relaunch/start. */
  const [awaitingConfirm, setAwaitingConfirm] = useState(true)

  // Sync local form when pane config changes externally (profile apply)
  useEffect(() => {
    if (status === 'running') return
    setCommand(pane.cli?.command ?? '')
    setArgsText(argsToString(pane.cli?.args ?? []))
    setCwd(pane.cli?.cwd ?? '')
    if (pane.cli?.lastExitCode !== undefined && pane.cli?.lastExitCode !== null) {
      setExitCode(pane.cli.lastExitCode)
    }
  }, [pane.cli?.command, pane.cli?.args, pane.cli?.cwd, pane.cli?.lastExitCode, status])

  const persistScrollback = useCallback((): void => {
    if (!termRef.current || disposedRef.current) return
    try {
      const api = getArcheonApi()
      const text = serializeScrollback(termRef.current)
      void api.session
        .saveScrollback({ workspaceId, paneId: pane.id, text })
        .catch(() => {
          /* best-effort */
        })
    } catch {
      /* api unavailable */
    }
  }, [workspaceId, pane.id])

  const fitAndResize = useCallback((): void => {
    if (disposedRef.current || !fitRef.current || !termRef.current) return
    try {
      fitRef.current.fit()
    } catch {
      return
    }
    const sid = sessionIdRef.current
    if (sid) {
      try {
        const api = getArcheonApi()
        api.pty.resize(sid, termRef.current.cols, termRef.current.rows)
      } catch {
        /* ignore */
      }
    }
  }, [])

  const teardownSession = useCallback(async (): Promise<void> => {
    if (saveTimerRef.current) {
      clearInterval(saveTimerRef.current)
      saveTimerRef.current = undefined
    }
    dataDisposableRef.current?.dispose()
    dataDisposableRef.current = undefined
    unsubDataRef.current?.()
    unsubDataRef.current = undefined
    unsubExitRef.current?.()
    unsubExitRef.current = undefined
    const sid = sessionIdRef.current
    sessionIdRef.current = null
    if (sid) {
      try {
        const api = getArcheonApi()
        await api.pty.kill(sid)
      } catch {
        /* ignore */
      }
    }
  }, [])

  // Terminal host: create xterm once per pane/workspace; do NOT auto-spawn
  useEffect(() => {
    disposedRef.current = false
    const host = hostRef.current
    if (!host) return

    let api: ReturnType<typeof getArcheonApi>
    try {
      api = getArcheonApi()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
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

    // Restore scrollback only — never auto-start the agent process
    void (async () => {
      try {
        const prior = await api.session.loadScrollback({ workspaceId, paneId: pane.id })
        if (disposedRef.current) return
        if (prior) {
          term.writeln('\x1b[90m// restored scrollback\x1b[0m')
          for (const line of prior.split('\n')) {
            term.writeln(line)
          }
          term.writeln('')
        }
        try {
          fitAddon.fit()
        } catch {
          /* host may be 0-sized briefly */
        }
        const last = pane.cli?.lastExitCode
        if (last !== undefined && last !== null) {
          term.writeln(
            `\x1b[90m[previous session exited with code ${last} — relaunch to continue]\x1b[0m`
          )
        } else {
          term.writeln('\x1b[90m[agent idle — start or relaunch when ready]\x1b[0m')
        }
      } catch {
        /* ignore restore errors */
      }
    })()

    const ro = new ResizeObserver(() => {
      fitAndResize()
    })
    ro.observe(host)
    resizeObserverRef.current = ro
    requestAnimationFrame(() => fitAndResize())

    // Always prompt on mount (resume + first open) — do not auto-start
    setAwaitingConfirm(true)
    setStatus('idle')

    return () => {
      disposedRef.current = true
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = undefined
      if (saveTimerRef.current) {
        clearInterval(saveTimerRef.current)
        saveTimerRef.current = undefined
      }
      persistScrollback()
      void teardownSession()
      try {
        term.dispose()
      } catch {
        /* ignore */
      }
      termRef.current = null
      fitRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remount on pane/workspace identity only
  }, [pane.id, workspaceId])

  const startAgent = useCallback(async (): Promise<void> => {
    if (status === 'running') return
    setError(null)
    setAwaitingConfirm(false)

    const cmd = command.trim()
    if (!cmd) {
      setError('Set a command before starting the agent.')
      setStatus('error')
      return
    }

    const args = stringToArgs(argsText)
    // Persist config before spawn
    updatePaneCli(pane.id, {
      command: cmd,
      args,
      cwd: cwd.trim()
    })

    let api: ReturnType<typeof getArcheonApi>
    try {
      api = getArcheonApi()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
      return
    }

    const term = termRef.current
    if (!term) {
      setError('Terminal not ready')
      setStatus('error')
      return
    }

    // Kill any leftover session
    await teardownSession()

    try {
      fitRef.current?.fit()
    } catch {
      /* ignore */
    }
    const cols = Math.max(2, term.cols || 80)
    const rows = Math.max(1, term.rows || 24)

    term.writeln('')
    term.writeln(
      `\x1b[90m$ ${cmd}${args.length ? ' ' + args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ') : ''}\x1b[0m`
    )

    let sessionId = ''
    unsubDataRef.current = api.pty.onData((ev) => {
      if (!sessionId || ev.sessionId !== sessionId) return
      term.write(ev.data)
    })

    unsubExitRef.current = api.pty.onExit((ev) => {
      if (!sessionId || ev.sessionId !== sessionId) return
      sessionIdRef.current = null
      setStatus('exited')
      setExitCode(ev.exitCode)
      setAwaitingConfirm(true)
      term.writeln('')
      term.writeln(`\x1b[90m[process exited with code ${ev.exitCode}]\x1b[0m`)
      updatePaneCli(pane.id, { lastExitCode: ev.exitCode })
      persistScrollback()
      if (saveTimerRef.current) {
        clearInterval(saveTimerRef.current)
        saveTimerRef.current = undefined
      }
    })

    try {
      const result = await api.pty.spawn({
        paneId: pane.id,
        command: cmd,
        args,
        cwd: cwd.trim(),
        env: pane.cli?.env ?? {},
        cols,
        rows
      })
      sessionId = result.sessionId
      sessionIdRef.current = sessionId
      if (disposedRef.current) {
        void api.pty.kill(sessionId)
        return
      }
      setStatus('running')
      setExitCode(null)
      updatePaneCli(pane.id, { lastExitCode: null })

      dataDisposableRef.current = term.onData((data) => {
        const sid = sessionIdRef.current
        if (sid) api.pty.write(sid, data)
      })

      saveTimerRef.current = setInterval(persistScrollback, SCROLLBACK_SAVE_MS)
      term.focus()
      requestAnimationFrame(() => fitAndResize())
    } catch (err) {
      if (disposedRef.current) return
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setStatus('error')
      setAwaitingConfirm(true)
      term.writeln(`\x1b[31mFailed to start agent: ${message}\x1b[0m`)
      unsubDataRef.current?.()
      unsubDataRef.current = undefined
      unsubExitRef.current?.()
      unsubExitRef.current = undefined
    }
  }, [
    status,
    command,
    argsText,
    cwd,
    pane.id,
    pane.cli?.env,
    updatePaneCli,
    teardownSession,
    persistScrollback,
    fitAndResize
  ])

  const stopAgent = useCallback(async (): Promise<void> => {
    await teardownSession()
    setStatus('exited')
    setAwaitingConfirm(true)
    const term = termRef.current
    if (term) {
      term.writeln('')
      term.writeln('\x1b[90m[stopped by user]\x1b[0m')
    }
    persistScrollback()
  }, [teardownSession, persistScrollback])

  const commitConfig = useCallback((): void => {
    if (status === 'running') return
    updatePaneCli(pane.id, {
      command: command.trim(),
      args: stringToArgs(argsText),
      cwd: cwd.trim()
    })
  }, [status, pane.id, command, argsText, cwd, updatePaneCli])

  const statusLabel =
    status === 'running'
      ? 'running'
      : status === 'exited'
        ? `exited${exitCode !== null ? ` (${exitCode})` : ''}`
        : status === 'error'
          ? 'error'
          : 'idle'

  const hasPriorRun = exitCode !== null || (pane.cli?.lastExitCode !== undefined && pane.cli?.lastExitCode !== null)
  const confirmLabel = hasPriorRun ? 'Relaunch agent?' : 'Start agent?'

  return (
    <div className="cli-agent-pane">
      <header className="cli-agent-header">
        <div className="cli-agent-header-row">
          <span
            className={`cli-agent-status cli-agent-status--${status === 'running' ? 'running' : status === 'error' ? 'error' : status === 'exited' ? 'exited' : 'idle'}`}
          >
            {statusLabel}
          </span>
          <div className="cli-agent-header-actions">
            {status === 'running' ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => void stopAgent()}>
                Stop
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--accent btn--sm"
                onClick={() => void startAgent()}
                disabled={!command.trim()}
              >
                {hasPriorRun ? 'Relaunch' : 'Start'}
              </button>
            )}
          </div>
        </div>
        <div className="cli-agent-config">
          <label className="cli-agent-field">
            <span>cmd</span>
            <input
              className="cli-agent-input"
              value={command}
              disabled={status === 'running'}
              placeholder="claude / codex / aider / …"
              onChange={(e) => setCommand(e.target.value)}
              onBlur={commitConfig}
            />
          </label>
          <label className="cli-agent-field cli-agent-field--grow">
            <span>args</span>
            <input
              className="cli-agent-input"
              value={argsText}
              disabled={status === 'running'}
              placeholder="optional args"
              onChange={(e) => setArgsText(e.target.value)}
              onBlur={commitConfig}
            />
          </label>
          <label className="cli-agent-field">
            <span>cwd</span>
            <input
              className="cli-agent-input"
              value={cwd}
              disabled={status === 'running'}
              placeholder="home"
              onChange={(e) => setCwd(e.target.value)}
              onBlur={commitConfig}
            />
          </label>
        </div>
      </header>

      {error ? (
        <div className="shell-pane-banner shell-pane-banner--error" role="alert">
          {error}
        </div>
      ) : null}

      {awaitingConfirm && status !== 'running' ? (
        <div className="cli-agent-relaunch-banner" role="status">
          <span>{confirmLabel}</span>
          <button
            type="button"
            className="btn btn--accent btn--sm"
            onClick={() => void startAgent()}
            disabled={!command.trim()}
          >
            {hasPriorRun ? 'Relaunch' : 'Start'}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setAwaitingConfirm(false)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="shell-pane-term cli-agent-term" ref={hostRef} />
    </div>
  )
}
