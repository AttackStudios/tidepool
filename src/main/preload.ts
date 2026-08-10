import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS } from './ipc'
import type { BrowseQuery, InstallProgress, Settings } from '../shared/types'

/**
 * The renderer gets this narrow API and nothing else — no node integration, no
 * arbitrary ipcRenderer access. A mod manager reads and writes the user's game
 * folder, so the UI layer should never hold that power directly.
 */
const api = {
  /** Renderer needs this to reserve room for the macOS window buttons. */
  platform: process.platform,
  /**
   * True only in an unpackaged build. Gates development affordances — chiefly
   * the other-community picker, which would be baffling in a shipped app.
   *
   * Read from argv because main passes it via `additionalArguments`; the preload
   * runs in the renderer process, where main's environment is not guaranteed.
   */
  isDev: !process.argv.includes('--tidepool-packaged'),
  detectGame: () => ipcRenderer.invoke(CHANNELS.detectGame),
  browse: (query: BrowseQuery, community?: string) =>
    ipcRenderer.invoke(CHANNELS.browse, query, community),
  detail: (fullName: string, community?: string) =>
    ipcRenderer.invoke(CHANNELS.detail, fullName, community),
  refresh: (community?: string) => ipcRenderer.invoke(CHANNELS.refresh, community),
  catalogStatus: (community?: string) => ipcRenderer.invoke(CHANNELS.catalogStatus, community),
  resolveMods: (refs: string[], community?: string) =>
    ipcRenderer.invoke(CHANNELS.resolveMods, refs, community),
  listProfiles: () => ipcRenderer.invoke(CHANNELS.listProfiles),
  createProfile: (name: string) => ipcRenderer.invoke(CHANNELS.createProfile, name),
  deleteProfile: (id: string) => ipcRenderer.invoke(CHANNELS.deleteProfile, id),
  launchOptions: (profileId: string) => ipcRenderer.invoke(CHANNELS.launchOptions, profileId),
  openExternal: (url: string) => ipcRenderer.invoke(CHANNELS.openExternal, url),
  install: (profileId: string, refs: string[], community?: string) =>
    ipcRenderer.invoke(CHANNELS.install, profileId, refs, community),
  uninstall: (profileId: string, fullName: string) =>
    ipcRenderer.invoke(CHANNELS.uninstall, profileId, fullName),
  pickGameFolder: () => ipcRenderer.invoke(CHANNELS.pickGameFolder),
  clearGameFolder: () => ipcRenderer.invoke(CHANNELS.clearGameFolder),
  renameProfile: (id: string, name: string) => ipcRenderer.invoke(CHANNELS.renameProfile, id, name),
  duplicateProfile: (id: string, name?: string) =>
    ipcRenderer.invoke(CHANNELS.duplicateProfile, id, name),
  launchGame: (profileId: string, mode?: 'modded' | 'vanilla') =>
    ipcRenderer.invoke(CHANNELS.launchGame, profileId, mode),
  launchViaSteam: () => ipcRenderer.invoke(CHANNELS.launchViaSteam),
  exportProfile: (profileId: string, community?: string) =>
    ipcRenderer.invoke(CHANNELS.exportProfile, profileId, community),
  importProfile: (code: string, community?: string) =>
    ipcRenderer.invoke(CHANNELS.importProfile, code, community),
  setModEnabled: (profileId: string, fullName: string, enabled: boolean) =>
    ipcRenderer.invoke(CHANNELS.setModEnabled, profileId, fullName, enabled),
  checkUpdates: (profileId: string, community?: string) =>
    ipcRenderer.invoke(CHANNELS.checkUpdates, profileId, community),
  readSettings: () => ipcRenderer.invoke(CHANNELS.readSettings),
  writeSettings: (patch: Partial<Settings>) => ipcRenderer.invoke(CHANNELS.writeSettings, patch),
  /** Subscribe to install progress. Returns an unsubscribe function. */
  onInstallProgress: (handler: (progress: InstallProgress) => void) => {
    const listener = (_e: unknown, progress: InstallProgress) => handler(progress)
    ipcRenderer.on(CHANNELS.installProgress, listener)
    return () => { ipcRenderer.removeListener(CHANNELS.installProgress, listener) }
  },
}

contextBridge.exposeInMainWorld('tidepool', api)
export type TidePoolApi = typeof api
