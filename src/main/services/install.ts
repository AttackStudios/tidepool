/** Downloading and unpacking Thunderstore packages into a profile. */
import AdmZip from 'adm-zip'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import type { DependencyRef, PackageVersion } from '../../shared/types'

/**
 * Cache key for a downloaded package.
 *
 * Keyed on the download URL rather than the version string, so a republished
 * package under the same version number doesn't serve a stale zip from cache.
 */
export function cacheKey(version: PackageVersion): string {
  return createHash('sha256').update(version.download_url).digest('hex').slice(0, 16)
}

export async function downloadPackage(
  version: PackageVersion,
  cacheDir: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  mkdirSync(cacheDir, { recursive: true })
  const target = join(cacheDir, `${cacheKey(version)}.zip`)
  if (existsSync(target)) return target

  const res = await fetchImpl(version.download_url)
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${version.full_name}`)

  const buffer = Buffer.from(await res.arrayBuffer())
  // Write to a temp name first so an interrupted download can't poison the cache.
  const partial = `${target}.partial`
  writeFileSync(partial, buffer)
  writeFileSync(target, readFileSync(partial))
  return target
}

/**
 * Is `target` genuinely inside `root`?
 *
 * Archive entry names are attacker-controlled — anyone can upload a package —
 * and a name like `BepInEx/../../../../Library/LaunchAgents/evil.plist` resolves
 * clean outside the profile. That is Zip Slip, and for a tool whose whole job is
 * unpacking downloaded archives it is arbitrary file write. Compare resolved
 * paths rather than trusting the string.
 */
export function isInside(root: string, target: string): boolean {
  const r = resolve(root)
  const t = resolve(target)
  return t === r || t.startsWith(r.endsWith(sep) ? r : r + sep)
}

/**
 * Thunderstore packages are not consistently laid out: some contain a
 * `BepInEx/plugins/...` tree, others just drop loose DLLs at the root. Normalise
 * both into the profile's plugin folder so mods land somewhere BepInEx looks.
 *
 * Returns null for anything that would land outside the profile, so a hostile
 * archive is skipped rather than written.
 */
/**
 * Files a loader pack ships that belong beside the game executable, not in a
 * profile's plugin folder.
 *
 * `winhttp.dll` is the shim Windows loads into the game process; it is what
 * starts Doorstop, which is what starts BepInEx. If it is not next to the exe
 * then the launch arguments are read by nobody and the game runs vanilla —
 * silently, and reporting a successful install. `dotnet/` is the runtime
 * BepInEx 6 executes on, and `doorstop_config.ini` points at it.
 */
const LOADER_ROOT = /^(winhttp\.dll|doorstop_config\.ini|\.doorstop_version|dotnet\/.*)$/i

/** Where a loader pack's game-root files are staged inside the profile. */
export const LOADER_STAGING = '_loader'

/**
 * Strip a Thunderstore wrapper folder.
 *
 * Packages are published as `<PackageName>/<actual files>`, so an entry's own
 * first segment is not meaningful. `BepInEx/` is never stripped — it is the
 * destination, not a wrapper.
 */
function stripWrapper(path: string): string {
  const slash = path.indexOf('/')
  if (slash === -1) return path
  const head = path.slice(0, slash)
  if (head === 'BepInEx' || head === 'dotnet') return path
  return path.slice(slash + 1)
}

export function targetPathFor(entryName: string, profileDir: string, modFolder: string): string | null {
  const normalised = entryName.replace(/\\/g, '/')
  if (normalised.endsWith('/')) return null
  // Skip Thunderstore's own metadata; it isn't part of the mod.
  if (/^(icon\.png|manifest\.json|README\.md|CHANGELOG\.md)$/i.test(normalised)) return null
  // Absolute entries have no business in a mod archive.
  if (normalised.startsWith('/') || /^[a-zA-Z]:/.test(normalised)) return null

  const bepInExAt = normalised.indexOf('BepInEx/')
  if (bepInExAt !== -1) {
    const target = join(profileDir, normalised.slice(bepInExAt))
    return isInside(profileDir, target) ? target : null
  }

  // Staged rather than written to the game folder here, because installing is
  // deliberately independent of the game — the profile may be built before
  // TidePool has even located an install. Launching copies these across.
  const inner = stripWrapper(normalised)
  if (LOADER_ROOT.test(inner)) {
    const target = join(profileDir, LOADER_STAGING, inner)
    return isInside(profileDir, target) ? target : null
  }

  const target = join(profileDir, 'BepInEx', 'plugins', modFolder, normalised)
  return isInside(profileDir, target) ? target : null
}

export function extractInto(zipPath: string, profileDir: string, ref: DependencyRef): string[] {
  const zip = new AdmZip(zipPath)
  const written: string[] = []

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue
    const target = targetPathFor(entry.entryName, profileDir, ref.fullName)
    if (!target) continue

    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, entry.getData())
    written.push(target)
  }
  return written
}
