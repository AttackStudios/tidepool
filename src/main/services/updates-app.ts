/**
 * Keeping TidePool itself up to date.
 *
 * Without this, whatever build someone first downloads is the build they keep.
 * On launch day that matters more than usual: the first release will need
 * patching within hours, and the people on it are the early adopters most
 * likely to write mods.
 */
import { app, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; percent: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string }

export const UPDATE_CHANNEL = 'app:update-state'

/** Is this build itself a prerelease, e.g. 0.1.0-rc.5? */
export function isPrerelease(version: string): boolean {
  return version.includes('-')
}

export function initAutoUpdate(getWindow: () => BrowserWindow | null): void {
  // An unpackaged run has no update to install and electron-updater throws.
  if (!app.isPackaged) return

  // Someone running an rc should be offered the next rc, not told they are
  // already current until a stable ships.
  autoUpdater.allowPrerelease = isPrerelease(app.getVersion())
  autoUpdater.autoDownload = true
  // Installing behind the user's back on quit is rude for a tool they may be
  // mid-install with; the UI offers a restart instead.
  autoUpdater.autoInstallOnAppQuit = true

  const send = (state: UpdateState) => {
    const win = getWindow()
    if (win && !win.isDestroyed()) win.webContents.send(UPDATE_CHANNEL, state)
  }

  autoUpdater.on('checking-for-update', () => send({ status: 'checking' }))
  autoUpdater.on('update-available', (i) => send({ status: 'available', version: i.version }))
  autoUpdater.on('update-not-available', () => send({ status: 'idle' }))
  autoUpdater.on('download-progress', (p) =>
    send({ status: 'downloading', percent: Math.round(p.percent) }),
  )
  autoUpdater.on('update-downloaded', (i) => send({ status: 'ready', version: i.version }))
  autoUpdater.on('error', (err) =>
    // A failed update check must never be fatal — being offline is normal.
    send({ status: 'error', message: err?.message ?? 'Update check failed' }),
  )

  void autoUpdater.checkForUpdates().catch(() => undefined)
  // Long sessions are common while modding; look again every few hours.
  setInterval(() => void autoUpdater.checkForUpdates().catch(() => undefined), 6 * 60 * 60 * 1000)
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}
