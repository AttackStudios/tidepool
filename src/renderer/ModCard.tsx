import { useState } from 'react'
import type { PackageSummary } from '../shared/types'
import { compactNumber, relativeDate } from './format'

export function ModCard({
  mod,
  selected,
  installed,
  installing,
  onSelect,
}: {
  mod: PackageSummary
  selected: boolean
  installed: boolean
  installing: boolean
  onSelect: (fullName: string) => void
}) {
  // Package icons are third-party URLs and do 404. A broken one should fall back
  // to the placeholder rather than leaving a blank hole in the row.
  const [iconOk, setIconOk] = useState(true)

  return (
    <li>
      <button
        className={`card${selected ? ' card--selected' : ''}`}
        onClick={() => onSelect(mod.fullName)}
        aria-pressed={selected}
      >
        {mod.icon && iconOk ? (
          <img
            className="card__icon"
            src={mod.icon}
            alt=""
            loading="lazy"
            onError={() => setIconOk(false)}
          />
        ) : (
          <div className="card__icon card__icon--empty" aria-hidden="true" />
        )}

        <div className="card__body">
          <div className="card__title">
            <span className="card__name">{mod.name}</span>
            <span className="card__version">{mod.latestVersion}</span>
            {installing && <span className="tag tag--ok is-working">working…</span>}
            {installed && !installing && <span className="tag tag--ok">installed</span>}
            {mod.isDeprecated && <span className="tag tag--warn">deprecated</span>}
            {mod.isPinned && <span className="tag">pinned</span>}
          </div>
          <p className="card__desc">{mod.description || 'No description.'}</p>
          <div className="card__meta">
            <span>{mod.owner}</span>
            <span>{compactNumber(mod.downloads)} downloads</span>
            {mod.rating > 0 && <span>{compactNumber(mod.rating)} likes</span>}
            {mod.dateUpdated && <span>{relativeDate(mod.dateUpdated)}</span>}
          </div>
        </div>
      </button>
    </li>
  )
}
