/**
 * In-memory package catalog for one community.
 *
 * Holds the full index (needed to walk pinned dependency versions) but only ever
 * hands the renderer a page of summaries. Measured against lethal-company the
 * full index is ~311 MB across 50,362 packages, so this boundary is load-bearing,
 * not a nicety.
 */
import type {
  BrowsePage,
  BrowseQuery,
  Package,
  PackageSummary,
  PackageVersion,
  Resolution,
} from '../../shared/types'
import { browse, toSummary } from '../../shared/browse'
import { indexPackages, latestVersion, resolve } from '../../shared/deps'
import { DEFAULT_COMMUNITY, fetchPackages } from './thunderstore'

/** How long a fetched index stays fresh before we go back to Thunderstore. */
export const CATALOG_TTL_MS = 15 * 60 * 1000

export interface PackageDetail {
  summary: PackageSummary
  versions: PackageVersion[]
  latest: PackageVersion | null
}

interface Snapshot {
  community: string
  packages: Package[]
  byName: Map<string, Package>
  summaries: PackageSummary[]
  fetchedAt: number
}

export class Catalog {
  private snapshot: Snapshot | null = null
  private inflight: Promise<Snapshot> | null = null

  constructor(private readonly now: () => number = () => Date.now()) {}

  private fresh(community: string): boolean {
    return (
      this.snapshot !== null &&
      this.snapshot.community === community &&
      this.now() - this.snapshot.fetchedAt < CATALOG_TTL_MS
    )
  }

  /** Load the index, reusing a fresh one and coalescing concurrent callers. */
  async load(community: string = DEFAULT_COMMUNITY, force = false): Promise<Snapshot> {
    if (!force && this.fresh(community) && this.snapshot) return this.snapshot
    // Without this, opening the browser fires several overlapping 311 MB fetches.
    if (this.inflight) return this.inflight

    this.inflight = (async () => {
      const packages = await fetchPackages({ community })
      const snapshot: Snapshot = {
        community,
        packages,
        byName: indexPackages(packages),
        summaries: packages.map(toSummary),
        fetchedAt: this.now(),
      }
      this.snapshot = snapshot
      return snapshot
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
      // Newest first is what a version picker wants.
      versions: [...pkg.versions].reverse(),
      latest: latestVersion(pkg),
    }
  }

  async resolve(refs: string[], community?: string): Promise<Resolution> {
    const snapshot = await this.load(community)
    return resolve(refs, snapshot.byName)
  }

  /** Stats for the UI footer — also the cheapest way to see the index loaded. */
  async stats(community?: string) {
    const snapshot = await this.load(community)
    return {
      community: snapshot.community,
      packages: snapshot.packages.length,
      fetchedAt: snapshot.fetchedAt,
    }
  }
}
