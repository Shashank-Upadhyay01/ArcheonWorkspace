/**
 * On-device ASR using Whisper-tiny (pretrained weights via transformers.js / ONNX).
 *
 * Our product code owns capture, VAD, resample, and backend selection.
 * Model weights are pretrained (like using a GPU driver) — inference runs fully local
 * after the first download into the browser cache.
 */
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@xenova/transformers'
import { WHISPER_SAMPLE_RATE } from '@shared/audio-dsp'

export type WhisperLoadState =
  | { status: 'idle' }
  | { status: 'loading'; progress: number; file?: string }
  | { status: 'ready' }
  | { status: 'error'; message: string }

// Prefer local cache; allow remote download of model files on first use
env.allowLocalModels = false
env.useBrowserCache = true

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null
let loadState: WhisperLoadState = { status: 'idle' }
const loadListeners = new Set<(s: WhisperLoadState) => void>()

function setLoadState(next: WhisperLoadState): void {
  loadState = next
  for (const l of loadListeners) l(next)
}

export function getWhisperLoadState(): WhisperLoadState {
  return loadState
}

export function onWhisperLoadState(cb: (s: WhisperLoadState) => void): () => void {
  loadListeners.add(cb)
  cb(loadState)
  return () => {
    loadListeners.delete(cb)
  }
}

/**
 * Lazy-load Whisper tiny English model (~40MB first download).
 */
export async function getWhisperTranscriber(): Promise<AutomaticSpeechRecognitionPipeline> {
  if (!transcriberPromise) {
    setLoadState({ status: 'loading', progress: 0 })
    transcriberPromise = pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-tiny.en',
      {
        progress_callback: (p: {
          status?: string
          progress?: number
          file?: string
        }) => {
          if (typeof p.progress === 'number') {
            setLoadState({
              status: 'loading',
              progress: Math.min(100, Math.max(0, p.progress)),
              file: p.file
            })
          }
        }
      }
    )
      .then((pipe) => {
        setLoadState({ status: 'ready' })
        return pipe as AutomaticSpeechRecognitionPipeline
      })
      .catch((err) => {
        transcriberPromise = null
        const message = err instanceof Error ? err.message : String(err)
        setLoadState({ status: 'error', message })
        throw err
      })
  }
  return transcriberPromise
}

export interface TranscribeResult {
  text: string
}

/**
 * Transcribe mono Float32 PCM at 16 kHz.
 */
export async function transcribePcm16k(audio: Float32Array): Promise<TranscribeResult> {
  if (audio.length < WHISPER_SAMPLE_RATE * 0.25) {
    // Too short (<250ms) — ignore
    return { text: '' }
  }
  const asr = await getWhisperTranscriber()
  const result = await asr(audio, {
    // chunking helps longer utterances
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: false
  })
  const text =
    typeof result === 'object' && result && 'text' in result
      ? String((result as { text: string }).text || '').trim()
      : ''
  return { text }
}

/** Warm the model in the background (optional). */
export function preloadWhisper(): void {
  void getWhisperTranscriber().catch(() => {
    /* surfaced via load state */
  })
}
