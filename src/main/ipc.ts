/** IPC surface exposed to the renderer. Keep this the only channel list. */
import { ipcMain, shell } from 'electron'
import { findGameInstall, detectBackend } from './services/steam'
import { CommunityNotFoundError, ThunderstoreUnavailableError } from './services/thunderstore'
import { ProfileStore } from './services/profiles'
import { buildLaunchPlan, steamLaunchOptions } from './services/launch'
import { Catalog } from './services/catalog'
import { Installer } from './services/installer'
import type { BrowseQuery, Failure, InstallProgress } from '../shared/types'

export const CHANNELS = {
  detectGame: 'game:detect',
  browse: 'catalog:browse',
  detail: 'catalog:detail',
  stats: 'catalog:stats',
  refresh: 'catalog:refresh',
  resolveMods: 'mods:resolve',
  listProfiles: 'profiles:list',
  createProfile: 'profiles:create',
  deleteProfile: 'profiles:delete',
  launchOptions: 'launch:options',
  openExternal: 'shell:open',
  install: 'mods:install',
  uninstall: 'mods:uninstall',
  installProgress: 'mods:install-progress',
} as const

/** Map thrown errors onto the discriminated union the UI switches on. */
function toFailure(error: unknown): Failure {
  if (error instanceof CommunityNotFoundError)
    return { ok: false, reason: 'no-community', message: error.message }
  if (error instanceof ThunderstoreUnavailableError)
    return { ok: false, reason: 'unavailable', message: error.message }
  return { ok: false, reason: 'error', message: error instanceof Error ? error.message : String(error) }
}

async function attempt<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, data: await fn() }
  } catch (error) {
    return toFailure(error)
  }
}

export function registerIpc(profileRoot: string, cacheDir: string): void {
  const profiles = new ProfileStore(profileRoot)
  const catalog = new Catalog()
  const installer = new Installer(catalog, profiles, cacheDir)

  ipcMain.handle(CHANNELS.detectGame, () => {
    const install = findGameInstall()
    if (!install) return null
    return { ...install, backend: detectBackend(install.root) }
  })

  ipcMain.handle(CHANNELS.browse, (_e, query: BrowseQuery, community?: string) =>
    attempt(() => catalog.browse(query, community)),
  )
  ipcMain.handle(CHANNELS.detail, (_e, fullName: string, community?: string) =>
    attempt(() => catalog.detail(fullName, community)),
  )
  ipcMain.handle(CHANNELS.stats, (_e, community?: string) =>
    attempt(() => catalog.stats(community)),
  )
  ipcMain.handle(CHANNELS.refresh, (_e, community?: string) =>
    attempt(() => catalog.load(community, true).then((s) => ({ packages: s.packages.length }))),
  )
  ipcMain.handle(CHANNELS.resolveMods, (_e, refs: string[], community?: string) =>
    attempt(() => catalog.resolve(refs, community)),
  )

  ipcMain.handle(CHANNELS.listProfiles, () => profiles.list())
  ipcMain.handle(CHANNELS.createProfile, (_e, name: string) => profiles.create(name))
  ipcMain.handle(CHANNELS.deleteProfile, (_e, id: string) => profiles.delete(id))

  ipcMain.handle(CHANNELS.launchOptions, (_e, profileId: string) => {
    const plan = buildLaunchPlan(profiles.dir(profileId))
    return { plan, steam: steamLaunchOptions(plan) }
  })

  ipcMain.handle(
    CHANNELS.install,
    (event, profileId: string, refs: string[], community?: string) =>
      attempt(() =>
        installer.install(profileId, refs, community, (progress: InstallProgress) => {
          // Streamed rather than returned so the UI can show per-package state
          // during what may be a multi-minute download.
          if (!event.sender.isDestroyed()) {
            event.sender.send(CHANNELS.installProgress, progress)
          }
        }),
      ),
  )

  ipcMain.handle(CHANNELS.uninstall, (_e, profileId: string, fullName: string) =>
    attempt(async () => installer.uninstall(profileId, fullName)),
  )

  ipcMain.handle(CHANNELS.openExternal, (_e, url: string) => {
    // Only ever open http(s) — the renderer must not be able to launch anything else.
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })
}
