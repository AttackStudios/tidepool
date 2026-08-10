/** IPC surface exposed to the renderer. Keep this the only channel list. */
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { findGameInstall } from './services/steam'
import { inspectGameFolder } from './services/gamefolder'
import { canLaunchDirectly, launchGame, steamRunUrl } from './services/launcher'
import { findUpdates } from './services/updates'
import { decodeProfile, encodeProfile, refsFor } from './services/profilecode'
import { analyseRemoval } from './services/dependents'
import type { LaunchMode } from './services/launcher'
import { SettingsStore } from './services/settings'
import { CommunityNotFoundError, ThunderstoreUnavailableError } from './services/thunderstore'
import { ProfileStore } from './services/profiles'
import { buildLaunchPlan, steamLaunchOptions } from './services/launch'
import { Catalog } from './services/catalog'
import { IndexCache } from './services/indexcache'
import { GameNotOnGameBananaError, fetchMods, findGameId } from './services/gamebanana'
import { Installer } from './services/installer'
import type {
  BrowseQuery,
  Failure,
  GameInstall,
  InstallProgress,
  Settings,
} from '../shared/types'

export const CHANNELS = {
  detectGame: 'game:detect',
  browse: 'catalog:browse',
  detail: 'catalog:detail',
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
  pickGameFolder: 'game:pick',
  clearGameFolder: 'game:clear',
  renameProfile: 'profiles:rename',
  duplicateProfile: 'profiles:duplicate',
  launchGame: 'launch:start',
  readSettings: 'settings:read',
  writeSettings: 'settings:write',
  launchViaSteam: 'launch:steam',
  setModEnabled: 'mods:set-enabled',
  checkUpdates: 'mods:check-updates',
  catalogStatus: 'catalog:status',
  analyseRemoval: 'mods:analyse-removal',
  exportProfile: 'profiles:export',
  importProfile: 'profiles:import',
} as const

