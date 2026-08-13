import { useCallback, useEffect, useState } from 'react'
import type { Profile, Result } from '../shared/types'
import { toast, toastError } from './toast'

interface LogLine { raw: string; level: 'error' | 'warning' | 'info'; source: string | null }
interface LogRead { path: string | null; truncated: boolean; sizeBytes: number; lines: LogLine[] }

export function LogPanel({ profile }: { profile: Profile | null }) {
  const [log, setLog] = useState<LogRead | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorsOnly, setErrorsOnly] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    const res: Result<LogRead> = await window.tidepool.readLog(profile.id)
    setLoading(false)
    if (res.ok) setLog(res.data)
    else toastError(res.message)
  }, [profile])

  useEffect(() => { void load() }, [load])

  if (!profile) return <p className="muted pad">No profile selected.</p>

  const copyBundle = async () => {
    const res: Result<string> = await window.tidepool.supportBundle(profile.id)
    if (!res.ok) return toastError(res.message)
    await navigator.clipboard.writeText(res.data)
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
    toast('Support bundle copied — paste it into your ticket')
  }

  const errors = log?.lines.filter((l) => l.level === 'error').length ?? 0
  const warnings = log?.lines.filter((l) => l.level === 'warning').length ?? 0
  const shown = errorsOnly ? (log?.lines ?? []).filter((l) => l.level === 'error') : log?.lines ?? []

  return (
    <div className="logs">
      <div className="logs__head">
        <p className="muted count">
          {!log?.path && 'No log yet — it appears once you have run the game with mods.'}
          {log?.path && (
            <>
              {log.lines.length} lines · {errors} error{errors === 1 ? '' : 's'} · {warnings} warning
              {warnings === 1 ? '' : 's'}
              {log.truncated && ' · showing the tail'}
            </>
          )}
        </p>
        <div className="logs__actions">
          <label className="check">
            <input
              type="checkbox"
              checked={errorsOnly}
              onChange={(e) => setErrorsOnly(e.target.checked)}
              disabled={!log?.path}
            />
            Errors only
          </label>
          <button className="button--ghost" onClick={() => void load()} disabled={loading}>
            {loading ? 'Reading…' : 'Refresh'}
          </button>
          <button
            className="button--ghost"
            onClick={() => void window.tidepool.openLogFolder(profile.id)}
          >
            Show file
          </button>
          <button onClick={() => void copyBundle()}>
            {copied ? 'Copied' : 'Copy support bundle'}
          </button>
        </div>
      </div>

      {log?.path && (
        <p className="muted logs__path" title={log.path}>{log.path}</p>
      )}

      {log?.path && shown.length === 0 && (
        <p className="muted pad">{errorsOnly ? 'No errors. ' : ''}Nothing to show.</p>
      )}

      {shown.length > 0 && (
        <ol className="logs__lines">
          {shown.map((l, i) => (
            <li key={i} className={`logline logline--${l.level}`}>
              <span className="logline__text">{l.raw}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
