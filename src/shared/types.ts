export type PaneType = 'shell' | 'ai_chat' | 'cli_agent'

export interface Workspace {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  layout: LayoutNode
  panes: Record<string, Pane>
  activePaneId?: string
  sidebarCollapsed?: boolean
  themeId?: string
}

export type LayoutNode =
  | { type: 'split'; direction: 'h' | 'v'; sizes: number[]; children: LayoutNode[] }
  | { type: 'tabs'; active: number; tabs: string[] }
  | { type: 'leaf'; paneId: string }

export interface Pane {
  id: string
  name: string
  color: string
  type: PaneType
  profileId?: string
  shell?: {
    shellId: string
    cwd: string
    scrollbackRef?: string
  }
  aiChat?: {
    providerId: string
    model: string
    systemPrompt: string
    threadId: string
    /** Context window size for this model (tokens). */
    contextLimit?: number
  }
  cli?: {
    command: string
    args: string[]
    env: Record<string, string>
    cwd: string
    lastExitCode?: number | null
  }
  /** Shared agent session metadata (tasks, tokens) — also persisted in session files. */
  agentSession?: AgentSessionMeta
}

/** Lightweight meta mirrored on the pane for chrome UI. */
export interface AgentSessionMeta {
  tokenUsed: number
  tokenLimit: number
  tasks: AgentTask[]
}

export interface AgentTask {
  id: string
  title: string
  done: boolean
  createdAt: string
  completedAt?: string
}

/** Token budget for a pane session. */
export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  limit: number
}

/** Compact durable project memory (summaries, not full chat dumps). */
export interface ProjectMemoryNote {
  id: string
  at: string
  text: string
  source: 'user' | 'assistant' | 'system' | 'compact'
}

export interface ProjectMemory {
  projectKey: string
  title: string
  model?: string
  providerId?: string
  notes: ProjectMemoryNote[]
  updatedAt: string
}

export interface AgentProfile {
  id: string
  name: string
  color: string
  icon?: string
  kind: PaneType
  defaults: Record<string, unknown>
}

export interface LayoutPreset {
  id: string
  name: string
  builtIn: boolean
  layout: LayoutNode
  paneTemplates?: Array<Partial<Pane> & { type: PaneType }>
}

export interface AppSettings {
  defaultShellId?: string
  themeId: string
  autosaveMs: number
  defaultWorkspaceId?: string
  /** Default AI provider id (matches `providers[].id`). */
  defaultProviderId?: string
  /** Default model string for new AI chat panes. */
  defaultModel?: string
  providers: Array<{ id: string; baseUrl?: string; label: string }>
}

/** Chat message roles for AI threads (persisted + IPC). */
export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}
