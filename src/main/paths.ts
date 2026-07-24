import path from 'path'

export interface UserDataPaths {
  workspacesDir: string
  profilesPath: string
  presetsPath: string
  sessionsDir: string
  recoveryDir: string
  settingsPath: string
}

/** Resolve standard persistence paths under Electron `userData` (or a test root). */
export function getUserDataPaths(userData: string): UserDataPaths {
  return {
    workspacesDir: path.join(userData, 'workspaces'),
    profilesPath: path.join(userData, 'profiles.json'),
    presetsPath: path.join(userData, 'presets.json'),
    sessionsDir: path.join(userData, 'sessions'),
    recoveryDir: path.join(userData, 'recovery'),
    settingsPath: path.join(userData, 'settings.json')
  }
}
