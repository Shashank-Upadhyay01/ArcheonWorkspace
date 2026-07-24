import { useState } from 'react'
import { builtinPresets } from '@shared/layout'
import { useAppStore } from '../stores/app-store'

export default function Sidebar(): JSX.Element {
  const workspaces = useAppStore((s) => s.workspaces)
  const activeWorkspace = useAppStore((s) => s.activeWorkspace)
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const userPresets = useAppStore((s) => s.userPresets)
  const createWorkspace = useAppStore((s) => s.createWorkspace)
  const selectWorkspace = useAppStore((s) => s.selectWorkspace)
  const renameWorkspace = useAppStore((s) => s.renameWorkspace)
  const deleteWorkspace = useAppStore((s) => s.deleteWorkspace)
  const applyPreset = useAppStore((s) => s.applyPreset)
  const saveUserPreset = useAppStore((s) => s.saveUserPreset)
  const focusPane = useAppStore((s) => s.focusPane)

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [savingPreset, setSavingPreset] = useState(false)
  const [presetName, setPresetName] = useState('')

  if (sidebarCollapsed) {
    return <aside className="sidebar sidebar--collapsed" aria-hidden="true" />
  }

  const agents = activeWorkspace ? Object.values(activeWorkspace.panes) : []
  const builtIns = builtinPresets()
  const paneCount = activeWorkspace ? Object.keys(activeWorkspace.panes).length : 0

  async function handleCreate(): Promise<void> {
    const name = newName.trim() || `Workspace ${workspaces.length + 1}`
    await createWorkspace(name)
    setNewName('')
    setCreating(false)
  }

  async function commitRename(id: string): Promise<void> {
    if (renameValue.trim()) {
      await renameWorkspace(id, renameValue.trim())
    }
    setRenamingId(null)
    setRenameValue('')
  }

  async function handleSavePreset(): Promise<void> {
    const name = presetName.trim()
    if (!name) return
    await saveUserPreset(name)
    setPresetName('')
    setSavingPreset(false)
  }

  return (
    <aside className="sidebar" aria-label="Workspace sidebar">
      <section className="sidebar-section">
        <div className="sidebar-section-header">
          <h2 className="sidebar-heading">Workspaces</h2>
          <button
            type="button"
            className="sidebar-icon-btn"
            aria-label="New workspace"
            title="New workspace"
            onClick={() => setCreating(true)}
          >
            +
          </button>
        </div>

        {creating ? (
          <div className="sidebar-create">
            <input
              className="sidebar-input"
              autoFocus
              placeholder="Workspace name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreate()
                if (e.key === 'Escape') {
                  setCreating(false)
                  setNewName('')
                }
              }}
            />
            <div className="sidebar-create-actions">
              <button type="button" className="btn btn--ghost" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn--accent" onClick={() => void handleCreate()}>
                Create
              </button>
            </div>
          </div>
        ) : null}

        <ul className="sidebar-list">
          {workspaces.length === 0 ? (
            <li className="sidebar-empty">No workspaces yet</li>
          ) : (
            workspaces.map((ws) => {
              const active = activeWorkspace?.id === ws.id
              return (
                <li key={ws.id} className={active ? 'sidebar-item sidebar-item--active' : 'sidebar-item'}>
                  {renamingId === ws.id ? (
                    <input
                      className="sidebar-input"
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => void commitRename(ws.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void commitRename(ws.id)
                        if (e.key === 'Escape') {
                          setRenamingId(null)
                          setRenameValue('')
                        }
                      }}
                    />
                  ) : (
                    <>
                      <button
                        type="button"
                        className="sidebar-item-main"
                        onClick={() => void selectWorkspace(ws.id)}
                        onDoubleClick={() => {
                          setRenamingId(ws.id)
                          setRenameValue(ws.name)
                        }}
                      >
                        <span className="sidebar-item-dot" aria-hidden="true" />
                        <span className="sidebar-item-label">{ws.name}</span>
                      </button>
                      <div className="sidebar-item-actions">
                        <button
                          type="button"
                          className="sidebar-icon-btn sidebar-icon-btn--quiet"
                          aria-label={`Rename ${ws.name}`}
                          title="Rename"
                          onClick={() => {
                            setRenamingId(ws.id)
                            setRenameValue(ws.name)
                          }}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="sidebar-icon-btn sidebar-icon-btn--quiet sidebar-icon-btn--danger"
                          aria-label={`Delete ${ws.name}`}
                          title="Delete"
                          onClick={() => {
                            if (window.confirm(`Delete workspace “${ws.name}”?`)) {
                              void deleteWorkspace(ws.id)
                            }
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </>
                  )}
                </li>
              )
            })
          )}
        </ul>
      </section>

      <section className="sidebar-section">
        <div className="sidebar-section-header">
          <h2 className="sidebar-heading">Agents</h2>
        </div>
        <ul className="sidebar-list">
          {agents.length === 0 ? (
            <li className="sidebar-empty">No panes yet</li>
          ) : (
            agents.map((pane) => (
              <li
                key={pane.id}
                className={
                  activeWorkspace?.activePaneId === pane.id
                    ? 'sidebar-item sidebar-item--active'
                    : 'sidebar-item'
                }
              >
                <button
                  type="button"
                  className="sidebar-item-main"
                  onClick={() => focusPane(pane.id)}
                >
                  <span
                    className="sidebar-item-dot"
                    style={{ background: pane.color }}
                    aria-hidden="true"
                  />
                  <span className="sidebar-item-label">{pane.name}</span>
                  <span className="sidebar-item-meta">{pane.type.replace('_', ' ')}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="sidebar-section sidebar-section--grow">
        <div className="sidebar-section-header">
          <h2 className="sidebar-heading">Presets</h2>
          <button
            type="button"
            className="sidebar-icon-btn"
            aria-label="Save current layout as preset"
            title="Save layout as preset"
            disabled={paneCount === 0}
            onClick={() => setSavingPreset(true)}
          >
            ⬇
          </button>
        </div>

        {savingPreset ? (
          <div className="sidebar-create">
            <input
              className="sidebar-input"
              autoFocus
              placeholder="Preset name"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSavePreset()
                if (e.key === 'Escape') {
                  setSavingPreset(false)
                  setPresetName('')
                }
              }}
            />
            <div className="sidebar-create-actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setSavingPreset(false)
                  setPresetName('')
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--accent"
                onClick={() => void handleSavePreset()}
              >
                Save
              </button>
            </div>
          </div>
        ) : null}

        <ul className="sidebar-list">
          {builtIns.map((preset) => (
            <li key={preset.id} className="sidebar-item">
              <button
                type="button"
                className="sidebar-item-main"
                disabled={!activeWorkspace}
                title={`Apply ${preset.name}`}
                onClick={() => void applyPreset(preset.id)}
              >
                <span className="sidebar-item-label">{preset.name}</span>
                <span className="sidebar-item-meta">built-in</span>
              </button>
            </li>
          ))}
          {userPresets.map((preset) => (
            <li key={preset.id} className="sidebar-item">
              <button
                type="button"
                className="sidebar-item-main"
                disabled={!activeWorkspace}
                title={`Apply ${preset.name}`}
                onClick={() => void applyPreset(preset.id)}
              >
                <span className="sidebar-item-label">{preset.name}</span>
                <span className="sidebar-item-meta">user</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  )
}
