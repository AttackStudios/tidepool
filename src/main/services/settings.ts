/** Persisted user settings. Small enough that a single JSON file is right. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { DEFAULT_COMMUNITY } from './thunderstore'
import type { Settings } from '../../shared/types'

export type { Settings }

export const DEFAULT_SETTINGS: Settings = {
  gamePath: null,
  // Ships pointing at our own community. Development targets an existing one,
  // but that is chosen in the UI and only offered in unpackaged builds.
  community: DEFAULT_COMMUNITY,
  lastProfileId: null,
  seenWelcome: false,
  beachPath: null,
}

/**
 * Coerce anything into a valid Settings.
 *
 * Shared by reading and writing on purpose. Reading was already strict, which is
 * why a corrupt file never stopped the app — but writing spread the patch
 * straight through, so a wrong type reached the disk and the value handed back
 * to the UI, and only got cleaned up on the next read. Same rules both ways.
 */
function normalise(value: unknown): Settings {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_SETTINGS }
  const p = value as Partial<Settings>
  return {
    gamePath: typeof p.gamePath === 'string' ? p.gamePath : null,
    community: typeof p.community === 'string' ? p.community : DEFAULT_SETTINGS.community,
    lastProfileId: typeof p.lastProfileId === 'string' ? p.lastProfileId : null,
    seenWelcome: p.seenWelcome === true,
    beachPath: typeof p.beachPath === 'string' ? p.beachPath : null,
  }
}

export class SettingsStore {
  constructor(private readonly file: string) {}

  read(): Settings {
    if (!existsSync(this.file)) return { ...DEFAULT_SETTINGS }
    try {
      return normalise(JSON.parse(readFileSync(this.file, 'utf8')))
    } catch {
      // Corrupt settings must never stop the app starting.
      return { ...DEFAULT_SETTINGS }
    }
  }

  write(patch: Partial<Settings>): Settings {
    const next = normalise({ ...this.read(), ...patch })
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify(next, null, 2), 'utf8')
    return next
  }
}
