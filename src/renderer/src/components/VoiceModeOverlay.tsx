import type { WhisperLoadState } from '../lib/local-whisper'
import type { WaveformLevels } from '../lib/voice-engine'

export interface VoiceModeOverlayProps {
  active: boolean
  levels: WaveformLevels
  speaking?: boolean
  interimText?: string
  status?: string
  error?: string | null
  modelState?: WhisperLoadState
}

/**
 * Liquid-glass overlay: live mic bars + local Whisper status.
 */
export default function VoiceModeOverlay({
  active,
  levels,
  speaking = false,
  interimText,
  status,
  error,
  modelState
}: VoiceModeOverlayProps): JSX.Element | null {
  if (!active && !error && modelState?.status !== 'loading') return null

  const modelLine =
    modelState?.status === 'loading'
      ? `Downloading Whisper-tiny (local)… ${Math.round(modelState.progress)}%${
          modelState.file ? ` · ${modelState.file.split('/').pop()}` : ''
        }`
      : modelState?.status === 'ready'
        ? 'On-device Whisper-tiny · ready'
        : modelState?.status === 'error'
          ? `Model: ${modelState.message}`
          : null

  return (
    <div className={active || modelState?.status === 'loading' ? 'voice-glass voice-glass--on' : 'voice-glass'} role="status">
      <div className="voice-glass-panel">
        <div className="voice-glass-header">
          <span
            className={
              speaking ? 'voice-glass-dot voice-glass-dot--live' : 'voice-glass-dot'
            }
            aria-hidden="true"
          />
          <span className="voice-glass-label">
            {error
              ? 'Voice error'
              : speaking
                ? 'Hearing speech…'
                : active
                  ? 'Listening (local ASR)…'
                  : 'Preparing model…'}
          </span>
          <span className="voice-glass-hint">Ctrl+Shift+Space</span>
        </div>
        {active ? (
          <div className="voice-waveform" aria-hidden="true">
            {levels.map((lv, i) => (
              <span
                key={i}
                className="voice-waveform-bar"
                style={{ transform: `scaleY(${Math.max(0.06, lv)})` }}
              />
            ))}
          </div>
        ) : null}
        {modelState?.status === 'loading' ? (
          <div className="voice-model-progress" role="progressbar" aria-valuenow={modelState.progress}>
            <div
              className="voice-model-progress-bar"
              style={{ width: `${Math.min(100, modelState.progress)}%` }}
            />
          </div>
        ) : null}
        {error ? (
          <p className="voice-glass-text voice-glass-text--error">{error}</p>
        ) : interimText ? (
          <p className="voice-glass-text">{interimText}</p>
        ) : status ? (
          <p className="voice-glass-text voice-glass-text--muted">{status}</p>
        ) : modelLine ? (
          <p className="voice-glass-text voice-glass-text--muted">{modelLine}</p>
        ) : (
          <p className="voice-glass-text voice-glass-text--muted">
            Speak · pauses transcribe on-device (no API key)
          </p>
        )}
      </div>
    </div>
  )
}