/** Map thrown errors onto the discriminated union the UI switches on. */
function toFailure(error: unknown): Failure {
  if (error instanceof GameNotOnGameBananaError)
    return { ok: false, reason: 'no-community', message: error.message }
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

export function registerIpc(profileRoot: string, cacheDir: string, settingsFile: string): void {
  const profiles = new ProfileStore(profileRoot)
  const catalog = new Catalog(() => Date.now(), new IndexCache(join(cacheDir, 'index')))
  const installer = new Installer(catalog, profiles, cacheDir)
  const settings = new SettingsStore(settingsFile)

  /** Manual override wins, because it exists precisely for when detection is wrong. */
  const resolveGame = (): GameInstall | null => {
    const manual = settings.read().gamePath
    if (manual) {
      const folder = inspectGameFolder(manual)
      if (folder) {
        return {
          root: folder.root, source: 'manual', backend: folder.backend,
          executable: folder.executable, dataDir: folder.dataDir,
        }
      }
    }
    const found = findGameInstall()
    if (!found) return null
    const folder = inspectGameFolder(found.root)
    return {
      ...found,
      backend: folder?.backend ?? null,
      executable: folder?.executable ?? null,
      dataDir: folder?.dataDir ?? null,
    }
  }

  ipcMain.handle(CHANNELS.detectGame, () => resolveGame())

  ipcMain.handle(CHANNELS.pickGameFolder, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const picked = await (win
      ? dialog.showOpenDialog(win, { properties: ['openDirectory'] })
      : dialog.showOpenDialog({ properties: ['openDirectory'] }))
    const chosen = picked.filePaths[0]
    if (picked.canceled || !chosen) return { ok: true as const, data: resolveGame() }

    const folder = inspectGameFolder(chosen)
    if (!folder) {
      return {
        ok: false as const,
        reason: 'error' as const,
        message:
          "That folder doesn't look like a Unity game — it has no `<Name>_Data` folder inside. " +
          'Pick the folder containing the game executable.',
      }
    }
    settings.write({ gamePath: chosen })
    return { ok: true as const, data: resolveGame() }
  })

  ipcMain.handle(CHANNELS.clearGameFolder, () => {
    settings.write({ gamePath: null })
    return resolveGame()
  })

  ipcMain.handle(CHANNELS.readSettings, () => settings.read())
  ipcMain.handle(CHANNELS.writeSettings, (_e, patch: Partial<Settings>) => settings.write(patch))

  ipcMain.handle(CHANNELS.renameProfile, (_e, id: string, name: string) =>
    profiles.rename(id, name),
  )
  ipcMain.handle(CHANNELS.duplicateProfile, (_e, id: string, name?: string) =>
    profiles.duplicate(id, name),
  )

  ipcMain.handle(CHANNELS.launchGame, (_e, profileId: string, mode: LaunchMode = 'modded') =>
    attempt(async () => {
      const game = resolveGame()
      if (!game) throw new Error('No game folder set. Use "Locate game" to pick it.')
      const plan = buildLaunchPlan(profiles.dir(profileId))
      return launchGame(game.root, plan, mode)
    }),
  )

  /** The URL is built in main, so the renderer can never hand us an arbitrary protocol. */
  ipcMain.handle(
    CHANNELS.analyseRemoval,
    (_e, profileId: string, fullName: string, community?: string) =>
      attempt(async () => {
        const profile = profiles.read(profileId)
        if (!profile) throw new Error(`No such profile: ${profileId}`)
        return analyseRemoval(profile, fullName, catalog, community)
      }),
  )

  ipcMain.handle(CHANNELS.exportProfile, (_e, profileId: string, community?: string) =>
    attempt(async () => {
      const profile = profiles.read(profileId)
      if (!profile) throw new Error(`No such profile: ${profileId}`)
      return encodeProfile(profile, community)
    }),
  )

  ipcMain.handle(
    CHANNELS.importProfile,
    (event, code: string, community?: string) =>
      attempt(async () => {
        // Decode first: a bad code should fail before an empty profile is left behind.
        const decoded = decodeProfile(code)
        const created = profiles.create(decoded.name)
        const refs = refsFor(decoded)
        if (refs.length === 0) return { profile: created, result: null }

        const result = await installer.install(
          created.id,
          refs,
          decoded.community ?? community,
          (progress) => {
            if (!event.sender.isDestroyed()) event.sender.send(CHANNELS.installProgress, progress)
          },
        )
        // Honour whatever was disabled in the exported profile.
        for (const mod of decoded.mods) {
          if (!mod.enabled) installer.setEnabled(created.id, mod.fullName, false)
        }
        return { profile: profiles.read(created.id), result }
      }),
  )

  ipcMain.handle(CHANNELS.launchViaSteam, () =>
    attempt(async () => {
      await shell.openExternal(steamRunUrl())
      return { started: true, mode: 'steam' as const }
    }),
  )

  ipcMain.handle(CHANNELS.setModEnabled, (_e, profileId: string, fullName: string, on: boolean) =>
    attempt(async () => installer.setEnabled(profileId, fullName, on)),
  )

  ipcMain.handle(CHANNELS.checkUpdates, (_e, profileId: string, community?: string) =>
    attempt(async () => {
      const profile = profiles.read(profileId)
      if (!profile) throw new Error(`No such profile: ${profileId}`)
      return findUpdates(profile, catalog, community)
    }),
  )

  // GameBanana pages server-side and has no dependency data, so it is a separate
  // path rather than another community fed through the Thunderstore catalog.
  let gameBananaId: number | null = null

  ipcMain.handle(CHANNELS.browse, (_e, query: BrowseQuery, community?: string) =>
    attempt(async () => {
      if (query.source !== 'gamebanana') return catalog.browse(query, community)

      gameBananaId ??= await findGameId()
      const page = (query.page ?? 0) + 1
      const { items, total } = await fetchMods(gameBananaId, page)
      return {
        items,
        total,
        page: query.page ?? 0,
        pageSize: items.length || 15,
        categories: [],
      }
    }),
  )
  ipcMain.handle(CHANNELS.detail, (_e, fullName: string, community?: string) =>
    attempt(() => catalog.detail(fullName, community)),
  )
  ipcMain.handle(CHANNELS.catalogStatus, (_e, community?: string) =>
    attempt(() => catalog.status(community)),
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
    return {
      steam: steamLaunchOptions(plan),
      canLaunch: canLaunchDirectly(),
      profileDir: profiles.dir(profileId),
    }
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
