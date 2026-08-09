import { useEffect, useState } from 'react'
import type { BrowsePage, Profile, Result, SortKey } from '../shared/types'
import { ModCard } from './ModCard'
import { ModDetail } from './ModDetail'
import { useDebounced } from './useDebounced'

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
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey | null>(null)
  const [category, setCategory] = useState<string | null>(null)
  const [includeDeprecated, setIncludeDeprecated] = useState(false)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [state, setState] = useState<State>({ status: 'loading' })

  const debouncedSearch = useDebounced(search)

  // Any change to the query invalidates the current page number.
  useEffect(() => { setPage(0) }, [debouncedSearch, category, sort, includeDeprecated, community])

  useEffect(() => {
    let cancelled = false
    setState((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }))

    void window.tidepool
      .browse(
        {
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
  }, [debouncedSearch, category, sort, includeDeprecated, page, community])

  const result = state.status === 'ready' ? state.page : null
  const pageCount = result ? Math.ceil(result.total / result.pageSize) : 0

  return (
    <div className="browser">
      <div className="browser__controls">
        <input
          className="search"
          type="search"
          placeholder="Search mods…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search mods"
        />
        <select
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
          disabled={!result || result.categories.length === 0}
        >
          <option value="">All categories</option>
          {result?.categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={includeDeprecated}
            onChange={(e) => setIncludeDeprecated(e.target.checked)}
          />
          Show deprecated
        </label>
      </div>

      {state.status === 'loading' && <p className="muted pad">Loading catalog…</p>}

      {state.status === 'no-community' && (
        <div className="empty">
          <p>{state.message}</p>
          <p className="muted">
            Until then, switch the community above to browse an existing one — the whole
            pipeline is the same.
          </p>
        </div>
      )}

      {state.status === 'error' && <p className="error pad">{state.message}</p>}

      {result && (
        <div className="browser__body">
          <div className="browser__list">
            <p className="muted count">
              {result.total.toLocaleString()} {result.total === 1 ? 'mod' : 'mods'}
              {debouncedSearch && ` matching “${debouncedSearch}”`}
            </p>

            {result.items.length === 0 ? (
              <p className="muted pad">Nothing matches that.</p>
            ) : (
              <ul className="cards">
                {result.items.map((mod) => (
                  <ModCard
                    key={mod.fullName}
                    mod={mod}
                    selected={mod.fullName === selected}
                    installed={profile?.mods.some((m) => m.fullName === mod.fullName) ?? false}
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
