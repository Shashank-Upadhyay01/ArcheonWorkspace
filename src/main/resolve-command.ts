/**
 * Resolve CLI agent commands on Windows/Linux so subscription tools
 * (claude, grok, …) spawn even when Electron's PATH is thin.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'

const WIN_EXTS = ['.exe', '.cmd', '.bat', '.ps1', '']

/** Extra dirs where popular agent CLIs install. */
export function agentCliSearchDirs(home = os.homedir()): string[] {
  const dirs: string[] = []
  const local = path.join(home, '.local', 'bin')
  const grok = path.join(home, '.grok', 'bin')
  const cargo = path.join(home, '.cargo', 'bin')
  dirs.push(local, grok, cargo)

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
    const localApp = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
    dirs.push(
      path.join(appData, 'npm'),
      path.join(localApp, 'Programs'),
      path.join(home, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Links')
    )
  } else {
    dirs.push('/usr/local/bin', path.join(home, 'bin'))
  }
  return dirs
}

export function pathEntries(envPath: string | undefined, platform = process.platform): string[] {
  if (!envPath) return []
  const sep = platform === 'win32' ? ';' : ':'
  return envPath.split(sep).filter(Boolean)
}

/**
 * Build an env PATH that includes common agent CLI install locations.
 */
export function enrichPath(
  baseEnv: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): string {
  const key = platform === 'win32' ? 'Path' : 'PATH'
  // Windows may use Path or PATH
  const current =
    (platform === 'win32'
      ? baseEnv.Path || baseEnv.PATH
      : baseEnv.PATH || baseEnv.Path) || ''
  const parts = [
    ...agentCliSearchDirs(),
    ...pathEntries(current, platform)
  ]
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const p of parts) {
    const n = path.normalize(p)
    const k = platform === 'win32' ? n.toLowerCase() : n
    if (seen.has(k)) continue
    seen.add(k)
    ordered.push(n)
  }
  const sep = platform === 'win32' ? ';' : ':'
  return ordered.join(sep)
}

function isExecutableFile(file: string): boolean {
  try {
    const st = fs.statSync(file)
    if (!st.isFile()) return false
    // On Windows, existence is enough for .exe/.cmd
    if (process.platform === 'win32') return true
    fs.accessSync(file, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Resolve a bare command name to an absolute path when possible.
 * Falls back to the original command (PATH lookup at spawn time).
 */
export function resolveCommandPath(
  command: string,
  envPath?: string,
  platform: NodeJS.Platform = process.platform,
  home = os.homedir()
): string {
  const cmd = command.trim()
  if (!cmd) return cmd

  // Already absolute / relative path with separator
  if (path.isAbsolute(cmd) || cmd.includes('/') || cmd.includes('\\')) {
    return cmd
  }

  const pathStr = envPath ?? enrichPath(process.env, platform)
  const dirs = [
    ...agentCliSearchDirs(home),
    ...pathEntries(pathStr, platform)
  ]

  const candidates =
    platform === 'win32'
      ? WIN_EXTS.map((ext) => (ext && cmd.toLowerCase().endsWith(ext) ? cmd : cmd + ext))
      : [cmd]

  const seen = new Set<string>()
  for (const dir of dirs) {
    for (const name of candidates) {
      const full = path.join(dir, name)
      const key = platform === 'win32' ? full.toLowerCase() : full
      if (seen.has(key)) continue
      seen.add(key)
      if (isExecutableFile(full)) return full
    }
  }

  return cmd
}
