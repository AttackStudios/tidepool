import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS } from './ipc'

/**
 * The renderer gets this narrow API and nothing else — no node integration, no
 * arbitrary ipcRenderer access. A mod manager reads and writes the user's game
 * folder, so the UI layer should never hold that power directly.
 */
const api = {
  detectGame: () => ipcRenderer.invoke(CHANNELS.detectGame),
  listPackages: (community?: string) => ipcRenderer.invoke(CHANNELS.listPackages, community),
  listProfiles: () => ipcRenderer.invoke(CHANNELS.listProfiles),
  createProfile: (name: string) => ipcRenderer.invoke(CHANNELS.createProfile, name),
  deleteProfile: (id: string) => ipcRenderer.invoke(CHANNELS.deleteProfile, id),
  resolveMods: (requested: string[], community?: string) =>
    ipcRenderer.invoke(CHANNELS.resolveMods, requested, community),
  launchOptions: (profileId: string) => ipcRenderer.invoke(CHANNELS.launchOptions, profileId),
}

contextBridge.exposeInMainWorld('tidepool', api)
export type TidePoolApi = typeof api
