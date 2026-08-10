import type { SourceId } from './types'

export interface Community {
  slug: string
  label: string
}

export const HOME_COMMUNITY: Community = { slug: 'surf-sandbox', label: 'Surf Sandbox' }

/**
 * Communities used during development, when surf-sandbox does not exist yet.
 *
 * These must never reach a packaged build: someone installing a Surf Sandbox mod
 * manager and finding Lethal Company selected would reasonably conclude it was
 * broken.
 */
export const DEV_COMMUNITIES: Community[] = [
  { slug: 'lethal-company', label: 'Lethal Company (dev target)' },
  { slug: 'valheim', label: 'Valheim (dev target)' },
]

/** The communities the user may choose between. */
export function communitiesFor(isDev: boolean): Community[] {
  return isDev ? [HOME_COMMUNITY, ...DEV_COMMUNITIES] : [HOME_COMMUNITY]
}

/** Whether the picker is worth showing at all. */
export function showCommunityPicker(isDev: boolean): boolean {
  return communitiesFor(isDev).length > 1
}

export const DEFAULT_SOURCE: SourceId = 'thunderstore'
