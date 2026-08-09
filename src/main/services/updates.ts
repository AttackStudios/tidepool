/** Detecting newer versions of what's already installed. */
import type { InstalledMod, Profile } from '../../shared/types'
import { compareVersions } from '../../shared/deps'
import type { Catalog } from './catalog'

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
    const detail = await catalog.detail(mod.fullName, community)
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
