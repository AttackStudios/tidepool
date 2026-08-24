/** Detecting newer versions of what's already installed. */
import type { InstalledMod, Profile } from '../../shared/types'
import { compareVersions } from '../../shared/deps'
import type { Catalog } from './catalog'
import { CommunityNotFoundError, ThunderstoreUnavailableError } from './thunderstore'

export interface ModUpdate {
  fullName: string
  current: string
  latest: string
  /** The ref to install, i.e. "Owner-Name-1.2.3". */
  ref: string
  viaDependency: boolean
}

/**
 * Compare each installed mod against the catalog.
 *
 * A mod missing from the catalog is skipped rather than reported: it usually
 * means the package was deprecated or the community changed, and neither is an
 * update the user can act on.
 */
export async function findUpdates(
  profile: Profile,
  catalog: Catalog,
  community?: string,
): Promise<ModUpdate[]> {
  const updates: ModUpdate[] = []

  for (const mod of profile.mods) {
    let detail
    try {
      detail = await catalog.detail(mod.fullName, community)
    } catch (error) {
      // There is no catalogue to compare against. On release day that is the
      // normal state: the Thunderstore community does not exist until it is
      // approved, and anything installed from Essentials was never a
      // Thunderstore package anyway. "No updates" is the honest answer; an
      // error here would greet a first-time user with a broken-looking
      // Installed tab on a perfectly good install.
      if (
        error instanceof CommunityNotFoundError ||
        error instanceof ThunderstoreUnavailableError
      ) {
        return updates
      }
      throw error
    }
    const latest = detail?.latest?.version_number
    if (!latest) continue
    if (compareVersions(latest, mod.version) <= 0) continue

    updates.push({
      fullName: mod.fullName,
      current: mod.version,
      latest,
      ref: `${mod.fullName}-${latest}`,
      viaDependency: mod.viaDependency ?? false,
    })
  }
  return updates
}

/** True when this mod is newer in the catalog than on disk. */
export function isOutdated(mod: InstalledMod, latest: string | null | undefined): boolean {
  return Boolean(latest) && compareVersions(latest!, mod.version) > 0
}
