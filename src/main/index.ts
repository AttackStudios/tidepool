import { app, BrowserWindow, Menu, nativeImage, shell } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc'

const APP_NAME = 'TidePool'
const isDev = !app.isPackaged

/**
 * Set before `whenReady`, otherwise macOS shows "Electron" in the menu bar and
 * in the About panel during development.
 */
app.setName(APP_NAME)

function resource(...parts: string[]): string {
  // Packaged builds run from dist/main; in dev the repo root is two levels up.
  return join(__dirname, '..', '..', ...parts)
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 940,
    minHeight: 620,
    title: APP_NAME,
    backgroundColor: '#07171d',
    icon: process.platform === 'linux' ? resource('build', 'icon.png') : undefined,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // The renderer's <title> would otherwise overwrite the window title on load.
  win.on('page-title-updated', (event) => event.preventDefault())

  // Anything trying to open a new window goes to the user's browser instead.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function applyMacIdentity(): void {
  if (process.platform !== 'darwin' || !app.dock) return
  // Packaged builds get the icon from the bundle; in dev we set it by hand so
  // the Dock doesn't show the stock Electron icon.
  const icon = nativeImage.createFromPath(resource('build', 'icon.png'))
  if (!icon.isEmpty()) app.dock.setIcon(icon)
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin'
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac
        ? [{
            label: APP_NAME,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          }]
        : []),
      { label: 'File', submenu: [isMac ? { role: 'close' as const } : { role: 'quit' as const }] },
      { label: 'Edit', role: 'editMenu' as const },
      { label: 'View', role: 'viewMenu' as const },
      { label: 'Window', role: 'windowMenu' as const },
    ]),
  )
}

void app.whenReady().then(() => {
  app.setAboutPanelOptions({
    applicationName: APP_NAME,
    applicationVersion: app.getVersion(),
    copyright: 'Mod manager for Surf Sandbox',
  })
  applyMacIdentity()
  buildMenu()
  registerIpc(
    join(app.getPath('userData'), 'profiles'),
    join(app.getPath('userData'), 'cache'),
    join(app.getPath('userData'), 'settings.json'),
  )
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
