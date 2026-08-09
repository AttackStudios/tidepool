/** Locating the Surf Sandbox install via Steam. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GameInstall } from '../../shared/types'

export const SURF_SANDBOX_APP_ID = '4480760'
export const SURF_SANDBOX_FOLDER = 'Surf Sandbox'

/**
 * Pull library paths out of Steam's libraryfolders.vdf.
 *
 * The file is Valve's KeyValues format, not JSON. Rather than pull in a VDF
 * parser we take the "path" values directly, which is all we need and is stable
 * across the format revisions Valve has shipped.
 */
export function parseLibraryFolders(vdf: string): string[] {
  const paths: string[] = []
  const re = /"path"\s+"([^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = re.exec(vdf)) !== null) {
    const path = match[1]
    if (path) paths.push(path.replace(/\\\\/g, '\\'))
  }
  return paths
}

/** Candidate Steam roots for the current platform. */
export function steamRoots(platform: NodeJS.Platform, home: string): string[] {
  switch (platform) {
    case 'win32':
      return ['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam']
    case 'darwin':
      return [join(home, 'Library', 'Application Support', 'Steam')]
    default:
      return [join(home, '.steam', 'steam'), join(home, '.local', 'share', 'Steam')]
  }
}

/**
 * Find the game folder, or null if it isn't installed.
 *
 * Note this looks for the *Windows* install. Surf Sandbox ships no macOS build,
 * so on a Mac this only finds anything if the files were pulled down with
 * SteamCMD's forced platform type.
 */
export function findGameInstall(
  platform: NodeJS.Platform = process.platform,
  home: string = process.env.HOME ?? process.env.USERPROFILE ?? '',
): GameInstall | null {
  for (const root of steamRoots(platform, home)) {
    const vdfPath = join(root, 'steamapps', 'libraryfolders.vdf')
    if (!existsSync(vdfPath)) continue

    let libraries: string[]
    try {
      libraries = parseLibraryFolders(readFileSync(vdfPath, 'utf8'))
    } catch {
      continue
    }

    for (const library of [root, ...libraries]) {
      const candidate = join(library, 'steamapps', 'common', SURF_SANDBOX_FOLDER)
      if (existsSync(candidate)) return { root: candidate, source: 'steam', backend: null }
    }
  }
  return null
}

/**
 * Determine the Unity scripting backend from what's on disk.
 *
 * This is the single most important thing to learn on release day: Mono
 * decompiles to readable C#, IL2CPP needs Il2CppDumper first.
 */
export function detectBackend(gameRoot: string): 'mono' | 'il2cpp' | null {
  if (existsSync(join(gameRoot, 'GameAssembly.dll'))) return 'il2cpp'

  // The data folder name follows the executable name, which we don't know yet,
  // so check the known candidates rather than hardcoding one.
  for (const data of ['Surf Sandbox_Data', 'SurfSandbox_Data']) {
    if (existsSync(join(gameRoot, data, 'Managed', 'Assembly-CSharp.dll'))) return 'mono'
  }
  return null
}
