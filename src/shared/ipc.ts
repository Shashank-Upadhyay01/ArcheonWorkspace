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
  sessionSaveScrollback: 'session:saveScrollback',
  sessionLoadScrollback: 'session:loadScrollback',
  aiChat: 'ai:chat',
  aiChatChunk: 'ai:chatChunk',
  secretsSet: 'secrets:set',
  secretsHas: 'secrets:has',
  secretsDelete: 'secrets:delete',
  appReadyState: 'app:readyState',
  /** main → renderer: please flush dirty workspace before window closes */
  appBeforeQuitSave: 'app:before-quit-save',
  /** renderer → main: flush finished (or failed); close may proceed */
  appBeforeQuitSaveDone: 'app:before-quit-save-done',
  exportWorkspace: 'workspace:export',
  importWorkspace: 'workspace:import',
  presetsList: 'presets:list',
  presetsSave: 'presets:save',
  presetsUpsert: 'presets:upsert'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]
