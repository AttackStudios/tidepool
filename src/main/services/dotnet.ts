/**
 * Finding a .NET runtime for MelonLoader to host.
 *
 * MelonLoader is managed code. Its native bootstrap loads, then starts CoreCLR
 * and runs the rest of itself there — and neither its Windows nor its macOS
 * archive ships a runtime, so one has to already be on the machine.
 *
 * On Windows that is usually true by accident. On macOS it usually is not: this
 * machine had no .NET at all, and the failure is silent — MelonLoader creates
 * its log file, writes nothing to it, and the game starts unmodded with no
 * indication anything was meant to happen. Saying so plainly is the entire
 * point of this file.
 *
 * The architecture matters as much as the presence. On Apple Silicon the game
 * runs its x86_64 slice under Rosetta so MelonLoader's x86_64 bootstrap can
 * inject, which means the runtime it hosts must be **x64 too** — an arm64
 * runtime cannot be loaded into an x86_64 process, and the arm64 build is what
 * you get from the ordinary installer.
 */
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** MelonLoader's runtimeconfig asks for this, rolling forward within major 6. */
export const REQUIRED_MAJOR = 6

export interface DotnetRuntime {
  /** Value for DOTNET_ROOT. */
  root: string
  /** Versions of Microsoft.NETCore.App found there. */
  versions: string[]
}

/**
 * Where a .NET runtime plausibly lives, best first.
 *
 * `~/.dotnet-x64` and `/usr/local/share/dotnet/x64` come first on macOS because
 * an Apple Silicon machine that has both will have the arm64 one in the plain
 * location — and the plain one is the wrong architecture for an injected game.
 */
export function candidateRoots(platform: string = process.platform): string[] {
  const home = homedir()
  if (platform === 'darwin') {
    return [
      join(home, '.dotnet-x64'),
      '/usr/local/share/dotnet/x64',
      join(home, '.dotnet'),
      '/usr/local/share/dotnet',
    ]
  }
  if (platform === 'win32') {
    return [
      join(process.env.ProgramFiles ?? 'C:\\Program Files', 'dotnet'),
      join(home, '.dotnet'),
    ]
  }
  return [join(home, '.dotnet'), '/usr/share/dotnet', '/usr/local/share/dotnet']
}

/** Runtime versions installed under a DOTNET_ROOT, newest last. */
function versionsIn(root: string): string[] {
  const shared = join(root, 'shared', 'Microsoft.NETCore.App')
  if (!existsSync(shared)) return []
  try {
    return readdirSync(shared).filter((v) => /^\d+\./.test(v)).sort()
  } catch {
    return []
  }
}

/** Does this set of versions satisfy what MelonLoader asks for? */
export function satisfies(versions: string[]): boolean {
  // rollForward is "LatestMinor", which stays inside the major version — so a
  // machine with only .NET 8 does not satisfy a request for 6.
  return versions.some((v) => Number.parseInt(v.split('.')[0] ?? '', 10) === REQUIRED_MAJOR)
}

/**
 * The runtime MelonLoader should host, or null if there is none to host.
 *
 * An explicit DOTNET_ROOT wins, because someone who set it meant it.
 */
export function findDotnetRuntime(
  platform: string = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): DotnetRuntime | null {
  // An explicit DOTNET_ROOT is used *instead of* the usual places, not before
  // them — that is what hostfxr itself does, and searching on past it would
  // report a runtime the game is never going to load.
  const roots = env.DOTNET_ROOT ? [env.DOTNET_ROOT] : candidateRoots(platform)

  let fallback: DotnetRuntime | null = null
  for (const root of roots) {
    const versions = versionsIn(root)
    if (versions.length === 0) continue
    if (satisfies(versions)) return { root, versions }
    // Remember a runtime of the wrong major so the message can say "you have
    // .NET 8, MelonLoader wants 6" rather than "no .NET found", which would
    // send someone hunting for something already installed.
    fallback ??= { root, versions }
  }
  return fallback
}

/**
 * What to tell someone when mods will not load for want of a runtime.
 *
 * Returns null when everything needed is present.
 */
export function dotnetProblem(
  platform: string = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const found = findDotnetRuntime(platform, env)
  if (found && satisfies(found.versions)) return null

  const install =
    `Install it with:\n` +
    `  curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- \\\n` +
    `    --channel ${REQUIRED_MAJOR}.0 --runtime dotnet --architecture x64 \\\n` +
    `    --install-dir ~/.dotnet-x64`

  if (found) {
    return (
      `MelonLoader needs the .NET ${REQUIRED_MAJOR} runtime and this machine only has ` +
      `${found.versions.join(', ')}. Without it MelonLoader loads, writes nothing to its log, ` +
      `and the game runs unmodded.\n\n${install}`
    )
  }

  return (
    `MelonLoader needs the .NET ${REQUIRED_MAJOR} runtime and none is installed. It ships no ` +
    `runtime of its own, so without one MelonLoader loads, writes nothing to its log, and the ` +
    `game runs unmodded with no error.\n\n${install}` +
    (platform === 'darwin'
      ? `\n\nThe x64 build is deliberate: the game runs its x86_64 slice under Rosetta so ` +
        `MelonLoader can inject, and an arm64 runtime cannot load into that process.`
      : '')
  )
}
