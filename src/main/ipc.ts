/** IPC surface exposed to the renderer. Keep this the only channel list. */
import { ipcMain } from 'electron'
import { findGameInstall, detectBackend } from './services/steam'
import {
  fetchPackages,
  CommunityNotFoundError,
  ThunderstoreUnavailableError,
} from './services/thunderstore'
import { ProfileStore } from './services/profiles'
import { buildLaunchPlan, steamLaunchOptions } from './services/launch'
import { resolve, indexPackages } from '../shared/deps'

export const CHANNELS = {
  detectGame: 'game:detect',
  listPackages: 'packages:list',
  listProfiles: 'profiles:list',
  createProfile: 'profiles:create',
  deleteProfile: 'profiles:delete',
  resolveMods: 'mods:resolve',
  launchOptions: 'launch:options',
} as const

export function registerIpc(profileRoot: string): void {
  const profiles = new ProfileStore(profileRoot)

  ipcMain.handle(CHANNELS.detectGame, () => {
    const install = findGameInstall()
    if (!install) return null
    return { ...install, backend: detectBackend(install.root) }
  })

  ipcMain.handle(CHANNELS.listPackages, async (_e, community?: string) => {
    try {
      return { ok: true as const, packages: await fetchPackages({ community }) }
    } catch (error) {
      // A missing community is the expected state before launch, not a crash.
      if (error instanceof CommunityNotFoundError) {
        return { ok: false as const, reason: 'no-community' as const, message: error.message }
      }
      if (error instanceof ThunderstoreUnavailableError) {
        return { ok: false as const, reason: 'unavailable' as const, message: error.message }
      }
      return { ok: false as const, reason: 'error' as const, message: String(error) }
    }
  })

  ipcMain.handle(CHANNELS.listProfiles, () => profiles.list())
  ipcMain.handle(CHANNELS.createProfile, (_e, name: string) => profiles.create(name))
  ipcMain.handle(CHANNELS.deleteProfile, (_e, id: string) => profiles.delete(id))

  ipcMain.handle(CHANNELS.resolveMods, async (_e, requested: string[], community?: string) => {
    const packages = await fetchPackages({ community })
    return resolve(requested, indexPackages(packages))
  })

  ipcMain.handle(CHANNELS.launchOptions, (_e, profileId: string) => {
    const plan = buildLaunchPlan(profiles.dir(profileId))
    return { plan, steam: steamLaunchOptions(plan) }
  })
}
