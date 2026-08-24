/**
 * Actually starting the game.
 *
 * Three routes, because they trade off differently:
 *
 * - **Direct, modded** — we spawn the executable with the Doorstop arguments
 *   ourselves. One click, no Steam round trip, and the profile is guaranteed to
 *   be the one that loads. Windows only, and Steam sees no playtime or overlay.
 * - **Direct, vanilla** — same, minus Doorstop. The fastest way to answer "is
 *   this bug actually caused by a mod?".
 * - **Via Steam** — hands off to `steam://rungameid/<id>`. Keeps the overlay,
 *   playtime and cloud saves, and works wherever Steam can run the game, but it
 *   applies whatever launch options are saved in Steam rather than ours.
 */
import { spawn } from 'node:child_process'
import { cpSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { LaunchPlan } from './launch'
import { inspectGameFolder } from './gamefolder'
import { LOADER_STAGING } from './install'
import { SURF_SANDBOX_APP_ID } from './steam'

export type LaunchMode = 'modded' | 'vanilla' | 'steam'

export interface LaunchOutcome {
  started: boolean
  mode: LaunchMode
  /** Why it couldn't start, for showing the user. */
  reason?: string
}

/**
 * Copy a profile's staged loader files into the game folder.
 *
 * Windows loads `winhttp.dll` from the executable's own directory, and that DLL
 * is what starts Doorstop, which starts BepInEx. Installing cannot put it there
 * because a profile can be created before TidePool has located the game at all,
 * so it is staged in the profile and placed here, at the one moment a game is
 * known to exist.
 *
 * Returns the number of entries copied, or null when the profile has no loader
 * staged — which means BepInEx was never installed, and launching modded would
 * silently produce a vanilla game.
 */
export function placeLoader(profileDir: string, gameRoot: string): number | null {
  const staged = join(profileDir, LOADER_STAGING)
  if (!existsSync(staged)) return null
  const entries = readdirSync(staged)
  if (entries.length === 0) return null

  for (const entry of entries) {
    // Overwrites on purpose: switching profiles must replace the previous
    // profile's loader rather than leave a stale one injecting itself.
    cpSync(join(staged, entry), join(gameRoot, entry), { recursive: true, force: true })
  }
  return entries.length
}

export function canLaunchDirectly(platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'win32'
}

/** The URL that asks Steam to start the game. Built here so the renderer never supplies one. */
export function steamRunUrl(appId: string = SURF_SANDBOX_APP_ID): string {
  return `steam://rungameid/${appId}`
}

export function launchGame(
  gameRoot: string,
  profileDir: string,
  plan: LaunchPlan,
  mode: LaunchMode = 'modded',
  platform: NodeJS.Platform = process.platform,
  spawnImpl: typeof spawn = spawn,
): LaunchOutcome {
  if (!canLaunchDirectly(platform)) {
    return {
      started: false,
      mode,
      reason:
        'Surf Sandbox is a Windows executable, so TidePool can only start it directly on Windows. ' +
        'Use “Launch via Steam”, or copy the launch options and start it from Steam.',
    }
  }

  const folder = inspectGameFolder(gameRoot)
  if (!folder) return { started: false, mode, reason: `Not a Unity game folder: ${gameRoot}` }
  if (!folder.executable) {
    return { started: false, mode, reason: `No executable found beside ${folder.dataDir}` }
  }

  if (mode !== 'vanilla' && placeLoader(profileDir, gameRoot) === null) {
    return {
      started: false,
      mode,
      reason:
        'This profile has no mod loader installed, so the game would start unmodded. ' +
        'Install BepInEx from Browse, then launch again.',
    }
  }

  // The plan already encodes the difference: a vanilla plan carries arguments
  // that switch Doorstop off, rather than no arguments at all. Only the Wine
  // override is dropped here.
  const args = plan.args
  const env = mode === 'vanilla' ? {} : plan.env

  const child = spawnImpl(join(gameRoot, folder.executable), args, {
    cwd: gameRoot,
    env: { ...process.env, ...env },
    // Detached so closing TidePool doesn't take the game down with it.
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  return { started: true, mode }
}
