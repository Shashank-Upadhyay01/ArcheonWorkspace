import type { AgentTask } from '@shared/types'

export interface AgentTaskStripProps {
  tasks: AgentTask[]
  maxVisible?: number
}

/**
 * Compact task progress next to agent title: ✓ for done, ○ for open.
 */
export default function AgentTaskStrip({
  tasks,
  maxVisible = 6
}: AgentTaskStripProps): JSX.Element | null {
  if (!tasks.length) return null
  const done = tasks.filter((t) => t.done).length
  const total = tasks.length
  const visible = tasks.slice(0, maxVisible)
  const overflow = total - visible.length

  return (
    <div
      className="agent-task-strip"
      title={tasks.map((t) => `${t.done ? '✓' : '○'} ${t.title}`).join('\n')}
    >
      <span className="agent-task-strip-summary">
        {done}/{total}
      </span>
      <ul className="agent-task-strip-list">
        {visible.map((t) => (
          <li
            key={t.id}
            className={t.done ? 'agent-task-chip agent-task-chip--done' : 'agent-task-chip'}
          >
            <span className="agent-task-tick" aria-hidden="true">
              {t.done ? '✓' : '○'}
            </span>
            <span className="agent-task-title">{t.title}</span>
          </li>
        ))}
        {overflow > 0 ? (
          <li className="agent-task-chip agent-task-chip--more">+{overflow}</li>
        ) : null}
      </ul>
    </div>
  )
}
