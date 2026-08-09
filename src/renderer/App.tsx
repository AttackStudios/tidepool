import { useEffect, useState } from 'react'
import type { GameInstall } from '../shared/types'
import { ModBrowser } from './ModBrowser'
import { useProfiles } from './useProfiles'

/**
 * The surf-sandbox community will not exist until mods are published for it, so
 * the browser is pointed at a real community during development. This selector
 * is what makes the whole UI exercisable months before the game ships.
 */
const COMMUNITIES = [
  { slug: 'surf-sandbox', label: 'Surf Sandbox (not live yet)' },
  { slug: 'lethal-company', label: 'Lethal Company (dev target)' },
  { slug: 'valheim', label: 'Valheim (dev target)' },
]

export function App() {
  const [game, setGame] = useState<GameInstall | null | undefined>(undefined)
  const [community, setCommunity] = useState('lethal-company')
  const { profiles, current, currentId, setCurrentId, refresh, create } = useProfiles()

  useEffect(() => { void window.tidepool.detectGame().then(setGame) }, [])

  const newProfile = async () => {
    const name = `Profile ${profiles.length + 1}`
    await create(name)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true" />
          <div>
            <h1>TidePool</h1>
            <p className="brand__sub">Mod manager for Surf Sandbox</p>
          </div>
        </div>

        <div className="topbar__right">
          <span className={`status status--${game === undefined ? 'wait' : game ? 'ok' : 'off'}`}>
            {game === undefined && 'Looking for game…'}
            {game === null && 'Game not installed'}
            {game && `Game found · ${game.backend ?? 'backend unknown'}`}
          </span>

          <label className="field">
            <span className="field__label">Profile</span>
            <select
              value={currentId ?? ''}
              onChange={(e) => setCurrentId(e.target.value)}
              aria-label="Active profile"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.mods.length})
                </option>
              ))}
            </select>
          </label>
          <button className="button--ghost" onClick={() => void newProfile()}>New</button>

          <select
            value={community}
            onChange={(e) => setCommunity(e.target.value)}
            aria-label="Thunderstore community"
          >
            {COMMUNITIES.map((c) => (
              <option key={c.slug} value={c.slug}>{c.label}</option>
            ))}
          </select>
        </div>
      </header>

      <ModBrowser community={community} profile={current} onChanged={() => void refresh()} />
    </div>
  )
}
