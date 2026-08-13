/**
 * Installing and removing mods within a profile.
 *
 * Deliberately independent of the game: installing is download-and-unpack into
 * a profile folder, so the whole pipeline is exercisable before Surf Sandbox
 * ships. Only *launching* needs the game.
 */
import { existsSync, renameSync, rmSync, rmdirSync, readdirSync } from 'node:fs'
import { dirname, relative, sep } from 'node:path'
import type {
  DependencyRef,
  InstallProgress,
  InstallResult,
  InstalledMod,
} from '../../shared/types'
import { parseRef } from '../../shared/deps'
import type { Catalog } from './catalog'
import type { ProfileStore } from './profiles'
import { downloadPackage, extractInto } from './install'

export type ProgressFn = (progress: InstallProgress) => void

/** Suffix applied to a disabled mod's DLLs so BepInEx stops loading them. */
export const DISABLED_SUFFIX = '.disabled'

export class Installer {
  /**
   * One promise chain per profile, so mutations queue instead of racing.
   *
   * Every mutating path is read-modify-write on profile.json. Two overlapping
   * operations — "Update all" while an install runs from Browse, or an
   * impatient double click — both read the same starting state and the second
   * write silently discards the first's additions. Serialising per profile is
   * enough; different profiles never touch the same file.
   */
  private locks = new Map<string, Promise<unknown>>()

  private withLock<T>(profileId: string, fn: () => Promise<T> | T): Promise<T> {
    const previous = this.locks.get(profileId) ?? Promise.resolve()
    // Chain off the settled result so one failure doesn't wedge the queue.
    const next = previous.then(fn, fn)
    this.locks.set(
      profileId,
      next.catch(() => undefined),
    )
    return next
  }

