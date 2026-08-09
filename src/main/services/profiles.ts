/**
 * Profiles: named, isolated sets of installed mods.
 *
 * Each profile owns its own BepInEx folder, so switching profiles never touches
 * the game install. That is what makes "try a mod, then get back to a clean
 * game" safe, and it is why the launcher passes Doorstop a path rather than
 * copying files around.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { InstalledMod, Profile } from '../../shared/types'

const PROFILE_FILE = 'profile.json'

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'profile'
}

export class ProfileStore {
  constructor(private readonly root: string) {}

  /** Absolute path to a profile's folder — this is what Doorstop is pointed at. */
  dir(id: string): string {
    return join(this.root, id)
  }

  list(): Profile[] {
    if (!existsSync(this.root)) return []
    const profiles: Profile[] = []
    for (const entry of readdirSync(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const profile = this.read(entry.name)
      if (profile) profiles.push(profile)
    }
    return profiles
  }

  read(id: string): Profile | null {
    const file = join(this.dir(id), PROFILE_FILE)
    if (!existsSync(file)) return null
    try {
      const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
      if (typeof parsed !== 'object' || parsed === null) return null
      const p = parsed as Partial<Profile>
      if (typeof p.id !== 'string' || typeof p.name !== 'string') return null
      return { id: p.id, name: p.name, mods: Array.isArray(p.mods) ? p.mods : [] }
    } catch {
      // A corrupt profile shouldn't take the whole list down with it.
      return null
    }
  }

  create(name: string): Profile {
    let id = slugify(name)
    let n = 2
    while (existsSync(this.dir(id))) id = `${slugify(name)}-${n++}`

    const profile: Profile = { id, name, mods: [] }
    mkdirSync(join(this.dir(id), 'BepInEx', 'plugins'), { recursive: true })
    this.write(profile)
    return profile
  }

  write(profile: Profile): void {
    mkdirSync(this.dir(profile.id), { recursive: true })
    writeFileSync(
      join(this.dir(profile.id), PROFILE_FILE),
      JSON.stringify(profile, null, 2),
      'utf8',
    )
  }

  delete(id: string): void {
    rmSync(this.dir(id), { recursive: true, force: true })
  }

  setMods(id: string, mods: InstalledMod[]): Profile | null {
    const profile = this.read(id)
    if (!profile) return null
    const updated = { ...profile, mods }
    this.write(updated)
    return updated
  }
}
