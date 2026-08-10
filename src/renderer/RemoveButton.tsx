import { useState } from 'react'
import type { Result } from '../shared/types'
import { ConfirmDialog } from './Prompts'
import { toast, toastError } from './toast'

interface Impact { dependents: string[]; orphans: string[] }

/**
 * Removing a mod that others depend on leaves them installed but broken, and
 * that only shows up later as the game misbehaving. So check first and say so.
 */
export function RemoveButton({
  profileId,
  fullName,
  community,
  disabled,
  label = 'Remove',
  onDone,
}: {
  profileId: string
  fullName: string
  community: string
  disabled?: boolean
  label?: string
  onDone: () => void
}) {
  const [impact, setImpact] = useState<Impact | null>(null)
  const [checking, setChecking] = useState(false)

  const open = async () => {
    setChecking(true)
    const res: Result<Impact> = await window.tidepool.analyseRemoval(profileId, fullName, community)
    setChecking(false)
    setImpact(res.ok ? res.data : { dependents: [], orphans: [] })
  }

  const remove = async () => {
    setImpact(null)
    const res: Result<unknown> = await window.tidepool.uninstall(profileId, fullName)
    if (!res.ok) toastError(res.message)
    else toast(`Removed ${fullName}`)
    onDone()
  }

  const body = !impact
    ? ''
    : [
        impact.dependents.length > 0
          ? `${impact.dependents.join(', ')} depend${impact.dependents.length === 1 ? 's' : ''} on this and will stop working.`
          : 'Nothing else in this profile depends on it.',
        impact.orphans.length > 0
          ? `${impact.orphans.join(', ')} was installed only as a dependency and will no longer be needed by anything — you can remove it separately.`
          : '',
      ].filter(Boolean).join(' ')

  return (
    <>
      <button className="button--danger" onClick={() => void open()} disabled={disabled || checking}>
        {checking ? 'Checking…' : label}
      </button>
      {impact && (
        <ConfirmDialog
          title={`Remove ${fullName}?`}
          body={body}
          confirmLabel="Remove"
          onConfirm={() => void remove()}
          onClose={() => setImpact(null)}
        />
      )}
    </>
  )
}
