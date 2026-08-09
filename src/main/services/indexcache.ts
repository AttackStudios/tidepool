/**
 * On-disk cache of a community's package index.
 *
 * Without this, every launch re-downloads the whole index — 311 MB for a mature
 * community — which is slow for the user and rude to Thunderstore. It also makes
 * the app usable offline: a stale cache is far better than an empty screen.
 *
 * Stored gzipped because the payload is highly repetitive JSON and compresses
 * roughly ten to one.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import type { Package } from '../../shared/types'

export interface CachedIndex {
  packages: Package[]
  fetchedAt: number
}

export class IndexCache {
  constructor(private readonly dir: string) {}

  /** Hashed so an odd community slug can never escape the cache directory. */
  private file(community: string): string {
    const key = createHash('sha256').update(community).digest('hex').slice(0, 16)
    return join(this.dir, `index-${key}.json.gz`)
  }

  read(community: string): CachedIndex | null {
    const file = this.file(community)
    if (!existsSync(file)) return null
    try {
      const parsed: unknown = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'))
      if (typeof parsed !== 'object' || parsed === null) return null
      const c = parsed as Partial<CachedIndex>
      if (!Array.isArray(c.packages) || typeof c.fetchedAt !== 'number') return null
      return { packages: c.packages, fetchedAt: c.fetchedAt }
    } catch {
      // A truncated or corrupt cache must never stop the app; drop it and refetch.
      try { unlinkSync(file) } catch { /* already gone */ }
      return null
    }
  }

  write(community: string, packages: Package[], fetchedAt: number): void {
    try {
      mkdirSync(this.dir, { recursive: true })
      const body = gzipSync(Buffer.from(JSON.stringify({ packages, fetchedAt }), 'utf8'))
      // Write-then-rename, so a crash mid-write can't leave a half-file that
      // reads as valid gzip but truncated JSON.
      const tmp = `${this.file(community)}.tmp`
      writeFileSync(tmp, body)
      renameSync(tmp, this.file(community))
    } catch {
      // Caching is an optimisation; failing to write it must not fail the fetch.
    }
  }
}
