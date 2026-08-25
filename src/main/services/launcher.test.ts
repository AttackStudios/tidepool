import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canLaunchDirectly, launchGame, placeLoader, steamRunUrl } from './launcher'
import { buildLaunchPlan } from './launch'
import { LOADER_STAGING } from './install'

let root: string
let profile: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'tidepool-l-'))
  mkdirSync(join(root, 'Surf Sandbox_Data'), { recursive: true })
  writeFileSync(join(root, 'Surf Sandbox.exe'), 'MZ')

  // A profile with a loader staged, as an install would leave it.
  profile = mkdtempSync(join(tmpdir(), 'tidepool-p-'))
  mkdirSync(join(profile, LOADER_STAGING, 'dotnet'), { recursive: true })
  writeFileSync(join(profile, LOADER_STAGING, 'winhttp.dll'), 'MZ')
  writeFileSync(join(profile, LOADER_STAGING, 'doorstop_config.ini'), '[General]')
  writeFileSync(join(profile, LOADER_STAGING, 'dotnet', 'coreclr.dll'), 'MZ')
  // The preloader Doorstop is aimed at. Without it there is nothing to load,
  // which is what an uninstalled or toggled-off loader looks like on disk.
  mkdirSync(join(profile, 'BepInEx', 'core'), { recursive: true })
  writeFileSync(join(profile, 'BepInEx', 'core', 'BepInEx.Unity.IL2CPP.dll'), 'MZ')
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(profile, { recursive: true, force: true })
})

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
    const plan = buildLaunchPlan('/profiles/default', { loader: 'bepinex', platform: 'win32' })
    expect(launchGame(root, profile, plan, 'modded', 'win32', spawn).started).toBe(true)

    const [exe, args, options] = (spawn as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(exe).toBe(join(root, 'Surf Sandbox.exe'))
    expect(args).toContain('--doorstop-enabled')
    expect(options).toMatchObject({ cwd: root, detached: true })
  })

  it('explains itself instead of failing on macOS', () => {
    const { spawn } = fakeSpawn()
    const outcome = launchGame(root, profile, buildLaunchPlan('/p', { loader: 'bepinex' }), 'modded', 'darwin', spawn)
    expect(outcome.started).toBe(false)
    expect(outcome.reason).toMatch(/Windows/)
    expect(spawn).not.toHaveBeenCalled()
  })

  it('refuses a folder that is not a Unity build', () => {
    const empty = mkdtempSync(join(tmpdir(), 'tidepool-e-'))
    const outcome = launchGame(empty, profile, buildLaunchPlan('/p', { loader: 'bepinex' }), 'modded', 'win32', fakeSpawn().spawn)
    expect(outcome.started).toBe(false)
    expect(outcome.reason).toMatch(/Not a Unity game folder/)
    rmSync(empty, { recursive: true, force: true })
  })

  it('turns Doorstop off explicitly in vanilla mode, and drops the Wine override', () => {
    // winhttp.dll may still be sitting beside the exe from an earlier modded
    // run, so passing nothing would let it load BepInEx off its config file and
    // defeat the point of an unmodded comparison.
    const { spawn } = fakeSpawn()
    const plan = buildLaunchPlan('/p', { loader: 'bepinex', platform: 'win32', modded: false })
    launchGame(root, profile, plan, 'vanilla', 'win32', spawn)
    const [, args, options] = (spawn as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(args).toEqual(['--doorstop-enabled', 'false'])
    expect((options as { env: Record<string, string> }).env.WINEDLLOVERRIDES).toBeUndefined()
  })

  it('places the loader beside the executable before a modded launch', () => {
    const { spawn } = fakeSpawn()
    launchGame(root, profile, buildLaunchPlan(profile, { loader: 'bepinex', platform: 'win32' }), 'modded', 'win32', spawn)
    // Windows loads winhttp.dll out of the game's own folder. Anywhere else and
    // Doorstop never runs and the game starts unmodded, silently.
    expect(existsSync(join(root, 'winhttp.dll'))).toBe(true)
    expect(existsSync(join(root, 'doorstop_config.ini'))).toBe(true)
    expect(existsSync(join(root, 'dotnet', 'coreclr.dll'))).toBe(true)
  })

  it('refuses a modded launch when the profile has no loader', () => {
    const bare = mkdtempSync(join(tmpdir(), 'tidepool-b-'))
    const { spawn } = fakeSpawn()
    const outcome = launchGame(root, bare, buildLaunchPlan(bare, { loader: 'bepinex' }), 'modded', 'win32', spawn)
    expect(outcome.started).toBe(false)
    expect(outcome.reason).toMatch(/no mod loader/i)
    expect(spawn).not.toHaveBeenCalled()
    rmSync(bare, { recursive: true, force: true })
  })

  it('does not need a loader to launch vanilla', () => {
    const bare = mkdtempSync(join(tmpdir(), 'tidepool-b2-'))
    const { spawn } = fakeSpawn()
    const plan = buildLaunchPlan(bare, { loader: 'bepinex', platform: 'win32', modded: false })
    expect(launchGame(root, bare, plan, 'vanilla', 'win32', spawn).started).toBe(true)
    rmSync(bare, { recursive: true, force: true })
  })

  it('reports a missing executable rather than spawning nothing', () => {
    const noExe = mkdtempSync(join(tmpdir(), 'tidepool-n-'))
    mkdirSync(join(noExe, 'Game_Data'), { recursive: true })
    const outcome = launchGame(noExe, profile, buildLaunchPlan('/p', { loader: 'bepinex' }), 'modded', 'win32', fakeSpawn().spawn)
    expect(outcome.started).toBe(false)
    expect(outcome.reason).toMatch(/No executable/)
    rmSync(noExe, { recursive: true, force: true })
  })
})

describe('placeLoader', () => {
  it('refuses when the loader is installed but toggled off', () => {
    // Disabling renames the preloader to .disabled. Copying the shim across
    // anyway would start the game with Doorstop aimed at a file that no longer
    // exists — unmodded, reported as modded.
    rmSync(join(profile, 'BepInEx', 'core', 'BepInEx.Unity.IL2CPP.dll'))
    writeFileSync(join(profile, 'BepInEx', 'core', 'BepInEx.Unity.IL2CPP.dll.disabled'), 'MZ')
    expect(placeLoader(profile, root)).toBeNull()
  })

  it('reports null when nothing is staged, so the caller can refuse to launch', () => {
    const bare = mkdtempSync(join(tmpdir(), 'tidepool-b3-'))
    expect(placeLoader(bare, root)).toBeNull()
    rmSync(bare, { recursive: true, force: true })
  })

  it('overwrites a previous profile\'s loader rather than leaving it', () => {
    writeFileSync(join(root, 'winhttp.dll'), 'STALE')
    placeLoader(profile, root)
    expect(readFileSync(join(root, 'winhttp.dll'), 'utf8')).toBe('MZ')
  })
})

describe('steamRunUrl', () => {
  it('targets the Surf Sandbox app id', () => {
    expect(steamRunUrl()).toBe('steam://rungameid/4480760')
  })
})
