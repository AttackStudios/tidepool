import { useEffect, useState } from 'react'
import type { InstallProgress, PackageSummary, Profile, Result } from '../shared/types'
import { toast, toastError } from './toast'

interface EssentialMod {
  id: string
  name: string
  owner: string
  summary: string
  description: string
  status: 'planned' | 'released'
  version: string | null
  homepage: string | null
  categories: string[]
}

export function EssentialDetail({
  summary,
  profile,
  onChanged,
}: {
  summary: PackageSummary
  profile: Profile | null
  onChanged: () => void
}) {
  const [mod, setMod] = useState<EssentialMod | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<InstallProgress | null>(null)

  useEffect(() => {
    setMod(undefined)
    void window.tidepool.essentialDetail(summary.fullName).then((r: Result<EssentialMod | null>) =>
      setMod(r.ok ? r.data : null),
    )
  }, [summary.fullName])

  useEffect(() => window.tidepool.onInstallProgress(setProgress), [])

  const installed = profile?.mods.find((m) => m.fullName === summary.fullName) ?? null

  const install = async () => {
    if (!profile) return
    setBusy(true)
    const res: Result<unknown> = await window.tidepool.installEssential(profile.id, summary.fullName)
    setBusy(false)
    setProgress(null)
    if (!res.ok) toastError(res.message)
    else toast(`Installed ${summary.name}`)
    onChanged()
  }

  const planned = summary.planned === true

  return (
    <aside className="detail">
      <header className="detail__head">
        {summary.icon && <img className="detail__icon" src={summary.icon} alt="" />}
        <div>
          <h2 className="detail__name">{summary.name}</h2>
          <p className="muted">by {summary.owner}</p>
        </div>
      </header>

      <div className="detail__tags">
        {planned ? (
          <span className="tag tag--warn">in development</span>
        ) : (
          <span className="tag tag--ok">available</span>
        )}
        {summary.categories.map((c) => <span className="tag" key={c}>{c}</span>)}
      </div>

      {mod === undefined && <p className="muted">Loading…</p>}
      {mod && (
        <div className="detail__desc">
          {mod.description.split('\n').filter(Boolean).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      )}

      {planned && (
        <section className="detail__section">
          <h3>Not out yet</h3>
          <p className="muted">
            This is on the roadmap, not on your disk. It will become installable here the moment
            it ships — the list is fetched fresh each time, so there is nothing for you to update.
          </p>
        </section>
      )}

      <div className="detail__actions">
        {installed ? (
          <span className="tag tag--ok">installed {installed.version}</span>
        ) : (
          <button
            onClick={() => void install()}
            disabled={planned || busy || !profile}
            title={planned ? 'Not released yet' : undefined}
          >
            {busy ? 'Installing…' : planned ? 'Coming soon' : 'Install'}
          </button>
        )}
        {summary.packageUrl && (
          <button
            className="button--ghost"
            onClick={() => void window.tidepool.openExternal(summary.packageUrl!)}
          >
            Project page
          </button>
        )}
      </div>

      {busy && progress && (
        <div className="progress" role="status">
          <div className="progress__bar"><span style={{ width: '60%' }} /></div>
          <p className="muted progress__label">{progress.phase} {progress.current ?? ''}</p>
        </div>
      )}
    </aside>
  )
}
