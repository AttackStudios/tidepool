import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, SettingsStore } from './settings'

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tidepool-s-'))
  file = join(dir, 'settings.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('SettingsStore', () => {
  it('returns defaults before anything is written', () => {
    expect(new SettingsStore(file).read()).toEqual(DEFAULT_SETTINGS)
  })

  it('round-trips a patch without dropping other keys', () => {
    const store = new SettingsStore(file)
    store.write({ gamePath: '/games/surf' })
    store.write({ community: 'valheim' })
    expect(store.read()).toMatchObject({ gamePath: '/games/surf', community: 'valheim' })
  })

  it('falls back to defaults on a corrupt file rather than failing to start', () => {
    writeFileSync(file, '{ this is not json', 'utf8')
    expect(new SettingsStore(file).read()).toEqual(DEFAULT_SETTINGS)
  })

  it('ignores values of the wrong type', () => {
    writeFileSync(file, JSON.stringify({ gamePath: 42, community: null }), 'utf8')
    const s = new SettingsStore(file).read()
    expect(s.gamePath).toBeNull()
    expect(s.community).toBe(DEFAULT_SETTINGS.community)
  })

  it('creates the containing directory when writing', () => {
    const nested = new SettingsStore(join(dir, 'a', 'b', 'settings.json'))
    expect(nested.write({ community: 'x' }).community).toBe('x')
  })
})
