import { describe, expect, it } from 'vitest'
import { buildLaunchPlan, doorstopArgs, steamLaunchOptions, wineEnv } from './launch'

describe('doorstopArgs', () => {
  it('uses Doorstop 4 flag names for BepInEx 6', () => {
    const args = doorstopArgs('/p', 4)
    expect(args.slice(0, 2)).toEqual(['--doorstop-enabled', 'true'])
    expect(args).toContain('--doorstop-target-assembly')
    // The Doorstop 3 spellings must not appear; the wrong pair fails silently.
    expect(args).not.toContain('--doorstop-enable')
    expect(args).not.toContain('--doorstop-target')
  })

  it('uses the different Doorstop 3 flag names for BepInEx 5', () => {
    // enable/enabled and target/target-assembly differ between versions; the
    // wrong pair fails silently by launching the game unmodded.
    expect(doorstopArgs('/p', 3)).toEqual([
      '--doorstop-enable', 'true',
      '--doorstop-target', '/p/BepInEx/core/BepInEx.Preloader.dll',
    ])
  })

  it('targets the IL2CPP entry point, which is not called Preloader', () => {
    // BepInEx.Preloader.dll is the Mono name and ships in no IL2CPP pack.
    // Pointing Doorstop at a file that does not exist fails silently.
    const args = doorstopArgs('/p', 4)
    expect(args).toContain('/p/BepInEx/core/BepInEx.Unity.IL2CPP.dll')
    expect(args.join(' ')).not.toContain('BepInEx.Preloader.dll')
  })

  it('tells Doorstop where the bundled CoreCLR is', () => {
    // IL2CPP has no Mono runtime to borrow, so BepInEx 6 ships its own .NET.
    // Without these Doorstop has nothing to run the preloader on.
    const args = doorstopArgs('/p', 4)
    const at = (flag: string) => args[args.indexOf(flag) + 1]
    expect(at('--doorstop-clr-runtime-coreclr-path')).toBe('/p/_loader/dotnet/coreclr.dll')
    expect(at('--doorstop-clr-corlib-dir')).toBe('/p/_loader/dotnet')
  })
})

describe('wineEnv', () => {
  it('overrides winhttp off Windows so BepInEx actually loads', () => {
    expect(wineEnv('darwin')).toEqual({ WINEDLLOVERRIDES: 'winhttp.dll=n,b' })
    expect(wineEnv('linux')).toEqual({ WINEDLLOVERRIDES: 'winhttp.dll=n,b' })
  })

  it('adds nothing on native Windows', () => {
    expect(wineEnv('win32')).toEqual({})
  })
})

describe('buildLaunchPlan', () => {
  it('switches Doorstop off explicitly when launching unmodded', () => {
    // Not an empty plan. With no arguments at all Doorstop reads
    // doorstop_config.ini beside the game, where enabled is true — so a
    // "vanilla" run would load BepInEx anyway and prove nothing.
    expect(buildLaunchPlan('/p', { loader: 'bepinex', modded: false })).toEqual({
      args: ['--doorstop-enabled', 'false'],
      env: {},
    })
    expect(buildLaunchPlan('/p', { loader: 'bepinex', modded: false, doorstop: 3 })).toEqual({
      args: ['--doorstop-enable', 'false'],
      env: {},
    })
  })
})

describe('steamLaunchOptions', () => {
  it('puts env before %command% and args after it', () => {
    const plan = buildLaunchPlan('/p', { loader: 'bepinex', doorstop: 4, platform: 'linux' })
    const opts = steamLaunchOptions(plan)
    expect(opts.indexOf('WINEDLLOVERRIDES')).toBeLessThan(opts.indexOf('%command%'))
    expect(opts.indexOf('%command%')).toBeLessThan(opts.indexOf('--doorstop-enabled'))
  })

  it('quotes arguments containing spaces', () => {
    const opts = steamLaunchOptions(buildLaunchPlan('/Program Files/p', { loader: 'bepinex', platform: 'win32' }))
    expect(opts).toContain('"/Program Files/p/BepInEx/core/BepInEx.Unity.IL2CPP.dll"')
    // The CoreCLR paths carry the same space and need the same treatment.
    expect(opts).toContain('"/Program Files/p/_loader/dotnet"')
  })
})

describe('MelonLoader plans', () => {
  it('needs no arguments to load, because version.dll does it', () => {
    expect(buildLaunchPlan('/p', { loader: 'melonloader' })).toEqual({ args: [], env: {} })
  })

  it('turns the loader off with --no-mods for a vanilla run', () => {
    // Not "no arguments" — that is how the loader runs. Off is explicit.
    expect(buildLaunchPlan('/p', { loader: 'melonloader', modded: false }))
      .toEqual({ args: ['--no-mods'], env: {} })
  })

  it('carries no Wine override, which only exists for Doorstop', () => {
    const plan = buildLaunchPlan('/p', { loader: 'melonloader', platform: 'darwin' })
    expect(plan.env).toEqual({})
  })

  it('defaults to MelonLoader, the loader this game actually runs', () => {
    expect(buildLaunchPlan('/p')).toEqual({ args: [], env: {} })
  })
})
