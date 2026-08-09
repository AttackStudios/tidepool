import { useEffect, useState } from 'react'
import type { GameInstall, Profile } from '../shared/types'

type PackagesState =
  | { status: 'loading' }
  | { status: 'ok'; count: number }
  | { status: 'no-community'; message: string }
  | { status: 'unavailable'; message: string }
  | { status: 'error'; message: string }

export function App() {
  const [game, setGame] = useState<GameInstall | null | undefined>(undefined)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [packages, setPackages] = useState<PackagesState>({ status: 'loading' })

  useEffect(() => {
    void window.tidepool.detectGame().then(setGame)
    void window.tidepool.listProfiles().then(setProfiles)
    void window.tidepool.listPackages().then((res: any) => {
      if (res.ok) setPackages({ status: 'ok', count: res.packages.length })
      else if (res.reason === 'no-community')
        setPackages({ status: 'no-community', message: res.message })
      else if (res.reason === 'unavailable')
        setPackages({ status: 'unavailable', message: res.message })
      else setPackages({ status: 'error', message: res.message })
    })
  }, [])

  const addProfile = async () => {
    const name = `Profile ${profiles.length + 1}`
    await window.tidepool.createProfile(name)
    setProfiles(await window.tidepool.listProfiles())
  }

  return (
    <div className="app">
      <header>
        <h1>TidePool</h1>
        <p className="sub">Mod manager for Surf Sandbox</p>
      </header>

      <section>
        <h2>Game</h2>
        {game === undefined && <p className="muted">Looking…</p>}
        {game === null && (
          <p className="muted">
            Surf Sandbox not found. It releases 25 Aug 2026 — until then there is nothing to detect.
          </p>
        )}
        {game && (
          <dl className="facts">
            <div><dt>Path</dt><dd>{game.root}</dd></div>
            <div><dt>Found via</dt><dd>{game.source}</dd></div>
            <div><dt>Backend</dt><dd>{game.backend ?? 'unknown'}</dd></div>
          </dl>
        )}
      </section>

      <section>
        <h2>Thunderstore</h2>
        {packages.status === 'loading' && <p className="muted">Checking…</p>}
        {packages.status === 'ok' && <p>{packages.count} packages available.</p>}
        {packages.status === 'no-community' && <p className="muted">{packages.message}</p>}
        {packages.status === 'unavailable' && <p className="error">{packages.message}</p>}
        {packages.status === 'error' && <p className="error">{packages.message}</p>}
      </section>

      <section>
        <h2>Profiles</h2>
        {profiles.length === 0 && <p className="muted">No profiles yet.</p>}
        <ul className="profiles">
          {profiles.map((p) => (
            <li key={p.id}>
              <span>{p.name}</span>
              <span className="muted">{p.mods.length} mods</span>
            </li>
          ))}
        </ul>
        <button onClick={() => void addProfile()}>New profile</button>
      </section>
    </div>
  )
}
