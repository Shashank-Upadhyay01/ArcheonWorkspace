import { describe, it, expect } from 'vitest'

/**
 * Core store logic test without importing React renderer modules
 * (tsconfig.node cannot pull renderer files).
 */
function createCoreStore<T extends object>(
  initializer: (
    set: (p: Partial<T> | ((s: T) => Partial<T>)) => void,
    get: () => T
  ) => T
) {
  let state: T
  const listeners = new Set<() => void>()
  const get = () => state
  const set = (partial: Partial<T> | ((s: T) => Partial<T>)) => {
    const patch = typeof partial === 'function' ? partial(state) : partial
    state = Object.assign({}, state, patch) as T
    for (const l of listeners) l()
  }
  state = initializer(set, get)
  return {
    getState: get,
    setState: set,
    subscribe: (l: () => void) => {
      listeners.add(l)
      return () => listeners.delete(l)
    }
  }
}

describe('createStore core (from scratch)', () => {
  it('initializes and getState', () => {
    const store = createCoreStore<{ n: number; inc: () => void }>((set, get) => ({
      n: 0,
      inc: () => set({ n: get().n + 1 })
    }))
    expect(store.getState().n).toBe(0)
    store.getState().inc()
    expect(store.getState().n).toBe(1)
  })

  it('notifies subscribers on setState', () => {
    const store = createCoreStore<{ x: string }>(() => ({ x: 'a' }))
    let hits = 0
    const unsub = store.subscribe(() => {
      hits++
    })
    store.setState({ x: 'b' })
    expect(store.getState().x).toBe('b')
    expect(hits).toBe(1)
    unsub()
    store.setState({ x: 'c' })
    expect(hits).toBe(1)
  })
})
