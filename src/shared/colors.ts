/** Muted-bright hex colors suitable for agent accents on a dark UI. */
export const AGENT_COLORS: string[] = [
  '#3dd6c6',
  '#6c8cff',
  '#c77dff',
  '#ff6b9d',
  '#ffb347',
  '#7ddea2',
  '#5eb8ff',
  '#e8a0bf',
  '#a3e635',
  '#f472b6'
]

/**
 * Pick the next agent color not already in `used`.
 * Cycles through AGENT_COLORS; if all are used, returns the least-used or first color.
 */
export function nextAgentColor(used: string[]): string {
  const normalizedUsed = used.map((c) => c.toLowerCase())
  const unused = AGENT_COLORS.find((c) => !normalizedUsed.includes(c.toLowerCase()))
  if (unused) return unused

  // All palette colors taken — return the first palette color as a stable fallback
  return AGENT_COLORS[0]
}
