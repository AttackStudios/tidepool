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
import { detectLoader, inspectGameFolder } from './gamefolder'
import { LOADER_STAGING } from './install'
import { SURF_SANDBOX_APP_ID } from './steam'
import { dotnetProblem, findDotnetRuntime, satisfies } from './dotnet'
import { SHIM_NAME, prepareMacGame } from './macmods'

/**
 * Is a mod loader available at all, by either route?
 *
 * There are two, and conflating them is a mistake this has already made twice:
 * MelonLoader installs into the game folder, while BepInEx was staged inside a
 * profile and copied across at launch. Checking only the profile told anyone
 * with a perfectly good MelonLoader that they had no loader — and pointed them
 * at BepInEx, which TidePool no longer ships because it does not run on this
 * game.
 *
 * Both launch paths ask this, so they cannot drift apart again.
 */
export function hasLoader(gameRoot: string, profileDir: string): boolean {
  if (detectLoader(gameRoot) !== null) return true
  return placeLoader(profileDir, gameRoot) !== null
}

export type LaunchMode = 'modded' | 'vanilla' | 'steam'

export interface LaunchOutcome {
  started: boolean
  mode: LaunchMode
  /** Why it couldn't start, for showing the user. */
  reason?: string
  /**
   * The game started, but something will not work.
   *
   * Separate from `reason` because refusing to launch would be the wrong
   * response: the game runs perfectly well, it just runs unmodded, and being
   * told that is far better than the silence this replaces.
   */
  warning?: string
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

  // Placing the shim is pointless if there is nothing for it to load. This is
  // the file Doorstop is pointed at, and it goes missing both when no loader is
  // installed and when the installed one has been toggled off — either way,
  // launching would produce a vanilla game while claiming to be modded.
  const preloaders = [
    join(profileDir, 'BepInEx', 'core', 'BepInEx.Unity.IL2CPP.dll'),
    join(profileDir, 'BepInEx', 'core', 'BepInEx.Preloader.dll'),
  ]
  if (!preloaders.some((p) => existsSync(p))) return null

  for (const entry of entries) {
    // Overwrites on purpose: switching profiles must replace the previous
    // profile's loader rather than leave a stale one injecting itself.
    cpSync(join(staged, entry), join(gameRoot, entry), { recursive: true, force: true })
  }
  return entries.length
}

export function canLaunchDirectly(
  platform: NodeJS.Platform = process.platform,
  gameRoot: string | null = null,
): boolean {
  if (platform === 'win32') return true
  // The Mac build arrived after release. TidePool starting the game itself is
  // worth more here than on Windows: launching the binary directly is the only
  // way to set DYLD_INSERT_LIBRARIES, which is how MelonLoader attaches on
  // macOS. Going through Steam cannot do that without the user hand-editing
  // Launch Options.
  if (platform === 'darwin' && gameRoot) return macBundle(gameRoot) !== null
  return false
}

/** The game's `.app` and the binary inside it, or null if this is not a Mac build. */
export function macBundle(gameRoot: string): { app: string; binary: string } | null {
  const folder = inspectGameFolder(gameRoot)
  if (!folder?.executable?.endsWith('.app')) return null

  const macOsDir = join(gameRoot, folder.executable, 'Contents', 'MacOS')
  let entries: string[]
  try {
    entries = readdirSync(macOsDir)
  } catch {
    return null
  }

  // Read the binary out of the folder rather than assuming it matches the
  // bundle name — Unity usually agrees, but nothing guarantees it.
  const binary = entries.find((e) => !e.startsWith('.'))
  if (!binary) return null

  return { app: folder.executable, binary: join(macOsDir, binary) }
}

/** The URL that asks Steam to start the game. Built here so the renderer never supplies one. */
export function steamRunUrl(appId: string = SURF_SANDBOX_APP_ID): string {
  return `steam://rungameid/${appId}`
}

/**
 * The environment that attaches MelonLoader on macOS, or nothing for a vanilla
 * run.
 *
 * Separated out so it can be tested without depending on the host's
 * architecture — the launch path around it thins a binary, which only makes
 * sense on Apple Silicon and only works on a real Mach-O.
 */
export function macInjectionEnv(gameRoot: string, mode: LaunchMode): Record<string, string> {
  if (mode === 'vanilla') return {}

  const bootstrap = join(gameRoot, 'MelonLoader.Bootstrap.dylib')
  if (!existsSync(bootstrap)) return {}

  // The shim goes first, and it is what makes any of this work: MelonLoader's
  // PLT hook on dlsym never fires in a translated process, so the game resolves
  // il2cpp_init without the loader ever seeing it. The shim interposes dlsym
  // instead and hands those lookups to MelonLoader's own detour.
  const bundle = macBundle(gameRoot)
  const shim = bundle ? join(gameRoot, bundle.app, 'Contents', 'MacOS', SHIM_NAME) : null
  const inserted = shim && existsSync(shim) ? `${shim}:${bootstrap}` : bootstrap

  const env: Record<string, string> = {
    DYLD_INSERT_LIBRARIES: inserted,
    // The managed side loads the bootstrap again by bare filename.
    DYLD_LIBRARY_PATH: gameRoot,
    // Cpp2IL runs as a child process and inherits the injection, so the
    // bootstrap tries to load itself there by bare name too. Without this the
    // first launch fails partway through generating interop assemblies.
    DYLD_FALLBACK_LIBRARY_PATH: `${gameRoot}:/usr/local/lib:/usr/lib`,
  }

  // MelonLoader is managed code and ships no runtime, so it has to host one
  // that is already here. Pointing at it explicitly matters on Apple Silicon,
  // where the runtime that must be used is the x64 one rather than whichever
  // the system would resolve.
  const runtime = findDotnetRuntime()
  if (runtime && satisfies(runtime.versions)) env.DOTNET_ROOT = runtime.root

  return env
}

