export interface AutosaveHandle {
  /** Schedule a debounced save after `ms` of quiet. */
  touch(): void
  /** Save immediately and cancel any pending debounce. */
  flush(): void
  /** Cancel pending work; does not flush. */
  dispose(): void
}

/**
 * Debounced autosave helper. Pure timer logic — no Electron dependency.
 * `saveFn` is invoked at most once per quiet period of `ms` after the last `touch`.
 */
export function createAutosave(saveFn: () => void, ms: number): AutosaveHandle {
  let timer: ReturnType<typeof setTimeout> | null = null

  function clear(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  return {
    touch() {
      clear()
      timer = setTimeout(() => {
        timer = null
        saveFn()
      }, ms)
    },
    flush() {
      clear()
      saveFn()
    },
    dispose() {
      clear()
    }
  }
}
