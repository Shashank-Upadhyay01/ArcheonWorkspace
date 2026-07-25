import { useCallback, useEffect, useRef, useState } from 'react'

type SpeechRecognitionCtor = new () => SpeechRecognition

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/**
 * Insert text into the currently focused editable control or xterm textarea.
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
    el.setSelectionRange(pos, pos)
    return true
  }

  if (el.isContentEditable) {
    document.execCommand('insertText', false, text)
    return true
  }

  // xterm uses a hidden textarea
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
  toggle: () => void
  stop: () => void
}

/**
 * Global voice dictation (Web Speech API in Chromium/Electron).
 * Hotkey is registered by the host (Ctrl+Shift+Space).
 */
export function useVoiceInput(): UseVoiceInputResult {
  const [active, setActive] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<SpeechRecognition | null>(null)
  const Ctor = typeof window !== 'undefined' ? getSpeechRecognition() : null
  const supported = Boolean(Ctor)

  const stop = useCallback(() => {
    try {
      recRef.current?.stop()
    } catch {
      /* ignore */
    }
    recRef.current = null
    setActive(false)
    setInterim('')
  }, [])

  const start = useCallback(() => {
    if (!Ctor) {
      setError('Speech recognition is not available in this environment.')
      return
    }
    setError(null)
    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = navigator.language || 'en-US'

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interimBuf = ''
      let finalBuf = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i]
        const t = r[0]?.transcript ?? ''
        if (r.isFinal) finalBuf += t
        else interimBuf += t
      }
      if (finalBuf) {
        const ok = insertTextAtFocus(finalBuf.endsWith(' ') ? finalBuf : `${finalBuf} `)
        if (!ok) {
          // Fallback: copy to clipboard so user can paste into any target
          void navigator.clipboard.writeText(finalBuf).catch(() => {
            /* ignore */
          })
        }
        setInterim('')
      } else {
        setInterim(interimBuf)
      }
    }

    rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
      if (ev.error === 'aborted' || ev.error === 'no-speech') return
      setError(ev.message || ev.error || 'Voice recognition error')
      setActive(false)
    }

    rec.onend = () => {
      // If user still wants listening, restart (some engines stop after silence)
      if (recRef.current === rec) {
        try {
          rec.start()
        } catch {
          setActive(false)
          recRef.current = null
        }
      }
    }

    try {
      rec.start()
      recRef.current = rec
      setActive(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setActive(false)
    }
  }, [Ctor])

  const toggle = useCallback(() => {
    if (active) stop()
    else start()
  }, [active, start, stop])

  useEffect(() => {
    return () => {
      try {
        recRef.current?.abort()
      } catch {
        /* ignore */
      }
    }
  }, [])

  return { active, interim, error, supported, toggle, stop }
}

// Minimal DOM typings for SpeechRecognition (not always in TS lib)
interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((ev: SpeechRecognitionEvent) => void) | null
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message: string
}
