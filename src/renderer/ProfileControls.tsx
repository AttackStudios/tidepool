import { useState } from 'react'
import type { Profile, Result } from '../shared/types'
import { Dialog } from './Dialog'

type Mode = null | 'export' | 'import'

export function ProfileControls({
  profiles,
  current,
  community,
  onSelect,
  onChanged,
}: {
  profiles: Profile[]
  current: Profile | null
  community: string
  onSelect: (id: string) => void
  onChanged: () => void
}) {
  const [mode, setMode] = useState<Mode>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const close = () => { setMode(null); setCode(''); setError(null); setCopied(false) }

  const create = async () => {
    const name = window.prompt('Profile name', `Profile ${profiles.length + 1}`)
    if (name?.trim()) { await window.tidepool.createProfile(name.trim()); onChanged() }
  }

  const rename = async () => {
    if (!current) return
    const name = window.prompt('Rename profile', current.name)
    if (name?.trim()) { await window.tidepool.renameProfile(current.id, name.trim()); onChanged() }
  }

  const duplicate = async () => {
    if (!current) return
    await window.tidepool.duplicateProfile(current.id)
    onChanged()
  }

  const remove = async () => {
    if (!current) return
    // Deleting takes the installed mods with it, so make that explicit.
    const ok = window.confirm(
      `Delete “${current.name}” and its ${current.mods.length} installed mod(s)? This cannot be undone.`,
    )
    if (!ok) return
    await window.tidepool.deleteProfile(current.id)
    onChanged()
  }

  const openExport = async () => {
    if (!current) return
    setMode('export'); setError(null); setCode('')
    const res: Result<string> = await window.tidepool.exportProfile(current.id, community)
    if (res.ok) setCode(res.data)
    else setError(res.message)
  }

  const copy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const runImport = async () => {
    setBusy(true); setError(null)
    const res: Result<unknown> = await window.tidepool.importProfile(code, community)
    setBusy(false)
    if (!res.ok) return setError(res.message)
    onChanged()
    close()
  }

  return (
    <div className="profilebar">
      <label className="field">
        <span className="field__label">Profile</span>
        <select
          value={current?.id ?? ''}
          onChange={(e) => onSelect(e.target.value)}
          aria-label="Active profile"
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.mods.length})</option>
          ))}
        </select>
      </label>

      <button className="button--ghost" onClick={() => void create()}>New</button>
      <button className="button--ghost" onClick={() => void rename()} disabled={!current}>Rename</button>
      <button className="button--ghost" onClick={() => void duplicate()} disabled={!current}>Duplicate</button>
      <button className="button--ghost" onClick={() => void openExport()} disabled={!current}>Share</button>
      <button className="button--ghost" onClick={() => setMode('import')}>Import</button>
      <button
        className="button--danger"
        onClick={() => void remove()}
        disabled={!current || profiles.length < 2}
        title={profiles.length < 2 ? 'Keep at least one profile' : undefined}
      >
        Delete
      </button>

      {mode === 'export' && (
        <Dialog
          title={`Share “${current?.name ?? ''}”`}
          onClose={close}
          footer={
            <>
              <button className="button--ghost" onClick={close}>Done</button>
              <button onClick={() => void copy()} disabled={!code}>
                {copied ? 'Copied' : 'Copy code'}
              </button>
            </>
          }
        >
          <p className="muted">
            Anyone with this code can rebuild the exact same set of mods. It carries the mod list, not
            the files — they’ll be downloaded fresh.
          </p>
          <textarea className="codebox" readOnly value={code} rows={5} spellCheck={false} />
          {error && <p className="error">{error}</p>}
        </Dialog>
      )}

      {mode === 'import' && (
        <Dialog
          title="Import a profile"
          onClose={close}
          footer={
            <>
              <button className="button--ghost" onClick={close} disabled={busy}>Cancel</button>
              <button onClick={() => void runImport()} disabled={busy || !code.trim()}>
                {busy ? 'Importing…' : 'Import and install'}
              </button>
            </>
          }
        >
          <p className="muted">
            Paste a code. A new profile is created and its mods installed — nothing existing is touched.
          </p>
          <textarea
            className="codebox"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            rows={5}
            spellCheck={false}
            placeholder="TP1-…"
          />
          {error && <p className="error">{error}</p>}
        </Dialog>
      )}
    </div>
  )
}
