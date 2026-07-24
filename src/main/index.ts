import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { IpcChannels } from '../shared/ipc'
import { createAutosave } from './autosave'
import { registerIpcHandlers } from './ipc-handlers'
import { WorkspaceStore } from './workspace-store'

let store: WorkspaceStore | null = null
let recoveryAutosave: ReturnType<typeof createAutosave> | null = null

/** Max wait for renderer flushSave ack before force-closing the window. */
const QUIT_SAVE_TIMEOUT_MS = 3000

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

  // Flush renderer dirty workspace before the window actually closes.
  // Flag prevents infinite close → preventDefault → close loops.
  let allowClose = false
  let saveInProgress = false

  mainWindow.on('close', (event) => {
    if (allowClose || mainWindow.isDestroyed()) {
      return
    }

    // No renderer to talk to — allow default close
    if (mainWindow.webContents.isDestroyed()) {
      return
    }

    event.preventDefault()
    if (saveInProgress) {
      return
    }
    saveInProgress = true

    const finish = (): void => {
      if (allowClose) return
      allowClose = true
      saveInProgress = false
      ipcMain.removeListener(IpcChannels.appBeforeQuitSaveDone, onDone)
      clearTimeout(timeout)
      if (!mainWindow.isDestroyed()) {
        mainWindow.close()
      }
    }

    const onDone = (): void => {
      finish()
    }

    const timeout = setTimeout(() => {
      // Renderer hung or never loaded — do not block quit forever
      finish()
    }, QUIT_SAVE_TIMEOUT_MS)

    ipcMain.once(IpcChannels.appBeforeQuitSaveDone, onDone)
    mainWindow.webContents.send(IpcChannels.appBeforeQuitSave)
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
