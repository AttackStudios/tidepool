/**
 * Curated first-party mods.
 *
 * The manifest lives in the repository and is fetched over HTTP at runtime
 * rather than bundled. That is the whole point: a mod can be listed as
 * `planned` today and become installable later by editing one JSON file, with
 * no new app build and nothing for users to update.
 */
import type { PackageSummary } from '../../shared/types'

export const MANIFEST_URL =
  'https://raw.githubusercontent.com/AttackStudios/tidepool/main/essentials/index.json'

export interface EssentialMod {
  id: string
  name: string
  owner: string
  summary: string
  description: string
  /** `planned` entries are shown but not installable. */
  status: 'planned' | 'released'
  version: string | null
  downloadUrl: string | null
  icon: string | null
  homepage: string | null
  categories: string[]
  dependencies: string[]
}

export interface EssentialsOptions {
  fetchImpl?: typeof fetch
  signal?: AbortSignal
  url?: string
}

export class EssentialsUnavailableError extends Error {
  constructor(reason: string) {
    super(`Couldn't load the Essentials list — ${reason}.`)
    this.name = 'EssentialsUnavailableError'
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/** Validate one entry. Anything malformed is dropped rather than trusted. */
export function parseMod(value: unknown): EssentialMod | null {
  if (typeof value !== 'object' || value === null) return null
  const m = value as Record<string, unknown>
  if (typeof m.id !== 'string' || typeof m.name !== 'string') return null

  const status = m.status === 'released' ? 'released' : 'planned'
  const downloadUrl = typeof m.downloadUrl === 'string' ? m.downloadUrl : null

  return {
    id: m.id,
    name: m.name,
    owner: typeof m.owner === 'string' ? m.owner : 'AttackStudioYT',
    summary: typeof m.summary === 'string' ? m.summary : '',
    description: typeof m.description === 'string' ? m.description : '',
    // A released entry with no download is a manifest mistake; treat it as
    // planned rather than offering an install that cannot work.
    status: status === 'released' && downloadUrl ? 'released' : 'planned',
    version: typeof m.version === 'string' ? m.version : null,
    downloadUrl,
    icon: typeof m.icon === 'string' ? m.icon : null,
    homepage: typeof m.homepage === 'string' ? m.homepage : null,
    categories: asStringArray(m.categories),
    dependencies: asStringArray(m.dependencies),
  }
}

export function toSummary(mod: EssentialMod): PackageSummary {
  return {
    fullName: mod.id,
    name: mod.name,
    owner: mod.owner,
    description: mod.summary || mod.description.split('\n')[0] || '',
    icon: mod.icon,
    latestVersion: mod.version ?? '',
    // Downloads, ratings and pinning are Thunderstore concepts. A curated entry
    // has none of them, and rendering zeroes as "0 downloads" or a stray
    // "pinned" badge is worse than showing nothing.
    downloads: 0,
    rating: 0,
    categories: mod.categories,
    isDeprecated: false,
    isPinned: false,
    isNsfw: false,
    dateUpdated: '',
    packageUrl: mod.homepage,
    source: 'essentials',
    installable: mod.status === 'released',
    planned: mod.status === 'planned',
  }
}

export async function fetchEssentials(
  options: EssentialsOptions = {},
): Promise<EssentialMod[]> {
  const doFetch = options.fetchImpl ?? fetch
  let res: Response
  try {
    res = await doFetch(options.url ?? MANIFEST_URL, { signal: options.signal })
  } catch {
    throw new EssentialsUnavailableError('the list could not be reached')
  }
  if (!res.ok) throw new EssentialsUnavailableError(`the server returned ${res.status}`)

  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw new EssentialsUnavailableError('the list was not valid JSON')
  }

  const mods = (body as { mods?: unknown })?.mods
  if (!Array.isArray(mods)) throw new EssentialsUnavailableError('the list has no mods')

  return mods.map(parseMod).filter((m): m is EssentialMod => m !== null)
}

/** Look up one entry, for the detail panel and for installing. */
export async function findEssential(
  id: string,
  options: EssentialsOptions = {},
): Promise<EssentialMod | null> {
  return (await fetchEssentials(options)).find((m) => m.id === id) ?? null
}
