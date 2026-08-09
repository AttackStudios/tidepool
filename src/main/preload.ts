import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS } from './ipc'
import type { BrowseQuery } from '../shared/types'

/**
 * The renderer gets this narrow API and nothing else — no node integration, no
 * arbitrary ipcRenderer access. A mod manager reads and writes the user's game
 * folder, so the UI layer should never hold that power directly.
 */
const api = {
  detectGame: () => ipcRenderer.invoke(CHANNELS.detectGame),
  browse: (query: BrowseQuery, community?: string) =>
    ipcRenderer.invoke(CHANNELS.browse, query, community),
  detail: (fullName: string, community?: string) =>
    ipcRenderer.invoke(CHANNELS.detail, fullName, community),
  stats: (community?: string) => ipcRenderer.invoke(CHANNELS.stats, community),
  refresh: (community?: string) => ipcRenderer.invoke(CHANNELS.refresh, community),
  resolveMods: (refs: string[], community?: string) =>
    ipcRenderer.invoke(CHANNELS.resolveMods, refs, community),
  listProfiles: () => ipcRenderer.invoke(CHANNELS.listProfiles),
  createProfile: (name: string) => ipcRenderer.invoke(CHANNELS.createProfile, name),
  deleteProfile: (id: string) => ipcRenderer.invoke(CHANNELS.deleteProfile, id),
  launchOptions: (profileId: string) => ipcRenderer.invoke(CHANNELS.launchOptions, profileId),
  openExternal: (url: string) => ipcRenderer.invoke(CHANNELS.openExternal, url),
}

contextBridge.exposeInMainWorld('tidepool', api)
export type TidePoolApi = typeof api
