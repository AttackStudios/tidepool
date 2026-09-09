import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ORIGINALS_DIR, SHIM_NAME, canRevertMacGame, describePreparation, isMacGamePrepared,
  prepareMacGame, revertMacGame,
} from './macmods'

/**
 * These build real universal Mach-O binaries with lipo, because the whole point
 * of this code is what lipo does to them — a stub file would test nothing.
 * Skipped anywhere that is not a Mac with the tools present.
 */
const hasTools = process.platform === 'darwin' && (() => {
  try {
    execFileSync('/usr/bin/lipo', ['-info', '/usr/bin/true'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

const onMac = hasTools ? describe : describe.skip

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'tidepool-macmods-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** A .app with a universal executable and universal frameworks, as shipped. */
function bundle(): { app: string; binary: string } {
  const app = join(dir, 'Game.app')
  const macOs = join(app, 'Contents', 'MacOS')
  const frameworks = join(app, 'Contents', 'Frameworks')
  mkdirSync(macOs, { recursive: true })
  mkdirSync(frameworks, { recursive: true })

  const binary = join(macOs, 'Game')
  universal(binary)
  universal(join(frameworks, 'GameAssembly.dylib'))
  universal(join(frameworks, 'UnityPlayer.dylib'))
  return { app, binary }
}

/** Build a genuine two-architecture Mach-O at `path`. */
function universal(path: string): void {
  const src = join(dir, 'tiny.c')
  writeFileSync(src, 'int main(void){return 0;}\n')
  const x64 = `${path}.x64`
  const arm = `${path}.arm`
  execFileSync('/usr/bin/clang', ['-arch', 'x86_64', '-o', x64, src])
  execFileSync('/usr/bin/clang', ['-arch', 'arm64', '-o', arm, src])
  execFileSync('/usr/bin/lipo', ['-create', x64, arm, '-output', path])
  rmSync(x64); rmSync(arm)
}

const archs = (path: string): string =>
  execFileSync('/usr/bin/lipo', ['-archs', path], { encoding: 'utf8' }).trim()

onMac('preparing a macOS install', () => {
  it('converts the executable and both frameworks to Intel-only', () => {
    const { app, binary } = bundle()
    const result = prepareMacGame(app, binary)

    expect(archs(binary)).toBe('x86_64')
    expect(archs(join(app, 'Contents/Frameworks/GameAssembly.dylib'))).toBe('x86_64')
    expect(archs(join(app, 'Contents/Frameworks/UnityPlayer.dylib'))).toBe('x86_64')
    expect(result.thinned).toHaveLength(3)
  })

  it('keeps the executable name, because MelonLoader truncates it', () => {
    // A thinned copy called "Game-x86_64" reaches Cpp2IL as "Game-x86" and
    // nothing is ever generated, so the thinned build has to be the original.
    const { app, binary } = bundle()
    prepareMacGame(app, binary)
    expect(existsSync(binary)).toBe(true)
    expect(existsSync(`${binary}-x86_64`)).toBe(false)
  })

  it('keeps the untouched original, outside the bundle', () => {
    const { app, binary } = bundle()
    prepareMacGame(app, binary)

    // Inside the bundle it would break codesign, which walks the whole thing
    // and refuses while any unsigned Mach-O is in there.
    const kept = join(dir, ORIGINALS_DIR, 'Game')
    expect(archs(kept)).toContain('arm64')
    expect(existsSync(`${binary}.universal`)).toBe(false)
  })

  it('writes the shim beside the binary, unsigned', () => {
    const { app, binary } = bundle()
    const result = prepareMacGame(app, binary)

    const shim = join(app, 'Contents', 'MacOS', SHIM_NAME)
    expect(result.shimWritten).toBe(true)
    expect(readFileSync(shim).subarray(0, 4)).toEqual(Buffer.from([0xcf, 0xfa, 0xed, 0xfe]))
    // Ad-hoc signing it stops the dyld interpose firing at all.
    expect(() => execFileSync('/usr/bin/codesign', ['-v', shim], { stdio: 'ignore' })).toThrow()
  })

  it('is safe to run again, and does not re-copy the original', () => {
    const { app, binary } = bundle()
    prepareMacGame(app, binary)
    const kept = join(dir, ORIGINALS_DIR, 'Game')
    const original = readFileSync(kept)

    const second = prepareMacGame(app, binary)
    expect(second.thinned).toEqual([])
    expect(second.shimWritten).toBe(false)
    // Crucially: the backup is still the universal build, not the thinned one.
    expect(readFileSync(kept)).toEqual(original)
    expect(archs(kept)).toContain('arm64')
  })

  it('reports whether an install still needs preparing', () => {
    const { app, binary } = bundle()
    expect(isMacGamePrepared(app, binary)).toBe(false)
    expect(describePreparation(app, binary)).toMatch(/Intel-only/)

    prepareMacGame(app, binary)

    expect(isMacGamePrepared(app, binary)).toBe(true)
    expect(describePreparation(app, binary)).toBeNull()
  })

  it('warns about the things people would be annoyed to discover later', () => {
    const { app, binary } = bundle()
    const text = describePreparation(app, binary)!
    expect(text).toMatch(/no longer runs natively/i)
    expect(text).toMatch(/waves/i)
    expect(text).toMatch(/undone/i)
    expect(text).toContain(ORIGINALS_DIR)
  })
})

onMac('reverting a prepared install', () => {
  it('puts the universal builds back and removes the shim', () => {
    const { app, binary } = bundle()
    const before = readFileSync(binary)
    prepareMacGame(app, binary)
    expect(archs(binary)).toBe('x86_64')

    const result = revertMacGame(app, binary)

    expect(archs(binary)).toContain('arm64')
    expect(archs(join(app, 'Contents/Frameworks/GameAssembly.dylib'))).toContain('arm64')
    expect(readFileSync(binary)).toEqual(before)
    expect(result.restored).toHaveLength(3)
    expect(result.shimRemoved).toBe(true)
    expect(existsSync(join(app, 'Contents', 'MacOS', SHIM_NAME))).toBe(false)
  })

  it('leaves the originals in place, so a failed revert can be retried', () => {
    const { app, binary } = bundle()
    prepareMacGame(app, binary)
    revertMacGame(app, binary)

    expect(canRevertMacGame(app)).toBe(true)
    // And running it twice is harmless.
    expect(revertMacGame(app, binary).restored).toHaveLength(3)
  })

  it('reports the game as needing preparation again afterwards', () => {
    const { app, binary } = bundle()
    prepareMacGame(app, binary)
    revertMacGame(app, binary)
    expect(isMacGamePrepared(app, binary)).toBe(false)
  })

  it('knows when there is nothing to revert to', () => {
    const { app } = bundle()
    expect(canRevertMacGame(app)).toBe(false)
  })

  it('does nothing rather than failing when the originals are gone', () => {
    const { app, binary } = bundle()
    prepareMacGame(app, binary)
    rmSync(join(dir, ORIGINALS_DIR), { recursive: true, force: true })

    const result = revertMacGame(app, binary)
    expect(result.restored).toEqual([])
    // The shim still goes, because that part needs no original.
    expect(result.shimRemoved).toBe(true)
    expect(archs(binary)).toBe('x86_64')
  })
})
