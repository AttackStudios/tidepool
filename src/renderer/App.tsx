import { useEffect, useState } from 'react'
import { GameBar } from './GameBar'
import { InstalledPanel } from './InstalledPanel'
import { ModBrowser } from './ModBrowser'
import { ProfileControls } from './ProfileControls'
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
  const [community, setCommunity] = useState('lethal-company')
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab] = useState<'browse' | 'installed'>('browse')
  const { profiles, current, setCurrentId, refresh } = useProfiles()

  // Remember the community across restarts.
  useEffect(() => {
    void window.tidepool.readSettings().then((s) => { if (s.community) setCommunity(s.community) })
  }, [])
  useEffect(() => { void window.tidepool.writeSettings({ community }) }, [community])

  const refreshCatalog = async () => {
    setRefreshing(true)
    await window.tidepool.refresh(community)
    setRefreshing(false)
    setCommunity((c) => c) // force the browser to re-query
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
          <ProfileControls
            profiles={profiles}
            current={current}
            onSelect={setCurrentId}
            onChanged={() => void refresh()}
          />
          <select
            value={community}
            onChange={(e) => setCommunity(e.target.value)}
            aria-label="Thunderstore community"
          >
            {COMMUNITIES.map((c) => (
              <option key={c.slug} value={c.slug}>{c.label}</option>
            ))}
          </select>
          <button className="button--ghost" onClick={() => void refreshCatalog()} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      <GameBar profile={current} />

      <nav className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'browse'}
          className={tab === 'browse' ? 'tab tab--on' : 'tab'}
          onClick={() => setTab('browse')}
        >
          Browse
        </button>
        <button
          role="tab"
          aria-selected={tab === 'installed'}
          className={tab === 'installed' ? 'tab tab--on' : 'tab'}
          onClick={() => setTab('installed')}
        >
          Installed{current ? ` (${current.mods.length})` : ''}
        </button>
      </nav>

      {tab === 'browse' ? (
        <ModBrowser community={community} profile={current} onChanged={() => void refresh()} />
      ) : (
        <InstalledPanel
          profile={current}
          community={community}
          onChanged={() => void refresh()}
        />
      )}
    </div>
  )
}
