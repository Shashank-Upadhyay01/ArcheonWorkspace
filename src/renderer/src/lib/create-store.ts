/**
 * Tiny reactive store — written from scratch (no Zustand / Redux / Jotai).
 * Compatible enough with our previous Zustand usage: (set, get) initializer,
 * selector hooks, and getState().
 */
import { useCallback, useRef, useSyncExternalStore } from 'react'

export type SetState<T> = (
  partial: Partial<T> | ((state: T) => Partial<T>)
) => void

export type GetState<T> = () => T

export type StoreApi<T> = {
  getState: GetState<T>
  setState: SetState<T>
  subscribe: (listener: () => void) => () => void
}

export type UseStore<T> = {
  <U>(selector: (state: T) => U): U
  getState: GetState<T>
  setState: SetState<T>
  subscribe: (listener: () => void) => () => void
}

export function createStore<T extends object>(
  initializer: (set: SetState<T>, get: GetState<T>) => T
): UseStore<T> {
  let state: T
  const listeners = new Set<() => void>()

  const getState: GetState<T> = () => state

  const setState: SetState<T> = (partial) => {
    const patch = typeof partial === 'function' ? partial(state) : partial
    // Shallow merge like Zustand's default object set
    const next = Object.assign({}, state, patch) as T
    // Bail if nothing changed by reference equality of top-level fields
    let changed = false
    for (const key of Object.keys(patch) as (keyof T)[]) {
      if (state[key] !== next[key]) {
        changed = true
        break
      }
    }
    if (!changed && Object.keys(patch).length > 0) {
      // still assign if empty patch intentional? skip notify
      return
    }
    state = next
    for (const listener of listeners) listener()
  }

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  state = initializer(setState, getState)

  function useStore<U>(selector: (s: T) => U): U {
    const selectorRef = useRef(selector)
    selectorRef.current = selector

    const getSnapshot = useCallback(() => selectorRef.current(getState()), [])

    // Re-run selector when store notifies; useSyncExternalStore handles tearing
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  }

  useStore.getState = getState
  useStore.setState = setState
  useStore.subscribe = subscribe

  return useStore as UseStore<T>
}
