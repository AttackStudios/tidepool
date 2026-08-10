import { useEffect, useState } from 'react'
import type { PackageSummary, PackageVersion, Profile, Resolution, Result } from '../shared/types'
import { compactNumber, relativeDate } from './format'
import { InstallButton } from './InstallButton'

interface Detail {
  summary: import('../shared/types').PackageSummary
  versions: PackageVersion[]
  latest: PackageVersion | null
}

export function ModDetail({
  fullName,
  summary: listed,
  community,
  profile,
  onChanged,
}: {
  fullName: string
  /** The row that was clicked. Sources other than Thunderstore have no detail endpoint. */
  summary: PackageSummary | null
  community: string
  profile: Profile | null
  onChanged: () => void
}) {
  // GameBanana has no per-package detail we can install from, so the listing row
  // is all there is — render that and hand off to the browser.
  if (listed && !listed.installable) {
    return (
      <aside className="detail">
        <header className="detail__head">
          {listed.icon && <img className="detail__icon" src={listed.icon} alt="" />}
          <div>
            <h2 className="detail__name">{listed.name}</h2>
            <p className="muted">by {listed.owner}</p>
          </div>
        </header>

        <dl className="facts">
          <div><dt>Source</dt><dd>GameBanana</dd></div>
          <div><dt>Updated</dt><dd>{relativeDate(listed.dateUpdated) || '—'}</dd></div>
          {listed.categories[0] && <div><dt>Category</dt><dd>{listed.categories[0]}</dd></div>}
        </dl>

        <section className="detail__section">
          <h3>Installing</h3>
          <p className="muted">
            GameBanana submissions carry no dependency information and often ship several
            alternative files, so TidePool won’t guess which to install. Open the page, download
            what you want, and drop it into your profile’s BepInEx folder.
          </p>
        </section>

        <div className="detail__actions">
          {listed.packageUrl && (
            <button onClick={() => void window.tidepool.openExternal(listed.packageUrl!)}>
              Open on GameBanana
            </button>
          )}
        </div>
      </aside>
    )
  }

  const [detail, setDetail] = useState<Detail | null | undefined>(undefined)
  const [resolution, setResolution] = useState<Resolution | null>(null)
  const [iconOk, setIconOk] = useState(true)

  useEffect(() => {
    let cancelled = false
    setDetail(undefined)
    setResolution(null)
    setIconOk(true)

    void window.tidepool.detail(fullName, community).then((res: Result<Detail | null>) => {
      if (cancelled) return
      const value = res.ok ? res.data : null
      setDetail(value)
      if (!value?.latest) return
      void window.tidepool
        .resolveMods([value.latest.full_name], community)
        .then((r: Result<Resolution>) => {
          if (!cancelled && r.ok) setResolution(r.data)
        })
    })
    return () => { cancelled = true }
  }, [fullName, community])

  if (detail === undefined) return <aside className="detail"><p className="muted">Loading…</p></aside>
  if (detail === null) return <aside className="detail"><p className="muted">Not found.</p></aside>

  const { summary, versions, latest } = detail
  // The package itself is last in install order; everything before it is a dependency.
  const dependencies = resolution?.order.slice(0, -1) ?? []

  return (
    <aside className="detail">
      <header className="detail__head">
        {summary.icon && iconOk && (
          <img className="detail__icon" src={summary.icon} alt="" onError={() => setIconOk(false)} />
        )}
        <div>
          <h2 className="detail__name">{summary.name}</h2>
          <p className="muted">by {summary.owner}</p>
        </div>
      </header>

      <p className="detail__desc">{summary.description || 'No description.'}</p>

      <dl className="facts">
        <div><dt>Latest</dt><dd>{summary.latestVersion}</dd></div>
        <div><dt>Downloads</dt><dd>{compactNumber(summary.downloads)}</dd></div>
        <div><dt>Updated</dt><dd>{relativeDate(summary.dateUpdated) || '—'}</dd></div>
        <div><dt>Versions</dt><dd>{versions.length}</dd></div>
      </dl>

      {summary.categories.length > 0 && (
        <div className="detail__tags">
          {summary.categories.map((c) => <span className="tag" key={c}>{c}</span>)}
        </div>
      )}

      <section className="detail__section">
        <h3>Installs</h3>
        {!resolution && <p className="muted">Resolving…</p>}
        {resolution && dependencies.length === 0 && (
          <p className="muted">No dependencies — just this package.</p>
        )}
        {dependencies.length > 0 && (
          <ol className="deps">
            {dependencies.map((d) => (
              <li key={`${d.fullName}-${d.version}`}>
                <span>{d.fullName}</span> <span className="muted">{d.version}</span>
              </li>
            ))}
            <li className="deps__self">
              <span>{summary.fullName}</span> <span className="muted">{summary.latestVersion}</span>
            </li>
          </ol>
        )}
        {resolution && resolution.missing.length > 0 && (
          <p className="error">Missing: {resolution.missing.join(', ')}</p>
        )}
        {resolution && resolution.conflicts.length > 0 && (
          <p className="error">
            Version conflict:{' '}
            {resolution.conflicts.map((c) => `${c.fullName} (${c.versions.join(' vs ')})`).join(', ')}
          </p>
        )}
      </section>

      <InstallButton
        fullName={summary.fullName}
        versionRef={latest?.full_name ?? null}
        community={community}
        profile={profile}
        onChanged={onChanged}
      />

      {summary.packageUrl && (
        <div className="detail__actions">
          <button
            className="button--ghost"
            onClick={() => void window.tidepool.openExternal(summary.packageUrl!)}
          >
            View on Thunderstore
          </button>
        </div>
      )}
      {latest && (
        <p className="muted detail__foot">
          {(latest.file_size / 1024 / 1024).toFixed(2)} MB download
        </p>
      )}
    </aside>
  )
}
