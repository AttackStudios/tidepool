/**
 * In-memory package catalog for one community, backed by an on-disk cache.
 *
 * Holds the full index (needed to walk pinned dependency versions) but only ever
 * hands the renderer a page of summaries. Measured against lethal-company the
 * full index is ~311 MB across 50,362 packages, so this boundary is load-bearing,
 * not a nicety.
 */
import type {
  BrowsePage,
  BrowseQuery,
  DependencyRef,
  Package,
  PackageSummary,
  PackageVersion,
  Resolution,
} from '../../shared/types'
import { browse, toSummary } from '../../shared/browse'
import { compareVersions, indexPackages, latestVersion, resolve } from '../../shared/deps'
import { DEFAULT_COMMUNITY, fetchPackages } from './thunderstore'
import { IndexCache } from './indexcache'

/** How long an index stays fresh before we go back to Thunderstore. */
export const CATALOG_TTL_MS = 15 * 60 * 1000

export interface PackageDetail {
  summary: PackageSummary
  versions: PackageVersion[]
  latest: PackageVersion | null
}

export interface CatalogStatus {
  community: string
  packages: number
  fetchedAt: number
  /** True when served from cache after the network failed. */
  stale: boolean
}

interface Snapshot {
  community: string
  packages: Package[]
  byName: Map<string, Package>
  summaries: PackageSummary[]
  fetchedAt: number
  stale: boolean
}

export class Catalog {
  private snapshot: Snapshot | null = null
  private inflight: Promise<Snapshot> | null = null

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly cache: IndexCache | null = null,
  ) {}

  private build(community: string, packages: Package[], fetchedAt: number, stale: boolean): Snapshot {
    const snapshot: Snapshot = {
      community,
      packages,
      byName: indexPackages(packages),
      summaries: packages.map(toSummary),
      fetchedAt,
      stale,
    }
    this.snapshot = snapshot
    return snapshot
  }

  private fresh(community: string): boolean {
    return (
      this.snapshot !== null &&
      this.snapshot.community === community &&
      !this.snapshot.stale &&
      this.now() - this.snapshot.fetchedAt < CATALOG_TTL_MS
    )
  }

  /**
   * Load the index: memory, then disk, then network.
   *
   * If the network fails but a cached copy exists, that copy is served and
   * flagged stale — an out-of-date list beats an error page.
   */
  async load(community: string = DEFAULT_COMMUNITY, force = false): Promise<Snapshot> {
    if (!force && this.fresh(community) && this.snapshot) return this.snapshot
    // Without this, opening the browser fires several overlapping 311 MB fetches.
    if (this.inflight) return this.inflight

    this.inflight = (async () => {
      const cached = this.cache?.read(community) ?? null
      if (!force && cached && this.now() - cached.fetchedAt < CATALOG_TTL_MS) {
        return this.build(community, cached.packages, cached.fetchedAt, false)
      }

      try {
        const packages = await fetchPackages({ community })
        const fetchedAt = this.now()
        this.cache?.write(community, packages, fetchedAt)
        return this.build(community, packages, fetchedAt, false)
      } catch (error) {
        if (cached) return this.build(community, cached.packages, cached.fetchedAt, true)
        throw error
      }
    })()

    try {
      return await this.inflight
    } finally {
      this.inflight = null
    }
  }

  async browse(query: BrowseQuery, community?: string): Promise<BrowsePage> {
    const snapshot = await this.load(community)
    return browse(snapshot.summaries, query)
  }

  async detail(fullName: string, community?: string): Promise<PackageDetail | null> {
    const snapshot = await this.load(community)
    const pkg = snapshot.byName.get(fullName)
    if (!pkg) return null
    return {
      summary: toSummary(pkg),
      // Sorted explicitly rather than trusting the API's order. Thunderstore
      // happens to return newest-first today, but relying on that once already
      // produced an oldest-first version list.
      versions: [...pkg.versions].sort((a, b) =>
        compareVersions(b.version_number, a.version_number),
      ),
      latest: latestVersion(pkg),
    }
  }

  /** Look up one exact published version, as pinned by a dependency ref. */
  async versionFor(ref: DependencyRef, community?: string): Promise<PackageVersion | null> {
    const snapshot = await this.load(community)
    const pkg = snapshot.byName.get(ref.fullName)
    if (!pkg) return null
    return pkg.versions.find((v) => v.version_number === ref.version) ?? null
  }

  async resolve(refs: string[], community?: string): Promise<Resolution> {
    const snapshot = await this.load(community)
    return resolve(refs, snapshot.byName)
  }

  async status(community?: string): Promise<CatalogStatus> {
    const s = await this.load(community)
    return { community: s.community, packages: s.packages.length, fetchedAt: s.fetchedAt, stale: s.stale }
  }
}
