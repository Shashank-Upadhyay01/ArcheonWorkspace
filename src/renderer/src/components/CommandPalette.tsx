import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { builtinPresets } from '@shared/layout'
import { useAppStore } from '../stores/app-store'

export interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

interface PaletteCommand {
  id: string
  label: string
  group: string
  keywords?: string
  run: () => void | Promise<void>
}

/** Simple fuzzy: substring match or ordered character match. */
function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase().trim()
  if (!q) return true
  const t = text.toLowerCase()
  if (t.includes(q)) return true
  let i = 0
  for (const ch of t) {
    if (ch === q[i]) i++
    if (i >= q.length) return true
  }
  return false
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps): JSX.Element | null {
  const workspaces = useAppStore((s) => s.workspaces)
  const activeWorkspace = useAppStore((s) => s.activeWorkspace)
  const userPresets = useAppStore((s) => s.userPresets)
  const broadcastPaneIds = useAppStore((s) => s.broadcastPaneIds)
  const addPane = useAppStore((s) => s.addPane)
  const applyPreset = useAppStore((s) => s.applyPreset)
  const selectWorkspace = useAppStore((s) => s.selectWorkspace)
  const focusPane = useAppStore((s) => s.focusPane)
  const toggleBroadcastMode = useAppStore((s) => s.toggleBroadcastMode)
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)
  const exportWorkspace = useAppStore((s) => s.exportWorkspace)
  const importWorkspace = useAppStore((s) => s.importWorkspace)

  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)

  const commands = useMemo((): PaletteCommand[] => {
    const list: PaletteCommand[] = []
    const runAndClose = (fn: () => void | Promise<void>): (() => void) => {
      return () => {
        onClose()
        void fn()
      }
    }

    list.push(
      {
        id: 'new-shell',
        label: 'New Shell pane',
        group: 'Panes',
        keywords: 'terminal',
        run: runAndClose(() => addPane('shell'))
      },
      {
        id: 'new-ai',
        label: 'New AI Chat pane',
        group: 'Panes',
        keywords: 'llm chat',
        run: runAndClose(() => addPane('ai_chat'))
      },
      {
        id: 'new-cli',
        label: 'New CLI Agent pane',
        group: 'Panes',
        keywords: 'agent',
        run: runAndClose(() => addPane('cli_agent'))
      }
    )

    for (const preset of [...builtinPresets(), ...userPresets]) {
      list.push({
        id: `preset:${preset.id}`,
        label: `Apply preset: ${preset.name}`,
        group: 'Presets',
        keywords: preset.builtIn ? 'builtin' : 'user',
        run: runAndClose(() => applyPreset(preset.id))
      })
    }

    for (const ws of workspaces) {
      list.push({
        id: `workspace:${ws.id}`,
        label: `Switch workspace: ${ws.name}`,
        group: 'Workspaces',
        run: runAndClose(() => selectWorkspace(ws.id))
      })
    }

    if (activeWorkspace) {
      for (const pane of Object.values(activeWorkspace.panes)) {
        list.push({
          id: `focus:${pane.id}`,
          label: `Focus pane: ${pane.name}`,
          group: 'Focus',
          keywords: pane.type,
          run: runAndClose(() => focusPane(pane.id))
        })
      }
    }

    list.push(
      {
        id: 'toggle-broadcast',
        label:
          broadcastPaneIds.length > 0
            ? `Toggle broadcast (off · ${broadcastPaneIds.length} selected)`
            : 'Toggle broadcast (select all shells)',
        group: 'Broadcast',
        keywords: 'multi shell input',
        run: runAndClose(() => toggleBroadcastMode())
      },
      {
        id: 'export',
        label: 'Export workspace…',
        group: 'Workspace',
        keywords: 'save json file',
        run: runAndClose(async () => {
          await exportWorkspace()
        })
      },
      {
        id: 'import',
        label: 'Import workspace…',
        group: 'Workspace',
        keywords: 'open json file',
        run: runAndClose(async () => {
          await importWorkspace()
        })
      },
      {
        id: 'settings',
        label: 'Open settings',
        group: 'App',
        keywords: 'preferences api key',
        run: runAndClose(() => setSettingsOpen(true))
      }
    )

    return list
  }, [
    workspaces,
    activeWorkspace,
    userPresets,
    broadcastPaneIds,
    addPane,
    applyPreset,
    selectWorkspace,
    focusPane,
    toggleBroadcastMode,
    setSettingsOpen,
    exportWorkspace,
    importWorkspace,
    onClose
  ])

  const filtered = useMemo(() => {
    return commands.filter((cmd) =>
      fuzzyMatch(query, `${cmd.label} ${cmd.group} ${cmd.keywords ?? ''}`)
    )
  }, [commands, query])

  // Reset selection when opening / filter changes
  useEffect(() => {
    if (!open) return
    setQuery('')
    setIndex(0)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => {
    setIndex(0)
  }, [query])

  useEffect(() => {
    if (index >= filtered.length) {
      setIndex(Math.max(0, filtered.length - 1))
    }
  }, [filtered.length, index])

  // Keep active item visible
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const item = list.querySelector<HTMLElement>(`[data-index="${index}"]`)
    item?.scrollIntoView({ block: 'nearest' })
  }, [index, filtered])

  const runSelected = useCallback(() => {
    const cmd = filtered[index]
    if (cmd) void cmd.run()
  }, [filtered, index])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setIndex((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setIndex((i) =>
          filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length
        )
      } else if (e.key === 'Enter') {
        e.preventDefault()
        runSelected()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [filtered.length, runSelected, onClose]
  )

  if (!open) return null

  return (
    <div
      className="command-palette-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={onKeyDown}
      >
        <div className="command-palette-header">
          <input
            ref={inputRef}
            className="command-palette-input"
            placeholder="Type a command…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter commands"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="command-palette-kbd">Esc</kbd>
        </div>
        <ul className="command-palette-list" ref={listRef} role="listbox">
          {filtered.length === 0 ? (
            <li className="command-palette-empty">No matching commands</li>
          ) : (
            filtered.map((cmd, i) => (
              <li key={cmd.id} role="option" aria-selected={i === index} data-index={i}>
                <button
                  type="button"
                  className={
                    i === index
                      ? 'command-palette-item command-palette-item--active'
                      : 'command-palette-item'
                  }
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => void cmd.run()}
                >
                  <span className="command-palette-item-label">{cmd.label}</span>
                  <span className="command-palette-item-group">{cmd.group}</span>
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="command-palette-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>Enter</kbd> run
          </span>
          <span>
            <kbd>Ctrl</kbd>
            <kbd>K</kbd> toggle
          </span>
        </div>
      </div>
    </div>
  )
}
