/**
 * Browsing and sharing saved beaches.
 *
 * nocanwin confirmed beaches are plain local JSON and said they can be shared
 * manually. That makes this the one feature that needs no BepInEx, no
 * decompiling and no code injection — it is file management, and it can work on
 * the day the game ships.
 *
 * The schema is unknown until then, so nothing here parses beach *contents*
 * beyond a best-effort display name. A beach is treated as opaque bytes, which
 * means whatever shape the format turns out to be, this still works.
 */
import {
  existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs'
import { basename, join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import AdmZip from 'adm-zip'

export const CODE_PREFIX = 'TPB1-'

/** Beyond this a code is unwieldy to paste; offer a file instead. */
export const MAX_CODE_SOURCE_BYTES = 2 * 1024 * 1024

export interface Beach {
  fileName: string
  path: string
  /** The level's name in game, which is its file name without the extension. */
  name: string
  sizeBytes: number
  modified: string
  /** Parsed contents, or null if the file is not a readable level. */
  shape?: BeachShape | null
}

/**
 * Where Unity games keep user data.
 *
 * The company and product folders are chosen by the developer and unknowable
 * before release, so these are the roots to search rather than a final path.
 */
/** Levels are `.lvl`, plain JSON, written by the game itself. */
export const BEACH_EXT = '.lvl'

/**
 * Find the folder holding beaches.
 *
 * Not a Unity save folder. The game keeps levels inside its own install, at
 * `<game>/<Name>_Data/StreamingAssets/Levels`, and writes player edits there
 * too — `Kewalo_User.lvl` and friends appear beside the shipped presets. That
 * folder is writable without elevation, which is why it works at all.
 */
export function findBeachDir(
  gameRoot: string | null,
  override?: string | null,
): string | null {
  // The game wins. Beaches belong wherever the game currently reads them from,
  // so resolving fresh each time means moving or reinstalling the game just
  // works, and a manual folder picked once cannot go stale and start pointing
  // somewhere the game never looks.
  const derived = levelsDirIn(gameRoot)
  if (derived) return derived

  // Only a fallback, for an install we could not find.
  return override && existsSync(override) ? override : null
}

/** `<game>/<Name>_Data/StreamingAssets/Levels`, if it is there. */
function levelsDirIn(gameRoot: string | null): string | null {
  if (!gameRoot || !existsSync(gameRoot)) return null

  let entries: string[]
  try {
    entries = readdirSync(gameRoot)
  } catch {
    return null
  }
  const dataDir = entries.find((e) => e.endsWith('_Data'))
  if (!dataDir) return null

  const levels = join(gameRoot, dataDir, 'StreamingAssets', 'Levels')
  return existsSync(levels) ? levels : null
}

/**
 * Pull a human name out of an unknown schema.
 *
 * The real key is unknown until the game ships, so try the plausible ones and
 * fall back to the file name rather than guessing wrong and showing nothing.
 */
/**
 * Metres per depth unit in a level file.
 *
 * Levels store height above the game's floor, not metres. Least-squares fit of
 * the game's own Pipeline.lvl against a real Pipeline cross-section over its
 * 229 unclamped samples gives 14.8 m; rounded, because 36 quantisation levels
 * do not support more precision than that.
 */
export const METRES_PER_UNIT = 15

export interface BeachShape {
  samples: number
  swell: number
  tide: number
  /** Deepest point, in metres. The game clamps at one depth unit. */
  maxDepthM: number
  /** True when the profile hits the floor, so the real sea bed is deeper. */
  clamped: boolean
}

/**
 * Read the shape out of a level file.
 *
 * A `.lvl` is plain JSON: `GroundHeights` (321 samples, shore first), `Swell`
 * and `Tide`. Depth below the waterline is `Tide - height`, so a value above
 * the tide is dry beach.
 *
 * Returns null rather than throwing: a corrupt or foreign file should still be
 * listed so it can be deleted.
 */
export function describeBeach(contents: string): BeachShape | null {
  try {
    const d: unknown = JSON.parse(contents)
    if (typeof d !== 'object' || d === null) return null
    const o = d as Record<string, unknown>
    const g = o.GroundHeights
    if (!Array.isArray(g) || g.length === 0) return null
    const heights = g.filter((v): v is number => typeof v === 'number')
    if (heights.length === 0) return null

    const tide = typeof o.Tide === 'number' ? o.Tide : 1
    const swell = typeof o.Swell === 'number' ? o.Swell : 0
    const deepest = tide - Math.min(...heights)
    return {
      samples: heights.length,
      swell,
      tide,
      maxDepthM: Math.round(deepest * METRES_PER_UNIT * 10) / 10,
      clamped: deepest >= 1,
    }
  } catch {
    return null
  }
}

export function readBeaches(dir: string): Beach[] {
  if (!existsSync(dir)) return []
  let files: string[]
  try {
    files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(BEACH_EXT))
  } catch {
    return []
  }

  const beaches: Beach[] = []
  for (const fileName of files) {
    const path = join(dir, fileName)
    try {
      const stat = statSync(path)
      if (!stat.isFile()) continue
      const contents = stat.size < MAX_CODE_SOURCE_BYTES ? readFileSync(path, 'utf8') : ''
      beaches.push({
        fileName,
        path,
        name: fileName.replace(/\.lvl$/i, ''),
      shape: contents ? describeBeach(contents) : null,
        sizeBytes: stat.size,
        modified: stat.mtime.toISOString(),
      })
    } catch {
      // One unreadable file shouldn't hide the rest.
    }
  }
  return beaches.sort((a, b) => b.modified.localeCompare(a.modified))
}

export class InvalidBeachCodeError extends Error {
  constructor(reason: string) {
    super(`That doesn't look like a valid beach code — ${reason}.`)
    this.name = 'InvalidBeachCodeError'
  }
}

interface Payload { n: string; f: string; d: string }

export function encodeBeach(beach: Beach): string {
  const contents = readFileSync(beach.path, 'utf8')
  if (Buffer.byteLength(contents) > MAX_CODE_SOURCE_BYTES) {
    throw new Error(
      `“${beach.name}” is too large to share as a code. Export it as a file instead.`,
    )
  }
  const payload: Payload = { n: beach.name, f: beach.fileName, d: contents }
  return CODE_PREFIX + gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'), { level: 9 }).toString('base64url')
}

export function decodeBeach(code: string): { name: string; fileName: string; contents: string } {
  const trimmed = code.trim()
  if (!trimmed.startsWith(CODE_PREFIX)) {
    throw new InvalidBeachCodeError(`beach codes start with "${CODE_PREFIX}"`)
  }
  let payload: unknown
  try {
    payload = JSON.parse(
      gunzipSync(Buffer.from(trimmed.slice(CODE_PREFIX.length), 'base64url')).toString('utf8'),
    )
  } catch {
    throw new InvalidBeachCodeError('it is damaged or was copied incompletely')
  }
  if (typeof payload !== 'object' || payload === null) {
    throw new InvalidBeachCodeError('it contains no beach')
  }
  const p = payload as Partial<Payload>
  if (typeof p.d !== 'string' || typeof p.f !== 'string') {
    throw new InvalidBeachCodeError('it is missing the beach data')
  }
  return {
    name: typeof p.n === 'string' ? p.n : p.f,
    // Codes come from strangers; never let one dictate a path.
    fileName: safeFileName(p.f),
    contents: p.d,
  }
}

/** Strip any directory component so an imported name cannot escape the folder. */
export function safeFileName(name: string): string {
  // The file name is the level's name in game, so keep what reads naturally —
  // brackets, apostrophes, commas — and strip only what a file system or a path
  // would object to. Replacing them turned "Pipeline (Break Pack)" into
  // "Pipeline _Break Pack_" on the level list.
  const base = basename(name.replace(/\\/g, '/')).replace(/[<>:"/|?*\x00-\x1f]+/g, '_')
  const trimmed = base.replace(/^\.+/, '').slice(0, 100)
  const withExt = /\.lvl$/i.test(trimmed) ? trimmed : `${trimmed}${BEACH_EXT}`
  return withExt === BEACH_EXT ? `imported-beach${BEACH_EXT}` : withExt
}

/** Write an imported beach, never overwriting an existing save. */
export function importBeach(
  dir: string,
  beach: { fileName: string; contents: string },
): string {
  mkdirSync(dir, { recursive: true })
  const safe = safeFileName(beach.fileName)
  let target = join(dir, safe)
  let n = 2
  while (existsSync(target)) {
    target = join(dir, safe.replace(/\.lvl$/i, ` (${n++})${BEACH_EXT}`))
  }
  writeFileSync(target, beach.contents, 'utf8')
  return target
}

export function deleteBeach(dir: string, fileName: string): void {
  const target = join(dir, safeFileName(fileName))
  // Only ever delete inside the beach folder.
  if (!target.startsWith(dir)) return
  rmSync(target, { force: true })
}


/**
 * Install a pack of beaches from a downloaded archive.
 *
 * Beaches are not mods. They are save files the game reads from its own folder,
 * so they must never go through the normal install path, which writes into a
 * profile's BepInEx tree — somewhere the game will never look. This is why a
 * beach pack needs no loader and works on a vanilla install.
 *
 * Entry names are deliberately flattened through `safeFileName`: an archive
 * from a stranger has no business choosing a path.
 */
export function installBeachPack(zipPath: string, dir: string): string[] {
  const zip = new AdmZip(zipPath)
  const written: string[] = []

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue
    const name = entry.entryName.replace(/\\/g, '/')
    // Packaging metadata is not a beach.
    if (/^(icon\.png|manifest\.json|README\.md|CHANGELOG\.md)$/i.test(name.split('/').pop() ?? '')) {
      continue
    }
    if (!name.toLowerCase().endsWith(BEACH_EXT)) continue

    written.push(
      importBeach(dir, {
        fileName: name.split('/').pop() ?? `beach${BEACH_EXT}`,
        contents: entry.getData().toString('utf8'),
      }),
    )
  }
  return written
}
