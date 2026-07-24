import type { AppSettings, Workspace } from '../shared/types'

export interface WorkspaceSummary {
  id: string
  name: string
  updatedAt: string
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
    export(id: string): Promise<string>
    import(json: string): Promise<Workspace>
  }
  settings: {
    get(): Promise<AppSettings>
    set(partial: Partial<AppSettings>): Promise<AppSettings>
  }
  on?: never
}

declare global {
  interface Window {
    archeon: ArcheonApi
  }
}

export {}
