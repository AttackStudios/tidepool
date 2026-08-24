import { describe, expect, it } from 'vitest'
import { buildLaunchPlan, doorstopArgs, steamLaunchOptions, wineEnv } from './launch'

describe('doorstopArgs', () => {
  it('uses Doorstop 4 flag names for BepInEx 6', () => {
    expect(doorstopArgs('/p', 4)).toEqual([
      '--doorstop-enabled', 'true',
      '--doorstop-target-assembly', '/p/BepInEx/core/BepInEx.Preloader.dll',
    ])
  })

  it('uses the different Doorstop 3 flag names for BepInEx 5', () => {
    // enable/enabled and target/target-assembly differ between versions; the
    // wrong pair fails silently by launching the game unmodded.
    expect(doorstopArgs('/p', 3)).toEqual([
      '--doorstop-enable', 'true',
      '--doorstop-target', '/p/BepInEx/core/BepInEx.Preloader.dll',
    ])
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
    expect(buildLaunchPlan('/p', { modded: false })).toEqual({
      args: ['--doorstop-enabled', 'false'],
      env: {},
    })
    expect(buildLaunchPlan('/p', { modded: false, doorstop: 3 })).toEqual({
      args: ['--doorstop-enable', 'false'],
      env: {},
    })
  })
})

describe('steamLaunchOptions', () => {
  it('puts env before %command% and args after it', () => {
    const plan = buildLaunchPlan('/p', { doorstop: 4, platform: 'linux' })
    const opts = steamLaunchOptions(plan)
    expect(opts.indexOf('WINEDLLOVERRIDES')).toBeLessThan(opts.indexOf('%command%'))
    expect(opts.indexOf('%command%')).toBeLessThan(opts.indexOf('--doorstop-enabled'))
  })

  it('quotes arguments containing spaces', () => {
    const opts = steamLaunchOptions(buildLaunchPlan('/Program Files/p', { platform: 'win32' }))
    expect(opts).toContain('"/Program Files/p/BepInEx/core/BepInEx.Preloader.dll"')
  })
})
