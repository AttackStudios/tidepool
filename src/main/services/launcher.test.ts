import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canLaunchDirectly, launchGame, steamRunUrl } from './launcher'
import { buildLaunchPlan } from './launch'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'tidepool-l-'))
  mkdirSync(join(root, 'Surf Sandbox_Data'), { recursive: true })
  writeFileSync(join(root, 'Surf Sandbox.exe'), 'MZ')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const fakeSpawn = () => {
  const unref = vi.fn()
  const spawn = vi.fn(() => ({ unref })) as unknown as typeof import('node:child_process').spawn
  return { spawn, unref }
}

describe('canLaunchDirectly', () => {
  it('is Windows-only, because the game ships no other build', () => {
    expect(canLaunchDirectly('win32')).toBe(true)
    expect(canLaunchDirectly('darwin')).toBe(false)
    expect(canLaunchDirectly('linux')).toBe(false)
  })
})

describe('launchGame', () => {
  it('spawns the derived executable with the Doorstop arguments', () => {
    const { spawn } = fakeSpawn()
    const plan = buildLaunchPlan('/profiles/default', { platform: 'win32' })
    expect(launchGame(root, plan, 'modded', 'win32', spawn).started).toBe(true)

    const [exe, args, options] = (spawn as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(exe).toBe(join(root, 'Surf Sandbox.exe'))
    expect(args).toContain('--doorstop-enabled')
    expect(options).toMatchObject({ cwd: root, detached: true })
  })

  it('explains itself instead of failing on macOS', () => {
    const { spawn } = fakeSpawn()
    const outcome = launchGame(root, buildLaunchPlan('/p'), 'modded', 'darwin', spawn)
    expect(outcome.started).toBe(false)
    expect(outcome.reason).toMatch(/Windows/)
    expect(spawn).not.toHaveBeenCalled()
  })

  it('refuses a folder that is not a Unity build', () => {
    const empty = mkdtempSync(join(tmpdir(), 'tidepool-e-'))
    const outcome = launchGame(empty, buildLaunchPlan('/p'), 'modded', 'win32', fakeSpawn().spawn)
    expect(outcome.started).toBe(false)
    expect(outcome.reason).toMatch(/Not a Unity game folder/)
    rmSync(empty, { recursive: true, force: true })
  })

  it('drops the Doorstop args and Wine override entirely in vanilla mode', () => {
    // Anything less and a leftover override could quietly re-enable the loader,
    // defeating the point of an unmodded comparison run.
    const { spawn } = fakeSpawn()
    const plan = buildLaunchPlan('/p', { platform: 'win32' })
    launchGame(root, plan, 'vanilla', 'win32', spawn)
    const [, args, options] = (spawn as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(args).toEqual([])
    expect((options as { env: Record<string, string> }).env.WINEDLLOVERRIDES).toBeUndefined()
  })

  it('reports a missing executable rather than spawning nothing', () => {
    const noExe = mkdtempSync(join(tmpdir(), 'tidepool-n-'))
    mkdirSync(join(noExe, 'Game_Data'), { recursive: true })
    const outcome = launchGame(noExe, buildLaunchPlan('/p'), 'modded', 'win32', fakeSpawn().spawn)
    expect(outcome.started).toBe(false)
    expect(outcome.reason).toMatch(/No executable/)
    rmSync(noExe, { recursive: true, force: true })
  })
})

describe('steamRunUrl', () => {
  it('targets the Surf Sandbox app id', () => {
    expect(steamRunUrl()).toBe('steam://rungameid/4480760')
  })
})
