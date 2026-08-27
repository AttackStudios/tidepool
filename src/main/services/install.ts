/** Downloading and unpacking Thunderstore packages into a profile. */
import AdmZip from 'adm-zip'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
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


/**
 * Install a mod loader into the game itself.
 *
 * A loader is not a mod and does not belong in a profile: MelonLoader
 * bootstraps from `version.dll` beside the executable and reads `Mods/` from
 * the game folder, so its files have to land there. Nothing about it is
 * per-profile, which is why this takes a game root rather than a profile.
 *
 * Archive paths are honoured rather than flattened — a loader's layout is the
 * point — but every target is still checked for containment, because this
 * writes into a folder the user did not choose.
 */
/**
 * Files a shared pack carries that are notes for a person, not part of the mod.
 */
const NOTES = /^(icon\.png|manifest\.json|read-?me(\.[a-z]+)?|changelog(\.[a-z]+)?)$/i

/**
 * Install a mod someone handed you.
 *
 * Mods normally arrive from a catalogue, but a friend sending a zip is how
 * people actually share things — and until now the only answer was "unzip this
 * into your game folder, keeping the folder names", which is exactly the
 * instruction that gets a DLL dropped in the wrong place and reported as a
 * broken mod.
 *
 * Accepts a folder as readily as a zip, because half the people who receive one
 * will have already extracted it.
 *
 * Entries are game-root-relative, the same layout a loader pack uses, so a pack
 * containing `Mods/Thing.dll` and a loose `steam_api64.dll` lands correctly
 * without knowing anything about what those files are for.
 */
export function importLocalPack(source: string, gameRoot: string): string[] {
  const written: string[] = []

  const place = (name: string, data: Buffer): void => {
    const clean = name.replace(/\\/g, '/')
    if (NOTES.test(clean.split('/').pop() ?? '')) return
    // Absolute entries have no business in a pack, and `..` must not escape:
    // this writes into the game folder, so Zip Slip here is arbitrary file write.
    if (clean.startsWith('/') || /^[a-zA-Z]:/.test(clean)) return

    const target = join(gameRoot, clean)
    if (!isInside(gameRoot, target)) return

    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, data)
    written.push(target)
  }

  if (statSync(source).isDirectory()) {
    const walk = (dir: string, prefix: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const child = join(dir, entry.name)
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.isDirectory()) walk(child, rel)
        else place(rel, readFileSync(child))
      }
    }
    walk(source, '')
    return written
  }

  for (const entry of new AdmZip(source).getEntries()) {
    if (entry.isDirectory) continue
    place(entry.entryName, entry.getData())
  }
  return written
}

export function installLoaderPack(zipPath: string, gameRoot: string): string[] {
  const zip = new AdmZip(zipPath)
  const written: string[] = []

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue
    const name = entry.entryName.replace(/\\/g, '/')
    if (/^(icon\.png|manifest\.json|README\.md|CHANGELOG\.md)$/i.test(name.split('/').pop() ?? '')) {
      continue
    }
    if (name.startsWith('/') || /^[a-zA-Z]:/.test(name)) continue

    const target = join(gameRoot, name)
    if (!isInside(gameRoot, target)) continue

    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, entry.getData())
    written.push(target)
  }
  return written
}
