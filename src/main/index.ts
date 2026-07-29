import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { IpcChannels } from '../shared/ipc'
import { createAutosave } from './autosave'
import { registerIpcHandlers } from './ipc-handlers'
import { getUserDataPaths } from './paths'
import { PtyManager } from './pty-manager'
import { SecureStore } from './secure-store'
import { WorkspaceStore } from './workspace-store'
import { AppUpdater } from './updater'

let store: WorkspaceStore | null = null
let ptyManager: PtyManager | null = null
let recoveryAutosave: ReturnType<typeof createAutosave> | null = null

/** Max wait for renderer flushSave ack before force-closing the window. */
const QUIT_SAVE_TIMEOUT_MS = 3000

/**
 * Immersive UI: no File/Edit/View/Window/Help chrome on Windows/Linux.
 * Standard cut/copy/paste/selectAll still work via Chromium accelerators in inputs.
 * On macOS, keep a minimal Edit menu (platform convention + shortcuts).
 */
function installApplicationMenu(): void {
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        { role: 'appMenu' },
        {
          label: 'Edit',
          submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'selectAll' }
          ]
        }
      ])
    )
    return
  }
  // Hide the default menu strip entirely (the immersion breaker).
  Menu.setApplicationMenu(null)
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    title: 'Archeon Workspace',
    backgroundColor: '#0e1116',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // Ensure no per-window menu reappears on Windows/Linux
  if (process.platform !== 'darwin') {
    mainWindow.setMenuBarVisibility(false)
    mainWindow.setMenu(null)
  }

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
  installApplicationMenu()

  const userData = app.getPath('userData')
  store = new WorkspaceStore(userData)
  ptyManager = new PtyManager()
  const { sessionsDir, secretsDir } = getUserDataPaths(userData)
  const secrets = new SecureStore(secretsDir)

  const settings = store.getSettings()
  recoveryAutosave = createAutosave(writeRecoverySnapshot, settings.autosaveMs)
  // Seed a recovery snapshot on boot (also rewritten on every workspace save)
  recoveryAutosave.touch()

  const updater = new AppUpdater()

  registerIpcHandlers({
    store,
    pty: ptyManager,
    sessionsDir,
    secrets,
    updater,
    onWorkspaceSaved: () => {
      // Debounced snapshot on save so crash recovery stays current without
      // writing on every keystroke path that does not yet persist.
      recoveryAutosave?.touch()
    }
  })

  createWindow()

  // Silent update check a few seconds after launch (notify only if newer).
  setTimeout(() => {
    void (async () => {
      try {
        const result = await updater.checkForUpdates()
        if (!result.updateAvailable || !result.info) return
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) {
            win.webContents.send(IpcChannels.updateAvailable, result)
          }
        }
      } catch {
        /* offline / no releases — ignore */
      }
    })()
  }, 8000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  ptyManager?.killAll()
  recoveryAutosave?.flush()
  recoveryAutosave?.dispose()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
