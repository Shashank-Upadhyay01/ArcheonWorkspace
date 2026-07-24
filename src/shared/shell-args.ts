/**
 * Quote-aware shell-style args join/parse so multi-word tokens round-trip.
 */

/** Join argv into a single string; quote tokens that need it. */
export function joinArgs(args: string[]): string {
  return args.map(quoteArg).join(' ')
}

function quoteArg(arg: string): string {
  if (arg === '') return '""'
  if (!/[\s"']/.test(arg)) return arg
  // Prefer double quotes; escape embedded double quotes by doubling (common CLI style)
  if (!arg.includes('"')) return `"${arg}"`
  if (!arg.includes("'")) return `'${arg}'`
  return `"${arg.replace(/"/g, '\\"')}"`
}

/**
 * Parse a shell-ish args string into argv.
 * Supports double-quoted, single-quoted, and bare tokens.
 */
export function parseArgs(s: string): string[] {
  const trimmed = s.trim()
  if (!trimmed) return []
  const tokens: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(trimmed)) !== null) {
    tokens.push(m[1] ?? m[2] ?? m[3] ?? '')
  }
  return tokens
}
