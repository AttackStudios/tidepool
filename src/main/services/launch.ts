/**
 * Building the command line that starts the game with a profile's mods loaded.
 *
 * BepInEx is injected by UnityDoorstop. Doorstop reads its configuration from
 * either a config file next to the game or from command-line arguments; we use
 * arguments so that switching profiles never rewrites files in the game folder.
 *
 * Pure functions — no spawning here — so the argument shapes stay testable.
 */

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
  const preloader = `${profileDir}/BepInEx/core/BepInEx.Preloader.dll`
  return version === 4
    ? ['--doorstop-enabled', 'true', '--doorstop-target-assembly', preloader]
    : ['--doorstop-enable', 'true', '--doorstop-target', preloader]
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

export function buildLaunchPlan(
  profileDir: string,
  options: { doorstop?: DoorstopVersion; platform?: NodeJS.Platform; modded?: boolean } = {},
): LaunchPlan {
  const { doorstop = 4, platform = process.platform, modded = true } = options
  if (!modded) return { args: [], env: {} }
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
