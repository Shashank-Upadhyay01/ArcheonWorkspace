import { useEffect, useState } from 'react'
import { getArcheonApi } from '../lib/ipc'
import { useAppStore } from '../stores/app-store'

function apiKeySecretName(providerId: string): string {
  return `apiKey:${providerId}`
}

export interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

export default function SettingsModal({ open, onClose }: SettingsModalProps): JSX.Element | null {
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)

  const providers = settings?.providers ?? []
  const [providerId, setProviderId] = useState(
    settings?.defaultProviderId ?? providers[0]?.id ?? 'xai'
  )
  const [model, setModel] = useState(settings?.defaultModel ?? 'grok-2-latest')
  const [apiKey, setApiKey] = useState('')
  const [keyConfigured, setKeyConfigured] = useState(false)
  const [secretsUnavailable, setSecretsUnavailable] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Sync local fields when modal opens / settings load
  useEffect(() => {
    if (!open || !settings) return
    setProviderId(settings.defaultProviderId ?? settings.providers[0]?.id ?? 'xai')
    setModel(settings.defaultModel ?? 'grok-2-latest')
    setApiKey('')
    setStatus(null)
  }, [open, settings])

  // Check whether a key is stored for the selected provider
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const api = getArcheonApi()
        const has = await api.secrets.has(apiKeySecretName(providerId))
        if (!cancelled) {
          setKeyConfigured(has)
          setSecretsUnavailable(false)
        }
      } catch (err) {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('unavailable') || msg.includes('SecretsUnavailable')) {
          setSecretsUnavailable(true)
          setKeyConfigured(false)
        } else {
          setKeyConfigured(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, providerId])

  if (!open) return null

  async function handleSave(): Promise<void> {
    setSaving(true)
    setStatus(null)
    try {
      await updateSettings({
        defaultProviderId: providerId,
        defaultModel: model.trim() || 'grok-2-latest'
      })

      const trimmedKey = apiKey.trim()
      if (trimmedKey) {
        const api = getArcheonApi()
        await api.secrets.set(apiKeySecretName(providerId), trimmedKey)
        setApiKey('')
        setKeyConfigured(true)
        setSecretsUnavailable(false)
        setStatus('API key saved securely.')
      } else {
        setStatus('Settings saved.')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('unavailable') || msg.includes('SecretsUnavailable')) {
        setSecretsUnavailable(true)
        setStatus(msg)
      } else {
        setStatus(msg)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleClearKey(): Promise<void> {
    setSaving(true)
    setStatus(null)
    try {
      const api = getArcheonApi()
      await api.secrets.delete(apiKeySecretName(providerId))
      setKeyConfigured(false)
      setApiKey('')
      setStatus('API key removed.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('unavailable') || msg.includes('SecretsUnavailable')) {
        setSecretsUnavailable(true)
      }
      setStatus(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="settings-title" className="modal-title">
            Settings
          </h2>
          <button type="button" className="sidebar-icon-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {secretsUnavailable ? (
            <div className="settings-warn" role="alert">
              OS secure encryption is unavailable. API keys cannot be stored on this system.
            </div>
          ) : null}

          <label className="settings-field">
            <span className="settings-label">AI provider</span>
            <select
              className="settings-select"
              value={providerId}
              onChange={(e) => {
                setProviderId(e.target.value)
                setApiKey('')
                setStatus(null)
              }}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-field">
            <span className="settings-label">Default model</span>
            <input
              className="settings-input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. grok-2-latest"
              spellCheck={false}
            />
          </label>

          <label className="settings-field">
            <span className="settings-label">
              API key
              {keyConfigured ? (
                <span className="settings-key-badge">configured</span>
              ) : (
                <span className="settings-key-badge settings-key-badge--missing">not set</span>
              )}
            </span>
            <input
              className="settings-input"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={keyConfigured ? '••••••••  (enter new key to replace)' : 'Paste API key'}
              disabled={secretsUnavailable}
              spellCheck={false}
            />
            <span className="settings-hint">
              Write-only: the stored key is never shown. Keys use OS encryption (safeStorage).
            </span>
          </label>

          {status ? <p className="settings-status">{status}</p> : null}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={saving || secretsUnavailable || !keyConfigured}
            onClick={() => void handleClearKey()}
          >
            Clear key
          </button>
          <div className="modal-footer-spacer" />
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
            Close
          </button>
          <button
            type="button"
            className="btn btn--accent"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
