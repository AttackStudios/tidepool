import { afterEach, describe, expect, it, vi } from 'vitest'
import { Catalog } from './catalog'
import { findUpdates, isOutdated } from './updates'
import { CommunityNotFoundError, ThunderstoreUnavailableError } from './thunderstore'
import type { InstalledMod, Package, Profile } from '../../shared/types'

const version = (full: string, v: string) => ({
  full_name: `${full}-${v}`, name: 'x', version_number: v,
  download_url: `https://example.test/${full}-${v}.zip`,
  dependencies: [], file_size: 1, downloads: 1,
})

const pkg = (full: string, versions: string[]): Package => ({
  name: full.split('-').slice(1).join('-'),
  full_name: full,
  owner: full.split('-')[0] ?? '',
  is_deprecated: false,
  versions: versions.map((v) => version(full, v)),
})

const mod = (fullName: string, v: string, over: Partial<InstalledMod> = {}): InstalledMod => ({
  fullName, version: v, enabled: true, installedAt: 'now', files: [], ...over,
})

const profile = (mods: InstalledMod[]): Profile => ({ id: 'p', name: 'P', mods })

function stubFetch(packages: Package[]) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    status: 200, ok: true, json: async () => packages,
  }) as unknown as Response))
}
afterEach(() => vi.unstubAllGlobals())

describe('isOutdated', () => {
  it('compares numerically rather than lexically', () => {
    expect(isOutdated(mod('A-B', '1.9.0'), '1.10.0')).toBe(true)
    expect(isOutdated(mod('A-B', '1.10.0'), '1.9.0')).toBe(false)
  })
  it('is false when there is no known latest', () => {
    expect(isOutdated(mod('A-B', '1.0.0'), null)).toBe(false)
  })
})

describe('findUpdates', () => {
  it('reports a mod with a newer version, with the ref to install', async () => {
    stubFetch([pkg('Owner-Mod', ['1.0.0', '2.0.0'])])
    const updates = await findUpdates(profile([mod('Owner-Mod', '1.0.0')]), new Catalog(), 'x')
    expect(updates).toEqual([{
      fullName: 'Owner-Mod', current: '1.0.0', latest: '2.0.0',
      ref: 'Owner-Mod-2.0.0', viaDependency: false,
    }])
  })

  it('says nothing when everything is current', async () => {
    stubFetch([pkg('Owner-Mod', ['1.0.0'])])
    expect(await findUpdates(profile([mod('Owner-Mod', '1.0.0')]), new Catalog(), 'x')).toEqual([])
  })

  it('never suggests a downgrade', async () => {
    // Installing ahead of the catalog is normal after a package is pulled.
    stubFetch([pkg('Owner-Mod', ['1.0.0'])])
    expect(await findUpdates(profile([mod('Owner-Mod', '2.0.0')]), new Catalog(), 'x')).toEqual([])
  })

  it('skips a mod that is no longer in the catalog', async () => {
    stubFetch([pkg('Other-Thing', ['1.0.0'])])
    expect(await findUpdates(profile([mod('Gone-Mod', '1.0.0')]), new Catalog(), 'x')).toEqual([])
  })

  it('marks updates that came in as dependencies', async () => {
    stubFetch([pkg('Owner-Dep', ['1.0.0', '1.1.0'])])
    const updates = await findUpdates(
      profile([mod('Owner-Dep', '1.0.0', { viaDependency: true })]), new Catalog(), 'x',
    )
    expect(updates[0]?.viaDependency).toBe(true)
  })
})


describe('when there is no catalogue to compare against', () => {
  const profile = {
    id: 'default', name: 'Default',
    mods: [{ fullName: 'BepInEx-BepInExPack_IL2CPP', version: '6.0.755', files: [], enabled: true }],
  } as unknown as Profile

  // Release day: the Thunderstore community does not exist until approved, and
  // BepInEx came from Essentials so it was never a Thunderstore package. An
  // error here shows a first-time user a broken Installed tab on a good install.
  it('reports no updates when the community does not exist', async () => {
    const catalog = {
      detail: async () => { throw new CommunityNotFoundError('surf-sandbox') },
    } as unknown as Catalog
    await expect(findUpdates(profile, catalog, 'surf-sandbox')).resolves.toEqual([])
  })

  it('reports no updates when Thunderstore is unreachable', async () => {
    const catalog = {
      detail: async () => { throw new ThunderstoreUnavailableError('503') },
    } as unknown as Catalog
    await expect(findUpdates(profile, catalog)).resolves.toEqual([])
  })

  // A real bug must still surface rather than being read as "up to date".
  it('still throws on anything else', async () => {
    const catalog = {
      detail: async () => { throw new TypeError('undefined is not a function') },
    } as unknown as Catalog
    await expect(findUpdates(profile, catalog)).rejects.toThrow(TypeError)
  })
})
