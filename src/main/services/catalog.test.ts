import { afterEach, describe, expect, it, vi } from 'vitest'
import { CATALOG_TTL_MS, Catalog } from './catalog'
import type { Package } from '../../shared/types'

const pkg = (full: string, deps: string[] = []): Package => ({
  name: full.split('-').slice(1).join('-'),
  full_name: full,
  owner: full.split('-')[0] ?? '',
  is_deprecated: false,
  rating_score: 1,
  categories: ['Mods'],
  date_updated: '2026-01-01T00:00:00Z',
  versions: [{
    full_name: `${full}-1.0.0`, name: 'x', version_number: '1.0.0',
    download_url: 'https://example.test/x.zip', dependencies: deps,
    file_size: 1, downloads: 7, description: 'd',
  }],
})

function stubFetch(packages: Package[]) {
  const fetchMock = vi.fn(async () => ({
    status: 200, ok: true, json: async () => packages,
  }) as unknown as Response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe('Catalog', () => {
  it('serves a page of summaries rather than raw packages', async () => {
    stubFetch([pkg('Owner-Mod')])
    const page = await new Catalog().browse({}, 'x')
    expect(page.total).toBe(1)
    expect(page.items[0]).toMatchObject({ fullName: 'Owner-Mod', downloads: 7 })
    // Crucially not the 311 MB shape: no versions array crosses this boundary.
    expect(page.items[0]).not.toHaveProperty('versions')
  })

  it('reuses a fresh index instead of refetching', async () => {
    const fetchMock = stubFetch([pkg('Owner-Mod')])
    const catalog = new Catalog()
    await catalog.browse({}, 'x')
    await catalog.browse({ search: 'mod' }, 'x')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refetches once the index goes stale', async () => {
    const fetchMock = stubFetch([pkg('Owner-Mod')])
    let now = 0
    const catalog = new Catalog(() => now)
    await catalog.browse({}, 'x')
    now += CATALOG_TTL_MS + 1
    await catalog.browse({}, 'x')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('coalesces concurrent loads into one fetch', async () => {
    // Without this, opening the UI fires several overlapping index downloads.
    const fetchMock = stubFetch([pkg('Owner-Mod')])
    const catalog = new Catalog()
    await Promise.all([catalog.browse({}, 'x'), catalog.browse({}, 'x'), catalog.stats('x')])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refetches when the community changes', async () => {
    const fetchMock = stubFetch([pkg('Owner-Mod')])
    const catalog = new Catalog()
    await catalog.browse({}, 'a')
    await catalog.browse({}, 'b')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns detail with versions newest-first', async () => {
    // The live API returns newest-first, so the fixture matches that ordering.
    // An earlier fixture used the opposite order and hid a reversed list.
    const p = pkg('Owner-Mod')
    p.versions = [
      { ...p.versions[0]!, version_number: '2.0.0', full_name: 'Owner-Mod-2.0.0' },
      { ...p.versions[0]!, version_number: '1.0.0', full_name: 'Owner-Mod-1.0.0' },
    ]
    stubFetch([p])
    const detail = await new Catalog().detail('Owner-Mod', 'x')
    expect(detail?.versions.map((v) => v.version_number)).toEqual(['2.0.0', '1.0.0'])
    expect(detail?.latest?.version_number).toBe('2.0.0')
  })

  it('sorts versions rather than trusting the order it was given', async () => {
    const p = pkg('Owner-Mod')
    p.versions = [
      { ...p.versions[0]!, version_number: '1.9.0', full_name: 'Owner-Mod-1.9.0' },
      { ...p.versions[0]!, version_number: '1.10.0', full_name: 'Owner-Mod-1.10.0' },
      { ...p.versions[0]!, version_number: '1.2.0', full_name: 'Owner-Mod-1.2.0' },
    ]
    stubFetch([p])
    const detail = await new Catalog().detail('Owner-Mod', 'x')
    expect(detail?.versions.map((v) => v.version_number)).toEqual(['1.10.0', '1.9.0', '1.2.0'])
  })

  it('returns null for an unknown package', async () => {
    stubFetch([pkg('Owner-Mod')])
    expect(await new Catalog().detail('Nope-Missing', 'x')).toBeNull()
  })

  it('resolves dependencies against the loaded index', async () => {
    stubFetch([pkg('A-Top', ['B-Base-1.0.0']), pkg('B-Base')])
    const r = await new Catalog().resolve(['A-Top-1.0.0'], 'x')
    expect(r.order.map((o) => o.fullName)).toEqual(['B-Base', 'A-Top'])
  })
})
