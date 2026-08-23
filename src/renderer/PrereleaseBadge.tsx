import { useEffect, useState } from 'react'
import { prereleaseBadge } from '../shared/version'

/**
 * Marks a build as unreleased, bottom left, always visible.
 *
 * Beta testers run several builds a week and file bugs against whichever one
 * they happen to have open. Without a visible version, a report says "the
 * installer broke" and the first reply is always "which build?". This puts the
 * answer on screen so it lands in the screenshot.
 *
 * Renders nothing at all on a stable build — a release should not carry beta
 * chrome.
 */
export function PrereleaseBadge() {
  const [label, setLabel] = useState<string | null>(null)

  useEffect(() => {
    void window.tidepool
      .appVersion()
      .then((v) => setLabel(prereleaseBadge(v)))
      // A badge is not worth surfacing an error over; absence is a fine failure.
      .catch(() => setLabel(null))
  }, [])

  if (!label) return null

  return (
    <div className="prerelease" role="status" title="This is a test build, not a release">
      {label}
    </div>
  )
}
