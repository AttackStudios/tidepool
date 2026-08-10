import { useCallback, useEffect, useState } from 'react'
import type { InstalledMod, Profile, Result } from '../shared/types'
import type { ModUpdate } from './types'
import { toast, toastError } from './toast'
import { RemoveButton } from './RemoveButton'

export function InstalledPanel({
  profile,
  community,
  onChanged,
}: {
  profile: Profile | null
  community: string
  onChanged: () => void
}) {
  const [updates, setUpdates] = useState<ModUpdate[]>([])
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const check = useCallback(async () => {
    if (!profile) return
    setChecking(true)
    const res: Result<ModUpdate[]> = await window.tidepool.checkUpdates(profile.id, community)
    setChecking(false)
    if (res.ok) setUpdates(res.data)
    else setError(res.message)
  }, [profile, community])

  useEffect(() => { void check() }, [check])

  if (!profile) return <p className="muted pad">No profile selected.</p>

  const mods = [...profile.mods].sort((a, b) => {
    // Chosen mods first, dependencies after — they're noise most of the time.
    if (a.viaDependency !== b.viaDependency) return a.viaDependency ? 1 : -1
    return a.fullName.localeCompare(b.fullName)
  })

  const act = async (key: string, fn: () => Promise<Result<unknown>>, message?: string) => {
    setBusy(key)
    setError(null)
    const res = await fn()
    setBusy(null)
    if (!res.ok) { setError(res.message); toastError(res.message) }
    else if (message) toast(message)
    onChanged()
    void check()
  }

  const updateFor = (m: InstalledMod) => updates.find((u) => u.fullName === m.fullName)

  const updateAll = () =>
    act(
      'all',
      () => window.tidepool.install(profile.id, updates.map((u) => u.ref), community),
      `Updated ${updates.length} mod${updates.length === 1 ? '' : 's'}`,
    )

  return (
    <div className="installed">
      <div className="installed__head">
        <p className="muted count">
          {mods.length} in “{profile.name}”
          {updates.length > 0 && ` · ${updates.length} with updates`}
        </p>
        <div className="installed__actions">
          <button className="button--ghost" onClick={() => void check()} disabled={checking}>
            {checking ? 'Checking…' : 'Check for updates'}
          </button>
          {updates.length > 0 && (
            <button onClick={() => void updateAll()} disabled={busy !== null}>
              {busy === 'all' ? 'Updating…' : `Update all (${updates.length})`}
            </button>
          )}
        </div>
      </div>

      {error && <p className="error pad">{error}</p>}

      {mods.length === 0 ? (
        <p className="muted pad">Nothing installed yet. Find something in Browse.</p>
      ) : (
        <ul className="installed__list">
          {mods.map((mod) => {
            const update = updateFor(mod)
            return (
              <li key={mod.fullName} className={mod.enabled ? '' : 'is-off'}>
                <label className="switch" title={mod.enabled ? 'Disable' : 'Enable'}>
                  <input
                    type="checkbox"
                    checked={mod.enabled}
                    disabled={busy !== null}
                    onChange={(e) =>
                      void act(
                        mod.fullName,
                        () => window.tidepool.setModEnabled(profile.id, mod.fullName, e.target.checked),
                        `${e.target.checked ? 'Enabled' : 'Disabled'} ${mod.fullName}`,
                      )
                    }
                  />
                  <span aria-hidden="true" />
                </label>

                <div className="installed__body">
                  <div className="installed__title">
                    <span className="installed__name">{mod.fullName}</span>
                    <span className="card__version">{mod.version}</span>
                    {mod.viaDependency && <span className="tag">dependency</span>}
                    {!mod.enabled && <span className="tag tag--warn">disabled</span>}
                    {update && <span className="tag tag--ok">v{update.latest} ready</span>}
                  </div>
                </div>

                <div className="installed__row-actions">
                  {update && (
                    <button
                      onClick={() =>
                        void act(
                          mod.fullName,
                          () => window.tidepool.install(profile.id, [update.ref], community),
                          `Updated ${mod.fullName} to ${update.latest}`,
                        )
                      }
                      disabled={busy !== null}
                    >
                      Update
                    </button>
                  )}
                  <RemoveButton
                    profileId={profile.id}
                    fullName={mod.fullName}
                    community={community}
                    disabled={busy !== null}
                    onDone={() => { onChanged(); void check() }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
