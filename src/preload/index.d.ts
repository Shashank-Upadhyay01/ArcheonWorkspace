import type {
  AgentProfile,
  AppSettings,
  ChatMessage,
  LayoutPreset,
  Workspace
} from '../shared/types'

export interface WorkspaceSummary {
  id: string
  name: string
  updatedAt: string
}

export interface PtySpawnOptions {
  paneId: string
  shellId?: string
  cwd: string
  cols: number
  rows: number
  command?: string
  args?: string[]
  env?: Record<string, string>
}

export interface PtyDataEvent {
  sessionId: string
  data: string
}

export interface PtyExitEvent {
  sessionId: string
  exitCode: number
}

export interface ScrollbackKey {
  workspaceId: string
  paneId: string
}

export interface ChatThreadKey {
  workspaceId: string
  paneId: string
}

export interface ChatThread {
  messages: ChatMessage[]
}

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

export interface ArcheonApi {
  versions: {
    node: string
    chrome: string
    electron: string
  }
  workspace: {
    list(): Promise<WorkspaceSummary[]>
    get(id: string): Promise<Workspace | null>
    create(name: string): Promise<Workspace>
    save(ws: Workspace): Promise<void>
    delete(id: string): Promise<void>
    setActive(id: string): Promise<void>
    export(id: string): Promise<{ canceled: true } | { canceled: false; path: string }>
    import(): Promise<{ canceled: true } | { canceled: false; workspace: Workspace }>
  }
  settings: {
    get(): Promise<AppSettings>
    set(partial: Partial<AppSettings>): Promise<AppSettings>
  }
  presets: {
    list(): Promise<LayoutPreset[]>
    save(presets: LayoutPreset[]): Promise<LayoutPreset[]>
    upsert(preset: LayoutPreset): Promise<LayoutPreset[]>
  }
  profiles: {
    list(): Promise<AgentProfile[]>
    save(profiles: AgentProfile[]): Promise<AgentProfile[]>
    upsert(profile: AgentProfile): Promise<AgentProfile[]>
    delete(id: string): Promise<AgentProfile[]>
  }
  pty: {
    spawn(opts: PtySpawnOptions): Promise<{ sessionId: string }>
    write(sessionId: string, data: string): void
    resize(sessionId: string, cols: number, rows: number): void
    kill(sessionId: string): Promise<void>
    onData(cb: (event: PtyDataEvent) => void): () => void
    onExit(cb: (event: PtyExitEvent) => void): () => void
  }
  session: {
    saveScrollback(key: ScrollbackKey & { text: string }): Promise<void>
    loadScrollback(key: ScrollbackKey): Promise<string | null>
    saveChat(key: ChatThreadKey & { thread: ChatThread }): Promise<void>
    loadChat(key: ChatThreadKey): Promise<ChatThread | null>
  }
  secrets: {
    set(key: string, value: string): Promise<void>
    has(key: string): Promise<boolean>
    delete(key: string): Promise<void>
  }
  ai: {
    chat(req: AiChatRequest): Promise<{ ok: true; cancelled?: boolean }>
    /** Abort an in-flight stream by requestId. */
    cancel(requestId: string): void
    onChunk(cb: (event: AiChatChunkEvent) => void): () => void
  }
  app: {
    /** main → renderer: flush dirty state before window close. Returns unsubscribe. */
    onBeforeQuitSave(cb: () => void): () => void
    /** renderer → main: flush complete; close may proceed. */
    ackBeforeQuitSave(): void
  }
  shell: {
    /** Open http(s) URL in the OS default browser. */
    openExternal(url: string): Promise<void>
  }
}

declare global {
  interface Window {
    archeon: ArcheonApi
  }
}

export {}
