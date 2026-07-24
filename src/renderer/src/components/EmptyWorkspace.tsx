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
    description: 'Interactive terminal pane (PTY lands next)',
    glyph: '>_'
  },
  {
    type: 'ai_chat',
    label: 'AI',
    description: 'Built-in streaming chat agent',
    glyph: '◈'
  },
  {
    type: 'cli_agent',
    label: 'CLI',
    description: 'External CLI agent in a terminal',
    glyph: '⌘'
  }
]

interface EmptyWorkspaceProps {
  /** When false, show “create a workspace first” instead of pane CTAs. */
  hasWorkspace: boolean
}

export default function EmptyWorkspace({ hasWorkspace }: EmptyWorkspaceProps): JSX.Element {
  const addPane = useAppStore((s) => s.addPane)
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

  return (
    <div className="empty-workspace">
      <div className="empty-workspace-inner">
        <p className="empty-kicker">Empty workspace</p>
        <h2 className="empty-title">Add your first pane</h2>
        <p className="empty-copy">
          Spin up a shell, AI chat, or CLI agent. Layout and PTY wiring follow in later tasks —
          panes are already persisted in the workspace store.
        </p>
        <div className="empty-ctas">
          {CTAS.map((cta) => (
            <button
              key={cta.type}
              type="button"
              className="empty-cta"
              onClick={() => void addPane(cta.type)}
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
