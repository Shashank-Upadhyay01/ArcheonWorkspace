/**
 * Generate a unique id using the platform crypto API (Node 20+ / Chromium).
 * No external uuid package — keeps the dependency surface small.
 */
export function createId(prefix?: string): string {
  const id = crypto.randomUUID()
  return prefix ? `${prefix}_${id}` : id
}
