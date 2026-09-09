import { useCallback, useEffect, useState } from 'react'
import type { Result } from '../shared/types'
import { toast, toastError } from './toast'

interface ModSupport {
  platform: string
  /** Which loader is installed in the game folder, if any. */
  loader: 'melonloader' | 'bepinex' | null
  /** Why .NET is a problem, or null when it is fine. */
  dotnet: string | null
  /** macOS: has the install been converted so mods can attach? */
  prepared: boolean
  /** macOS: are the original game files still saved? */
  canRevert: boolean
  /** macOS: what converting would still change, or null once done. */
  needsPreparing: string | null
}

/**
 * Settings, and the place to undo things TidePool has done to the game.
 *
 * The one section that matters is whether mods will actually load. Both
 * platforms answer that question; they just fail differently — macOS needs the
 * game converted to Intel, and Windows needs a loader and a .NET runtime.
 */
export function SettingsPanel({ gamePath }: { gamePath: string | null }) {
  const [support, setSupport] = useState<ModSupport | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const refresh = useCallback(() => {
    void window.tidepool.modSupport().then((r: Result<ModSupport | null>) => {
      setSupport(r.ok ? r.data : null)
    })
  }, [])

  useEffect(refresh, [refresh])

  const revert = async () => {
    setBusy(true)
    const res: Result<{ restored: string[] }> = await window.tidepool.revertMacGame()
    setBusy(false)
    setConfirming(false)
    if (!res.ok) toastError(res.message)
    else {
      toast(
        res.data.restored.length > 0
          ? 'Surf Sandbox is back to how Steam installed it.'
          : 'Nothing needed changing.',
      )
    }
    refresh()
  }

  const isMac = support?.platform === 'darwin'

  return (
    <section className="panel">
      <h2 className="panel__title">Settings</h2>

      <section className="setting">
        <h3 className="setting__name">Game folder</h3>
        <p className="setting__note">
          {gamePath ?? 'Not found yet. Use “Change folder” at the top to point TidePool at it.'}
        </p>
      </section>

      {support && (
        <section className="setting">
          <h3 className="setting__name">
            {isMac ? 'Mod support on this Mac' : 'Mod support on this PC'}
          </h3>

          {/* The same question both ways: is anything going to load? */}
          {support.loader === null ? (
            <p className="setting__note setting__note--warn">
              No mod loader is installed, so nothing will load. Install MelonLoader from the
              Browse tab — it is the first entry.
            </p>
          ) : (
            <p className="setting__note">
              {support.loader === 'melonloader' ? 'MelonLoader' : 'BepInEx'} is installed.
            </p>
          )}

          {support.dotnet && (
            <p className="setting__note setting__note--warn">{support.dotnet}</p>
          )}

          {isMac ? (
            support.prepared ? (
              <>
                <p className="setting__note">
                  Surf Sandbox is set up to load mods. To do that it runs the Intel build
                  through Rosetta, so it is not running natively on Apple Silicon. That costs
                  some performance, and waves can behave a little differently.
                </p>

                {support.canRevert ? (
                  confirming ? (
                    <div className="setting__confirm">
                      <p>
                        This puts the original game files back. Mods will stop loading until
                        you launch with mods again.
                      </p>
                      <div className="setting__actions">
                        <button
                          className="button--danger"
                          onClick={() => void revert()}
                          disabled={busy}
                        >
                          {busy ? 'Restoring…' : 'Restore original game'}
                        </button>
                        <button
                          className="button--quiet"
                          onClick={() => setConfirming(false)}
                          disabled={busy}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="setting__actions">
                      <button className="button--danger" onClick={() => setConfirming(true)}>
                        Restore original game
                      </button>
                    </div>
                  )
                ) : (
                  <p className="setting__note setting__note--warn">
                    The original game files are no longer saved, so TidePool cannot put them
                    back. Verifying the game files in Steam will restore them.
                  </p>
                )}
              </>
            ) : (
              <p className="setting__note">
                Surf Sandbox has not been changed. The first time you launch with mods,
                TidePool will convert it to the Intel build so the mod loader can attach,
                and keep the originals so this can be undone.
              </p>
            )
          ) : (
            <p className="setting__note">
              Nothing about the game needs changing here — the loader attaches on its own, and
              TidePool leaves your install exactly as Steam put it there.
            </p>
          )}
        </section>
      )}
    </section>
  )
}
