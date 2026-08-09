import { useEffect, useState } from 'react'
import type { InstallProgress, InstallResult, Profile, Result } from '../shared/types'

const LABELS: Record<InstallProgress['phase'], string> = {
  resolving: 'Resolving…',
  downloading: 'Downloading',
  extracting: 'Extracting',
  done: 'Done',
  failed: 'Failed',
}

export function InstallButton({
  fullName,
  versionRef,
  community,
  profile,
  onChanged,
}: {
  fullName: string
  versionRef: string | null
  community: string
  profile: Profile | null
  onChanged: () => void
}) {
  const [progress, setProgress] = useState<InstallProgress | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => window.tidepool.onInstallProgress(setProgress), [])
  useEffect(() => { setProgress(null); setError(null) }, [fullName])

  const installed = profile?.mods.find((m) => m.fullName === fullName) ?? null

  const run = async (fn: () => Promise<Result<unknown>>) => {
    setBusy(true)
    setError(null)
    const res = await fn()
    setBusy(false)
    setProgress(null)
    if (!res.ok) setError(res.message)
    onChanged()
  }

  if (!profile) return <p className="muted">No profile selected.</p>

  return (
    <>
      <div className="detail__actions">
        {installed ? (
          <button
            className="button--danger"
            disabled={busy}
            onClick={() => void run(() => window.tidepool.uninstall(profile.id, fullName))}
          >
            {busy ? 'Removing…' : `Uninstall ${installed.version}`}
          </button>
        ) : (
          <button
            disabled={busy || !versionRef}
            onClick={() =>
              void run(() =>
                window.tidepool.install(profile.id, [versionRef!], community) as Promise<
                  Result<InstallResult>
                >,
              )
            }
          >
            {busy ? 'Installing…' : 'Install'}
          </button>
        )}
      </div>

      {busy && progress && (
        <div className="progress" role="status">
          <div className="progress__bar">
            <span
              style={{
                width: progress.total
                  ? `${Math.round((progress.completed / progress.total) * 100)}%`
                  : '10%',
              }}
            />
          </div>
          <p className="muted progress__label">
            {LABELS[progress.phase]}
            {progress.current ? ` ${progress.current}` : ''}
            {progress.total ? ` · ${progress.completed}/${progress.total}` : ''}
          </p>
        </div>
      )}

      {installed?.viaDependency && (
        <p className="muted detail__foot">Installed as a dependency of another mod.</p>
      )}
      {error && <p className="error detail__foot">{error}</p>}
    </>
  )
}
