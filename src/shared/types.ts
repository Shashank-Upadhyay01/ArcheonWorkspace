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
  }
  cli?: {
    command: string
    args: string[]
    env: Record<string, string>
    cwd: string
    lastExitCode?: number | null
  }
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
  providers: Array<{ id: string; baseUrl?: string; label: string }>
}
