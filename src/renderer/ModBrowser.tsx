import { useEffect, useRef, useState } from 'react'
import type { BrowsePage, InstallProgress, Profile, Result, SortKey, SourceId } from '../shared/types'
import { ModCard } from './ModCard'
import { ModDetail } from './ModDetail'
import { useDebounced } from './useDebounced'

const SOURCES: { id: SourceId; label: string }[] = [
  { id: 'thunderstore', label: 'Thunderstore' },
  { id: 'gamebanana', label: 'GameBanana' },
]

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'relevance', label: 'Relevance' },
  { key: 'downloads', label: 'Downloads' },
  { key: 'rating', label: 'Likes' },
  { key: 'updated', label: 'Recently updated' },
  { key: 'name', label: 'Name' },
]

type State =
  | { status: 'loading' }
  | { status: 'ready'; page: BrowsePage }
  | { status: 'no-community'; message: string }
  | { status: 'error'; message: string }

export function ModBrowser({
  community,
  profile,
  onChanged,
}: {
  community: string
  profile: Profile | null
  onChanged: () => void
}) {
  const [source, setSource] = useState<SourceId>('thunderstore')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey | null>(null)
  const [category, setCategory] = useState<string | null>(null)
  const [includeDeprecated, setIncludeDeprecated] = useState(false)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [state, setState] = useState<State>({ status: 'loading' })
  // Progress carries the package being worked on, so the list can mark it too —
  // feedback shouldn't only exist in the detail panel.
  const [installing, setInstalling] = useState<string | null>(null)

  useEffect(
    () =>
      window.tidepool.onInstallProgress((p: InstallProgress) =>
        setInstalling(p.phase === 'done' || p.phase === 'failed' ? null : p.current),
      ),
    [],
  )

  const searchBox = useRef<HTMLInputElement>(null)
  const listBox = useRef<HTMLDivElement>(null)
  const debouncedSearch = useDebounced(search)

  // Cmd/Ctrl+F focuses search, matching what anyone browsing a long list expects.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        searchBox.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Any change to the query invalidates the current page number.
  useEffect(() => { setPage(0) }, [debouncedSearch, category, sort, includeDeprecated, community, source])

  useEffect(() => {
    let cancelled = false
    setState((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }))

    void window.tidepool
      .browse(
        {
          source,
          search: debouncedSearch,
          category,
          includeDeprecated,
          page,
          ...(sort ? { sort } : {}),
        },
        community,
      )
      .then((res: Result<BrowsePage>) => {
        if (cancelled) return
        if (res.ok) setState({ status: 'ready', page: res.data })
        else if (res.reason === 'no-community') setState({ status: 'no-community', message: res.message })
        else setState({ status: 'error', message: res.message })
      })
    return () => { cancelled = true }
  }, [debouncedSearch, category, sort, includeDeprecated, page, community, source])

  // Landing halfway down page two is disorienting; go back to the top whenever
  // the visible set changes.
  useEffect(() => { listBox.current?.scrollTo({ top: 0 }) }, [page, debouncedSearch, category, sort, source])

  const result = state.status === 'ready' ? state.page : null
  const pageCount = result ? Math.ceil(result.total / result.pageSize) : 0

  return (
    <div className="browser">
      <div className="browser__controls">
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as SourceId)}
          aria-label="Mod source"
        >
          {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <input
          ref={searchBox}
          className="search"
          type="search"
          placeholder="Search the lineup…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search mods"
          disabled={source === 'gamebanana'}
          title={source === 'gamebanana' ? 'GameBanana pages its own listings; search isn’t wired up yet' : undefined}
        />
        <select
          disabled={source === 'gamebanana'}
          value={sort ?? ''}
          onChange={(e) => setSort((e.target.value || null) as SortKey | null)}
          aria-label="Sort by"
        >
          <option value="">Sort: automatic</option>
          {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select
          value={category ?? ''}
          onChange={(e) => setCategory(e.target.value || null)}
          aria-label="Filter by category"
          disabled={source === 'gamebanana' || !result || result.categories.length === 0}
        >
          <option value="">All categories</option>
          {result?.categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="check">
          <input
            type="checkbox"
            disabled={source === 'gamebanana'}
            checked={includeDeprecated}
            onChange={(e) => setIncludeDeprecated(e.target.checked)}
          />
          Show deprecated
        </label>
      </div>

      {state.status === 'loading' && <p className="muted pad">Paddling out…</p>}

      {state.status === 'no-community' && (
        <div className="empty">
          <h2 className="empty__title">Flat today</h2>
          <p className="muted">{state.message}</p>
          {window.tidepool.isDev ? (
            <p className="muted">
              Switch the community above to browse an existing one — the pipeline is identical.
            </p>
          ) : (
            <>
              <p className="muted">
                Surf Sandbox released on 25 August 2026 and the modding community is brand new. Once
                the first mods are published they will appear here automatically — nothing to update.
              </p>
              <p className="muted">
                Want to be one of the first? Everything you need is in the{' '}
                <a
                  href="https://github.com/AttackStudios/tidepool"
                  onClick={(e) => {
                    e.preventDefault()
                    void window.tidepool.openExternal('https://github.com/AttackStudios/tidepool')
                  }}
                >
                  TidePool repository
                </a>
                .
              </p>
            </>
          )}
        </div>
      )}

      {state.status === 'error' && <p className="error pad">{state.message}</p>}

      {result && (
        <div className="browser__body">
          <div className="browser__list" ref={listBox}>
            {source === 'gamebanana' && (
              <p className="muted count">
                GameBanana submissions carry no dependency data and often ship several alternative
                files, so TidePool lists them and opens them in your browser rather than guessing an
                install. Thunderstore mods install here directly.
              </p>
            )}
            <p className="muted count">
              {result.total.toLocaleString()} {result.total === 1 ? 'mod' : 'mods'}
              {debouncedSearch && ` matching “${debouncedSearch}”`}
            </p>

            {result.items.length === 0 ? (
              <p className="muted pad">Flat — nothing out there matching that.</p>
            ) : (
              <ul className="cards">
                {result.items.map((mod) => (
                  <ModCard
                    key={mod.fullName}
                    mod={mod}
                    selected={mod.fullName === selected}
                    installed={profile?.mods.some((m) => m.fullName === mod.fullName) ?? false}
                    installing={installing === mod.fullName}
                    onSelect={setSelected}
                  />
                ))}
              </ul>
            )}

            {pageCount > 1 && (
              <nav className="pager">
                <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </button>
                <span className="muted">Page {page + 1} of {pageCount.toLocaleString()}</span>
                <button disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>
                  Next
                </button>
              </nav>
            )}
          </div>

          {selected && (
            <ModDetail
              fullName={selected}
              summary={result.items.find((i) => i.fullName === selected) ?? null}
              community={community}
              profile={profile}
              onChanged={onChanged}
            />
          )}
        </div>
      )}
    </div>
  )
}
