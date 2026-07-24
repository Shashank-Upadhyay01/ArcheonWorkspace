import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { createAutosave } from './autosave'
import { registerIpcHandlers } from './ipc-handlers'
import { WorkspaceStore } from './workspace-store'

let store: WorkspaceStore | null = null
let recoveryAutosave: ReturnType<typeof createAutosave> | null = null

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    title: 'Archeon Workspace',
    backgroundColor: '#0e1116',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function writeRecoverySnapshot(): void {
  if (!store) return
  const active = store.getActive()
  store.writeRecovery({
    activeWorkspaceId: active?.id,
    workspaces: store.loadAll()
  })
}

app.whenReady().then(() => {
  store = new WorkspaceStore(app.getPath('userData'))
  registerIpcHandlers(store)

  const settings = store.getSettings()
  recoveryAutosave = createAutosave(writeRecoverySnapshot, settings.autosaveMs)
  // Seed a recovery snapshot on boot
  recoveryAutosave.touch()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  recoveryAutosave?.flush()
  recoveryAutosave?.dispose()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
