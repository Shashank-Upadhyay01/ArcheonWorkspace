/**
 * From-scratch voice capture pipeline (no third-party audio libs).
 *
 * Mic → AudioContext → Analyser (FFT/RMS waveform) → energy VAD →
 * SpeechBackend (system speech today; local model later).
 */
import {
  computeRms,
  EnergyVad,
  frequencyToBars
} from '@shared/audio-dsp'

export type WaveformLevels = number[]

export interface VoiceEngineHandlers {
  onLevels: (levels: WaveformLevels) => void
  onInterim?: (text: string) => void
  onFinal?: (text: string) => void
  onError?: (message: string) => void
  onVad?: (speaking: boolean) => void
}

export interface SpeechBackend {
  readonly name: string
  start(handlers: {
    onInterim: (t: string) => void
    onFinal: (t: string) => void
    onError: (m: string) => void
  }): void
  stop(): void
}

export { computeRms, EnergyVad, frequencyToBars }

/**
 * System speech backend — uses Chromium's built-in recognition (OS-level service).
 * Not a npm library; still Tier-0 platform. Waveform/VAD remain ours.
 */
export class SystemSpeechBackend implements SpeechBackend {
  readonly name = 'system-speech'
  private rec: SpeechRecognition | null = null

  start(handlers: {
    onInterim: (t: string) => void
    onFinal: (t: string) => void
    onError: (m: string) => void
  }): void {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognition
      webkitSpeechRecognition?: new () => SpeechRecognition
    }
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) {
      handlers.onError(
        'No system speech engine. Mic capture still works; add a local ASR model later.'
      )
      return
    }
    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = navigator.language || 'en-US'
    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      let final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i]
        const t = r[0]?.transcript ?? ''
        if (r.isFinal) final += t
        else interim += t
      }
      if (final) handlers.onFinal(final)
      else if (interim) handlers.onInterim(interim)
    }
    rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
      if (ev.error === 'aborted' || ev.error === 'no-speech') return
      handlers.onError(ev.message || ev.error || 'Speech error')
    }
    rec.onend = () => {
      if (this.rec === rec) {
        try {
          rec.start()
        } catch {
          /* stopped */
        }
      }
    }
    try {
      rec.start()
      this.rec = rec
    } catch (err) {
      handlers.onError(err instanceof Error ? err.message : String(err))
    }
  }

  stop(): void {
    try {
      this.rec?.abort()
    } catch {
      /* ignore */
    }
    this.rec = null
  }
}

export class VoiceEngine {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private analyser: AnalyserNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private raf = 0
  private lastTs = 0
  private vad = new EnergyVad()
  private speech: SpeechBackend | null = null
  private running = false
  private freqBuf: Uint8Array | null = null
  private timeBuf: Float32Array | null = null

  constructor(
    private handlers: VoiceEngineHandlers,
    private barCount = 28
  ) {}

  get isRunning(): boolean {
    return this.running
  }

  async start(backend: SpeechBackend = new SystemSpeechBackend()): Promise<void> {
    if (this.running) return
    this.speech = backend

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
    } catch (err) {
      this.handlers.onError?.(
        err instanceof Error ? err.message : 'Microphone permission denied'
      )
      throw err
    }

    const ctx = new AudioContext()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.65
    source.connect(analyser)

    this.stream = stream
    this.ctx = ctx
    this.source = source
    this.analyser = analyser
    this.freqBuf = new Uint8Array(analyser.frequencyBinCount)
    this.timeBuf = new Float32Array(analyser.fftSize)
    this.running = true
    this.lastTs = performance.now()
    this.vad.reset()

    backend.start({
      onInterim: (t) => this.handlers.onInterim?.(t),
      onFinal: (t) => this.handlers.onFinal?.(t),
      onError: (m) => this.handlers.onError?.(m)
    })

    const tick = (ts: number): void => {
      if (!this.running || !this.analyser || !this.freqBuf || !this.timeBuf) return
      const dt = Math.min(50, ts - this.lastTs)
      this.lastTs = ts

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.analyser.getByteFrequencyData(this.freqBuf as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.analyser.getFloatTimeDomainData(this.timeBuf as any)

      const levels = frequencyToBars(this.freqBuf, this.barCount)
      this.handlers.onLevels(levels)

      const rms = computeRms(this.timeBuf)
      const { speaking, changed } = this.vad.update(rms, dt)
      if (changed) this.handlers.onVad?.(speaking)

      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.raf)
    this.speech?.stop()
    this.speech = null
    try {
      this.source?.disconnect()
    } catch {
      /* ignore */
    }
    try {
      void this.ctx?.close()
    } catch {
      /* ignore */
    }
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.ctx = null
    this.source = null
    this.analyser = null
    this.freqBuf = null
    this.timeBuf = null
    this.vad.reset()
    this.handlers.onLevels(new Array(this.barCount).fill(0.08))
  }
}

// Minimal SpeechRecognition types for SystemSpeechBackend
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
