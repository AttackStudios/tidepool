import { useEffect, useState } from 'react'

type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; percent: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string }

/**
 * Only appears when there is something to say.
 *
 * A permanently visible "you're up to date" badge is noise; an update that
 * silently installs itself while someone is mid-install is worse. So: quiet
 * until ready, then one obvious action.
 */
export function UpdateChip() {
  const [state, setState] = useState<UpdateState>({ status: 'idle' })

  useEffect(() => window.tidepool.onUpdateState((s) => setState(s as UpdateState)), [])

  if (state.status === 'idle' || state.status === 'checking') return null
  // A failed check usually means offline, which is not worth interrupting for.
  if (state.status === 'error') return null

  if (state.status === 'downloading') {
    return <span className="status">Update {state.percent}%</span>
  }
  if (state.status === 'available') {
    return <span className="status">Update {state.version} downloading…</span>
  }
  return (
    <button onClick={() => void window.tidepool.installUpdate()} title={`Install ${state.version}`}>
      Restart to update
    </button>
  )
}
