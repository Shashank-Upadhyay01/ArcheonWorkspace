import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react'

export interface SplitPaneProps {
  direction: 'h' | 'v'
  sizes: number[]
  onResize: (sizes: number[]) => void
  children: ReactNode[]
}

function normalize(sizes: number[]): number[] {
  const sum = sizes.reduce((a, b) => a + b, 0)
  if (sum <= 0) {
    const eq = 1 / Math.max(sizes.length, 1)
    return sizes.map(() => eq)
  }
  return sizes.map((s) => s / sum)
}

/**
 * Flex split container with draggable gutters between children.
 * `direction: 'h'` = side-by-side (vertical gutters);
 * `direction: 'v'` = stacked (horizontal gutters).
 */
export default function SplitPane({
  direction,
  sizes,
  onResize,
  children
}: SplitPaneProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const dragRef = useRef<{
    index: number
    startPos: number
    startSizes: number[]
  } | null>(null)

  const isHorizontal = direction === 'h'
  const count = children.length
  const safeSizes =
    sizes.length === count ? normalize(sizes) : normalize(Array.from({ length: count }, () => 1))

  const onPointerDown = useCallback(
    (index: number, e: ReactPointerEvent) => {
      e.preventDefault()
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
      dragRef.current = {
        index,
        startPos: isHorizontal ? e.clientX : e.clientY,
        startSizes: [...safeSizes]
      }
      setDragging(index)
    },
    [isHorizontal, safeSizes]
  )

  useEffect(() => {
    if (dragging === null) return

    const onMove = (e: PointerEvent): void => {
      const drag = dragRef.current
      const el = containerRef.current
      if (!drag || !el) return

      const rect = el.getBoundingClientRect()
      const total = isHorizontal ? rect.width : rect.height
      if (total <= 0) return

      // Account for gutter widths (~4px each)
      const gutterTotal = Math.max(0, count - 1) * 4
      const usable = Math.max(1, total - gutterTotal)
      const deltaPx = (isHorizontal ? e.clientX : e.clientY) - drag.startPos
      const deltaFrac = deltaPx / usable

      const i = drag.index
      const next = [...drag.startSizes]
      const left = next[i]
      const right = next[i + 1]
      const pair = left + right
      const minFrac = Math.min(0.08, pair / 2)
      let newLeft = left + deltaFrac
      newLeft = Math.max(minFrac, Math.min(pair - minFrac, newLeft))
      next[i] = newLeft
      next[i + 1] = pair - newLeft
      onResize(normalize(next))
    }

    const onUp = (): void => {
      dragRef.current = null
      setDragging(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [dragging, count, isHorizontal, onResize])

  return (
    <div
      ref={containerRef}
      className={
        isHorizontal
          ? 'split-pane split-pane--h'
          : 'split-pane split-pane--v'
      }
      data-dragging={dragging !== null ? 'true' : undefined}
    >
      {children.map((child, i) => (
        // eslint-disable-next-line react/no-array-index-key -- split children are positional
        <div key={i} className="split-pane-slot" style={{ flex: `${safeSizes[i]} 1 0%` }}>
          {child}
        </div>
      )).flatMap((slot, i) => {
        if (i === children.length - 1) return [slot]
        return [
          slot,
          <div
            key={`gutter-${i}`}
            className={
              isHorizontal ? 'split-gutter split-gutter--v' : 'split-gutter split-gutter--h'
            }
            role="separator"
            aria-orientation={isHorizontal ? 'vertical' : 'horizontal'}
            aria-valuenow={Math.round(safeSizes[i] * 100)}
            tabIndex={0}
            onPointerDown={(e) => onPointerDown(i, e)}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 0.05 : 0.02
              let delta = 0
              if (isHorizontal) {
                if (e.key === 'ArrowLeft') delta = -step
                if (e.key === 'ArrowRight') delta = step
              } else {
                if (e.key === 'ArrowUp') delta = -step
                if (e.key === 'ArrowDown') delta = step
              }
              if (delta === 0) return
              e.preventDefault()
              const next = [...safeSizes]
              const pair = next[i] + next[i + 1]
              const minFrac = Math.min(0.08, pair / 2)
              let newLeft = next[i] + delta
              newLeft = Math.max(minFrac, Math.min(pair - minFrac, newLeft))
              next[i] = newLeft
              next[i + 1] = pair - newLeft
              onResize(normalize(next))
            }}
          />
        ]
      })}
    </div>
  )
}
