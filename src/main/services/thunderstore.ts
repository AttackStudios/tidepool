/**
 * Thunderstore API client.
 *
 * The Surf Sandbox community does not exist yet — Thunderstore only creates one
 * once there are mods ready to upload. The community slug is therefore a
 * parameter, not a constant, so this client can be developed and tested against
 * an existing community (try "lethal-company") long before ours exists.
 */
import type { Package } from '../../shared/types'
import { isTimeout, withTimeout } from './http'

export const DEFAULT_COMMUNITY = 'surf-sandbox'

/** A community known to exist, used to tell "no such community" from "site down". */
export const PROBE_COMMUNITY = 'lethal-company'

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

/** Thrown when Thunderstore itself is unreachable, as opposed to the community missing. */
export class ThunderstoreUnavailableError extends Error {
  /** `reason` covers the failures that never produce a status code at all. */
  constructor(public status: number, reason?: string) {
    super(
      reason
        ? `Thunderstore is unavailable right now — ${reason}. Try again shortly.`
        : `Thunderstore is unavailable right now (HTTP ${status}). Try again shortly.`,
    )
    this.name = 'ThunderstoreUnavailableError'
  }
}

/**
 * Fetch the full package listing for a community.
 *
 * Thunderstore answers an unknown community with **503**, not 404 — a nonsense
 * slug and a real outage look identical from one request. To keep "our community
 * doesn't exist yet" (the normal pre-launch state) distinguishable from "the site
 * is down", a 503 triggers one probe against a community known to exist.
 */
export async function fetchPackages(options: FetchOptions = {}): Promise<Package[]> {
  const community = options.community ?? DEFAULT_COMMUNITY
  const doFetch = options.fetchImpl ?? fetch

  let res: Response
  try {
    res = await doFetch(packageIndexUrl(community), { signal: withTimeout(options.signal) })
  } catch (error) {
    // Without this the raw "fetch failed" — or a timeout's "operation was
    // aborted" — reached the user as the whole explanation.
    throw new ThunderstoreUnavailableError(
      0,
      isTimeout(error) ? 'it took too long to answer' : 'it could not be reached',
    )
  }

  if (res.status === 404) throw new CommunityNotFoundError(community)

  if (res.status === 503) {
    if (community === PROBE_COMMUNITY) throw new ThunderstoreUnavailableError(res.status)
    const probe = await doFetch(packageIndexUrl(PROBE_COMMUNITY), { signal: withTimeout(options.signal) })
    // Probe fine, target 503 -> the community genuinely isn't there.
    if (probe.ok) throw new CommunityNotFoundError(community)
    throw new ThunderstoreUnavailableError(res.status)
  }

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
