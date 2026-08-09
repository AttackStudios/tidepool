/**
 * Shareable profile codes.
 *
 * A code carries the mod list, not the files — the recipient re-downloads from
 * Thunderstore. Self-contained rather than server-backed, so sharing a setup
 * needs no infrastructure and no account.
 *
 * Codes arrive from strangers and trigger downloads, so decoding validates
 * defensively and refuses anything malformed or unreasonably large rather than
 * trusting its own format.
 */
import { gunzipSync, gzipSync } from 'node:zlib'
import type { Profile } from '../../shared/types'
import { parseRef } from '../../shared/deps'

/** Bumped if the payload shape ever changes, so old codes fail loudly. */
export const CODE_PREFIX = 'TP1-'

/** A single code should never install more than a plausible profile's worth. */
export const MAX_MODS = 500

export interface DecodedProfile {
  name: string
  community: string | null
  mods: { fullName: string; version: string; enabled: boolean; viaDependency: boolean }[]
}

/** Compact tuple form keeps codes short: [fullName, version, enabled, viaDependency]. */
type ModTuple = [string, string, number, number]
interface Payload { n: string; c?: string; m: ModTuple[] }

export function encodeProfile(profile: Profile, community?: string): string {
  const payload: Payload = {
    n: profile.name,
    ...(community ? { c: community } : {}),
    m: profile.mods.map((m) => [m.fullName, m.version, m.enabled ? 1 : 0, m.viaDependency ? 1 : 0]),
  }
  const gz = gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'), { level: 9 })
  return CODE_PREFIX + gz.toString('base64url')
}

export class InvalidProfileCodeError extends Error {
  constructor(reason: string) {
    super(`That doesn't look like a valid TidePool profile code — ${reason}.`)
    this.name = 'InvalidProfileCodeError'
  }
}

export function decodeProfile(code: string): DecodedProfile {
  const trimmed = code.trim()
  if (!trimmed.startsWith(CODE_PREFIX)) {
    throw new InvalidProfileCodeError(`codes start with "${CODE_PREFIX}"`)
  }

  let payload: unknown
  try {
    const raw = gunzipSync(Buffer.from(trimmed.slice(CODE_PREFIX.length), 'base64url'))
    payload = JSON.parse(raw.toString('utf8'))
  } catch {
    throw new InvalidProfileCodeError('it is damaged or was copied incompletely')
  }

  if (typeof payload !== 'object' || payload === null) {
    throw new InvalidProfileCodeError('it contains no profile')
  }
  const p = payload as Partial<Payload>
  if (typeof p.n !== 'string' || !Array.isArray(p.m)) {
    throw new InvalidProfileCodeError('it is missing a name or mod list')
  }
  if (p.m.length > MAX_MODS) {
    throw new InvalidProfileCodeError(`it lists ${p.m.length} mods, more than the ${MAX_MODS} limit`)
  }

  const mods: DecodedProfile['mods'] = []
  for (const entry of p.m) {
    if (!Array.isArray(entry)) continue
    const [fullName, version, enabled, dep] = entry as ModTuple
    if (typeof fullName !== 'string' || typeof version !== 'string') continue
    // Reuse the same validation installs go through, so a code can never carry
    // a reference the resolver wouldn't accept.
    if (!parseRef(`${fullName}-${version}`)) continue
    mods.push({
      fullName,
      version,
      enabled: enabled !== 0,
      viaDependency: dep === 1,
    })
  }

  if (mods.length === 0 && p.m.length > 0) {
    throw new InvalidProfileCodeError('none of its entries are valid package references')
  }

  return {
    name: p.n.slice(0, 80) || 'Imported profile',
    community: typeof p.c === 'string' ? p.c : null,
    mods,
  }
}

/** The refs an import should install, dependencies included for exact fidelity. */
export function refsFor(decoded: DecodedProfile): string[] {
  return decoded.mods.map((m) => `${m.fullName}-${m.version}`)
}
