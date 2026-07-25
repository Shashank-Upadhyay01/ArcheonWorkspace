import type { AgentProfile } from './types'

/** Defaults stored on cli_agent profiles (and applied onto Pane.cli). */
export interface CliAgentDefaults {
  command: string
  args: string[]
  env: Record<string, string>
  cwd: string
  /** Short blurb shown in UI (subscription vs API). */
  blurb?: string
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
  if (typeof o.blurb === 'string') base.blurb = o.blurb
  return base
}

/**
 * Built-in CLI agent profile templates for subscription CLIs you already pay for.
 * These do NOT use Archeon API keys — auth is handled by each CLI login.
 * Not auto-spawned; apply from sidebar or empty-workspace quick launch.
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
        cwd: '',
        blurb: 'Uses your Claude subscription (claude login). No API key in Archeon.'
      }
    },
    {
      id: 'builtin_grok',
      name: 'Grok Build',
      color: '#3dd6c6',
      icon: 'grok',
      kind: 'cli_agent',
      defaults: {
        // Your install: %USERPROFILE%\.grok\bin\grok.exe
        command: 'grok',
        args: [],
        env: {},
        cwd: '',
        blurb: 'Uses your Grok / xAI subscription CLI. No API key in Archeon.'
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
        cwd: '',
        blurb: 'OpenAI Codex CLI (if installed). Subscription/login via that tool.'
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
        cwd: '',
        blurb: 'Aider coding agent (if installed).'
      }
    },
    {
      id: 'builtin_custom',
      name: 'Custom CLI',
      color: '#8b97a8',
      icon: 'custom',
      kind: 'cli_agent',
      defaults: {
        command: '',
        args: [],
        env: {},
        cwd: '',
        blurb: 'Any command on your PATH.'
      }
    }
  ]
}

export function isBuiltinProfileId(id: string): boolean {
  return id.startsWith('builtin_')
}

export function getBuiltinProfile(id: string): AgentProfile | undefined {
  return builtinAgentProfiles().find((p) => p.id === id)
}

/** Serialize env map as KEY=value lines for a simple textarea editor. */
export function envToText(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
}

/**
 * Parse KEY=value lines into an env map.
 * Blank lines and # comments are ignored. First `=` splits key/value.
 */
export function parseEnvText(text: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    if (!key) continue
    env[key] = line.slice(eq + 1)
  }
  return env
}
