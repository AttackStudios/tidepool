import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  REQUIRED_MAJOR, candidateRoots, dotnetProblem, findDotnetRuntime, satisfies,
} from './dotnet'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'tidepool-dotnet-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** Lay out a DOTNET_ROOT the way a real install does. */
function runtimeAt(root: string, ...versions: string[]): string {
  for (const v of versions) {
    mkdirSync(join(root, 'shared', 'Microsoft.NETCore.App', v), { recursive: true })
  }
  return root
}

describe('what MelonLoader needs', () => {
  it('accepts the major version its runtimeconfig asks for', () => {
    expect(satisfies([`${REQUIRED_MAJOR}.0.36`])).toBe(true)
  })

  it('rejects a newer major, because rollForward stays inside the major', () => {
    // A machine with only .NET 8 does not satisfy a request for 6 — telling
    // someone "no .NET found" there would send them hunting for what they have.
    expect(satisfies(['8.0.11', '9.0.0'])).toBe(false)
  })

  it('rejects nothing at all', () => {
    expect(satisfies([])).toBe(false)
  })
})

describe('finding a runtime', () => {
  it('uses an explicit DOTNET_ROOT before anything it would guess', () => {
    const root = runtimeAt(dir, '6.0.36')
    expect(findDotnetRuntime('darwin', { DOTNET_ROOT: root })).toMatchObject({ root })
  })

  it('reports nothing when there is no runtime anywhere', () => {
    expect(findDotnetRuntime('darwin', { DOTNET_ROOT: dir })).toBeNull()
  })

  it('still reports a wrong-major runtime, so the message can name it', () => {
    const root = runtimeAt(dir, '8.0.11')
    expect(findDotnetRuntime('darwin', { DOTNET_ROOT: root })).toMatchObject({
      root, versions: ['8.0.11'],
    })
  })

  it('prefers the x64 location on macOS, where the plain one is arm64', () => {
    // The game runs its x86_64 slice under Rosetta so MelonLoader can inject,
    // and an arm64 runtime cannot load into that process.
    const roots = candidateRoots('darwin')
    expect(roots[0]).toMatch(/\.dotnet-x64$/)
    expect(roots.indexOf('/usr/local/share/dotnet/x64'))
      .toBeLessThan(roots.indexOf('/usr/local/share/dotnet'))
  })
})

describe('explaining a missing runtime', () => {
  it('says nothing when the right runtime is present', () => {
    expect(dotnetProblem('darwin', { DOTNET_ROOT: runtimeAt(dir, '6.0.36') })).toBeNull()
  })

  it('describes the silent failure it prevents', () => {
    const message = dotnetProblem('darwin', { DOTNET_ROOT: dir })
    // The whole point: without this, MelonLoader fails without saying anything.
    expect(message).toMatch(/writes nothing to its log/)
    expect(message).toMatch(/--architecture x64/)
  })

  it('names the version actually installed when it is the wrong one', () => {
    const message = dotnetProblem('darwin', { DOTNET_ROOT: runtimeAt(dir, '8.0.11') })
    expect(message).toContain('8.0.11')
  })

  it('explains the x64 requirement only where it applies', () => {
    expect(dotnetProblem('darwin', { DOTNET_ROOT: dir })).toMatch(/Rosetta/)
    expect(dotnetProblem('win32', { DOTNET_ROOT: dir })).not.toMatch(/Rosetta/)
  })
})
