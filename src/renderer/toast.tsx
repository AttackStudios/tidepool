import { useEffect, useState } from 'react'

/**
 * Minimal toast channel.
 *
 * A module-level emitter rather than context: toasts are fired from deep inside
 * handlers that have no business taking a provider prop, and there is only ever
 * one toast host on screen.
 */
export type ToastKind = 'ok' | 'error'
export interface Toast { id: number; kind: ToastKind; message: string }

type Listener = (toast: Toast) => void
const listeners = new Set<Listener>()
let nextId = 1

export function toast(message: string, kind: ToastKind = 'ok'): void {
  const entry: Toast = { id: nextId++, kind, message }
  for (const listener of listeners) listener(entry)
}

export const toastError = (message: string) => toast(message, 'error')

export function Toasts() {
  const [items, setItems] = useState<Toast[]>([])

  useEffect(() => {
    const listener: Listener = (entry) => {
      setItems((current) => [...current, entry])
      // Errors linger, because they usually need reading twice.
      const ms = entry.kind === 'error' ? 6500 : 3200
      setTimeout(() => setItems((c) => c.filter((t) => t.id !== entry.id)), ms)
    }
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])

  if (items.length === 0) return null

  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`}>
          <span>{t.message}</span>
          <button
            className="toast__close"
            aria-label="Dismiss"
            onClick={() => setItems((c) => c.filter((x) => x.id !== t.id))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
