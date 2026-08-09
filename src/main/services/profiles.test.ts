import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProfileStore, slugify } from './profiles'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'tidepool-')) })
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

describe('slugify', () => {
  it('makes a filesystem-safe id', () => {
    expect(slugify('My Cool Profile!')).toBe('my-cool-profile')
  })
  it('never returns an empty id', () => {
    expect(slugify('!!!')).toBe('profile')
  })
})

describe('ProfileStore', () => {
  it('creates a profile with a BepInEx plugin folder ready', () => {
    const store = new ProfileStore(root)
    const profile = store.create('Default')
    expect(existsSync(join(store.dir(profile.id), 'BepInEx', 'plugins'))).toBe(true)
  })

  it('does not collide when two profiles share a name', () => {
    const store = new ProfileStore(root)
    expect(store.create('Test').id).toBe('test')
    expect(store.create('Test').id).toBe('test-2')
  })

  it('round-trips through disk', () => {
    const store = new ProfileStore(root)
    const created = store.create('Modded')
    store.setMods(created.id, [
      { fullName: 'Owner-Mod', version: '1.0.0', enabled: true, installedAt: 'now' },
    ])
    expect(new ProfileStore(root).read(created.id)?.mods).toHaveLength(1)
  })

  it('skips a corrupt profile rather than failing the whole list', () => {
    const store = new ProfileStore(root)
    store.create('Good')
    const bad = join(root, 'broken')
    store.create('Broken')
    writeFileSync(join(bad, 'profile.json'), '{ not json', 'utf8')
    expect(store.list().map((p) => p.name)).toEqual(['Good'])
  })

  it('deletes a profile', () => {
    const store = new ProfileStore(root)
    const p = store.create('Temp')
    store.delete(p.id)
    expect(store.read(p.id)).toBeNull()
  })
})
