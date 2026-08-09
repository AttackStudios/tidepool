/** Types shared between the Electron main process and the renderer. */

/** A single published version of a Thunderstore package. */
export interface PackageVersion {
  /** "Owner-Name-1.2.3" */
  full_name: string
  name: string
  version_number: string
  download_url: string
  /** Dependency references, each "Owner-Name-1.2.3" */
  dependencies: string[]
  file_size: number
  description?: string
  website_url?: string
}

/** A Thunderstore package, newest version first. */
export interface Package {
  name: string
  /** "Owner-Name" */
  full_name: string
  owner: string
  package_url?: string
  is_deprecated: boolean
  versions: PackageVersion[]
}

/** A parsed "Owner-Name-1.2.3" reference. */
export interface DependencyRef {
  owner: string
  name: string
  /** "Owner-Name" */
  fullName: string
  version: string
}

export interface InstalledMod {
  /** "Owner-Name" */
  fullName: string
  version: string
  enabled: boolean
  installedAt: string
}

export interface Profile {
  id: string
  name: string
  mods: InstalledMod[]
}

export interface GameInstall {
  /** Absolute path to the folder containing the game executable. */
  root: string
  /** How we found it, for showing the user. */
  source: 'steam' | 'manual'
  /** Unity scripting backend, once known. Null until the game ships. */
  backend: 'mono' | 'il2cpp' | null
}

/** Outcome of resolving a set of requested mods against an index. */
export interface Resolution {
  /** Install order: dependencies always before the things that need them. */
  order: DependencyRef[]
  /** Requested or depended-on packages absent from the index. */
  missing: string[]
  /** Packages pulled in at two different versions. */
  conflicts: VersionConflict[]
}

export interface VersionConflict {
  /** "Owner-Name" */
  fullName: string
  versions: string[]
}
