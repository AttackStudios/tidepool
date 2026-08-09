/** Downloading and unpacking Thunderstore packages into a profile. */
import AdmZip from 'adm-zip'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
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
 * Thunderstore packages are not consistently laid out: some contain a
 * `BepInEx/plugins/...` tree, others just drop loose DLLs at the root. Normalise
 * both into the profile's plugin folder so mods land somewhere BepInEx looks.
 */
export function targetPathFor(entryName: string, profileDir: string, modFolder: string): string | null {
  const normalised = entryName.replace(/\\/g, '/')
  if (normalised.endsWith('/')) return null
  // Skip Thunderstore's own metadata; it isn't part of the mod.
  if (/^(icon\.png|manifest\.json|README\.md|CHANGELOG\.md)$/i.test(normalised)) return null

  const bepInExAt = normalised.indexOf('BepInEx/')
  if (bepInExAt !== -1) return join(profileDir, normalised.slice(bepInExAt))

  return join(profileDir, 'BepInEx', 'plugins', modFolder, normalised)
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
