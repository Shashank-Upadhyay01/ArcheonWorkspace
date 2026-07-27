import { useCallback, useEffect, useRef, useState } from 'react'
import {
  SystemSpeechBackend,
  VoiceEngine,
  type WaveformLevels
} from '../lib/voice-engine'

/**
 * Insert text into the currently focused editable control or xterm textarea.
 * From-scratch DOM insertion — no input libraries.
 */
export function insertTextAtFocus(text: string): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? el.value.length
    const next = el.value.slice(0, start) + text + el.value.slice(end)
    const proto = Object.getOwnPropertyDescriptor(
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      'value'
    )
    proto?.set?.call(el, next)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    const pos = start + text.length
    try {
      el.setSelectionRange(pos, pos)
    } catch {
      /* some inputs disallow */
    }
    return true
  }

  if (el.isContentEditable) {
    document.execCommand('insertText', false, text)
    return true
  }

  if (el.tagName === 'TEXTAREA' || el.classList.contains('xterm-helper-textarea')) {
    const ta = el as HTMLTextAreaElement
    ta.focus()
    document.execCommand('insertText', false, text)
    ta.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }))
    return true
  }

  return false
}

export interface UseVoiceInputResult {
  active: boolean
  interim: string
  error: string | null
  supported: boolean
  levels: WaveformLevels
  speaking: boolean
  toggle: () => void
  stop: () => void
}

const BAR_COUNT = 28

/**
 * Global voice dictation — custom Web Audio capture + VAD + waveform.
 * STT via SystemSpeechBackend (Chromium OS speech) until a local model lands.
 * Hotkey: Ctrl+Shift+Space (registered by App).
 */
export function useVoiceInput(): UseVoiceInputResult {
  const [active, setActive] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [levels, setLevels] = useState<WaveformLevels>(() =>
    Array.from({ length: BAR_COUNT }, () => 0.08)
  )
  const [speaking, setSpeaking] = useState(false)
  const engineRef = useRef<VoiceEngine | null>(null)

  const supported =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof AudioContext !== 'undefined'

  const stop = useCallback(() => {
    engineRef.current?.stop()
    engineRef.current = null
    setActive(false)
    setInterim('')
    setSpeaking(false)
    setLevels(Array.from({ length: BAR_COUNT }, () => 0.08))
  }, [])

  const start = useCallback(async () => {
    if (!supported) {
      setError('Microphone / AudioContext not available.')
      return
    }
    setError(null)
    const engine = new VoiceEngine(
      {
        onLevels: setLevels,
        onVad: setSpeaking,
        onInterim: setInterim,
        onFinal: (text) => {
          const padded = text.endsWith(' ') ? text : `${text} `
          const ok = insertTextAtFocus(padded)
          if (!ok) {
            void navigator.clipboard.writeText(text).catch(() => {
              /* ignore */
            })
          }
          setInterim('')
        },
        onError: (message) => {
          setError(message)
        }
      },
      BAR_COUNT
    )
    engineRef.current = engine
    try {
      await engine.start(new SystemSpeechBackend())
      setActive(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setActive(false)
      engineRef.current = null
    }
  }, [supported])

  const toggle = useCallback(() => {
    if (active) stop()
    else void start()
  }, [active, start, stop])

  useEffect(() => {
    return () => {
      engineRef.current?.stop()
      engineRef.current = null
    }
  }, [])

  return { active, interim, error, supported, levels, speaking, toggle, stop }
}