/**
 * An x86_64-only copy of the game binary, made once and reused.
 *
 * Apple Silicon runs a universal binary's arm64 slice, and an x64 library
 * cannot inject into that. Thinning the binary is how the game runs x86_64
 * without `arch` in the way — see launchMac for why arch cannot be used.
 *
 * Lives beside the original inside the bundle so Unity still resolves its Data
 * folder relative to the executable.
 */
/**
 * Start the macOS build, injecting MelonLoader when there is one.
 *
 * This is what `melonloader-launch.sh` does, done from inside TidePool so
 * nobody has to paste an absolute path into Steam's Launch Options and get a
 * generic error when they get it slightly wrong.
 *
 * Steam cannot do this for us: LaunchServices starts a fresh process that does
 * not inherit DYLD_INSERT_LIBRARIES, which is why the shell wrapper exists at
 * all. Spawning the inner binary ourselves inherits it the ordinary Unix way.
 */
function launchMac(
  gameRoot: string,
  mode: LaunchMode,
  spawnImpl: typeof spawn,
): LaunchOutcome {
  const bundle = macBundle(gameRoot)
  if (!bundle) return { started: false, mode, reason: 'No .app bundle in the game folder.' }

  const injecting = mode !== 'vanilla' && existsSync(join(gameRoot, 'MelonLoader.Bootstrap.dylib'))

  // MelonLoader's bootstrap ships x86_64 only, so on Apple Silicon the game has
  // to run its x86_64 slice or the two never meet.
  //
  // Not via `arch -x86_64`. That is a platform binary, and dyld purges every
  // DYLD_* variable before handing control to one — so the injection is thrown
  // away on the way through, silently, and the game starts unmodded. Measured:
  // exec'ing directly keeps DYLD_INSERT_LIBRARIES, and going through arch
  // reports it as "(gone)".
  //
  // The game is converted in place instead. A thinned *copy* under another name
  // does not work: MelonLoader loses the last three characters of the executable
  // name on the way to Cpp2IL, so "Game-x86_64" arrives as "Game-x86" and the
  // interop assemblies are never generated.
  if (injecting) {
    try {
      prepareMacGame(join(gameRoot, bundle.app), bundle.binary)
    } catch (e) {
      return {
        started: false,
        mode,
        reason:
          'Could not convert Surf Sandbox to Intel-only, which MelonLoader needs on macOS: ' +
          `${(e as Error).message}`,
      }
    }
  }
  // After preparation, so it can see the shim that preparation writes.
  const env = macInjectionEnv(gameRoot, mode)
  const command = bundle.binary
  const args: string[] = []

  try {
    const child = spawnImpl(command, args, {
      cwd: gameRoot,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, ...env },
    })
    child.unref()
  } catch (e) {
    return { started: false, mode, reason: `Could not start the game: ${(e as Error).message}` }
  }

  // Checked only when injecting: a vanilla launch neither needs a runtime nor
  // deserves a warning about one.
  const runtime = injecting ? dotnetProblem() : null
  return runtime ? { started: true, mode, warning: runtime } : { started: true, mode }
}

export function launchGame(
  gameRoot: string,
  profileDir: string,
  plan: LaunchPlan,
  mode: LaunchMode = 'modded',
  platform: NodeJS.Platform = process.platform,
  spawnImpl: typeof spawn = spawn,
): LaunchOutcome {
  if (!canLaunchDirectly(platform, gameRoot)) {
    return {
      started: false,
      mode,
      reason:
        'TidePool can only start this game directly on Windows, or from a macOS .app bundle. ' +
        'Use “Launch via Steam” instead.',
    }
  }

  if (platform === 'darwin') return launchMac(gameRoot, mode, spawnImpl)

  const folder = inspectGameFolder(gameRoot)
  if (!folder) return { started: false, mode, reason: `Not a Unity game folder: ${gameRoot}` }
  if (!folder.executable) {
    return { started: false, mode, reason: `No executable found beside ${folder.dataDir}` }
  }

  // MelonLoader installs into the game itself and bootstraps from version.dll,
  // so there is nothing to place and nothing to refuse. Only BepInEx keeps its
  // loader in the profile and needs it copied across at launch.
  if (mode !== 'vanilla' && detectLoader(gameRoot) !== 'melonloader') {
    if (placeLoader(profileDir, gameRoot) === null) {
      return {
        started: false,
        mode,
        reason:
          'No mod loader found. TidePool looks for MelonLoader in the game folder, or BepInEx ' +
          'installed into this profile — neither is there, so the game would start unmodded.',
      }
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
