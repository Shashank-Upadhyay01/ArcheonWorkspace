import { describe, it, expect } from 'vitest'
import path from 'path'
import {
  resolveShell,
  resolveCwd,
  resolveSpawnTarget,
  mergeEnv
} from '../src/main/pty-manager'
import {
  capScrollbackText,
  scrollbackPath,
  assertSafeScrollbackKey,
  ScrollbackPathError
} from '../src/main/session-scrollback'

describe('resolveShell', () => {
  it('resolves default/powershell on win32', () => {
    expect(resolveShell('default', 'win32')).toEqual({
      file: 'powershell.exe',
      args: ['-NoLogo']
    })
    expect(resolveShell('powershell', 'win32')).toEqual({
      file: 'powershell.exe',
      args: ['-NoLogo']
    })
  })

  it('resolves cmd and bash on win32', () => {
    expect(resolveShell('cmd', 'win32')).toEqual({ file: 'cmd.exe', args: [] })
    expect(resolveShell('bash', 'win32')).toEqual({ file: 'bash.exe', args: ['-l'] })
  })

  it('falls back to powershell for unknown win32 shellId', () => {
    expect(resolveShell('zsh', 'win32')).toEqual({
      file: 'powershell.exe',
      args: ['-NoLogo']
    })
    expect(resolveShell('', 'win32')).toEqual({
      file: 'powershell.exe',
      args: ['-NoLogo']
    })
  })

  it('uses SHELL env or /bin/bash on linux', () => {
    const prev = process.env.SHELL
    try {
      delete process.env.SHELL
      expect(resolveShell('default', 'linux')).toEqual({ file: '/bin/bash', args: ['-l'] })
      process.env.SHELL = '/bin/zsh'
      expect(resolveShell('anything', 'linux')).toEqual({ file: '/bin/zsh', args: ['-l'] })
    } finally {
      if (prev === undefined) delete process.env.SHELL
      else process.env.SHELL = prev
    }
  })
})

describe('resolveCwd', () => {
  it('returns homedir for empty or whitespace cwd', () => {
    expect(resolveCwd('', '/home/user')).toBe('/home/user')
    expect(resolveCwd('   ', '/home/user')).toBe('/home/user')
  })

  it('returns provided non-empty cwd', () => {
    expect(resolveCwd('/tmp/project', '/home/user')).toBe('/tmp/project')
  })
})

describe('resolveSpawnTarget', () => {
  it('prefers custom command + args over shellId', () => {
    expect(
      resolveSpawnTarget({ command: 'claude', args: ['--dangerously-skip-permissions'], shellId: 'default' }, 'win32')
    ).toEqual({
      file: 'claude',
      args: ['--dangerously-skip-permissions']
    })
  })

  it('trims command and falls back to shell when empty', () => {
    expect(resolveSpawnTarget({ command: '  ', shellId: 'cmd' }, 'win32')).toEqual({
      file: 'cmd.exe',
      args: []
    })
  })

  it('defaults args to empty array for custom command', () => {
    expect(resolveSpawnTarget({ command: 'aider' }, 'linux')).toEqual({
      file: 'aider',
      args: []
    })
  })
})

describe('mergeEnv', () => {
  it('overlays string overrides onto base env', () => {
    const merged = mergeEnv({ PATH: '/bin', HOME: '/home/u', EMPTY: undefined }, {
      PATH: '/custom/bin',
      FOO: 'bar'
    })
    expect(merged.PATH).toBe('/custom/bin')
    expect(merged.HOME).toBe('/home/u')
    expect(merged.FOO).toBe('bar')
    expect(merged).not.toHaveProperty('EMPTY')
  })
})

describe('capScrollbackText', () => {
  it('returns empty for empty input', () => {
    expect(capScrollbackText('')).toBe('')
  })

  it('keeps short text intact', () => {
    expect(capScrollbackText('a\nb\nc')).toBe('a\nb\nc')
  })

  it('caps to last N lines', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `L${i}`)
    const capped = capScrollbackText(lines.join('\n'), 3)
    expect(capped).toBe('L7\nL8\nL9')
  })
})

describe('scrollback path safety', () => {
  const sessionsDir = path.join('/data', 'archeon', 'sessions')

  it('builds path under sessionsDir for safe ids', () => {
    const file = scrollbackPath(sessionsDir, {
      workspaceId: 'ws_abc',
      paneId: 'pane_1'
    })
    expect(file).toBe(
      path.resolve(sessionsDir, 'ws_abc', 'panes', 'pane_1.scrollback.txt')
    )
  })

  it('rejects path traversal and unsafe ids', () => {
    expect(() =>
      assertSafeScrollbackKey({ workspaceId: '../etc', paneId: 'pane' })
    ).toThrow(ScrollbackPathError)
    expect(() =>
      assertSafeScrollbackKey({ workspaceId: 'ws', paneId: 'a/b' })
    ).toThrow(ScrollbackPathError)
    expect(() =>
      scrollbackPath(sessionsDir, { workspaceId: '..', paneId: 'x' })
    ).toThrow(ScrollbackPathError)
    expect(() =>
      scrollbackPath(sessionsDir, { workspaceId: 'ws', paneId: 'p..e' })
    ).not.toThrow()
  })
})
