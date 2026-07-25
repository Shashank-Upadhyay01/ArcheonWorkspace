import { FitAddon } from '@xterm/addon-fit'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { joinArgs, parseArgs } from '@shared/shell-args'
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

export type CliAgentStatus = 'idle' | 'running' | 'exited' | 'error'

export interface CliAgentPaneProps {
  pane: Pane
  workspaceId: string
}

export default function CliAgentPane({ pane, workspaceId }: CliAgentPaneProps): JSX.Element {
  const updatePaneCli = useAppStore((s) => s.updatePaneCli)
  const registerPtySession = useAppStore((s) => s.registerPtySession)
  const setPaneRuntimeStatus = useAppStore((s) => s.setPaneRuntimeStatus)
  const focusRequest = useAppStore((s) => s.focusRequest)

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
  const [argsText, setArgsText] = useState(joinArgs(pane.cli?.args ?? []))
  const [cwd, setCwd] = useState(pane.cli?.cwd ?? '')
  /** After mount we never auto-start; user must confirm relaunch/start. */
  const [awaitingConfirm, setAwaitingConfirm] = useState(true)

  // Respond to store focusPane requests
  useEffect(() => {
    if (!focusRequest || focusRequest.paneId !== pane.id) return
    termRef.current?.focus()
  }, [focusRequest, pane.id])

  // Sync local form when pane config changes externally (profile apply)
  useEffect(() => {
    if (status === 'running') return
    setCommand(pane.cli?.command ?? '')
    setArgsText(joinArgs(pane.cli?.args ?? []))
    setCwd(pane.cli?.cwd ?? '')
    if (pane.cli?.lastExitCode !== undefined && pane.cli?.lastExitCode !== null) {
      setExitCode(pane.cli.lastExitCode)
    }
  }, [pane.cli?.command, pane.cli?.args, pane.cli?.cwd, pane.cli?.lastExitCode, status])

  // Mirror local agent status into the roster map
  useEffect(() => {
    setPaneRuntimeStatus(pane.id, status)
  }, [status, pane.id, setPaneRuntimeStatus])

  const persistScrollback = useCallback((): void => {
    if (!termRef.current || disposedRef.current) return
    try {
      const api = getArcheonApi()
      const text = serializeTerminalScrollback(termRef.current, SCROLLBACK_CAP)
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
    registerPtySession(pane.id, null)
    if (sid) {
      try {
        const api = getArcheonApi()
        await api.pty.kill(sid)
      } catch {
        /* ignore */
      }
    }
  }, [pane.id, registerPtySession])

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

    const { term, fitAddon } = createProductTerminal()
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
    setPaneRuntimeStatus(pane.id, 'idle')

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
      setPaneRuntimeStatus(pane.id, null)
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

    const args = parseArgs(argsText)
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
      `\x1b[90m$ ${cmd}${args.length ? ' ' + joinArgs(args) : ''}\x1b[0m`
    )

    let sessionId = ''
    unsubDataRef.current = api.pty.onData((ev) => {
      if (!sessionId || ev.sessionId !== sessionId) return
      term.write(ev.data)
    })

    unsubExitRef.current = api.pty.onExit((ev) => {
      if (!sessionId || ev.sessionId !== sessionId) return
      sessionIdRef.current = null
      registerPtySession(pane.id, null)
      setStatus('exited')
      setPaneRuntimeStatus(pane.id, 'exited')
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
      registerPtySession(pane.id, sessionId)
      if (disposedRef.current) {
        void api.pty.kill(sessionId)
        registerPtySession(pane.id, null)
        return
      }
      setStatus('running')
      setPaneRuntimeStatus(pane.id, 'running')
      setExitCode(null)
      updatePaneCli(pane.id, { lastExitCode: null })

      dataDisposableRef.current = term.onData((data) => {
        const sid = sessionIdRef.current
        if (sid) writePtyInput(pane.id, sid, data)
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
      args: parseArgs(argsText),
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
