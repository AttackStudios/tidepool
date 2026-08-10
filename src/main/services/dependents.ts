/**
 * Working out what else in a profile relies on a given mod.
 *
 * Uninstalling is otherwise silently destructive: removing a library leaves
 * every mod that needed it installed but broken, and the failure only shows up
 * as the game misbehaving later.
 */
import type { InstalledMod, Profile } from '../../shared/types'
import { parseRef } from '../../shared/deps'
import type { Catalog } from './catalog'

export interface DependencyImpact {
  /** Installed mods that declare the target as a dependency. */
  dependents: string[]
  /**
   * Mods that were only present as dependencies and would be left needed by
   * nothing once the target and its dependents are gone.
   */
  orphans: string[]
}

/** The dependency names declared by an installed mod's own version. */
async function declaredBy(
  mod: InstalledMod,
  catalog: Catalog,
  community?: string,
): Promise<string[]> {
  const ref = parseRef(`${mod.fullName}-${mod.version}`)
  if (!ref) return []
  const version = await catalog.versionFor(ref, community)
  if (!version) return []
  return version.dependencies
    .map((d) => parseRef(d)?.fullName)
    .filter((n): n is string => Boolean(n))
}

/**
 * What removing `fullName` would affect.
 *
 * Dependents are reported one level deep, which is what a confirmation dialog
 * can usefully show; orphans are computed against the full remaining set.
 */
export async function analyseRemoval(
  profile: Profile,
  fullName: string,
  catalog: Catalog,
  community?: string,
): Promise<DependencyImpact> {
  const edges = new Map<string, string[]>()
  for (const mod of profile.mods) {
    edges.set(mod.fullName, await declaredBy(mod, catalog, community))
  }

  const dependents = profile.mods
    .filter((m) => m.fullName !== fullName && (edges.get(m.fullName) ?? []).includes(fullName))
    .map((m) => m.fullName)

  // Anything still installed once the target goes.
  const remaining = profile.mods.filter((m) => m.fullName !== fullName)
  const stillNeeded = new Set<string>()
  for (const mod of remaining) {
    for (const dep of edges.get(mod.fullName) ?? []) stillNeeded.add(dep)
  }

  const orphans = remaining
    .filter((m) => m.viaDependency && !stillNeeded.has(m.fullName))
    .map((m) => m.fullName)

  return { dependents, orphans }
}
