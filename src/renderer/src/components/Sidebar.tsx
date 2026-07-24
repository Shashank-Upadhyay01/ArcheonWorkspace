import { useState } from 'react'
import { builtinPresets } from '@shared/layout'
import { useAppStore } from '../stores/app-store'

export default function Sidebar(): JSX.Element {
  const workspaces = useAppStore((s) => s.workspaces)
  const activeWorkspace = useAppStore((s) => s.activeWorkspace)
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const createWorkspace = useAppStore((s) => s.createWorkspace)
  const selectWorkspace = useAppStore((s) => s.selectWorkspace)
  const renameWorkspace = useAppStore((s) => s.renameWorkspace)
  const deleteWorkspace = useAppStore((s) => s.deleteWorkspace)

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  if (sidebarCollapsed) {
    return <aside className="sidebar sidebar--collapsed" aria-hidden="true" />
  }

  const agents = activeWorkspace ? Object.values(activeWorkspace.panes) : []
  const presets = builtinPresets()

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
              <li key={pane.id} className="sidebar-item">
                <span
                  className="sidebar-item-dot"
                  style={{ background: pane.color }}
                  aria-hidden="true"
                />
                <span className="sidebar-item-label">{pane.name}</span>
                <span className="sidebar-item-meta">{pane.type.replace('_', ' ')}</span>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="sidebar-section sidebar-section--grow">
        <div className="sidebar-section-header">
          <h2 className="sidebar-heading">Presets</h2>
        </div>
        <ul className="sidebar-list">
          {presets.map((preset) => (
            <li key={preset.id} className="sidebar-item sidebar-item--static">
              <span className="sidebar-item-label">{preset.name}</span>
              <span className="sidebar-item-meta">built-in</span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  )
}
