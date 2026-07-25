/**
 * Minimal semver helpers for auto-update (no external deps).
 * Accepts "1.2.3" or "v1.2.3"; ignores pre-release tags for ordering
 * (1.2.3-beta is treated as 1.2.3 for simplicity).
 */

export function parseSemver(input: string): [number, number, number] | null {
  const cleaned = input.trim().replace(/^v/i, '')
  const core = cleaned.split('-')[0]?.split('+')[0] ?? ''
  const parts = core.split('.')
  if (parts.length < 2) return null
  const major = Number(parts[0])
  const minor = Number(parts[1])
  const patch = Number(parts[2] ?? '0')
  if (![major, minor, patch].every((n) => Number.isFinite(n) && n >= 0)) {
    return null
  }
  return [major, minor, patch]
}

/** Negative if a < b, 0 if equal, positive if a > b. Null parts sort as lower. */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (!pa && !pb) return 0
  if (!pa) return -1
  if (!pb) return 1
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i]
  }
  return 0
}

export function isNewerVersion(latest: string, current: string): boolean {
  return compareSemver(latest, current) > 0
}
