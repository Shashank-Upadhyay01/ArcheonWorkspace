import { BrowserWindow } from 'electron'
import * as os from 'os'
import * as pty from 'node-pty'
import type { IPty } from 'node-pty'
import { createId } from '../shared/ids'
import { IpcChannels } from '../shared/ipc'

export interface PtySpawnOptions {
  paneId: string
  shellId: string
  cwd: string
  cols: number
  rows: number
}

export interface PtySpawnResult {
  sessionId: string
}

export interface PtyErrorPayload {
  code: 'SPAWN_FAILED' | 'SESSION_NOT_FOUND' | 'WRITE_FAILED' | 'RESIZE_FAILED' | 'KILL_FAILED'
  message: string
  paneId?: string
  sessionId?: string
}

/** Resolve shell executable + args for the host platform. */
export function resolveShell(
  shellId: string,
  platform: NodeJS.Platform
): { file: string; args: string[] } {
  if (platform === 'win32') {
    if (shellId === 'powershell' || shellId === 'default') {
      return { file: 'powershell.exe', args: ['-NoLogo'] }
    }
    if (shellId === 'cmd') return { file: 'cmd.exe', args: [] }
    if (shellId === 'bash') return { file: 'bash.exe', args: ['-l'] } // Git Bash if on PATH
  }
  // linux / darwin
  const file = process.env.SHELL || '/bin/bash'
  return { file, args: ['-l'] }
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}

/**
 * Owns node-pty sessions for shell panes. Map sessionId → IPty;
 * kill all on quit. Spawn errors surface as structured rejections.
 */
export class PtyManager {
  private sessions = new Map<string, IPty>()

  spawn(opts: PtySpawnOptions): PtySpawnResult {
    const sessionId = createId('pty')
    const { file, args } = resolveShell(opts.shellId, process.platform)
    const cwd =
      opts.cwd && opts.cwd.trim() !== '' ? opts.cwd : os.homedir()
    const cols = Math.max(2, opts.cols || 80)
    const rows = Math.max(1, opts.rows || 24)

    let term: IPty
    try {
      term = pty.spawn(file, args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env: process.env as Record<string, string>
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const payload: PtyErrorPayload = {
        code: 'SPAWN_FAILED',
        message: `Failed to spawn shell "${file}": ${message}`,
        paneId: opts.paneId,
        sessionId
      }
      const error = new Error(payload.message) as Error & { ptyError: PtyErrorPayload }
      error.ptyError = payload
      throw error
    }

    term.onData((data) => {
      broadcast(IpcChannels.ptyData, { sessionId, data })
    })

    term.onExit(({ exitCode }) => {
      this.sessions.delete(sessionId)
      broadcast(IpcChannels.ptyExit, { sessionId, exitCode: exitCode ?? 0 })
    })

    this.sessions.set(sessionId, term)
    return { sessionId }
  }

  write(sessionId: string, data: string): void {
    const term = this.sessions.get(sessionId)
    if (!term) {
      return
    }
    try {
      term.write(data)
    } catch {
      // Session may be exiting; ignore write races
    }
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const term = this.sessions.get(sessionId)
    if (!term) return
    const c = Math.max(2, cols)
    const r = Math.max(1, rows)
    try {
      term.resize(c, r)
    } catch {
      // ignore resize races during exit
    }
  }

  kill(sessionId: string): void {
    const term = this.sessions.get(sessionId)
    if (!term) return
    this.sessions.delete(sessionId)
    try {
      term.kill()
    } catch {
      // conpty can throw AttachConsole failures on exit; ignore
    }
  }

  killAll(): void {
    const ids = [...this.sessions.keys()]
    for (const id of ids) {
      this.kill(id)
    }
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }
}
