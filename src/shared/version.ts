/**
 * Reading a build's own version string.
 *
 * Lives in shared because both sides need the same answer: the updater uses it
 * to decide whether to offer prereleases, and the UI uses it to label the
 * window. Two definitions of "is this a beta" would eventually disagree.
 */

/** Is this build itself a prerelease, e.g. 0.1.0-rc.5? */
export function isPrerelease(version: string): boolean {
  return prereleaseLabel(version) !== null
}

/**
 * The bit after the hyphen: "1.0.0-rc.9" -> "rc.9". Null for a stable version.
 *
 * Build metadata (`+sha`) is not part of the prerelease identifier in semver,
 * so it is stripped rather than shown to someone reading a badge.
 */
export function prereleaseLabel(version: string): string | null {
  const hyphen = version.indexOf('-')
  if (hyphen < 0) return null
  const tail = (version.slice(hyphen + 1).split('+')[0] ?? '').trim()
  return tail || null
}

/** Badge text for a prerelease build, or null when the build is stable. */
export function prereleaseBadge(version: string): string | null {
  const label = prereleaseLabel(version)
  return label ? `PreRelease Build (${label})` : null
}
