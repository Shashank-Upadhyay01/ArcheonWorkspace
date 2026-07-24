/**
 * Generation guard helpers for debounced autosave.
 *
 * Pattern:
 * - Increment generation on every markDirty (or any local mutation that dirties).
 * - Capture generation at the start of flushSave.
 * - After await, only clear dirty if generation still matches (no newer edits).
 */

/** True when a completed save may safely clear the dirty flag. */
export function shouldClearDirtyAfterFlush(
  capturedGen: number,
  currentGen: number
): boolean {
  return capturedGen === currentGen
}

/** Next generation after a dirtying mutation. */
export function bumpSaveGeneration(current: number): number {
  return current + 1
}
