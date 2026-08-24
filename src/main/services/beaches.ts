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
  /** Best-effort display name; falls back to the file name. */
  name: string
  sizeBytes: number
  modified: string
}

/**
 * Where Unity games keep user data.
 *
 * The company and product folders are chosen by the developer and unknowable
 * before release, so these are the roots to search rather than a final path.
 */
export function unitySaveRoots(platform: NodeJS.Platform, home: string): string[] {
  switch (platform) {
    case 'win32':
      return [join(home, 'AppData', 'LocalLow')]
    case 'darwin':
      return [join(home, 'Library', 'Application Support'), join(home, 'Library', 'Preferences')]
    default:
      return [join(home, '.config', 'unity3d')]
  }
}

/**
 * Find the folder holding beach saves.
 *
 * Looks for a directory under a Unity save root whose name mentions the game and
 * which actually contains JSON. Searching by content rather than a hardcoded
 * path means a company folder we cannot predict does not break it.
 */
export function findBeachDir(
  platform: NodeJS.Platform = process.platform,
  home: string = process.env.HOME ?? process.env.USERPROFILE ?? '',
  override?: string | null,
): string | null {
  if (override && existsSync(override)) return override

  const matches = (name: string) => /surf/i.test(name)

  for (const root of unitySaveRoots(platform, home)) {
    if (!existsSync(root)) continue
    let companies: string[]
    try {
      companies = readdirSync(root)
    } catch {
      continue
    }

    for (const company of companies) {
      const companyDir = join(root, company)
      const candidates = matches(company) ? [companyDir] : []
      try {
        if (statSync(companyDir).isDirectory()) {
          for (const product of readdirSync(companyDir)) {
            if (matches(product) || matches(company)) candidates.push(join(companyDir, product))
          }
        }
      } catch {
        continue
      }

      for (const dir of candidates) {
        if (hasJson(dir)) return dir
        // Saves often sit one level deeper, in a "beaches" or "saves" folder.
        try {
          for (const sub of readdirSync(dir)) {
            const subDir = join(dir, sub)
            if (statSync(subDir).isDirectory() && hasJson(subDir)) return subDir
          }
        } catch {
          continue
        }
      }
    }
  }
  return null
}

function hasJson(dir: string): boolean {
  try {
    return readdirSync(dir).some((f) => f.toLowerCase().endsWith('.json'))
  } catch {
    return false
  }
}

/**
 * Pull a human name out of an unknown schema.
 *
 * The real key is unknown until the game ships, so try the plausible ones and
 * fall back to the file name rather than guessing wrong and showing nothing.
 */
export function displayNameFor(contents: string, fileName: string): string {
  const fallback = basename(fileName).replace(/\.json$/i, '')
  try {
    const parsed: unknown = JSON.parse(contents)
    if (typeof parsed !== 'object' || parsed === null) return fallback
    const o = parsed as Record<string, unknown>
    for (const key of ['name', 'beachName', 'title', 'displayName', 'label']) {
      const v = o[key]
      if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 80)
    }
  } catch {
    // Not valid JSON is still listable; the user may want to delete it.
  }
  return fallback
}

export function readBeaches(dir: string): Beach[] {
  if (!existsSync(dir)) return []
  let files: string[]
  try {
    files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.json'))
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
        name: contents ? displayNameFor(contents, fileName) : fileName.replace(/\.json$/i, ''),
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
  const base = basename(name.replace(/\\/g, '/')).replace(/[^\w.\- ]+/g, '_')
  const trimmed = base.replace(/^\.+/, '').slice(0, 100)
  const withExt = /\.json$/i.test(trimmed) ? trimmed : `${trimmed}.json`
  return withExt === '.json' ? 'imported-beach.json' : withExt
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
    target = join(dir, safe.replace(/\.json$/i, ` (${n++}).json`))
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
    if (!/\.json$/i.test(name)) continue

    written.push(
      importBeach(dir, {
        fileName: name.split('/').pop() ?? 'beach.json',
        contents: entry.getData().toString('utf8'),
      }),
    )
  }
  return written
}
