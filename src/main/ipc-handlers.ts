import { dialog, ipcMain, type WebContents } from 'electron'
import fs from 'fs'
import { IpcChannels } from '../shared/ipc'
import type {
  AgentProfile,
  AppSettings,
  ChatMessage,
  LayoutPreset,
  Workspace
} from '../shared/types'
import { AIClient, AiClientError } from './ai-client'
import type { PtyManager, PtySpawnOptions } from './pty-manager'
import {
  loadScrollback,
  saveScrollback,
  ScrollbackPathError
} from './session-scrollback'
import {
  ChatThreadPathError,
  loadChatThread,
  saveChatThread,
  type ChatThread
} from './session-chat'
import {
  apiKeySecretName,
  SecretsUnavailableError,
  type SecureStore
} from './secure-store'
import type { WorkspaceStore } from './workspace-store'

export interface AiChatRequest {
  requestId: string
  providerId: string
  model: string
  systemPrompt?: string
  messages: ChatMessage[]
}

export interface AiChatChunkEvent {
  requestId: string
  text?: string
  done?: boolean
  error?: string
}

export interface IpcHandlerDeps {
  store: WorkspaceStore
  pty: PtyManager
  sessionsDir: string
  secrets: SecureStore
  aiClient?: AIClient
  /** Called after a successful workspace save so recovery snapshot stays fresh. */
  onWorkspaceSaved?: () => void
}

/**
 * Register workspace + settings + PTY + session + secrets + AI IPC handlers.
 * Call once after the store / PtyManager / SecureStore are constructed on app ready.
 */
