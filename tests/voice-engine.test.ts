import { describe, it, expect } from 'vitest'
import { computeRms, frequencyToBars, EnergyVad } from '../src/shared/audio-dsp'

describe('voice DSP (from scratch)', () => {
  it('computeRms is zero for silence', () => {
    expect(computeRms(new Float32Array(128))).toBe(0)
  })

  it('computeRms rises with amplitude', () => {
    const loud = new Float32Array(128)
    loud.fill(0.5)
    expect(computeRms(loud)).toBeCloseTo(0.5, 5)
  })

  it('frequencyToBars returns fixed length and range', () => {
    const data = new Uint8Array(512)
    for (let i = 0; i < data.length; i++) data[i] = i % 256
    const bars = frequencyToBars(data, 28)
    expect(bars).toHaveLength(28)
    for (const b of bars) {
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThanOrEqual(1)
    }
  })

  it('EnergyVad opens after sustained energy', () => {
    const vad = new EnergyVad(0.02, 700, 80)
    let speaking = false
    for (let i = 0; i < 5; i++) {
      const r = vad.update(0.1, 20)
      speaking = r.speaking
    }
    expect(speaking).toBe(true)
  })

  it('EnergyVad closes after silence hangover', () => {
    const vad = new EnergyVad(0.02, 100, 20)
    vad.update(0.1, 30)
    vad.update(0.1, 30)
    expect(vad.update(0.1, 30).speaking).toBe(true)
    let speaking = true
    for (let i = 0; i < 10; i++) {
      speaking = vad.update(0.001, 20).speaking
    }
    expect(speaking).toBe(false)
  })
})
