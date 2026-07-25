import { useEffect, useRef, useState } from 'react'

export interface VoiceModeOverlayProps {
  active: boolean
  interimText?: string
  error?: string | null
}

/**
 * Liquid-glass waveform overlay while voice mode is listening.
 * Visual only — recognition lives in useVoiceInput.
 */
export default function VoiceModeOverlay({
  active,
  interimText,
  error
}: VoiceModeOverlayProps): JSX.Element | null {
  const [levels, setLevels] = useState<number[]>(() => Array.from({ length: 28 }, () => 0.15))
  const raf = useRef<number>(0)

  useEffect(() => {
    if (!active) {
      setLevels(Array.from({ length: 28 }, () => 0.12))
      return
    }
    let t = 0
    const tick = (): void => {
      t += 0.12
      setLevels(
        Array.from({ length: 28 }, (_, i) => {
          const wave =
            0.25 +
            0.35 * Math.abs(Math.sin(t + i * 0.35)) +
            0.25 * Math.abs(Math.sin(t * 1.7 + i * 0.2))
          return Math.min(1, Math.max(0.08, wave))
        })
      )
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [active])

  if (!active && !error) return null

  return (
    <div className={active ? 'voice-glass voice-glass--on' : 'voice-glass'} role="status">
      <div className="voice-glass-panel">
        <div className="voice-glass-header">
          <span className="voice-glass-dot" aria-hidden="true" />
          <span className="voice-glass-label">{error ? 'Voice error' : 'Listening…'}</span>
          <span className="voice-glass-hint">Ctrl+Shift+Space</span>
        </div>
        <div className="voice-waveform" aria-hidden="true">
          {levels.map((lv, i) => (
            <span
              key={i}
              className="voice-waveform-bar"
              style={{ transform: `scaleY(${lv})` }}
            />
          ))}
        </div>
        {error ? (
          <p className="voice-glass-text voice-glass-text--error">{error}</p>
        ) : interimText ? (
          <p className="voice-glass-text">{interimText}</p>
        ) : (
          <p className="voice-glass-text voice-glass-text--muted">Speak — text inserts where you type</p>
        )}
      </div>
    </div>
  )
}
