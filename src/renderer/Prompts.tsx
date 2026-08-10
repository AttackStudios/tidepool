import { useState } from 'react'
import { Dialog } from './Dialog'

/**
 * In-app replacements for `window.prompt` and `window.confirm`.
 *
 * The native ones cannot be styled and render as an OS sheet over a fully
 * custom window, which reads as a bug even when it is working.
 */
export function PromptDialog({
  title,
  label,
  initial = '',
  confirmLabel = 'Save',
  onSubmit,
  onClose,
}: {
  title: string
  label: string
  initial?: string
  confirmLabel?: string
  onSubmit: (value: string) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(initial)
  const submit = () => {
    const trimmed = value.trim()
    if (trimmed) onSubmit(trimmed)
  }

  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="button--ghost" onClick={onClose}>Cancel</button>
          <button onClick={submit} disabled={!value.trim()}>{confirmLabel}</button>
        </>
      }
    >
      <label className="promptfield">
        <span className="field__label">{label}</span>
        <input
          className="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          autoFocus
        />
      </label>
    </Dialog>
  )
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Delete',
  danger = true,
  onConfirm,
  onClose,
}: {
  title: string
  body: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="button--ghost" onClick={onClose}>Cancel</button>
          <button className={danger ? 'button--danger' : ''} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="muted">{body}</p>
    </Dialog>
  )
}
