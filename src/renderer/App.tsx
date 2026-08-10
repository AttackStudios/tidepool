import { useCallback, useEffect, useState } from 'react'
import { relativeDate } from './format'
import { GameBar } from './GameBar'
import { InstalledPanel } from './InstalledPanel'
import { ModBrowser } from './ModBrowser'
import { ProfileControls } from './ProfileControls'
import { useProfiles } from './useProfiles'
import { Toasts } from './toast'
import mark from './assets/mark.png'
import { Welcome } from './Welcome'
import type { GameInstall } from '../shared/types'

const HOME_COMMUNITY = { slug: 'surf-sandbox', label: 'Surf Sandbox' }

/**
 * The surf-sandbox community will not exist until mods are published for it, so
 * during development the browser can be pointed at a real community instead —
 * which is what makes the whole UI exercisable months before the game ships.
 *
 * Shipped builds only ever see Surf Sandbox. Offering a stranger a dropdown of
 * unrelated games would be baffling, and pointing them at Lethal Company mods
 * by default would be worse.
 */
const DEV_COMMUNITIES = [
  { slug: 'lethal-company', label: 'Lethal Company (dev target)' },
  { slug: 'valheim', label: 'Valheim (dev target)' },
]

const COMMUNITIES = window.tidepool.isDev
  ? [HOME_COMMUNITY, ...DEV_COMMUNITIES]
  : [HOME_COMMUNITY]

export function App() {
  const [community, setCommunity] = useState(HOME_COMMUNITY.slug)
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab] = useState<'browse' | 'installed'>('browse')
  const [status, setStatus] = useState<{ packages: number; fetchedAt: number; stale: boolean } | null>(null)
  const [showWelcome, setShowWelcome] = useState(false)
  const [game, setGame] = useState<GameInstall | null | undefined>(undefined)

  const readStatus = useCallback(async () => {
    const res = await window.tidepool.catalogStatus(community)
    setStatus(res.ok ? res.data : null)
  }, [community])
  const { profiles, current, setCurrentId, refresh } = useProfiles()

  // Remember the community across restarts.
  useEffect(() => {
    void window.tidepool.readSettings().then((s) => {
      if (s.community) setCommunity(s.community)
      setShowWelcome(!s.seenWelcome)
    })
    void window.tidepool.detectGame().then(setGame)
  }, [])

  const dismissWelcome = () => {
    setShowWelcome(false)
    void window.tidepool.writeSettings({ seenWelcome: true })
  }
  useEffect(() => { void window.tidepool.writeSettings({ community }) }, [community])

  useEffect(() => { void readStatus() }, [readStatus])

  const refreshCatalog = async () => {
    setRefreshing(true)
    await window.tidepool.refresh(community)
    await readStatus()
    setRefreshing(false)
    setCommunity((c) => c) // force the browser to re-query
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img className="brand__mark" src={mark} alt="" width={28} height={28} />
          <div>
            <h1>TidePool</h1>
            <p className="brand__sub">Mod manager for Surf Sandbox</p>
          </div>
        </div>

        <div className="topbar__right">
          <ProfileControls
            profiles={profiles}
            current={current}
            community={community}
            onSelect={setCurrentId}
            onChanged={() => void refresh()}
          />
          {COMMUNITIES.length > 1 && (
            <select
              value={community}
              onChange={(e) => setCommunity(e.target.value)}
              aria-label="Thunderstore community"
            >
              {COMMUNITIES.map((c) => (
                <option key={c.slug} value={c.slug}>{c.label}</option>
              ))}
            </select>
          )}
          {status?.stale && (
            <span className="status status--off" title="Thunderstore is unreachable — showing the last cached list">
              Fogged in · cached {relativeDate(new Date(status.fetchedAt).toISOString())}
            </span>
          )}
          <button className="button--ghost" onClick={() => void refreshCatalog()} disabled={refreshing}>
            {refreshing ? 'Reading swell…' : 'Refresh'}
          </button>
        </div>
      </header>

      <Toasts />

      <GameBar profile={current} />

      <nav className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'browse'}
          className={tab === 'browse' ? 'tab tab--on' : 'tab'}
          onClick={() => setTab('browse')}
        >
          Lineup
        </button>
        <button
          role="tab"
          aria-selected={tab === 'installed'}
          className={tab === 'installed' ? 'tab tab--on' : 'tab'}
          onClick={() => setTab('installed')}
        >
          Quiver{current ? ` (${current.mods.length})` : ''}
        </button>
      </nav>

      {showWelcome && (
        <Welcome
          game={game}
          hasMods={(current?.mods.length ?? 0) > 0}
          onDismiss={dismissWelcome}
        />
      )}

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
