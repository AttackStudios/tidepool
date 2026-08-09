/**
 * Actually starting the game.
 *
 * Surf Sandbox ships a Windows executable only, so launching directly is a
 * Windows-only path. Everywhere else the useful action is copying Steam launch
 * options, which work through Proton and Wine too.
 */
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import type { LaunchPlan } from './launch'
import { inspectGameFolder } from './gamefolder'

export interface LaunchOutcome {
  started: boolean
  /** Why it couldn't start, for showing the user. */
  reason?: string
}

export function canLaunchDirectly(platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'win32'
}

export function launchGame(
  gameRoot: string,
  plan: LaunchPlan,
  platform: NodeJS.Platform = process.platform,
  spawnImpl: typeof spawn = spawn,
): LaunchOutcome {
  if (!canLaunchDirectly(platform)) {
    return {
      started: false,
      reason:
        'Surf Sandbox is a Windows executable, so TidePool can only start it directly on Windows. ' +
        'Copy the Steam launch options instead and start the game from Steam.',
    }
  }

  const folder = inspectGameFolder(gameRoot)
  if (!folder) return { started: false, reason: `Not a Unity game folder: ${gameRoot}` }
  if (!folder.executable) {
    return { started: false, reason: `No executable found beside ${folder.dataDir}` }
  }

  const child = spawnImpl(join(gameRoot, folder.executable), plan.args, {
    cwd: gameRoot,
    env: { ...process.env, ...plan.env },
    // Detached so closing TidePool doesn't take the game down with it.
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  return { started: true }
}
