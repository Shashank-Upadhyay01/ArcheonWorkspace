import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AGENT_COLORS } from '@shared/colors'
import type { Pane } from '@shared/types'
import { useAppStore } from '../../stores/app-store'

export interface PaneChromeProps {
  pane: Pane
  focused: boolean
  onFocus: () => void
  children: ReactNode
}

function typeGlyph(type: Pane['type']): string {
  if (type === 'shell') return '>_'
  if (type === 'ai_chat') return '◈'
  return '⌘'
}

function typeLabel(type: Pane['type']): string {
  if (type === 'shell') return 'Shell'
  if (type === 'ai_chat') return 'AI'
  return 'CLI'
}

export default function PaneChrome({
  pane,
  focused,
  onFocus,
  children
}: PaneChromeProps): JSX.Element {
  const renamePane = useAppStore((s) => s.renamePane)
  const setPaneColor = useAppStore((s) => s.setPaneColor)
  const closePane = useAppStore((s) => s.closePane)
  const addPane = useAppStore((s) => s.addPane)
  const addPaneAsTab = useAppStore((s) => s.addPaneAsTab)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(pane.name)
  const [menuOpen, setMenuOpen] = useState(false)
  const [colorOpen, setColorOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (editing) {
      setDraft(pane.name)
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing, pane.name])

  useEffect(() => {
    if (!menuOpen && !colorOpen) return
    const onDoc = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
        setColorOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen, colorOpen])

  function commitRename(): void {
    setEditing(false)
    renamePane(pane.id, draft)
  }

  return (
    <article
      className={focused ? 'pane-chrome pane-chrome--focused' : 'pane-chrome'}
      onMouseDown={onFocus}
      data-pane-id={pane.id}
    >
      <div className="pane-chrome-rail" style={{ background: pane.color }} aria-hidden="true" />
      <div className="pane-chrome-body">
        <header className="pane-chrome-header">
          <span className="pane-chrome-type" title={typeLabel(pane.type)} aria-hidden="true">
            {typeGlyph(pane.type)}
          </span>
          {editing ? (
            <input
              ref={inputRef}
              className="pane-chrome-name-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') {
                  setDraft(pane.name)
                  setEditing(false)
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
            />
          ) : (
            <h3
              className="pane-chrome-name"
              title="Double-click to rename"
              onDoubleClick={(e) => {
                e.stopPropagation()
                setEditing(true)
              }}
            >
              {pane.name}
            </h3>
          )}
          <div className="pane-chrome-actions" ref={menuRef}>
            <button
              type="button"
              className="pane-chrome-btn"
              aria-label="Pane color"
              title="Color"
              onClick={(e) => {
                e.stopPropagation()
                setColorOpen((v) => !v)
                setMenuOpen(false)
              }}
            >
              <span className="pane-chrome-color-swatch" style={{ background: pane.color }} />
            </button>
            <button
              type="button"
              className="pane-chrome-btn"
              aria-label="Pane menu"
              title="Menu"
              aria-expanded={menuOpen}
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen((v) => !v)
                setColorOpen(false)
              }}
            >
              ···
            </button>
            {colorOpen ? (
              <div className="pane-chrome-menu pane-chrome-menu--colors" role="menu">
                {AGENT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={
                      c.toLowerCase() === pane.color.toLowerCase()
                        ? 'pane-color-chip pane-color-chip--active'
                        : 'pane-color-chip'
                    }
                    style={{ background: c }}
                    aria-label={`Set color ${c}`}
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation()
                      setPaneColor(pane.id, c)
                      setColorOpen(false)
                    }}
                  />
                ))}
              </div>
            ) : null}
            {menuOpen ? (
              <div className="pane-chrome-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="pane-chrome-menu-item"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpen(false)
                    void addPane(pane.type, 'h', pane.id)
                  }}
                >
                  Split right
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="pane-chrome-menu-item"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpen(false)
                    void addPane(pane.type, 'v', pane.id)
                  }}
                >
                  Split down
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="pane-chrome-menu-item"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpen(false)
                    void addPaneAsTab(pane.type, pane.id)
                  }}
                >
                  New tab here
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="pane-chrome-menu-item"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpen(false)
                    setEditing(true)
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="pane-chrome-menu-item pane-chrome-menu-item--danger"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpen(false)
                    void closePane(pane.id)
                  }}
                >
                  Close pane
                </button>
              </div>
            ) : null}
          </div>
        </header>
        <div className="pane-chrome-content">{children}</div>
      </div>
    </article>
  )
}
