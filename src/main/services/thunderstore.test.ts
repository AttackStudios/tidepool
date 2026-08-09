import { describe, expect, it } from 'vitest'
import {
  CommunityNotFoundError,
  PROBE_COMMUNITY,
  ThunderstoreUnavailableError,
  fetchPackages,
  packageIndexUrl,
} from './thunderstore'

const response = (status: number, body: unknown) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response

describe('packageIndexUrl', () => {
  it('targets the community package listing', () => {
    expect(packageIndexUrl('surf-sandbox'))
      .toBe('https://thunderstore.io/c/surf-sandbox/api/v1/package/')
  })
})

describe('fetchPackages', () => {
  const pkg = { full_name: 'Owner-Mod', owner: 'Owner', name: 'Mod', is_deprecated: false, versions: [] }

  it('returns packages for a community that exists', async () => {
    const packages = await fetchPackages({
      community: 'x', fetchImpl: async () => response(200, [pkg]),
    })
    expect(packages).toHaveLength(1)
  })

  it('raises a typed error for a community that does not exist yet', async () => {
    // This is the expected state for surf-sandbox until launch day, so it must
    // be distinguishable from a real failure rather than surfacing as a crash.
    await expect(
      fetchPackages({ community: 'surf-sandbox', fetchImpl: async () => response(404, null) }),
    ).rejects.toBeInstanceOf(CommunityNotFoundError)
  })

  it('treats 503 as a missing community when the probe community is healthy', async () => {
    // Verified against the live API: Thunderstore answers an unknown community
    // with 503, not 404. A nonsense slug and surf-sandbox both do this today.
    const fetchImpl = (async (url: string) =>
      url.includes(PROBE_COMMUNITY) ? response(200, []) : response(503, null)) as unknown as typeof fetch
    await expect(
      fetchPackages({ community: 'surf-sandbox', fetchImpl }),
    ).rejects.toBeInstanceOf(CommunityNotFoundError)
  })

  it('treats 503 as an outage when the probe community is also down', async () => {
    const fetchImpl = (async () => response(503, null)) as unknown as typeof fetch
    await expect(
      fetchPackages({ community: 'surf-sandbox', fetchImpl }),
    ).rejects.toBeInstanceOf(ThunderstoreUnavailableError)
  })

  it('does not probe itself when the probe community is the target', async () => {
    let calls = 0
    const fetchImpl = (async () => { calls++; return response(503, null) }) as unknown as typeof fetch
    await expect(
      fetchPackages({ community: PROBE_COMMUNITY, fetchImpl }),
    ).rejects.toBeInstanceOf(ThunderstoreUnavailableError)
    expect(calls).toBe(1)
  })

  it('drops entries that do not look like packages', async () => {
    const packages = await fetchPackages({
      community: 'x', fetchImpl: async () => response(200, [pkg, { junk: true }, null]),
    })
    expect(packages).toHaveLength(1)
  })

  it('throws on a non-array body', async () => {
    await expect(
      fetchPackages({ community: 'x', fetchImpl: async () => response(200, { nope: 1 }) }),
    ).rejects.toThrow(/unexpected shape/)
  })
})
