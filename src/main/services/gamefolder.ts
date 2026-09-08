/**
 * Identifying a Unity game folder without knowing the game's executable name.
 *
 * Rather than hardcode a guess, this derives them from Unity's own convention:
 * on Windows a build contains `<Name>_Data` beside `<Name>.exe`.
 *
 * macOS builds are shaped completely differently — everything lives inside a
 * `.app` bundle, the data folder is called plain `Data` rather than
 * `<Name>_Data`, and the native library is a .dylib. Surf Sandbox got a Mac
 * build after release, so both layouts have to be recognised.
 */
import { existsSync, readdirSync } from 'node:fs'
import { LOADERS, type LoaderKind } from '../../shared/loaders'
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
const APP_SUFFIX = '.app'

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

  if (dataDir) {
    const base = dataDir.slice(0, -DATA_SUFFIX.length)
    const exe = `${base}.exe`
    const executable = entries.includes(exe) ? exe : null
    return { root, executable, dataDir, backend: detectBackend(root, dataDir) }
  }

  // A macOS build: one .app bundle, with everything inside it.
  const bundle = entries.find((e) => e.endsWith(APP_SUFFIX))
  if (bundle) {
    const inside = join(bundle, 'Contents', 'Resources', 'Data')
    if (existsSync(join(root, inside))) {
      const name = bundle.slice(0, -APP_SUFFIX.length)
      // The bundle is what gets launched, not the binary buried inside it.
      return { root, executable: bundle, dataDir: inside, backend: detectBackend(root, inside) }
    }
  }

  return null
}

/**
 * Mono or IL2CPP — the single most important thing to learn on release day.
 * Mono decompiles to readable C#; IL2CPP needs Il2CppDumper first.
 */
export function detectBackend(root: string, dataDir: string): 'mono' | 'il2cpp' | null {
  if (existsSync(join(root, 'GameAssembly.dll'))) return 'il2cpp'
  // On macOS the native library sits in the bundle's Frameworks folder, two
  // levels above the Data folder, and carries a .dylib extension.
  if (existsSync(join(root, dataDir, '..', '..', 'Frameworks', 'GameAssembly.dylib'))) return 'il2cpp'
  if (existsSync(join(root, dataDir, 'Managed', 'Assembly-CSharp.dll'))) return 'mono'
  return null
}

/** True when the folder is a Unity build we could plausibly mod. */
export function isPlausibleGameFolder(root: string): boolean {
  return inspectGameFolder(root) !== null
}


/**
 * Which loader, if any, is installed in a game folder.
 *
 * Detects by the loader's own marker folder rather than the proxy DLL, because
 * a proxy can be left behind by an uninstall while the loader itself is gone —
 * and a stale winhttp.dll beside a working MelonLoader is exactly how two
 * loaders end up fighting over one process.
 */
export function detectLoader(root: string): LoaderKind | null {
  if (!root || !existsSync(root)) return null
  for (const spec of Object.values(LOADERS)) {
    if (existsSync(join(root, spec.marker))) return spec.kind
  }
  return null
}

/** Loaders with files present, so a conflicting pair can be reported. */
export function installedLoaders(root: string): LoaderKind[] {
  if (!root || !existsSync(root)) return []
  return Object.values(LOADERS)
    .filter((s) => existsSync(join(root, s.marker)) || existsSync(join(root, s.proxyDll)))
    .map((s) => s.kind)
}
