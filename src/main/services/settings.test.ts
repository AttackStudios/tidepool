import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, SettingsStore } from './settings'
import type { Settings } from '../../shared/types'
import { DEFAULT_COMMUNITY } from './thunderstore'

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tidepool-s-'))
  file = join(dir, 'settings.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('shipped defaults', () => {
  it('points at our own community, not a development target', () => {
    // A shipped build defaulting to another game's mods would be baffling, and
    // it is the sort of thing only noticed on launch day.
    expect(DEFAULT_SETTINGS.community).toBe(DEFAULT_COMMUNITY)
    expect(DEFAULT_SETTINGS.community).toBe('surf-sandbox')
  })
})

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

describe('writing hostile values', () => {
  it('refuses to persist a wrong type, rather than cleaning up on the next read', () => {
    const store = new SettingsStore(file)
    const written = store.write({
      gamePath: 12345,
      community: ['an array'],
      seenWelcome: 'yes',
    } as unknown as Partial<Settings>)

    // The value handed straight back to the UI is already clean.
    expect(written).toMatchObject({ gamePath: null, seenWelcome: false })
    expect(typeof written.community).toBe('string')
    // And so is the file, so nothing odd is left sitting on disk.
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ gamePath: null })
  })

  it('ignores keys that are not settings', () => {
    new SettingsStore(file).write({ nonsense: 'value' } as unknown as Partial<Settings>)
    expect(Object.keys(JSON.parse(readFileSync(file, 'utf8'))).sort())
      .toEqual(['beachPath', 'community', 'gamePath', 'lastProfileId', 'seenWelcome'])
  })

  it('leaves the prototype alone', () => {
    new SettingsStore(file).write(JSON.parse('{"__proto__":{"polluted":true}}') as Partial<Settings>)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})
