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
  icon?: string
  downloads?: number
  date_created?: string
  is_active?: boolean
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
  categories?: string[]
  rating_score?: number
  is_pinned?: boolean
  has_nsfw_content?: boolean
  date_updated?: string
  donation_link?: string
}

/**
 * The trimmed shape sent to the UI.
 *
 * The full index for a mature community is ~311 MB (measured against
 * lethal-company: 50,362 packages, 190,959 versions). Sending that over IPC
 * would stall the app, so the renderer only ever receives pages of these.
 */
export interface PackageSummary {
  fullName: string
  name: string
  owner: string
  description: string
  icon: string | null
  latestVersion: string
  downloads: number
  rating: number
  categories: string[]
  isDeprecated: boolean
  isPinned: boolean
  isNsfw: boolean
  dateUpdated: string
  packageUrl: string | null
}

export type SortKey = 'relevance' | 'downloads' | 'rating' | 'updated' | 'name'

export interface BrowseQuery {
  search?: string
  category?: string | null
  sort?: SortKey
  includeDeprecated?: boolean
  includeNsfw?: boolean
  page?: number
  pageSize?: number
}

export interface BrowsePage {
  items: PackageSummary[]
  total: number
  page: number
  pageSize: number
  categories: string[]
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

/** Failure shapes the UI switches on. */
export type Failure =
  | { ok: false; reason: 'no-community'; message: string }
  | { ok: false; reason: 'unavailable'; message: string }
  | { ok: false; reason: 'error'; message: string }

export type Result<T> = { ok: true; data: T } | Failure
