/**
 * Installing and removing mods within a profile.
 *
 * Deliberately independent of the game: installing is download-and-unpack into
 * a profile folder, so the whole pipeline is exercisable before Surf Sandbox
 * ships. Only *launching* needs the game.
 */
import { existsSync, rmSync, rmdirSync, readdirSync } from 'node:fs'
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

export class Installer {
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
  async install(
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
      rmSync(abs, { force: true })
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
