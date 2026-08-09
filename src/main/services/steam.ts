/** Locating the Surf Sandbox install via Steam. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GameInstall } from '../../shared/types'
import { inspectGameFolder } from './gamefolder'

export const SURF_SANDBOX_APP_ID = '4480760'

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

/**
 * Read the folder name Steam installed an app into.
 *
 * This is why we parse the app manifest rather than guessing: the folder name
 * is chosen by the developer and is not derivable from the store page. For an
 * unreleased game a guess would simply be wrong.
 */
export function parseInstallDir(acf: string): string | null {
  const match = /"installdir"\s+"([^"]+)"/.exec(acf)
  return match?.[1] ?? null
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
  appId: string = SURF_SANDBOX_APP_ID,
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
      const manifest = join(library, 'steamapps', `appmanifest_${appId}.acf`)
      if (!existsSync(manifest)) continue

      let installDir: string | null
      try {
        installDir = parseInstallDir(readFileSync(manifest, 'utf8'))
      } catch {
        continue
      }
      if (!installDir) continue

      const candidate = join(library, 'steamapps', 'common', installDir)
      const folder = inspectGameFolder(candidate)
      if (folder) return { root: candidate, source: 'steam', backend: folder.backend }
    }
  }
  return null
}
