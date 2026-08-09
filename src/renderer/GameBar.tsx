import { useCallback, useEffect, useState } from 'react'
import type { GameInstall, LaunchInfo, Profile, Result } from '../shared/types'

interface LaunchOutcome { started: boolean; reason?: string }

export function GameBar({ profile }: { profile: Profile | null }) {
  const [game, setGame] = useState<GameInstall | null | undefined>(undefined)
  const [launch, setLaunch] = useState<LaunchInfo | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const refreshGame = useCallback(async () => {
    setGame(await window.tidepool.detectGame())
  }, [])

  useEffect(() => { void refreshGame() }, [refreshGame])

  useEffect(() => {
    if (!profile) return setLaunch(null)
    void window.tidepool.launchOptions(profile.id).then(setLaunch)
  }, [profile])

  const locate = async () => {
    setNote(null)
    const res: Result<GameInstall | null> = await window.tidepool.pickGameFolder()
    if (res.ok) setGame(res.data)
    else setNote(res.message)
  }

  const clear = async () => {
    setNote(null)
    setGame(await window.tidepool.clearGameFolder())
  }

  const copy = async () => {
    if (!launch) return
    await navigator.clipboard.writeText(launch.steam)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const start = async () => {
    if (!profile) return
    setNote(null)
    const res: Result<LaunchOutcome> = await window.tidepool.launchGame(profile.id)
    if (!res.ok) setNote(res.message)
    else if (!res.data.started) setNote(res.data.reason ?? 'Could not start the game.')
  }

  return (
    <div className="gamebar">
      <div className="gamebar__info">
        {game === undefined && <span className="muted">Looking for the game…</span>}

        {game === null && (
          <span className="muted">
            Game not found. It releases 25 Aug 2026 — or point TidePool at it manually.
          </span>
        )}

        {game && (
          <>
            <span className={`dot dot--${game.backend ? 'ok' : 'warn'}`} aria-hidden="true" />
            <span className="gamebar__path" title={game.root}>{game.root}</span>
            <span className="tag">{game.source}</span>
            <span className="tag">{game.backend ?? 'backend unknown'}</span>
            {game.executable && <span className="tag">{game.executable}</span>}
          </>
        )}
      </div>

      <div className="gamebar__actions">
        <button className="button--ghost" onClick={() => void locate()}>
          {game ? 'Change folder' : 'Locate game…'}
        </button>
        {game?.source === 'manual' && (
          <button className="button--ghost" onClick={() => void clear()}>Reset</button>
        )}
        <button className="button--ghost" onClick={() => void copy()} disabled={!launch}>
          {copied ? 'Copied' : 'Copy Steam options'}
        </button>
        <button onClick={() => void start()} disabled={!game || !profile || !launch?.canLaunch}
          title={launch && !launch.canLaunch
            ? 'Direct launch is Windows-only; use Steam launch options here'
            : undefined}>
          Launch
        </button>
      </div>

      {note && <p className="gamebar__note error">{note}</p>}
      {launch && !launch.canLaunch && !note && (
        <p className="gamebar__note muted">
          Surf Sandbox is a Windows executable, so paste the Steam launch options into the game's
          properties and start it from Steam.
        </p>
      )}
    </div>
  )
}
