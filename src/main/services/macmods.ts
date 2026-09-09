/**
 * Preparing a macOS install so MelonLoader can actually load mods.
 *
 * MelonLoader's macOS bootstrap is x86_64 only, and three separate things have
 * to line up before a single mod runs. None of them fail loudly; each one just
 * produces a game that starts and ignores its mods, which is why this is one
 * deliberate step rather than something scattered through the launcher.
 *
 * 1. **Everything must be x86_64.** The bootstrap cannot inject into an arm64
 *    process, and Cpp2IL — which generates the interop assemblies on first
 *    launch — cannot read a universal Mach-O at all. So the executable and both
 *    frameworks are thinned.
 * 2. **The executable must keep its name.** MelonLoader loses the last three
 *    characters of it on the way to Cpp2IL, so a thinned copy called
 *    `Game-x86_64` arrives as `Game-x86` and Cpp2IL cannot find anything.
 *    The thinned build therefore replaces the original in place.
 * 3. **A shim has to be injected ahead of the bootstrap**, because MelonLoader's
 *    PLT hook on `dlsym` never fires in a translated process.
 *
 * This is not reversible by itself: the game becomes x86_64-only and no longer
 * runs its native arm64 slice. Originals are kept beside the files they
 * replace so it can be undone, and `describePreparation` exists so the UI can
 * say so before it happens.
 */
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { MAC_SHIM_BASE64 } from '../resources/macshim'

/**
 * Where the untouched universal originals are kept.
 *
 * Outside the `.app`, because `codesign` walks the whole bundle and refuses to
 * sign the executable while any unsigned Mach-O sits inside it — and an
 * untouched original is exactly that.
 */
export const ORIGINALS_DIR = 'TidePool originals'

/** The shim's filename, beside the game binary so paths resolve from it. */
export const SHIM_NAME = 'mlshim.dylib'

export interface MacPreparation {
  /** Files converted to x86_64, relative to the bundle. */
  thinned: string[]
  /** True when the shim was written this time rather than already present. */
  shimWritten: boolean
}

/** Is this file a universal binary that still needs thinning? */
function isUniversal(path: string): boolean {
  try {
    return execFileSync('/usr/bin/lipo', ['-archs', path], { encoding: 'utf8' }).includes('arm64')
  } catch {
    return false
  }
}

/**
 * Replace a universal Mach-O with its x86_64 slice, keeping the original.
 *
 * In place rather than beside, because the name matters — see the note above
 * about MelonLoader truncating it. Returns false when there was nothing to do.
 *
 * Does not sign: signing the executable while a sibling framework is unsigned
 * fails with "code object is not signed at all / In subcomponent", so every
 * signature is applied afterwards in the right order.
 */
function thin(path: string, originalsDir: string): boolean {
  if (!existsSync(path) || !isUniversal(path)) return false

  mkdirSync(originalsDir, { recursive: true })
  const original = join(originalsDir, basename(path))
  if (!existsSync(original)) copyFileSync(path, original)

  const temp = `${path}.thin`
  execFileSync('/usr/bin/lipo', [path, '-thin', 'x86_64', '-output', temp])
  renameSync(temp, path)
  return true
}

/**
 * Ad-hoc sign, because lipo drops the signature and macOS will not run an
 * unsigned binary that came from a signed bundle.
 */
function sign(path: string): void {
  if (existsSync(path)) execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', path])
}

/**
 * Write the shim beside the game binary.
 *
 * Deliberately last, and deliberately not signed. Ad-hoc signing it stops the
 * interpose firing at all, and `codesign` refuses to sign a bundle that
 * contains an unsigned Mach-O — so anything that signs must happen first.
 */
function writeShim(macOsDir: string): boolean {
  const path = join(macOsDir, SHIM_NAME)
  if (existsSync(path)) return false
  writeFileSync(path, Buffer.from(MAC_SHIM_BASE64, 'base64'))
  chmodSync(path, 0o644)
  return true
}

/**
 * Make a macOS install ready to load mods. Safe to call repeatedly.
 *
 * `bundle` is the `.app`, `binary` the executable inside it.
 */
export function prepareMacGame(bundlePath: string, binaryPath: string): MacPreparation {
  const frameworks = join(bundlePath, 'Contents', 'Frameworks')
  const thinned: string[] = []

  const gameAssembly = join(frameworks, 'GameAssembly.dylib')
  const unityPlayer = join(frameworks, 'UnityPlayer.dylib')
  const originals = join(dirname(bundlePath), ORIGINALS_DIR)

  if (thin(binaryPath, originals)) thinned.push('the game executable')
  if (thin(gameAssembly, originals)) thinned.push('GameAssembly.dylib')
  if (thin(unityPlayer, originals)) thinned.push('UnityPlayer.dylib')

  // Frameworks first, then the executable: signing the executable inspects the
  // whole bundle and refuses while anything inside it is unsigned.
  if (thinned.length > 0) {
    sign(gameAssembly)
    sign(unityPlayer)
    sign(binaryPath)
  }

  // Last, and never signed — signing the shim stops the interpose firing, and
  // codesign refuses a bundle containing an unsigned Mach-O.
  const shimWritten = writeShim(join(bundlePath, 'Contents', 'MacOS'))

  return { thinned, shimWritten }
}

/** Has this install already been prepared? */
export function isMacGamePrepared(bundlePath: string, binaryPath: string): boolean {
  return existsSync(join(bundlePath, 'Contents', 'MacOS', SHIM_NAME)) && !isUniversal(binaryPath)
}

/**
 * What preparing will do, for asking before doing it.
 *
 * Returns null when there is nothing left to change.
 */
export function describePreparation(bundlePath: string, binaryPath: string): string | null {
  if (isMacGamePrepared(bundlePath, binaryPath)) return null

  return (
    'To load mods, TidePool has to convert Surf Sandbox to Intel-only and add a small ' +
    'library beside it.\n\n' +
    'MelonLoader is Intel-only on macOS, so the game has to run its Intel build through ' +
    'Rosetta for mods to attach at all. Afterwards the game no longer runs natively on ' +
    'Apple Silicon, which costs some performance and can make waves behave slightly ' +
    'differently — the physics is sensitive to it.\n\n' +
    `The untouched originals are kept in a "${ORIGINALS_DIR}" folder beside the game, ` +
    'so this can be undone.'
  )
}
