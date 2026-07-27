export const IpcChannels = {
  workspaceList: 'workspace:list',
  workspaceGet: 'workspace:get',
  workspaceSave: 'workspace:save',
  workspaceCreate: 'workspace:create',
  workspaceDelete: 'workspace:delete',
  workspaceSetActive: 'workspace:setActive',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  ptySpawn: 'pty:spawn',
  ptyWrite: 'pty:write',
  ptyResize: 'pty:resize',
  ptyKill: 'pty:kill',
  ptyData: 'pty:data', // main → renderer event
  ptyExit: 'pty:exit',
  /** main → renderer: OAuth/login URL detected in CLI output */
  ptyLoginUrl: 'pty:loginUrl',
  sessionSaveScrollback: 'session:saveScrollback',
  sessionLoadScrollback: 'session:loadScrollback',
  aiChat: 'ai:chat',
  aiChatChunk: 'ai:chatChunk',
  /** renderer → main: abort an in-flight AI stream by requestId */
  aiChatCancel: 'ai:chatCancel',
  secretsSet: 'secrets:set',
  secretsHas: 'secrets:has',
  secretsDelete: 'secrets:delete',
  sessionSaveChat: 'session:saveChat',
  sessionLoadChat: 'session:loadChat',
  appReadyState: 'app:readyState',
  /** main → renderer: please flush dirty workspace before window closes */
  appBeforeQuitSave: 'app:before-quit-save',
  /** renderer → main: flush finished (or failed); close may proceed */
  appBeforeQuitSaveDone: 'app:before-quit-save-done',
  exportWorkspace: 'workspace:export',
  importWorkspace: 'workspace:import',
  presetsList: 'presets:list',
  presetsSave: 'presets:save',
  presetsUpsert: 'presets:upsert',
  profilesList: 'profiles:list',
  profilesSave: 'profiles:save',
  profilesUpsert: 'profiles:upsert',
  profilesDelete: 'profiles:delete',
  /** Open a URL in the OS default browser (terminal web links). */
  shellOpenExternal: 'shell:openExternal',
  /** Custom auto-updater (no electron-updater). */
  updateCheck: 'update:check',
  updateDownload: 'update:download',
  updateInstall: 'update:install',
  updateOpenRelease: 'update:openRelease',
  updateProgress: 'update:progress', // main → renderer
  updateAvailable: 'update:available' // main → renderer (startup silent check)
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]
