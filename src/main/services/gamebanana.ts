/**
 * GameBanana as a second browse source.
 *
 * Deliberately browse-only. GameBanana's API exposes listings, versions and
 * direct download URLs, but carries **no dependency information** and no
 * predictable archive layout, and a single mod often ships several alternative
 * files. Installing that automatically would guess wrong often enough to break
 * people's games, so TidePool lists these and hands off to the browser.
 */
import type { PackageSummary } from '../../shared/types'

const API = 'https://gamebanana.com/apiv11'
const UA = 'TidePool (+https://github.com/AttackStudios/tidepool)'

export const GAME_NAME = 'Surf Sandbox'

export interface GbOptions {
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}

export class GameNotOnGameBananaError extends Error {
  constructor(public game: string) {
    super(
      `GameBanana has no page for "${game}" yet. Pages appear once the game has ` +
        `submissions, so this will fill in after release.`,
    )
    this.name = 'GameNotOnGameBananaError'
  }
}

async function get(url: string, options: GbOptions): Promise<unknown> {
  const doFetch = options.fetchImpl ?? fetch
  const res = await doFetch(url, { headers: { 'User-Agent': UA }, signal: options.signal })
  if (!res.ok) throw new Error(`GameBanana returned ${res.status}`)
  return res.json()
}

/** Resolve the numeric game id GameBanana keys everything on. */
export async function findGameId(
  name: string = GAME_NAME,
  options: GbOptions = {},
): Promise<number> {
  const body = await get(
    `${API}/Util/Game/NameMatch?_sName=${encodeURIComponent(name)}`,
    options,
  )
  const records = (body as { _aRecords?: unknown })._aRecords
  if (!Array.isArray(records)) throw new GameNotOnGameBananaError(name)

  // NameMatch is fuzzy — "surf" also returns Subway Surfers — so require an
  // exact, case-insensitive title rather than taking the first hit.
  const exact = records.find(
    (r): r is { _idRow: number; _sName: string } =>
      typeof r === 'object' && r !== null &&
      typeof (r as { _sName?: unknown })._sName === 'string' &&
      (r as { _sName: string })._sName.toLowerCase() === name.toLowerCase(),
  )
  if (!exact) throw new GameNotOnGameBananaError(name)
  return exact._idRow
}

interface GbRecord {
  _idRow?: number
  _sName?: string
  _sProfileUrl?: string
  _tsDateModified?: number
  _tsDateAdded?: number
  _aSubmitter?: { _sName?: string }
  _aPreviewMedia?: { _aImages?: { _sBaseUrl?: string; _sFile?: string }[] }
  _nViewCount?: number
  _nLikeCount?: number
  _aRootCategory?: { _sName?: string }
}

function iconFor(record: GbRecord): string | null {
  const image = record._aPreviewMedia?._aImages?.[0]
  if (!image?._sBaseUrl || !image._sFile) return null
  return `${image._sBaseUrl}/${image._sFile}`
}

export function toSummary(record: GbRecord): PackageSummary | null {
  if (typeof record._idRow !== 'number' || typeof record._sName !== 'string') return null
  const owner = record._aSubmitter?._sName ?? 'GameBanana'
  return {
    fullName: `gb:${record._idRow}`,
    name: record._sName,
    owner,
    description: record._aRootCategory?._sName ?? '',
    icon: iconFor(record),
    latestVersion: '',
    downloads: record._nViewCount ?? 0,
    rating: record._nLikeCount ?? 0,
    categories: record._aRootCategory?._sName ? [record._aRootCategory._sName] : [],
    isDeprecated: false,
    isPinned: false,
    isNsfw: false,
    dateUpdated: new Date((record._tsDateModified ?? record._tsDateAdded ?? 0) * 1000).toISOString(),
    packageUrl: record._sProfileUrl ?? null,
    source: 'gamebanana',
    installable: false,
  }
}

/** One page of a game's submissions, newest first. */
export async function fetchMods(
  gameId: number,
  page = 1,
  options: GbOptions = {},
): Promise<{ items: PackageSummary[]; total: number }> {
  const body = await get(
    `${API}/Game/${gameId}/Subfeed?_nPage=${page}&_sSort=default`,
    options,
  )
  const b = body as { _aRecords?: unknown; _aMetadata?: { _nRecordCount?: number } }
  const records = Array.isArray(b._aRecords) ? (b._aRecords as GbRecord[]) : []
  return {
    items: records.map(toSummary).filter((s): s is PackageSummary => s !== null),
    total: b._aMetadata?._nRecordCount ?? records.length,
  }
}
