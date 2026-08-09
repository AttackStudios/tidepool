/**
 * Search, sort and pagination over a package index.
 *
 * Pure functions, and deliberately run in the main process rather than the
 * renderer: a mature community's full index measured 311 MB (50,362 packages /
 * 190,959 versions), so only the resulting page ever crosses IPC.
 */
import type {
  BrowsePage,
  BrowseQuery,
  Package,
  PackageSummary,
  SortKey,
} from './types'
import { latestVersion } from './deps'

export const DEFAULT_PAGE_SIZE = 60

/** Downloads are recorded per version, so a package total is the sum. */
export function totalDownloads(pkg: Package): number {
  let total = 0
  for (const v of pkg.versions) total += v.downloads ?? 0
  return total
}

export function toSummary(pkg: Package): PackageSummary {
  const latest = latestVersion(pkg)
  return {
    fullName: pkg.full_name,
    name: pkg.name,
    owner: pkg.owner,
    description: latest?.description ?? '',
    icon: latest?.icon ?? null,
    latestVersion: latest?.version_number ?? '0.0.0',
    downloads: totalDownloads(pkg),
    rating: pkg.rating_score ?? 0,
    categories: pkg.categories ?? [],
    isDeprecated: pkg.is_deprecated,
    isPinned: pkg.is_pinned ?? false,
    isNsfw: pkg.has_nsfw_content ?? false,
    dateUpdated: pkg.date_updated ?? '',
    packageUrl: pkg.package_url ?? null,
  }
}

/**
 * Score a package against a search query. 0 means "no match".
 *
 * Weighted so an exact name match always outranks an incidental mention in
 * someone else's description — searching "BepInEx" should surface BepInEx.
 */
export function score(summary: PackageSummary, query: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 1

  const name = summary.name.toLowerCase()
  const owner = summary.owner.toLowerCase()
  const description = summary.description.toLowerCase()

  if (name === q) return 100
  if (name.startsWith(q)) return 80
  if (name.includes(q)) return 60
  if (owner === q) return 50
  if (owner.includes(q)) return 30
  if (summary.categories.some((c) => c.toLowerCase() === q)) return 25
  if (description.includes(q)) return 10
  return 0
}

function comparator(sort: SortKey, scores: Map<string, number>) {
  return (a: PackageSummary, b: PackageSummary): number => {
    switch (sort) {
      case 'downloads':
        return b.downloads - a.downloads
      case 'rating':
        return b.rating - a.rating
      case 'updated':
        return b.dateUpdated.localeCompare(a.dateUpdated)
      case 'name':
        return a.name.localeCompare(b.name)
      case 'relevance':
      default: {
        const diff = (scores.get(b.fullName) ?? 0) - (scores.get(a.fullName) ?? 0)
        // Ties broken by popularity so relevance never returns an arbitrary order.
        return diff !== 0 ? diff : b.downloads - a.downloads
      }
    }
  }
}

/** Every distinct category present, sorted, for building a filter list. */
export function collectCategories(summaries: PackageSummary[]): string[] {
  const set = new Set<string>()
  for (const s of summaries) for (const c of s.categories) set.add(c)
  return [...set].sort((a, b) => a.localeCompare(b))
}

export function browse(summaries: PackageSummary[], query: BrowseQuery = {}): BrowsePage {
  const {
    search = '',
    category = null,
    sort = search.trim() ? 'relevance' : 'downloads',
    includeDeprecated = false,
    includeNsfw = false,
    page = 0,
    pageSize = DEFAULT_PAGE_SIZE,
  } = query

  const scores = new Map<string, number>()
  const matched: PackageSummary[] = []

  for (const summary of summaries) {
    if (!includeDeprecated && summary.isDeprecated) continue
    if (!includeNsfw && summary.isNsfw) continue
    if (category && !summary.categories.includes(category)) continue

    const s = score(summary, search)
    if (s === 0) continue
    scores.set(summary.fullName, s)
    matched.push(summary)
  }

  matched.sort(comparator(sort, scores))

  const start = Math.max(0, page) * pageSize
  return {
    items: matched.slice(start, start + pageSize),
    total: matched.length,
    page,
    pageSize,
    categories: collectCategories(summaries),
  }
}
