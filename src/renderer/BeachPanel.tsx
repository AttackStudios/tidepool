import { useCallback, useEffect, useState } from 'react'
import type { Result } from '../shared/types'
import { Dialog } from './Dialog'
import { ConfirmDialog } from './Prompts'
import { toast, toastError } from './toast'

interface Beach {
  fileName: string
  path: string
  name: string
  sizeBytes: number
  modified: string
  shape?: {
    samples: number
    swell: number
    tide: number
    maxDepthM: number
    clamped: boolean
  } | null
}

type Mode = null | { kind: 'share'; beach: Beach } | { kind: 'import' } | { kind: 'delete'; beach: Beach }

export function BeachPanel() {
  const [dir, setDir] = useState<string | null>(null)
  const [beaches, setBeaches] = useState<Beach[]>([])
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<Mode>(null)
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res: Result<{ dir: string | null; beaches: Beach[] }> = await window.tidepool.listBeaches()
    setLoading(false)
    if (!res.ok) return toastError(res.message)
    setDir(res.data.dir)
    setBeaches(res.data.beaches)
  }, [])

  useEffect(() => { void load() }, [load])

  const close = () => { setMode(null); setCode(''); setCopied(false) }

  const openShare = async (beach: Beach) => {
    setMode({ kind: 'share', beach })
    setCode('')
    const res: Result<string> = await window.tidepool.shareBeach(beach.fileName)
    if (res.ok) setCode(res.data)
    else { toastError(res.message); close() }
  }

  const copy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const runImport = async () => {
    const res: Result<{ name: string }> = await window.tidepool.importBeach(code)
    if (!res.ok) return toastError(res.message)
    toast(`Imported “${res.data.name}”`)
    close()
    void load()
  }

  const remove = async (beach: Beach) => {
    const res: Result<Beach[]> = await window.tidepool.deleteBeach(beach.fileName)
    close()
    if (!res.ok) return toastError(res.message)
    setBeaches(res.data)
    toast(`Deleted “${beach.name}”`)
  }

  const locate = async () => {
    const res: Result<string | null> = await window.tidepool.pickBeachFolder()
    if (res.ok) { setDir(res.data); void load() }
  }

  return (
    <div className="beaches">
      <div className="installed__head">
        <p className="muted count">
          {dir
            ? `${beaches.length} saved beach${beaches.length === 1 ? '' : 'es'}`
            : 'No beach folder found yet.'}
        </p>
        <div className="installed__actions">
          <button className="button--ghost" onClick={() => void load()} disabled={loading}>
            {loading ? 'Reading…' : 'Refresh'}
          </button>
          <button className="button--ghost" onClick={() => void locate()}>
            {dir ? 'Change folder' : 'Locate folder…'}
          </button>
          <button
            className="button--ghost"
            onClick={() => void window.tidepool.revealBeaches()}
            disabled={!dir}
          >
            Show folder
          </button>
          <button onClick={() => setMode({ kind: 'import' })}>Import a beach</button>
        </div>
      </div>

      {dir && <p className="muted logs__path" title={dir}>{dir}</p>}

      {!dir && (
        <div className="empty">
          <h2 className="empty__title">Nothing to browse yet</h2>
          <p className="muted">
            Surf Sandbox saves each beach as a JSON file. Once the game has run and you have made
            one, it shows up here and you can share it as a code — no Workshop needed.
          </p>
          <p className="muted">
            If you already have saves and they aren’t listed, point TidePool at the folder with
            <strong> Locate folder</strong>.
          </p>
        </div>
      )}

      {dir && beaches.length === 0 && (
        <p className="muted pad">No beaches saved yet. Build one in the game and it’ll appear here.</p>
      )}

      {beaches.length > 0 && (
        <ul className="installed__list">
          {beaches.map((b) => (
            <li key={b.fileName}>
              <div className="installed__body">
                <div className="installed__title">
                  <span className="card__name">{b.name}</span>
                  {b.shape ? (
                    <span className="card__version">
                      {b.shape.clamped ? '15+' : b.shape.maxDepthM} m deep
                    </span>
                  ) : (
                    <span className="card__version">unreadable</span>
                  )}
                </div>
                <p className="installed__name muted">
                  {b.shape
                    ? `swell ${b.shape.swell.toFixed(2)} · ${b.shape.samples} samples` +
                      (b.shape.clamped ? ' · reaches the game floor' : '')
                    : b.fileName}
                </p>
              </div>
              <div className="installed__row-actions">
                <button onClick={() => void openShare(b)}>Share</button>
                <button className="button--danger" onClick={() => setMode({ kind: 'delete', beach: b })}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {mode?.kind === 'share' && (
        <Dialog
          title={`Share “${mode.beach.name}”`}
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
            Anyone with this code gets the exact same beach. It carries the save itself, so they
            don’t need anything from you afterwards.
          </p>
          <textarea className="codebox" readOnly value={code} rows={5} spellCheck={false} />
        </Dialog>
      )}

      {mode?.kind === 'import' && (
        <Dialog
          title="Import a beach"
          onClose={close}
          footer={
            <>
              <button className="button--ghost" onClick={close}>Cancel</button>
              <button onClick={() => void runImport()} disabled={!code.trim()}>Import</button>
            </>
          }
        >
          <p className="muted">
            Paste a beach code. It’s saved alongside your own — nothing is overwritten.
          </p>
          <textarea
            className="codebox"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            rows={5}
            spellCheck={false}
            placeholder="TPB1-…"
          />
        </Dialog>
      )}

      {mode?.kind === 'delete' && (
        <ConfirmDialog
          title={`Delete “${mode.beach.name}”?`}
          body="This removes the save file from disk. If you have shared its code, that still works."
          onConfirm={() => void remove(mode.beach)}
          onClose={close}
        />
      )}
    </div>
  )
}
