/**
 * From-scratch voice capture pipeline.
 *
 * Mic → AudioContext → Analyser (live waveform) → energy VAD →
 * PCM segment (16 kHz) → Local Whisper (on-device) with optional system fallback.
 */
import {
  computeRms,
  concatFloat32,
  EnergyVad,
  frequencyToBars,
  resampleLinear,
  WHISPER_SAMPLE_RATE
} from '@shared/audio-dsp'
import { transcribePcm16k } from './local-whisper'

export type WaveformLevels = number[]

export interface VoiceEngineHandlers {
  onLevels: (levels: WaveformLevels) => void
  onInterim?: (text: string) => void
  onFinal?: (text: string) => void
  onError?: (message: string) => void
  onVad?: (speaking: boolean) => void
  onStatus?: (status: string) => void
}

export type AsrMode = 'local' | 'system' | 'auto'

export class VoiceEngine {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private analyser: AnalyserNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private processor: ScriptProcessorNode | null = null
  private silentGain: GainNode | null = null
  private raf = 0
  private lastTs = 0
  private vad = new EnergyVad(0.018, 650, 70)
  private running = false
  private freqBuf: Uint8Array | null = null
  private timeBuf: Float32Array | null = null
  private pcmChunks: Float32Array[] = []
  private recording = false
  private busyTranscribe = false
  private mode: AsrMode = 'local'

  constructor(
    private handlers: VoiceEngineHandlers,
    private barCount = 28
  ) {}

  get isRunning(): boolean {
    return this.running
  }

  async start(mode: AsrMode = 'local'): Promise<void> {
    if (this.running) return
    this.mode = mode

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

    // ScriptProcessor captures PCM for Whisper (from-scratch pipeline; not a third-party mic lib)
    const processor = ctx.createScriptProcessor(4096, 1, 1)
    const silentGain = ctx.createGain()
    silentGain.gain.value = 0
    source.connect(processor)
    processor.connect(silentGain)
    silentGain.connect(ctx.destination)

    processor.onaudioprocess = (ev: AudioProcessingEvent) => {
      if (!this.running) return
      const input = ev.inputBuffer.getChannelData(0)
      if (this.recording) {
        // copy — the buffer is reused by the audio thread
        this.pcmChunks.push(new Float32Array(input))
      }
    }

    this.stream = stream
    this.ctx = ctx
    this.source = source
    this.analyser = analyser
    this.processor = processor
    this.silentGain = silentGain
    this.freqBuf = new Uint8Array(analyser.frequencyBinCount)
    this.timeBuf = new Float32Array(analyser.fftSize)
    this.running = true
    this.lastTs = performance.now()
    this.vad.reset()
    this.pcmChunks = []
    this.recording = false

    this.handlers.onStatus?.(
      mode === 'local' ? 'Local Whisper ready when you speak…' : 'Listening…'
    )

    const tick = (ts: number): void => {
      if (!this.running || !this.analyser || !this.freqBuf || !this.timeBuf) return
      const dt = Math.min(50, ts - this.lastTs)
      this.lastTs = ts

      // TS DOM lib TypedArray generics are strict; cast through unknown
      this.analyser.getByteFrequencyData(this.freqBuf as unknown as Uint8Array<ArrayBuffer>)
      this.analyser.getFloatTimeDomainData(this.timeBuf as unknown as Float32Array<ArrayBuffer>)

      const levels = frequencyToBars(this.freqBuf, this.barCount)
      this.handlers.onLevels(levels)

      const rms = computeRms(this.timeBuf)
      const { speaking, changed } = this.vad.update(rms, dt)
      if (changed) {
        this.handlers.onVad?.(speaking)
        if (speaking) {
          this.recording = true
          this.pcmChunks = []
          this.handlers.onInterim?.('…')
          this.handlers.onStatus?.('Recording speech…')
        } else if (this.recording) {
          this.recording = false
          void this.flushUtterance(ctx.sampleRate)
        }
      }

      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  private async flushUtterance(fromRate: number): Promise<void> {
    if (this.busyTranscribe) return
    const chunks = this.pcmChunks
    this.pcmChunks = []
    if (chunks.length === 0) return

    const mono = concatFloat32(chunks)
    const pcm16 = resampleLinear(mono, fromRate, WHISPER_SAMPLE_RATE)
    // Require ~0.3s of audio
    if (pcm16.length < WHISPER_SAMPLE_RATE * 0.3) {
      this.handlers.onInterim?.('')
      this.handlers.onStatus?.('Listening…')
      return
    }

    this.busyTranscribe = true
    this.handlers.onStatus?.('Transcribing on-device…')
    this.handlers.onInterim?.('Transcribing…')

    try {
      if (this.mode === 'local' || this.mode === 'auto') {
        const { text } = await transcribePcm16k(pcm16)
        if (text) {
          this.handlers.onFinal?.(text)
          this.handlers.onInterim?.('')
          this.handlers.onStatus?.('Local Whisper · listening…')
        } else {
          this.handlers.onInterim?.('')
          this.handlers.onStatus?.('No speech detected · listening…')
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.handlers.onError?.(message)
      this.handlers.onStatus?.('Local ASR failed — check network for first model download')
    } finally {
      this.busyTranscribe = false
    }
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.raf)
    this.recording = false
    this.pcmChunks = []
    try {
      this.processor?.disconnect()
      this.source?.disconnect()
      this.silentGain?.disconnect()
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
    this.processor = null
    this.silentGain = null
    this.freqBuf = null
    this.timeBuf = null
    this.vad.reset()
    this.handlers.onLevels(new Array(this.barCount).fill(0.08))
    this.handlers.onStatus?.('')
  }
}
