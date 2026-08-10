import { afterEach, describe, expect, it, vi } from 'vitest'
import { Catalog } from './catalog'
import { analyseRemoval } from './dependents'
import type { InstalledMod, Package, Profile } from '../../shared/types'

const pkg = (full: string, deps: string[] = []): Package => ({
  name: full.split('-').slice(1).join('-'),
  full_name: full,
  owner: full.split('-')[0] ?? '',
  is_deprecated: false,
  versions: [{
    full_name: `${full}-1.0.0`, name: 'x', version_number: '1.0.0',
    download_url: 'https://example.test/x.zip', dependencies: deps, file_size: 1,
  }],
})

const mod = (fullName: string, viaDependency = false): InstalledMod => ({
  fullName, version: '1.0.0', enabled: true, installedAt: 'now', files: [], viaDependency,
})

const profile = (mods: InstalledMod[]): Profile => ({ id: 'p', name: 'P', mods })

function stubFetch(packages: Package[]) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    status: 200, ok: true, json: async () => packages,
  }) as unknown as Response))
}
afterEach(() => vi.unstubAllGlobals())

describe('analyseRemoval', () => {
  it('names the mods that would break', async () => {
    stubFetch([pkg('A-App', ['Lib-Core-1.0.0']), pkg('B-App', ['Lib-Core-1.0.0']), pkg('Lib-Core')])
    const impact = await analyseRemoval(
      profile([mod('A-App'), mod('B-App'), mod('Lib-Core', true)]),
      'Lib-Core', new Catalog(), 'x',
    )
    expect(impact.dependents.sort()).toEqual(['A-App', 'B-App'])
  })

  it('reports nothing when a leaf mod is removed', async () => {
    stubFetch([pkg('A-App', ['Lib-Core-1.0.0']), pkg('Lib-Core')])
    const impact = await analyseRemoval(
      profile([mod('A-App'), mod('Lib-Core', true)]), 'A-App', new Catalog(), 'x',
    )
    expect(impact.dependents).toEqual([])
  })

  it('spots a dependency left needed by nothing', async () => {
    stubFetch([pkg('A-App', ['Lib-Core-1.0.0']), pkg('Lib-Core')])
    const impact = await analyseRemoval(
      profile([mod('A-App'), mod('Lib-Core', true)]), 'A-App', new Catalog(), 'x',
    )
    expect(impact.orphans).toEqual(['Lib-Core'])
  })

  it('keeps a dependency that something else still needs', async () => {
    stubFetch([pkg('A-App', ['Lib-Core-1.0.0']), pkg('B-App', ['Lib-Core-1.0.0']), pkg('Lib-Core')])
    const impact = await analyseRemoval(
      profile([mod('A-App'), mod('B-App'), mod('Lib-Core', true)]), 'A-App', new Catalog(), 'x',
    )
    expect(impact.orphans).toEqual([])
  })

  it('never calls a deliberately installed mod an orphan', async () => {
    // Something the user chose is theirs to keep, even if nothing depends on it.
    stubFetch([pkg('A-App', ['Lib-Core-1.0.0']), pkg('Lib-Core')])
    const impact = await analyseRemoval(
      profile([mod('A-App'), mod('Lib-Core', false)]), 'A-App', new Catalog(), 'x',
    )
    expect(impact.orphans).toEqual([])
  })

  it('copes with a mod missing from the catalog', async () => {
    stubFetch([pkg('A-App')])
    const impact = await analyseRemoval(
      profile([mod('A-App'), mod('Gone-Mod')]), 'A-App', new Catalog(), 'x',
    )
    expect(impact.dependents).toEqual([])
  })
})
