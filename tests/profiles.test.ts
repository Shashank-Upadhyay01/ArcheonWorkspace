import { describe, it, expect } from 'vitest'
import {
  builtinAgentProfiles,
  emptyCliDefaults,
  envToText,
  isBuiltinProfileId,
  parseCliDefaults,
  parseEnvText
} from '../src/shared/profiles'

describe('builtinAgentProfiles', () => {
  it('includes Claude, Grok, Codex, Aider, and Custom templates', () => {
    const names = builtinAgentProfiles().map((p) => p.name)
    expect(names).toEqual(
      expect.arrayContaining(['Claude Code', 'Grok Build', 'Codex', 'Aider', 'Custom CLI'])
    )
    for (const p of builtinAgentProfiles()) {
      expect(p.kind).toBe('cli_agent')
      expect(isBuiltinProfileId(p.id)).toBe(true)
      expect(typeof parseCliDefaults(p.defaults).command).toBe('string')
    }
  })

  it('does not auto-spawn — commands are editable strings', () => {
    const claude = builtinAgentProfiles().find((p) => p.id === 'builtin_claude')!
    expect(parseCliDefaults(claude.defaults).command).toBe('claude')
    const grok = builtinAgentProfiles().find((p) => p.id === 'builtin_grok')!
    expect(parseCliDefaults(grok.defaults).command).toBe('grok')
    const custom = builtinAgentProfiles().find((p) => p.id === 'builtin_custom')!
    expect(parseCliDefaults(custom.defaults).command).toBe('')
  })
})

describe('parseCliDefaults', () => {
  it('returns empty defaults for invalid input', () => {
    expect(parseCliDefaults(null)).toEqual(emptyCliDefaults())
    expect(parseCliDefaults(undefined)).toEqual(emptyCliDefaults())
    expect(parseCliDefaults('x')).toEqual(emptyCliDefaults())
  })

  it('parses command, args, env, cwd', () => {
    expect(
      parseCliDefaults({
        command: 'codex',
        args: ['--full-auto', 1, 'ok'],
        env: { FOO: 'bar', N: 1 },
        cwd: '/proj'
      })
    ).toEqual({
      command: 'codex',
      args: ['--full-auto', 'ok'],
      env: { FOO: 'bar' },
      cwd: '/proj'
    })
  })
})

describe('envToText / parseEnvText', () => {
  it('round-trips KEY=value lines', () => {
    const env = { API_KEY: 'secret', PATH: '/usr/bin' }
    expect(parseEnvText(envToText(env))).toEqual(env)
  })

  it('ignores blanks, comments, and invalid lines', () => {
    expect(
      parseEnvText(`
# comment
FOO=bar
invalid
=novalue
BAZ=with=equals
`)
    ).toEqual({ FOO: 'bar', BAZ: 'with=equals' })
  })

  it('preserves empty values', () => {
    expect(parseEnvText('EMPTY=')).toEqual({ EMPTY: '' })
  })
})
