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
  aiChat: 'ai:chat',
  aiChatChunk: 'ai:chatChunk',
  secretsSet: 'secrets:set',
  secretsHas: 'secrets:has',
  secretsDelete: 'secrets:delete',
  appReadyState: 'app:readyState',
  exportWorkspace: 'workspace:export',
  importWorkspace: 'workspace:import'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]
