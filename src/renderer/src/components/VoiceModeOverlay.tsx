import type { WaveformLevels } from '../lib/voice-engine'

export interface VoiceModeOverlayProps {
  active: boolean
  levels: WaveformLevels
  speaking?: boolean
  interimText?: string
  error?: string | null
}

/**
 * Liquid-glass overlay driven by live mic levels (from-scratch DSP), not fake sines.
 */
export default function VoiceModeOverlay({
  active,
  levels,
  speaking = false,
  interimText,
  error
}: VoiceModeOverlayProps): JSX.Element | null {
  if (!active && !error) return null

  return (
    <div className={active ? 'voice-glass voice-glass--on' : 'voice-glass'} role="status">
      <div className="voice-glass-panel">
        <div className="voice-glass-header">
          <span
            className={
              speaking ? 'voice-glass-dot voice-glass-dot--live' : 'voice-glass-dot'
            }
            aria-hidden="true"
          />
          <span className="voice-glass-label">
            {error ? 'Voice error' : speaking ? 'Hearing speech…' : 'Listening…'}
          </span>
          <span className="voice-glass-hint">Ctrl+Shift+Space</span>
        </div>
        <div className="voice-waveform" aria-hidden="true">
          {levels.map((lv, i) => (
            <span
              key={i}
              className="voice-waveform-bar"
              style={{ transform: `scaleY(${Math.max(0.06, lv)})` }}
            />
          ))}
        </div>
        {error ? (
          <p className="voice-glass-text voice-glass-text--error">{error}</p>
        ) : interimText ? (
          <p className="voice-glass-text">{interimText}</p>
        ) : (
          <p className="voice-glass-text voice-glass-text--muted">
            From-scratch mic DSP · speak to type at the cursor
          </p>
        )}
      </div>
    </div>
  )
}