export function registerIpcHandlers(deps: IpcHandlerDeps): void {
  const { store, pty, sessionsDir, secrets, onWorkspaceSaved } = deps
  const aiClient = deps.aiClient ?? new AIClient()
  /** requestId → AbortController for in-flight AI streams */
  const aiAbortByRequest = new Map<string, AbortController>()

  const touchRecovery = (): void => {
    try {
      onWorkspaceSaved?.()
    } catch {
      /* best-effort */
    }
  }

  ipcMain.handle(IpcChannels.workspaceList, () => store.list())

  ipcMain.handle(IpcChannels.workspaceGet, (_event, id: string) => store.get(id))

  ipcMain.handle(IpcChannels.workspaceCreate, (_event, name: string) => {
    const ws = store.create(name)
    touchRecovery()
    return ws
  })

  ipcMain.handle(IpcChannels.workspaceSave, (_event, ws: Workspace) => {
    store.save(ws)
    touchRecovery()
  })

  ipcMain.handle(IpcChannels.workspaceDelete, (_event, id: string) => {
    store.delete(id)
    touchRecovery()
  })

  ipcMain.handle(IpcChannels.workspaceSetActive, (_event, id: string) => {
    store.setActive(id)
  })

  /** Export workspace JSON via save dialog (strips secrets in store). */
  ipcMain.handle(IpcChannels.exportWorkspace, async (_event, id: string) => {
    const json = store.exportWorkspace(id)
    if (json === null) {
      throw new Error(`Unknown workspace: ${id}`)
    }
    const ws = store.get(id)
    const defaultName = `${(ws?.name || 'workspace').replace(/[<>:"/\\|?*]+/g, '_')}.json`
    const result = await dialog.showSaveDialog({
      title: 'Export workspace',
      defaultPath: defaultName,
      filters: [
        { name: 'JSON', extensions: ['json'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (result.canceled || !result.filePath) {
      return { canceled: true as const }
    }
    fs.writeFileSync(result.filePath, json, 'utf8')
    return { canceled: false as const, path: result.filePath }
  })

  /** Import workspace JSON via open dialog; validates in store.importWorkspace. */
  ipcMain.handle(IpcChannels.importWorkspace, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import workspace',
      properties: ['openFile'],
      filters: [
        { name: 'JSON', extensions: ['json'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true as const }
    }
    const json = fs.readFileSync(result.filePaths[0], 'utf8')
    const workspace = store.importWorkspace(json)
    return { canceled: false as const, workspace }
  })

  ipcMain.handle(IpcChannels.settingsGet, () => store.getSettings())

  ipcMain.handle(IpcChannels.settingsSet, (_event, partial: Partial<AppSettings>) =>
    store.setSettings(partial)
  )

  ipcMain.handle(IpcChannels.presetsList, () => store.loadPresets())

  ipcMain.handle(IpcChannels.presetsSave, (_event, presets: LayoutPreset[]) =>
    store.savePresets(presets)
  )

  ipcMain.handle(IpcChannels.presetsUpsert, (_event, preset: LayoutPreset) =>
    store.upsertPreset(preset)
  )

  // ── Agent profiles (user-owned; built-ins live in renderer/shared) ──
  ipcMain.handle(IpcChannels.profilesList, () => store.loadProfiles())

  ipcMain.handle(IpcChannels.profilesSave, (_event, profiles: AgentProfile[]) =>
    store.saveProfiles(profiles)
  )

  ipcMain.handle(IpcChannels.profilesUpsert, (_event, profile: AgentProfile) =>
    store.upsertProfile(profile)
  )

  ipcMain.handle(IpcChannels.profilesDelete, (_event, id: string) => store.deleteProfile(id))

  // ── PTY ────────────────────────────────────────────────────
  ipcMain.handle(IpcChannels.ptySpawn, (_event, opts: PtySpawnOptions) => pty.spawn(opts))

  // High-frequency: fire-and-forget
  ipcMain.on(IpcChannels.ptyWrite, (_event, sessionId: string, data: string) => {
    if (typeof sessionId === 'string' && typeof data === 'string') {
      pty.write(sessionId, data)
    }
  })

  ipcMain.on(
    IpcChannels.ptyResize,
    (_event, sessionId: string, cols: number, rows: number) => {
      if (typeof sessionId === 'string') {
        pty.resize(sessionId, Number(cols) || 80, Number(rows) || 24)
      }
    }
  )

  ipcMain.handle(IpcChannels.ptyKill, (_event, sessionId: string) => {
    if (typeof sessionId === 'string') {
      pty.kill(sessionId)
    }
  })

  // ── Scrollback ─────────────────────────────────────────────
  ipcMain.handle(
    IpcChannels.sessionSaveScrollback,
    (
      _event,
      payload: { workspaceId: string; paneId: string; text: string }
    ) => {
      if (!payload?.workspaceId || !payload?.paneId) return
      try {
        saveScrollback(
          sessionsDir,
          { workspaceId: payload.workspaceId, paneId: payload.paneId },
          typeof payload.text === 'string' ? payload.text : ''
        )
      } catch (err) {
        if (err instanceof ScrollbackPathError) return
        throw err
      }
    }
  )

  ipcMain.handle(
    IpcChannels.sessionLoadScrollback,
    (_event, payload: { workspaceId: string; paneId: string }) => {
      if (!payload?.workspaceId || !payload?.paneId) return null
      try {
        return loadScrollback(sessionsDir, {
          workspaceId: payload.workspaceId,
          paneId: payload.paneId
        })
      } catch (err) {
        if (err instanceof ScrollbackPathError) return null
        throw err
      }
    }
  )

  // ── Chat thread persistence ────────────────────────────────
  ipcMain.handle(
    IpcChannels.sessionSaveChat,
    (_event, payload: { workspaceId: string; paneId: string; thread: ChatThread }) => {
      if (!payload?.workspaceId || !payload?.paneId || !payload?.thread) return
      try {
        saveChatThread(
          sessionsDir,
          { workspaceId: payload.workspaceId, paneId: payload.paneId },
          payload.thread
        )
      } catch (err) {
        if (err instanceof ChatThreadPathError) return
        throw err
      }
    }
  )

  ipcMain.handle(
    IpcChannels.sessionLoadChat,
    (_event, payload: { workspaceId: string; paneId: string }) => {
      if (!payload?.workspaceId || !payload?.paneId) return null
      try {
        return loadChatThread(sessionsDir, {
          workspaceId: payload.workspaceId,
          paneId: payload.paneId
        })
      } catch (err) {
        if (err instanceof ChatThreadPathError) return null
        throw err
      }
    }
  )

  // ── Secrets ────────────────────────────────────────────────
  ipcMain.handle(IpcChannels.secretsSet, (_event, key: string, value: string) => {
    if (typeof key !== 'string' || typeof value !== 'string') {
      throw new Error('secrets:set requires string key and value')
    }
    try {
      secrets.set(key, value)
    } catch (err) {
      throw serializeSecretError(err)
    }
  })

  ipcMain.handle(IpcChannels.secretsHas, (_event, key: string) => {
    if (typeof key !== 'string') return false
    try {
      return secrets.has(key)
    } catch (err) {
      throw serializeSecretError(err)
    }
  })

  ipcMain.handle(IpcChannels.secretsDelete, (_event, key: string) => {
    if (typeof key !== 'string') return
    try {
      secrets.delete(key)
    } catch (err) {
      throw serializeSecretError(err)
    }
  })

  // ── AI chat streaming ──────────────────────────────────────
  ipcMain.on(IpcChannels.aiChatCancel, (_event, requestId: string) => {
    if (typeof requestId !== 'string' || !requestId) return
    const ac = aiAbortByRequest.get(requestId)
    if (ac) ac.abort()
  })

  ipcMain.handle(IpcChannels.aiChat, async (event, req: AiChatRequest) => {
    if (!req?.requestId || typeof req.requestId !== 'string') {
      throw new Error('ai:chat requires requestId')
    }
    const sender = event.sender
    const requestId = req.requestId
    let terminalSent = false
    const ac = new AbortController()
    aiAbortByRequest.set(requestId, ac)

    const sendChunk = (payload: AiChatChunkEvent): void => {
      if (sender.isDestroyed()) return
      sender.send(IpcChannels.aiChatChunk, payload)
      if (payload.done) terminalSent = true
    }

    try {
      const providerId = typeof req.providerId === 'string' ? req.providerId : ''
      const model = typeof req.model === 'string' ? req.model : ''
      if (!providerId) throw new AiClientError('providerId is required')
      if (!model) throw new AiClientError('model is required')

      let apiKey: string | null
      try {
        apiKey = secrets.get(apiKeySecretName(providerId))
      } catch (err) {
        throw serializeSecretError(err)
      }

      if (!apiKey) {
        throw new AiClientError(
          'No API key configured for this provider. Open Settings and save an API key.'
        )
      }

      const settings = store.getSettings()
      const provider = settings.providers.find((p) => p.id === providerId)
      const baseUrl = provider?.baseUrl
      const messages = Array.isArray(req.messages) ? req.messages : []

      for await (const text of aiClient.chatStream({
        providerId,
        model,
        systemPrompt: typeof req.systemPrompt === 'string' ? req.systemPrompt : '',
        messages,
        apiKey,
        baseUrl,
        signal: ac.signal
      })) {
        if (ac.signal.aborted) break
        sendChunk({ requestId, text })
      }

      // Cancelled streams still close cleanly so the renderer can keep partial text.
      if (ac.signal.aborted) {
        sendChunk({ requestId, done: true })
        return { ok: true as const, cancelled: true as const }
      }

      sendChunk({ requestId, done: true })
      return { ok: true as const }
    } catch (err) {
      const cancelled =
        (err instanceof AiClientError && err.cancelled) || ac.signal.aborted
      if (cancelled) {
        if (!terminalSent) {
          sendChunk({ requestId, done: true })
        }
        return { ok: true as const, cancelled: true as const }
      }
      const message = err instanceof Error ? err.message : String(err)
      if (!terminalSent) {
        sendChunk({ requestId, done: true, error: message })
      }
      throw err instanceof Error ? err : new Error(message)
    } finally {
      aiAbortByRequest.delete(requestId)
    }
  })
}

/** Map secret errors to serializable Error with stable name in message. */
function serializeSecretError(err: unknown): Error {
  if (err instanceof SecretsUnavailableError) {
    const e = new Error(err.message)
    e.name = 'SecretsUnavailableError'
    return e
  }
  if (err instanceof Error) return err
  return new Error(String(err))
}

/** Exported for tests that need to drive chunk sends without full IPC. */
export function sendAiChatChunk(sender: WebContents, payload: AiChatChunkEvent): void {
  if (sender.isDestroyed()) return
  sender.send(IpcChannels.aiChatChunk, payload)
}
