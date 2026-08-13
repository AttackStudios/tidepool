import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_LOG_BYTES, buildSupportBundle, candidatePaths, parseLine, readLog } from './logs'
import type { GameInstall, InstalledMod, Profile } from '../../shared/types'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'tidepool-log-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const writeLog = (root: string, body: string) => {
  mkdirSync(join(root, 'BepInEx'), { recursive: true })
  writeFileSync(join(root, 'BepInEx', 'LogOutput.log'), body, 'utf8')
}

const mod = (fullName: string, over: Partial<InstalledMod> = {}): InstalledMod => ({
  fullName, version: '1.0.0', enabled: true, installedAt: 'now', files: [], ...over,
})
const profile = (mods: InstalledMod[]): Profile => ({ id: 'p', name: 'Default', mods })
const game: GameInstall = { root: '/games/surf', source: 'steam', backend: 'mono' }

describe('parseLine', () => {
  it('classifies BepInEx levels', () => {
    expect(parseLine('[Error  : SurfMP] boom').level).toBe('error')
    expect(parseLine('[Fatal  : BepInEx] worse').level).toBe('error')
    expect(parseLine('[Warning: Thing] hmm').level).toBe('warning')
    expect(parseLine('[Info   : Thing] fine').level).toBe('info')
  })

  it('extracts the emitting plugin, which is the point of reading a log', () => {
    expect(parseLine('[Error  : SurfMP] boom').source).toBe('SurfMP')
  })

  it('treats an unprefixed line as info rather than guessing', () => {
    expect(parseLine('just some text')).toMatchObject({ level: 'info', source: null })
  })
})

describe('candidatePaths', () => {
  it('prefers the profile, since Doorstop points there', () => {
    const [first] = candidatePaths('/p/default', '/games/surf')
    expect(first).toBe(join('/p/default', 'BepInEx', 'LogOutput.log'))
  })
  it('also checks the game folder, for a hand-installed BepInEx', () => {
    expect(candidatePaths('/p/default', '/games/surf')).toHaveLength(2)
  })
})

describe('readLog', () => {
  it('reads and classifies lines', () => {
    writeLog(dir, '[Info   : BepInEx] start\n[Error  : SurfMP] boom\n')
    const r = readLog(dir)
    expect(r.lines).toHaveLength(2)
    expect(r.lines[1]).toMatchObject({ level: 'error', source: 'SurfMP' })
  })

  it('reports nothing found rather than throwing', () => {
    expect(readLog(dir)).toMatchObject({ path: null, lines: [] })
  })

  it('keeps only the tail of a huge log, and says so', () => {
    // Real BepInEx logs reach tens of megabytes; loading it all would stall the UI.
    writeLog(dir, 'x'.repeat(MAX_LOG_BYTES * 2))
    const r = readLog(dir)
    expect(r.truncated).toBe(true)
    expect(r.sizeBytes).toBeGreaterThan(MAX_LOG_BYTES)
  })

  it('falls back to the game folder when the profile has no log', () => {
    const gameDir = mkdtempSync(join(tmpdir(), 'tidepool-game-'))
    writeLog(gameDir, '[Info   : BepInEx] from the game folder\n')
    expect(readLog(dir, gameDir).path).toContain(gameDir)
    rmSync(gameDir, { recursive: true, force: true })
  })
})

describe('buildSupportBundle', () => {
  const bundle = (over: Partial<Parameters<typeof buildSupportBundle>[0]> = {}) =>
    buildSupportBundle({
      profile: profile([mod('Owner-Mod'), mod('Dep-Lib', { viaDependency: true, enabled: false })]),
      game,
      log: readLog(dir),
      appVersion: '0.1.0',
      platform: 'darwin',
      ...over,
    })

  it('leads with errors, because that is what a helper reads first', () => {
    writeLog(dir, '[Info : X] noise\n[Error : SurfMP] boom\n')
    const text = bundle({ log: readLog(dir) })
    expect(text.indexOf('### Errors')).toBeLessThan(text.indexOf('### Mods'))
    expect(text).toContain('[Error : SurfMP] boom')
  })

  it('lists mods with their disabled and dependency state', () => {
    const text = bundle()
    expect(text).toContain('Owner-Mod 1.0.0')
    expect(text).toContain('Dep-Lib 1.0.0  (disabled, dependency)')
  })

  it('says so plainly when there are no errors', () => {
    writeLog(dir, '[Info : X] all fine\n')
    expect(bundle({ log: readLog(dir) })).toContain('No errors in the log.')
  })

  it('copes with no game, no profile and no log', () => {
    const text = bundle({ profile: null, game: null, log: readLog(dir) })
    expect(text).toContain('Game: not found')
    expect(text).toContain('None installed.')
  })

  it('caps how many errors it pastes', () => {
    writeLog(dir, Array.from({ length: 50 }, (_, i) => `[Error : X] e${i}`).join('\n'))
    const text = bundle({ log: readLog(dir) })
    expect(text).toContain('e49')
    expect(text).not.toContain('e10')
  })
})
