import { z } from 'zod'
import type { AppSettings, LayoutPreset, Workspace } from './types'

export const paneTypeSchema = z.enum(['shell', 'ai_chat', 'cli_agent'])

export const layoutNodeSchema: z.ZodType = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('split'),
      direction: z.enum(['h', 'v']),
      sizes: z.array(z.number()),
      children: z.array(layoutNodeSchema)
    }),
    z.object({
      type: z.literal('tabs'),
      active: z.number(),
      tabs: z.array(z.string())
    }),
    z.object({
      type: z.literal('leaf'),
      paneId: z.string()
    })
  ])
)

export const paneSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  type: paneTypeSchema,
  profileId: z.string().optional(),
  shell: z
    .object({
      shellId: z.string(),
      cwd: z.string(),
      scrollbackRef: z.string().optional()
    })
    .optional(),
  aiChat: z
    .object({
      providerId: z.string(),
      model: z.string(),
      systemPrompt: z.string(),
      threadId: z.string(),
      contextLimit: z.number().optional()
    })
    .optional(),
  cli: z
    .object({
      command: z.string(),
      args: z.array(z.string()),
      env: z.record(z.string()),
      cwd: z.string(),
      lastExitCode: z.number().nullable().optional()
    })
    .optional(),
  agentSession: z
    .object({
      tokenUsed: z.number(),
      tokenLimit: z.number(),
      tasks: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          done: z.boolean(),
          createdAt: z.string(),
          completedAt: z.string().optional()
        })
      )
    })
    .optional()
})

export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  layout: layoutNodeSchema,
  panes: z.record(paneSchema),
  activePaneId: z.string().optional(),
  sidebarCollapsed: z.boolean().optional(),
  themeId: z.string().optional()
})

export const agentProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  icon: z.string().optional(),
  kind: paneTypeSchema,
  defaults: z.record(z.unknown())
})

export const layoutPresetSchema = z.object({
  id: z.string(),
  name: z.string(),
  builtIn: z.boolean(),
  layout: layoutNodeSchema,
  paneTemplates: z
    .array(
      paneSchema.partial().extend({
        type: paneTypeSchema
      })
    )
    .optional()
})

export const appSettingsSchema = z.object({
  defaultShellId: z.string().optional(),
  themeId: z.string(),
  autosaveMs: z.number(),
  defaultWorkspaceId: z.string().optional(),
  defaultProviderId: z.string().optional(),
  defaultModel: z.string().optional(),
  providers: z.array(
    z.object({
      id: z.string(),
      baseUrl: z.string().optional(),
      label: z.string()
    })
  )
})

export function parseWorkspace(data: unknown): Workspace {
  return workspaceSchema.parse(data) as Workspace
}

export function safeParseWorkspace(data: unknown) {
  return workspaceSchema.safeParse(data)
}

export function parseLayoutPreset(data: unknown): LayoutPreset {
  return layoutPresetSchema.parse(data) as LayoutPreset
}

export function parseAppSettings(data: unknown): AppSettings {
  return appSettingsSchema.parse(data) as AppSettings
}
