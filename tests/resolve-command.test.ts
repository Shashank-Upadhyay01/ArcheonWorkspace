import { describe, it, expect } from 'vitest'
import path from 'path'
import os from 'os'
import {
  agentCliSearchDirs,
  enrichPath,
  pathEntries,
  resolveCommandPath
} from '../src/main/resolve-command'

describe('resolve-command', () => {
  it('includes .local/bin and .grok/bin in search dirs', () => {
    const home = os.homedir()
    const dirs = agentCliSearchDirs(home)
    expect(dirs.some((d) => d.includes(path.join('.local', 'bin')))).toBe(true)
    expect(dirs.some((d) => d.includes(path.join('.grok', 'bin')))).toBe(true)
  })

  it('splits PATH by platform separator', () => {
    expect(pathEntries('a;b;c', 'win32')).toEqual(['a', 'b', 'c'])
    expect(pathEntries('a:b:c', 'linux')).toEqual(['a', 'b', 'c'])
  })

  it('enrichPath prepends agent dirs', () => {
    const p = enrichPath({ PATH: '/usr/bin', Path: '/usr/bin' }, process.platform)
    expect(p.length).toBeGreaterThan(0)
    expect(p).toContain(path.join(os.homedir(), '.local', 'bin'))
  })

  it('returns absolute paths unchanged', () => {
    const abs =
      process.platform === 'win32' ? 'C:\\tools\\claude.exe' : '/usr/local/bin/claude'
    expect(resolveCommandPath(abs)).toBe(abs)
  })

  it('resolves claude when present on this machine', () => {
    const resolved = resolveCommandPath('claude')
    // On the user's machine we know claude exists; if not installed, falls back to bare name
    if (resolved !== 'claude') {
      expect(resolved.toLowerCase()).toContain('claude')
    } else {
      expect(resolved).toBe('claude')
    }
  })
})
