import { describe, it, expect, vi } from 'vitest'
import path from 'path'

// secure-store imports electron; stub for pure path helper tests
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s: string) => Buffer.from(s, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8')
  }
}))

import { secretFileName, secretFilePath, apiKeySecretName } from '../src/main/secure-store'

describe('secretFileName / secretFilePath', () => {
  it('maps colon keys to underscore filenames', () => {
    expect(secretFileName('apiKey:xai')).toBe('apiKey_xai.bin')
  })

  it('rejects empty / unsafe keys', () => {
    expect(() => secretFileName('')).toThrow(/Invalid secret key/)
    expect(() => secretFileName('../etc/passwd')).toThrow(/Invalid secret key/)
    expect(() => secretFileName('a/b')).toThrow(/Invalid secret key/)
  })

  it('keeps resolved path under secretsDir', () => {
    const root = path.resolve('/data/archeon/secrets')
    const file = secretFilePath(root, 'apiKey:openai-compatible')
    expect(file).toBe(path.join(root, 'apiKey_openai-compatible.bin'))
    expect(path.relative(root, file).startsWith('..')).toBe(false)
  })
})

describe('apiKeySecretName', () => {
  it('prefixes provider id', () => {
    expect(apiKeySecretName('xai')).toBe('apiKey:xai')
  })
})
