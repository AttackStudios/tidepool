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
import { join } from 'node:path'
import type { LaunchPlan } from './launch'
import { inspectGameFolder } from './gamefolder'
import { SURF_SANDBOX_APP_ID } from './steam'

export type LaunchMode = 'modded' | 'vanilla' | 'steam'

export interface LaunchOutcome {
  started: boolean
  mode: LaunchMode
  /** Why it couldn't start, for showing the user. */
  reason?: string
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

  // Vanilla deliberately drops both the arguments and the Wine override, so
  // nothing can quietly re-enable the loader.
  const args = mode === 'vanilla' ? [] : plan.args
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
