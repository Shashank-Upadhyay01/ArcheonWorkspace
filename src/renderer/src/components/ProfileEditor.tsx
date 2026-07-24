import { useEffect, useState } from 'react'
import { createId } from '@shared/ids'
import { emptyCliDefaults, envToText, parseCliDefaults, parseEnvText } from '@shared/profiles'
import { joinArgs, parseArgs } from '@shared/shell-args'
import type { AgentProfile } from '@shared/types'
import { nextAgentColor } from '@shared/colors'

export interface ProfileEditorProps {
  /** Existing profile to edit, or null for create. */
  profile: AgentProfile | null
  /** Seed from a built-in template when creating. */
  seed?: AgentProfile | null
  usedColors: string[]
  onSave: (profile: AgentProfile) => void | Promise<void>
  onCancel: () => void
}

export default function ProfileEditor({
  profile,
  seed,
  usedColors,
  onSave,
  onCancel
}: ProfileEditorProps): JSX.Element {
  const source = profile ?? seed
  const defaults = parseCliDefaults(source?.defaults)

  const [name, setName] = useState(source?.name ?? 'Custom agent')
  const [color, setColor] = useState(source?.color ?? nextAgentColor(usedColors))
  const [command, setCommand] = useState(defaults.command)
  const [argsText, setArgsText] = useState(joinArgs(defaults.args))
  const [envText, setEnvText] = useState(envToText(defaults.env))
  const [cwd, setCwd] = useState(defaults.cwd)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const src = profile ?? seed
    const d = parseCliDefaults(src?.defaults)
    setName(src?.name ?? 'Custom agent')
    setColor(src?.color ?? nextAgentColor(usedColors))
    setCommand(d.command)
    setArgsText(joinArgs(d.args))
    setEnvText(envToText(d.env))
    setCwd(d.cwd)
  }, [profile, seed, usedColors])

  async function handleSave(): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      const args = parseArgs(argsText)
      const env = parseEnvText(envText)
      const next: AgentProfile = {
        id: profile?.id && !profile.id.startsWith('builtin_') ? profile.id : createId('profile'),
        name: trimmed,
        color,
        kind: 'cli_agent',
        defaults: {
          ...emptyCliDefaults(),
          command: command.trim(),
          args,
          env,
          cwd: cwd.trim()
        }
      }
      await onSave(next)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="profile-editor">
      <label className="profile-editor-field">
        <span>Name</span>
        <input
          className="sidebar-input"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSave()
            if (e.key === 'Escape') onCancel()
          }}
        />
      </label>
      <label className="profile-editor-field">
        <span>Color</span>
        <input
          className="profile-editor-color"
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
      </label>
      <label className="profile-editor-field">
        <span>Command</span>
        <input
          className="sidebar-input"
          value={command}
          placeholder="claude / codex / aider"
          onChange={(e) => setCommand(e.target.value)}
        />
      </label>
      <label className="profile-editor-field">
        <span>Args</span>
        <input
          className="sidebar-input"
          value={argsText}
          placeholder='e.g. --model "gpt-4" path'
          onChange={(e) => setArgsText(e.target.value)}
        />
      </label>
      <label className="profile-editor-field">
        <span>Env (KEY=value)</span>
        <textarea
          className="sidebar-input profile-editor-env"
          value={envText}
          placeholder={'API_KEY=...\nFOO=bar'}
          rows={3}
          onChange={(e) => setEnvText(e.target.value)}
          spellCheck={false}
        />
      </label>
      <label className="profile-editor-field">
        <span>Cwd</span>
        <input
          className="sidebar-input"
          value={cwd}
          placeholder="empty → home"
          onChange={(e) => setCwd(e.target.value)}
        />
      </label>
      <div className="sidebar-create-actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--accent"
          onClick={() => void handleSave()}
          disabled={saving || !name.trim()}
        >
          Save
        </button>
      </div>
    </div>
  )
}
