/**
 * From-scratch audio DSP helpers (no third-party libs).
 * Used by the renderer voice engine and unit tests.
 */

/** Compute RMS of a Float32 time-domain buffer. */
export function computeRms(samples: Float32Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i]
    sum += v * v
  }
  return Math.sqrt(sum / samples.length)
}

/**
 * Map analyser frequency data to N normalized bar heights (0..1).
 * Logarithmic band grouping.
 */
export function frequencyToBars(frequencyData: Uint8Array, barCount: number): number[] {
  const bars = new Array<number>(barCount).fill(0.08)
  if (frequencyData.length === 0 || barCount <= 0) return bars

  for (let i = 0; i < barCount; i++) {
    const t0 = i / barCount
    const t1 = (i + 1) / barCount
    const i0 = Math.floor(Math.pow(t0, 1.6) * frequencyData.length)
    const i1 = Math.max(i0 + 1, Math.floor(Math.pow(t1, 1.6) * frequencyData.length))
    let peak = 0
    for (let j = i0; j < i1 && j < frequencyData.length; j++) {
      if (frequencyData[j] > peak) peak = frequencyData[j]
    }
    const n = peak / 255
    bars[i] = Math.min(1, 0.08 + Math.pow(n, 0.7) * 0.92)
  }
  return bars
}

/** Energy-based voice activity detection. */
export class EnergyVad {
  private speaking = false
  private silenceMs = 0
  private speechMs = 0

  constructor(
    private readonly speechThreshold = 0.02,
    private readonly hangoverMs = 700,
    private readonly attackMs = 80
  ) {}

  update(rms: number, dtMs: number): { speaking: boolean; changed: boolean } {
    if (rms >= this.speechThreshold) {
      this.speechMs += dtMs
      this.silenceMs = 0
      if (!this.speaking && this.speechMs >= this.attackMs) {
        this.speaking = true
        return { speaking: true, changed: true }
      }
    } else {
      this.silenceMs += dtMs
      this.speechMs = 0
      if (this.speaking && this.silenceMs >= this.hangoverMs) {
        this.speaking = false
        return { speaking: false, changed: true }
      }
    }
    return { speaking: this.speaking, changed: false }
  }

  reset(): void {
    this.speaking = false
    this.silenceMs = 0
    this.speechMs = 0
  }
}

/** Linear-interpolation resample (from scratch) to target sample rate. */
export function resampleLinear(
  input: Float32Array,
  fromRate: number,
  toRate: number
): Float32Array {
  if (fromRate === toRate || input.length === 0) {
    return new Float32Array(input)
  }
  const ratio = fromRate / toRate
  const outLen = Math.max(1, Math.floor(input.length / ratio))
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio
    const i0 = Math.floor(src)
    const i1 = Math.min(i0 + 1, input.length - 1)
    const t = src - i0
    out[i] = input[i0] * (1 - t) + input[i1] * t
  }
  return out
}

/** Concatenate Float32 chunks into one buffer. */
export function concatFloat32(chunks: Float32Array[]): Float32Array {
  let n = 0
  for (const c of chunks) n += c.length
  const out = new Float32Array(n)
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  return out
}

/** Target rate for Whisper-class models. */
export const WHISPER_SAMPLE_RATE = 16_000
