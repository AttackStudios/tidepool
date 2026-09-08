/**
 * What TidePool has installed into the game folder itself.
 *
 * Loaders, MelonLoader mods and beach packs do not live in a profile. A loader
 * bootstraps from a DLL beside the executable, MelonLoader reads `Mods/` from
 * the game folder, and beaches are save files the game loads from its own
 * `Levels` folder — none of it is per-profile, so none of it was ever written
 * into `profile.mods`.
 *
 * Which meant nothing knew it was there. The Install button had only the
 * profile to consult, so it stayed saying "Install" after a successful install,
 * and pressing it again cheerfully installed over the top. That is every entry
 * in Essentials, because all of them are loaders, MelonLoader mods or beaches.
 *
 * Keyed by game root, so moving the game or pointing TidePool at a second copy
 * does not leave a record insisting files are present that are not.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface GameInstall {
  /** The Essentials id, which is what the browser and detail panel key on. */
  id: string
  version: string
  /** Absolute paths written, so removing is exact rather than guesswork. */
  files: string[]
  installedAt: string
}

type Store = Record<string, Record<string, GameInstall>>

export class GameInstallStore {
  constructor(private readonly file: string) {}

  private read(): Store {
    if (!existsSync(this.file)) return {}
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.file, 'utf8'))
      return typeof parsed === 'object' && parsed !== null ? (parsed as Store) : {}
    } catch {
      // A corrupt record must not stop anyone installing; the worst case is
      // that the button says "Install" again, which is where we started.
      return {}
    }
  }

  private write(store: Store): void {
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify(store, null, 2), 'utf8')
  }

  /**
   * Everything recorded for this game folder that is genuinely still on disk.
   *
   * Verified rather than trusted, because people delete files by hand, verify
   * game files through Steam, or reinstall — and an Uninstall button for
   * something already gone is worse than no button.
   */
  list(gameRoot: string | null): GameInstall[] {
    if (!gameRoot) return []
    const entries = Object.values(this.read()[gameRoot] ?? {})
    return entries.filter((e) => e.files.some((f) => existsSync(f)))
  }

  find(gameRoot: string | null, id: string): GameInstall | null {
    return this.list(gameRoot).find((e) => e.id === id) ?? null
  }

  record(gameRoot: string, install: Omit<GameInstall, 'installedAt'>): GameInstall {
    const store = this.read()
    const entry: GameInstall = { ...install, installedAt: new Date().toISOString() }
    store[gameRoot] = { ...store[gameRoot], [install.id]: entry }
    this.write(store)
    return entry
  }

  /**
   * Remove an install's files and forget it.
   *
   * Only files this store recorded are touched — never a whole folder, because
   * a loader's folder holds the user's own mods and configuration alongside the
   * files we put there.
   */
  remove(gameRoot: string, id: string): string[] {
    const store = this.read()
    const entry = store[gameRoot]?.[id]
    if (!entry) return []

    const removed: string[] = []
    for (const file of entry.files) {
      try {
        if (existsSync(file)) { rmSync(file, { force: true }); removed.push(file) }
      } catch {
        // A file we cannot delete is not a reason to abandon the rest, or to
        // keep claiming the mod is installed.
      }
    }

    const rest = { ...store[gameRoot] }
    delete rest[id]
    store[gameRoot] = rest
    this.write(store)
    return removed
  }
}

/** Where the record lives, beside the other app data. */
export function gameInstallsFile(userData: string): string {
  return join(userData, 'game-installs.json')
}