  constructor(
    private readonly catalog: Catalog,
    private readonly profiles: ProfileStore,
    private readonly cacheDir: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /**
   * Install `refs` and everything they depend on into a profile.
   *
   * Dependencies are installed first because `resolve` returns them in that
   * order. Anything already present at the same version is skipped, so
   * installing two mods that share a dependency doesn't unpack it twice.
   */
  install(
    profileId: string,
    refs: string[],
    community?: string,
    onProgress: ProgressFn = () => {},
  ): Promise<InstallResult> {
    return this.withLock(profileId, () => this.installLocked(profileId, refs, community, onProgress))
  }

  private async installLocked(
    profileId: string,
    refs: string[],
    community?: string,
    onProgress: ProgressFn = () => {},
  ): Promise<InstallResult> {
    const profile = this.profiles.read(profileId)
    if (!profile) throw new Error(`No such profile: ${profileId}`)

    onProgress({ phase: 'resolving', current: null, completed: 0, total: 0 })
    const resolution = await this.catalog.resolve(refs, community)

    const requested = new Set(
      refs.map((r) => parseRef(r)?.fullName).filter((n): n is string => Boolean(n)),
    )
    const existing = new Map(profile.mods.map((m) => [m.fullName, m]))
    const profileDir = this.profiles.dir(profileId)

    const installed: InstalledMod[] = []
    const skipped: string[] = []
    const total = resolution.order.length
    let completed = 0

    for (const ref of resolution.order) {
      const already = existing.get(ref.fullName)
      if (already && already.version === ref.version) {
        skipped.push(`${ref.fullName}-${ref.version}`)
        completed++
        continue
      }

      const version = await this.catalog.versionFor(ref, community)
      if (!version) {
        // resolve() already recorded this in `missing`; don't fail the batch.
        completed++
        continue
      }

      onProgress({ phase: 'downloading', current: ref.fullName, completed, total })
      const zip = await downloadPackage(version, this.cacheDir, this.fetchImpl)

      onProgress({ phase: 'extracting', current: ref.fullName, completed, total })
      // Replacing an older version: clear its files first so stale DLLs from the
      // previous version can't linger and get loaded alongside the new ones.
      if (already) this.removeFiles(profileDir, already.files)

      const written = extractInto(zip, profileDir, ref)
      installed.push({
        fullName: ref.fullName,
        version: ref.version,
        enabled: true,
        installedAt: new Date().toISOString(),
        files: written.map((f) => relative(profileDir, f)),
        viaDependency: !requested.has(ref.fullName),
      })

      completed++
    }

    const merged = [...existing.values()].filter(
      (m) => !installed.some((i) => i.fullName === m.fullName),
    )
    this.profiles.setMods(profileId, [...merged, ...installed])

    onProgress({ phase: 'done', current: null, completed, total })
    return { installed, skipped, missing: resolution.missing, conflicts: resolution.conflicts }
  }

  /**
   * Install a single mod straight from a URL.
   *
   * Curated Essentials entries are fetched from a manifest rather than a package
   * index, so there is no dependency graph to resolve — the manifest author is
   * responsible for listing what a mod needs. Everything downstream (file
   * recording, replacing an older version, uninstall) is shared with the normal
   * path, so an Essentials mod behaves like any other once installed.
   */
  installDirect(
    profileId: string,
    mod: { fullName: string; version: string; downloadUrl: string },
    onProgress: ProgressFn = () => {},
  ): Promise<InstalledMod> {
    return this.withLock(profileId, () => this.installDirectLocked(profileId, mod, onProgress))
  }

  private async installDirectLocked(
    profileId: string,
    mod: { fullName: string; version: string; downloadUrl: string },
    onProgress: ProgressFn = () => {},
  ): Promise<InstalledMod> {
    const profile = this.profiles.read(profileId)
    if (!profile) throw new Error(`No such profile: ${profileId}`)

    const ref = parseRef(`${mod.fullName}-${mod.version}`)
    if (!ref) throw new Error(`Not a usable package reference: ${mod.fullName}-${mod.version}`)

    const profileDir = this.profiles.dir(profileId)
    const already = profile.mods.find((m) => m.fullName === ref.fullName)

    onProgress({ phase: 'downloading', current: ref.fullName, completed: 0, total: 1 })
    const zip = await downloadPackage(
      {
        full_name: `${mod.fullName}-${mod.version}`,
        name: ref.name,
        version_number: mod.version,
        download_url: mod.downloadUrl,
        dependencies: [],
        file_size: 0,
      },
      this.cacheDir,
      this.fetchImpl,
    )

    onProgress({ phase: 'extracting', current: ref.fullName, completed: 0, total: 1 })
    if (already) this.removeFiles(profileDir, already.files)
    const written = extractInto(zip, profileDir, ref)

    const installed: InstalledMod = {
      fullName: ref.fullName,
      version: ref.version,
      enabled: true,
      installedAt: new Date().toISOString(),
      files: written.map((f) => relative(profileDir, f)),
      viaDependency: false,
    }
    this.profiles.setMods(profileId, [
      ...profile.mods.filter((m) => m.fullName !== ref.fullName),
      installed,
    ])
    onProgress({ phase: 'done', current: null, completed: 1, total: 1 })
    return installed
  }

  /**
   * Enable or disable a mod without uninstalling it.
   *
   * BepInEx only loads `.dll` files from `plugins`, so suffixing them is enough
   * to take a mod out of play while keeping its configs and downloads. Only
   * DLLs are touched — renaming configs would lose the user's settings.
   */
  setEnabled(profileId: string, fullName: string, enabled: boolean): InstalledMod[] {
    const profile = this.profiles.read(profileId)
    if (!profile) throw new Error(`No such profile: ${profileId}`)

    const mod = profile.mods.find((m) => m.fullName === fullName)
    if (!mod) return profile.mods

    const dir = this.profiles.dir(profileId)
    for (const rel of mod.files) {
      if (!rel.toLowerCase().endsWith('.dll')) continue
      const active = `${dir}${sep}${rel}`
      const parked = `${active}${DISABLED_SUFFIX}`
      const from = enabled ? parked : active
      const to = enabled ? active : parked
      if (existsSync(from)) renameSync(from, to)
    }

    const updated = profile.mods.map((m) => (m.fullName === fullName ? { ...m, enabled } : m))
    this.profiles.setMods(profileId, updated)
    return updated
  }

  /** Remove a mod and the files it wrote. Dependencies are left alone. */
  uninstall(profileId: string, fullName: string): InstalledMod[] {
    const profile = this.profiles.read(profileId)
    if (!profile) throw new Error(`No such profile: ${profileId}`)

    const mod = profile.mods.find((m) => m.fullName === fullName)
    if (mod) this.removeFiles(this.profiles.dir(profileId), mod.files)

    const remaining = profile.mods.filter((m) => m.fullName !== fullName)
    this.profiles.setMods(profileId, remaining)
    return remaining
  }

  private removeFiles(profileDir: string, files: string[]): void {
    for (const rel of files) {
      const abs = `${profileDir}${sep}${rel}`
      // A disabled mod's DLLs sit under the suffixed name, so clear both or
      // uninstall would silently leave the parked copies behind.
      rmSync(abs, { force: true })
      rmSync(`${abs}${DISABLED_SUFFIX}`, { force: true })
      this.pruneEmptyDirs(profileDir, dirname(abs))
    }
  }

  /** Walk back up removing directories the mod left behind, stopping at the profile. */
  private pruneEmptyDirs(stopAt: string, dir: string): void {
    let current = dir
    while (current.startsWith(stopAt) && current !== stopAt) {
      if (!existsSync(current) || readdirSync(current).length > 0) return
      try {
        rmdirSync(current)
      } catch {
        return
      }
      current = dirname(current)
    }
  }
}
