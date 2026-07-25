import { builtinAgentProfiles, getBuiltinProfile } from '@shared/profiles'
import type { PaneType } from '@shared/types'
import { useAppStore } from '../stores/app-store'

interface Cta {
  type: PaneType
  label: string
  description: string
  glyph: string
}

const CTAS: Cta[] = [
  {
    type: 'shell',
    label: 'Shell',
    description: 'Plain terminal (PowerShell / bash)',
    glyph: '>_'
  },
  {
    type: 'cli_agent',
    label: 'CLI agent',
    description: 'Generic CLI agent pane',
    glyph: '⌘'
  },
  {
    type: 'ai_chat',
    label: 'AI chat (API key)',
    description: 'Built-in streaming chat — needs an API key later',
    glyph: '◈'
  }
]

interface EmptyWorkspaceProps {
  hasWorkspace: boolean
}

export default function EmptyWorkspace({ hasWorkspace }: EmptyWorkspaceProps): JSX.Element {
  const addPane = useAppStore((s) => s.addPane)
  const applyProfile = useAppStore((s) => s.applyProfile)
  const createWorkspace = useAppStore((s) => s.createWorkspace)

  if (!hasWorkspace) {
    return (
      <div className="empty-workspace">
        <div className="empty-workspace-inner">
          <p className="empty-kicker">Mission control</p>
          <h2 className="empty-title">No active workspace</h2>
          <p className="empty-copy">
            Create a workspace from the sidebar, or start one here to begin arranging agents.
          </p>
          <button
            type="button"
            className="btn btn--accent btn--lg"
            onClick={() => void createWorkspace('Workspace 1')}
          >
            Create workspace
          </button>
        </div>
      </div>
    )
  }

  const subscriptionProfiles = builtinAgentProfiles().filter((p) =>
    ['builtin_claude', 'builtin_grok'].includes(p.id)
  )

  return (
    <div className="empty-workspace">
      <div className="empty-workspace-inner">
        <p className="empty-kicker">Empty workspace</p>
        <h2 className="empty-title">Launch your subscription agents</h2>
        <p className="empty-copy">
          Prefer <strong>Claude Code</strong> or <strong>Grok Build</strong> with the logins you
          already have — no Archeon API key required. Built-in AI chat can wait until you add a key.
        </p>

        <div className="empty-ctas empty-ctas--featured">
          {subscriptionProfiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              className="empty-cta empty-cta--featured"
              style={{ borderColor: profile.color }}
              onClick={() => void applyProfile(profile)}
            >
              <span
                className="empty-cta-glyph"
                style={{ color: profile.color }}
                aria-hidden="true"
              >
                {profile.id === 'builtin_claude' ? '✦' : '⚡'}
              </span>
              <span className="empty-cta-label">{profile.name}</span>
              <span className="empty-cta-desc">
                {profile.id === 'builtin_claude'
                  ? 'Your Claude subscription CLI (`claude`)'
                  : 'Your Grok Build CLI (`grok`)'}
              </span>
              <span className="empty-cta-badge">Subscription · no API key</span>
            </button>
          ))}
        </div>

        <p className="empty-subhead">Or add a plain pane</p>
        <div className="empty-ctas">
          {CTAS.map((cta) => (
            <button
              key={cta.type}
              type="button"
              className="empty-cta"
              onClick={() => {
                if (cta.type === 'cli_agent') {
                  const custom = getBuiltinProfile('builtin_custom')
                  if (custom) void applyProfile(custom)
                  else void addPane('cli_agent')
                } else {
                  void addPane(cta.type)
                }
              }}
            >
              <span className="empty-cta-glyph" aria-hidden="true">
                {cta.glyph}
              </span>
              <span className="empty-cta-label">{cta.label}</span>
              <span className="empty-cta-desc">{cta.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
