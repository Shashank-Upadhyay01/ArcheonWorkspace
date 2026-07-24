import type { AgentProfile } from './types'

/** Defaults stored on cli_agent profiles (and applied onto Pane.cli). */
export interface CliAgentDefaults {
  command: string
  args: string[]
  env: Record<string, string>
  cwd: string
}

export function emptyCliDefaults(): CliAgentDefaults {
  return { command: '', args: [], env: {}, cwd: '' }
}

/** Normalize unknown profile.defaults into CliAgentDefaults. */
export function parseCliDefaults(raw: unknown): CliAgentDefaults {
  const base = emptyCliDefaults()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  const o = raw as Record<string, unknown>
  if (typeof o.command === 'string') base.command = o.command
  if (Array.isArray(o.args)) {
    base.args = o.args.filter((a): a is string => typeof a === 'string')
  }
  if (o.env && typeof o.env === 'object' && !Array.isArray(o.env)) {
    const env: Record<string, string> = {}
    for (const [k, v] of Object.entries(o.env as Record<string, unknown>)) {
      if (typeof v === 'string') env[k] = v
    }
    base.env = env
  }
  if (typeof o.cwd === 'string') base.cwd = o.cwd
  return base
}

/**
 * Built-in CLI agent profile templates.
 * Not auto-spawned; user can apply/clone and edit command strings.
 */
export function builtinAgentProfiles(): AgentProfile[] {
  return [
    {
      id: 'builtin_claude',
      name: 'Claude Code',
      color: '#d4a27f',
      icon: 'claude',
      kind: 'cli_agent',
      defaults: {
        command: 'claude',
        args: [],
        env: {},
        cwd: ''
      }
    },
    {
      id: 'builtin_codex',
      name: 'Codex',
      color: '#6c8cff',
      icon: 'codex',
      kind: 'cli_agent',
      defaults: {
        command: 'codex',
        args: [],
        env: {},
        cwd: ''
      }
    },
    {
      id: 'builtin_aider',
      name: 'Aider',
      color: '#7ddea2',
      icon: 'aider',
      kind: 'cli_agent',
      defaults: {
        command: 'aider',
        args: [],
        env: {},
        cwd: ''
      }
    },
    {
      id: 'builtin_custom',
      name: 'Custom',
      color: '#8b97a8',
      icon: 'custom',
      kind: 'cli_agent',
      defaults: {
        command: '',
        args: [],
        env: {},
        cwd: ''
      }
    }
  ]
}

export function isBuiltinProfileId(id: string): boolean {
  return id.startsWith('builtin_')
}
