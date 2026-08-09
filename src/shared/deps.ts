/**
 * Dependency resolution for Thunderstore packages.
 *
 * Pure functions only — no filesystem, no network — so this is the part of the
 * manager that can be fully tested long before the game exists.
 */
import type { DependencyRef, Package, Resolution, VersionConflict } from './types'

const VERSION_RE = /^\d+(\.\d+)*$/

/**
 * Parse a Thunderstore reference of the form "Owner-Name-1.2.3".
 *
 * Package names may themselves contain hyphens (e.g. "BepInEx-BepInExPack-5.4.2100"),
 * so the owner is the first segment, the version is the last, and the name is
 * everything in between. Returns null if the last segment isn't a version.
 */
export function parseRef(ref: string): DependencyRef | null {
  const parts = ref.split('-')
  if (parts.length < 3) return null

  const owner = parts[0]
  const version = parts[parts.length - 1]
  if (!owner || !version || !VERSION_RE.test(version)) return null

  const name = parts.slice(1, -1).join('-')
  if (!name) return null

  return { owner, name, fullName: `${owner}-${name}`, version }
}

/** Compare dotted numeric versions. Returns <0, 0, or >0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.')
  const pb = b.split('.')
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const na = Number(pa[i] ?? 0)
    const nb = Number(pb[i] ?? 0)
    if (na !== nb) return na - nb
  }
  return 0
}

/** Index packages by "Owner-Name" for lookup. */
export function indexPackages(packages: Package[]): Map<string, Package> {
  const map = new Map<string, Package>()
  for (const pkg of packages) map.set(pkg.full_name, pkg)
  return map
}

function findVersion(pkg: Package, version: string) {
  return pkg.versions.find((v) => v.version_number === version)
}

/**
 * Walk the dependency graph from `requested` and produce an install order.
 *
 * Dependencies always appear before the packages that require them, so callers
 * can install straight down the returned list. Cycles are tolerated rather than
 * fatal — Thunderstore shouldn't produce them, but a bad package shouldn't wedge
 * the whole install.
 */
export function resolve(requested: string[], index: Map<string, Package>): Resolution {
  const missing: string[] = []
  const seenVersions = new Map<string, Set<string>>()
  const order: DependencyRef[] = []
  const done = new Set<string>()
  const visiting = new Set<string>()

  const note = (ref: DependencyRef) => {
    const set = seenVersions.get(ref.fullName) ?? new Set<string>()
    set.add(ref.version)
    seenVersions.set(ref.fullName, set)
  }

  const visit = (raw: string) => {
    const ref = parseRef(raw)
    if (!ref) {
      missing.push(raw)
      return
    }
    note(ref)

    const key = `${ref.fullName}-${ref.version}`
    if (done.has(key)) return
    // A cycle: bail out of this branch rather than recursing forever.
    if (visiting.has(key)) return
    visiting.add(key)

    const pkg = index.get(ref.fullName)
    const version = pkg ? findVersion(pkg, ref.version) : undefined

    if (!pkg || !version) {
      missing.push(raw)
    } else {
      for (const dep of version.dependencies) visit(dep)
    }

    visiting.delete(key)
    done.add(key)
    order.push(ref)
  }

  for (const raw of requested) visit(raw)

  const conflicts: VersionConflict[] = []
  for (const [fullName, versions] of seenVersions) {
    if (versions.size > 1) {
      conflicts.push({
        fullName,
        versions: [...versions].sort(compareVersions),
      })
    }
  }

  return { order, missing, conflicts }
}

/** The newest version of a package, or null if it has none. */
export function latestVersion(pkg: Package) {
  let best = pkg.versions[0] ?? null
  for (const v of pkg.versions) {
    if (!best || compareVersions(v.version_number, best.version_number) > 0) best = v
  }
  return best
}
