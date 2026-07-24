import { safeStorage } from 'electron'
import fs from 'fs'
import path from 'path'

/** Thrown when OS encryption (safeStorage) is not available. */
export class SecretsUnavailableError extends Error {
  constructor(message = 'OS secure encryption is unavailable; API keys cannot be stored') {
    super(message)
    this.name = 'SecretsUnavailableError'
  }
}

/** Reject unsafe secret key names (path traversal / odd characters). */
const SAFE_KEY_RE = /^[A-Za-z0-9._:-]+$/

/**
 * Sanitize a secret key for use as a filename under secretsDir.
 * Colons (common in `apiKey:providerId`) become underscores.
 */
export function secretFileName(key: string): string {
  if (!key || !SAFE_KEY_RE.test(key)) {
    throw new Error(`Invalid secret key: ${key}`)
  }
  return `${key.replace(/:/g, '_')}.bin`
}

/**
 * Build absolute secret file path and ensure it stays under secretsDir.
 */
export function secretFilePath(secretsDir: string, key: string): string {
  const root = path.resolve(secretsDir)
  const file = path.resolve(root, secretFileName(key))
  const relative = path.relative(root, file)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Secret path escapes secretsDir: ${file}`)
  }
  return file
}

/**
 * Encrypt/decrypt secrets via Electron safeStorage and persist under userData/secrets/.
 * Never stores plain-text keys on disk.
 */
export class SecureStore {
  constructor(private readonly secretsDir: string) {}

  private assertAvailable(): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new SecretsUnavailableError()
    }
  }

  set(key: string, value: string): void {
    this.assertAvailable()
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error('Secret value must be a non-empty string')
    }
    const file = secretFilePath(this.secretsDir, key)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const encrypted = safeStorage.encryptString(value)
    fs.writeFileSync(file, encrypted)
  }

  get(key: string): string | null {
    this.assertAvailable()
    const file = secretFilePath(this.secretsDir, key)
    if (!fs.existsSync(file)) return null
    try {
      const buf = fs.readFileSync(file)
      if (buf.length === 0) return null
      return safeStorage.decryptString(buf)
    } catch {
      return null
    }
  }

  has(key: string): boolean {
    this.assertAvailable()
    const file = secretFilePath(this.secretsDir, key)
    if (!fs.existsSync(file)) return false
    try {
      const st = fs.statSync(file)
      return st.isFile() && st.size > 0
    } catch {
      return false
    }
  }

  delete(key: string): void {
    this.assertAvailable()
    const file = secretFilePath(this.secretsDir, key)
    if (fs.existsSync(file)) {
      fs.unlinkSync(file)
    }
  }
}

/** Convention: one API key per provider id. */
export function apiKeySecretName(providerId: string): string {
  return `apiKey:${providerId}`
}
