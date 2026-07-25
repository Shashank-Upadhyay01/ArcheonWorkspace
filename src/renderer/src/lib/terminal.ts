import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal, type ITheme } from 'xterm'
import { getArcheonApi } from './ipc'

/** Theme for xterm, derived from CSS design tokens (light/dark). */
export function terminalThemeFromCss(): ITheme {
  const css = getComputedStyle(document.documentElement)
  const bg = css.getPropertyValue('--term-bg').trim() || '#0e1116'
  const fg = css.getPropertyValue('--term-fg').trim() || '#e8eef7'
  const cursor = css.getPropertyValue('--term-cursor').trim() || '#3dd6c6'
  const selection =
    css.getPropertyValue('--term-selection').trim() || 'rgba(61, 214, 198, 0.28)'

  return {
    background: bg,
    foreground: fg,
    cursor,
    cursorAccent: bg,
    selectionBackground: selection,
    black: '#0e1116',
    red: '#f07178',
    green: '#3dd6c6',
    yellow: '#e6b450',
    blue: '#6cb6ff',
    magenta: '#c792ea',
    cyan: '#89ddff',
    white: '#e8eef7',
    brightBlack: '#8b97a8',
    brightRed: '#f07178',
    brightGreen: '#3dd6c6',
    brightYellow: '#e6b450',
    brightBlue: '#6cb6ff',
    brightMagenta: '#c792ea',
    brightCyan: '#89ddff',
    brightWhite: '#ffffff'
  }
}

/** Create a product-standard terminal with fit + clickable links. */
export function createProductTerminal(): {
  term: Terminal
  fitAddon: FitAddon
} {
  const term = new Terminal({
    cursorBlink: true,
    fontFamily: 'IBM Plex Mono, ui-monospace, Consolas, monospace',
    fontSize: 13,
    lineHeight: 1.2,
    theme: terminalThemeFromCss(),
    allowProposedApi: true,
    scrollback: 5000
  })

  const fitAddon = new FitAddon()
  term.loadAddon(fitAddon)

  term.loadAddon(
    new WebLinksAddon((_event, uri) => {
      try {
        void getArcheonApi().shell.openExternal(uri)
      } catch {
        // Preload bridge missing in non-Electron tests
      }
    })
  )

  return { term, fitAddon }
}

export function serializeTerminalScrollback(term: Terminal, cap: number): string {
  const buffer = term.buffer.active
  const len = buffer.length
  const start = Math.max(0, len - cap)
  const lines: string[] = []
  for (let i = start; i < len; i++) {
    const line = buffer.getLine(i)
    if (line) {
      lines.push(line.translateToString(true))
    }
  }
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  return lines.join('\n')
}
