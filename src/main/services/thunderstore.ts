/**
 * Thunderstore API client.
 *
 * The Surf Sandbox community does not exist yet — Thunderstore only creates one
 * once there are mods ready to upload. The community slug is therefore a
 * parameter, not a constant, so this client can be developed and tested against
 * an existing community (try "lethal-company") long before ours exists.
 */
import type { Package } from '../../shared/types'

export const DEFAULT_COMMUNITY = 'surf-sandbox'

export interface FetchOptions {
  community?: string
  signal?: AbortSignal
  /** Injectable for tests. */
  fetchImpl?: typeof fetch
}

export function packageIndexUrl(community: string): string {
  return `https://thunderstore.io/c/${community}/api/v1/package/`
}

/** Thrown when a community slug doesn't exist yet — expected before launch. */
export class CommunityNotFoundError extends Error {
  constructor(public community: string) {
    super(
      `Thunderstore has no community "${community}" yet. ` +
        `Communities are created on request once mods are ready to upload.`,
    )
    this.name = 'CommunityNotFoundError'
  }
}

/** Fetch the full package listing for a community. */
export async function fetchPackages(options: FetchOptions = {}): Promise<Package[]> {
  const community = options.community ?? DEFAULT_COMMUNITY
  const doFetch = options.fetchImpl ?? fetch

  const res = await doFetch(packageIndexUrl(community), { signal: options.signal })

  if (res.status === 404) throw new CommunityNotFoundError(community)
  if (!res.ok) throw new Error(`Thunderstore returned ${res.status} for "${community}"`)

  const body: unknown = await res.json()
  if (!Array.isArray(body)) throw new Error('Thunderstore returned an unexpected shape')

  return body.filter(isPackage)
}

/** Structural check — the API is not versioned tightly, so be defensive. */
function isPackage(value: unknown): value is Package {
  if (typeof value !== 'object' || value === null) return false
  const p = value as Record<string, unknown>
  return (
    typeof p.full_name === 'string' &&
    typeof p.owner === 'string' &&
    Array.isArray(p.versions)
  )
}
