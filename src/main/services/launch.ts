/**
 * Building the command line that starts the game with a profile's mods loaded.
 *
 * BepInEx is injected by UnityDoorstop. Doorstop reads its configuration from
 * either a config file next to the game or from command-line arguments; we use
 * arguments so that switching profiles never rewrites files in the game folder.
 *
 * Pure functions — no spawning here — so the argument shapes stay testable.
 */

import { LOADER_STAGING } from './install'

export type DoorstopVersion = 3 | 4

export interface LaunchPlan {
  args: string[]
  env: Record<string, string>
}

/**
 * Doorstop 3 (shipped with BepInEx 5) and Doorstop 4 (BepInEx 6) do not share
 * flag names — `--doorstop-enable` vs `--doorstop-enabled`, and
 * `--doorstop-target` vs `--doorstop-target-assembly`. Passing the wrong pair is
 * silent: the game simply starts unmodded, which is a miserable thing to debug.
 */
export function doorstopArgs(profileDir: string, version: DoorstopVersion): string[] {
  if (version === 3) {
    // BepInEx 5 / Mono. One managed preloader, nothing else to point at.
    return [
      '--doorstop-enable',
      'true',
      '--doorstop-target',
      `${profileDir}/BepInEx/core/BepInEx.Preloader.dll`,
    ]
  }

  // BepInEx 6 / IL2CPP. Three things differ from the Mono case, and all three
  // are taken from the pack's own doorstop_config.ini rather than guessed:
  //
  //   target_assembly = BepInEx\core\BepInEx.Unity.IL2CPP.dll
  //   coreclr_path    = dotnet\coreclr.dll
  //   corlib_dir      = dotnet
  //
  // The entry point is NOT called BepInEx.Preloader.dll — that is the Mono
  // name, and no such file exists in an IL2CPP pack. And IL2CPP runs on a
  // bundled CoreCLR, so Doorstop has to be told where that runtime is; without
  // those two paths it has nothing to execute the preloader on.
  return [
    '--doorstop-enabled',
    'true',
    '--doorstop-target-assembly',
    `${profileDir}/BepInEx/core/BepInEx.Unity.IL2CPP.dll`,
    // Names, not the descriptions in Doorstop's README, which has these two
    // transposed: -coreclr-path takes the DLL, -corlib-dir takes the folder.
    '--doorstop-clr-runtime-coreclr-path',
    `${profileDir}/${LOADER_STAGING}/dotnet/coreclr.dll`,
    '--doorstop-clr-corlib-dir',
    `${profileDir}/${LOADER_STAGING}/dotnet`,
  ]
}

/**
 * Environment needed to make Doorstop work under a Wine-based layer.
 *
 * Doorstop relies on the game loading `winhttp.dll` from its own folder, but
 * Wine prefers its builtin. Without this override BepInEx silently never starts.
 * Native Windows needs nothing.
 */
export function wineEnv(platform: NodeJS.Platform): Record<string, string> {
  if (platform === 'win32') return {}
  return { WINEDLLOVERRIDES: 'winhttp.dll=n,b' }
}

/**
 * Arguments that switch Doorstop **off**.
 *
 * Passing no arguments is not the same as passing "off". With none, Doorstop
 * falls back to `doorstop_config.ini` beside the game, where `enabled` is true —
 * so a vanilla launch would quietly load BepInEx anyway, which defeats the one
 * thing a vanilla launch is for: telling whether a mod caused the problem.
 */
export function doorstopDisableArgs(version: DoorstopVersion): string[] {
  return version === 4 ? ['--doorstop-enabled', 'false'] : ['--doorstop-enable', 'false']
}

export function buildLaunchPlan(
  profileDir: string,
  options: { doorstop?: DoorstopVersion; platform?: NodeJS.Platform; modded?: boolean } = {},
): LaunchPlan {
  const { doorstop = 4, platform = process.platform, modded = true } = options
  if (!modded) return { args: doorstopDisableArgs(doorstop), env: {} }
  return { args: doorstopArgs(profileDir, doorstop), env: wineEnv(platform) }
}

/** Steam launch-option string users paste into the game's properties. */
export function steamLaunchOptions(plan: LaunchPlan): string {
  const envPart = Object.entries(plan.env)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ')
  const argPart = plan.args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')
  return [envPart, '%command%', argPart].filter(Boolean).join(' ')
}
