/**
 * Identifying a Unity game folder without knowing the game's executable name.
 *
 * Surf Sandbox is unreleased, so its folder and executable names are unknown.
 * Rather than hardcode a guess, this derives them from Unity's own convention:
 * a build always contains `<Name>_Data` beside `<Name>.exe`.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export interface GameFolder {
  root: string
  /** Executable file name, e.g. "Surf Sandbox.exe". Null if not found. */
  executable: string | null
  /** The `<Name>_Data` folder name. */
  dataDir: string | null
  backend: 'mono' | 'il2cpp' | null
}

const DATA_SUFFIX = '_Data'

/** Inspect a folder and report whether it looks like a Unity game build. */
export function inspectGameFolder(root: string): GameFolder | null {
  if (!root || !existsSync(root)) return null

  let entries: string[]
  try {
    entries = readdirSync(root)
  } catch {
    return null
  }

  const dataDir = entries.find((e) => e.endsWith(DATA_SUFFIX)) ?? null
  if (!dataDir) return null

  const base = dataDir.slice(0, -DATA_SUFFIX.length)
  const exe = `${base}.exe`
  const executable = entries.includes(exe) ? exe : null

  return { root, executable, dataDir, backend: detectBackend(root, dataDir) }
}

/**
 * Mono or IL2CPP — the single most important thing to learn on release day.
 * Mono decompiles to readable C#; IL2CPP needs Il2CppDumper first.
 */
export function detectBackend(root: string, dataDir: string): 'mono' | 'il2cpp' | null {
  if (existsSync(join(root, 'GameAssembly.dll'))) return 'il2cpp'
  if (existsSync(join(root, dataDir, 'Managed', 'Assembly-CSharp.dll'))) return 'mono'
  return null
}

/** True when the folder is a Unity build we could plausibly mod. */
export function isPlausibleGameFolder(root: string): boolean {
  return inspectGameFolder(root) !== null
}
