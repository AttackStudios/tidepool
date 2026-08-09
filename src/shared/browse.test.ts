import { describe, expect, it } from 'vitest'
import { browse, collectCategories, score, toSummary, totalDownloads } from './browse'
import type { Package, PackageSummary } from './types'

const pkg = (over: Partial<Package> & { full_name: string }): Package => ({
  name: over.full_name.split('-').slice(1).join('-'),
  owner: over.full_name.split('-')[0] ?? '',
  is_deprecated: false,
  versions: [
    {
      full_name: `${over.full_name}-1.0.0`,
      name: 'x',
      version_number: '1.0.0',
      download_url: 'https://example.test/x.zip',
      dependencies: [],
      file_size: 1,
      downloads: 10,
      description: 'a mod',
    },
  ],
  ...over,
})

const summary = (over: Partial<PackageSummary> & { fullName: string }): PackageSummary => ({
  name: 'Mod', owner: 'Owner', description: '', icon: null, latestVersion: '1.0.0',
  downloads: 0, rating: 0, categories: [], isDeprecated: false, isPinned: false,
  isNsfw: false, dateUpdated: '2026-01-01', packageUrl: null, ...over,
})

describe('totalDownloads', () => {
  it('sums across versions, since downloads are per-version', () => {
    const p = pkg({ full_name: 'Owner-Mod' })
    p.versions.push({ ...p.versions[0]!, version_number: '2.0.0', downloads: 5 })
    expect(totalDownloads(p)).toBe(15)
  })
  it('treats a missing download count as zero', () => {
    const p = pkg({ full_name: 'Owner-Mod' })
    delete p.versions[0]!.downloads
    expect(totalDownloads(p)).toBe(0)
  })
})

describe('toSummary', () => {
  it('takes description and icon from the newest version', () => {
    const p = pkg({ full_name: 'Owner-Mod' })
    p.versions.push({ ...p.versions[0]!, version_number: '2.0.0', description: 'newer' })
    const s = toSummary(p)
    expect(s.latestVersion).toBe('2.0.0')
    expect(s.description).toBe('newer')
  })
})

describe('score', () => {
  it('ranks an exact name match above a description mention', () => {
    const exact = summary({ fullName: 'A-BepInEx', name: 'BepInEx' })
    const mention = summary({ fullName: 'B-Other', name: 'Other', description: 'needs BepInEx' })
    expect(score(exact, 'bepinex')).toBeGreaterThan(score(mention, 'bepinex'))
  })
  it('ranks a prefix match above a mid-string match', () => {
    expect(score(summary({ fullName: 'A-B', name: 'SurfTools' }), 'surf'))
      .toBeGreaterThan(score(summary({ fullName: 'C-D', name: 'BigSurfer' }), 'surf'))
  })
  it('returns 0 for no match, and matches everything on an empty query', () => {
    expect(score(summary({ fullName: 'A-B', name: 'Zed' }), 'nope')).toBe(0)
    expect(score(summary({ fullName: 'A-B', name: 'Zed' }), '')).toBe(1)
  })
})

describe('browse', () => {
  const items = [
    summary({ fullName: 'A-Popular', name: 'Popular', downloads: 900, rating: 1 }),
    summary({ fullName: 'B-Liked', name: 'Liked', downloads: 10, rating: 99 }),
    summary({ fullName: 'C-Old', name: 'Old', downloads: 50, dateUpdated: '2020-01-01' }),
    summary({ fullName: 'D-Dead', name: 'Dead', isDeprecated: true, downloads: 999 }),
    summary({ fullName: 'E-Spicy', name: 'Spicy', isNsfw: true, downloads: 999 }),
    summary({ fullName: 'F-Tool', name: 'Tool', categories: ['Tools'], downloads: 5 }),
  ]

  it('hides deprecated and NSFW packages by default', () => {
    const names = browse(items).items.map((i) => i.name)
    expect(names).not.toContain('Dead')
    expect(names).not.toContain('Spicy')
  })

  it('can opt back into deprecated packages', () => {
    expect(browse(items, { includeDeprecated: true }).items.map((i) => i.name)).toContain('Dead')
  })

  it('defaults to sorting by downloads when not searching', () => {
    expect(browse(items).items[0]?.name).toBe('Popular')
  })

  it('defaults to relevance when searching', () => {
    // "Liked" has far fewer downloads but is the exact name match.
    expect(browse(items, { search: 'liked' }).items[0]?.name).toBe('Liked')
  })

  it('filters by category', () => {
    const page = browse(items, { category: 'Tools' })
    expect(page.total).toBe(1)
    expect(page.items[0]?.name).toBe('Tool')
  })

  it('sorts by rating and by recency on request', () => {
    expect(browse(items, { sort: 'rating' }).items[0]?.name).toBe('Liked')
    expect(browse(items, { sort: 'updated' }).items.at(-1)?.name).toBe('Old')
  })

  it('paginates without losing the total', () => {
    const page = browse(items, { pageSize: 2, page: 1 })
    expect(page.items).toHaveLength(2)
    expect(page.total).toBe(4)
  })

  it('returns an empty page past the end rather than throwing', () => {
    expect(browse(items, { pageSize: 2, page: 99 }).items).toEqual([])
  })

  it('reports categories from the whole index, not just the current page', () => {
    expect(browse(items, { search: 'nothingmatches' }).categories).toContain('Tools')
  })
})

describe('collectCategories', () => {
  it('deduplicates and sorts', () => {
    expect(collectCategories([
      summary({ fullName: 'A-1', categories: ['Tools', 'Audio'] }),
      summary({ fullName: 'B-2', categories: ['Tools'] }),
    ])).toEqual(['Audio', 'Tools'])
  })
})
