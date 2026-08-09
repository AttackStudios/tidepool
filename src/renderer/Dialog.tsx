import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Small modal. Native `prompt` truncates and can't be styled, and profile codes
 * are several hundred characters, so they need a real text area.
 */
export function Dialog({
  title,
  children,
  onClose,
  footer,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  footer?: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    // Move focus in, so the dialog is usable from the keyboard immediately.
    panel.current?.querySelector<HTMLElement>('textarea, input, button')?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="scrim" onMouseDown={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={panel}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="dialog__title">{title}</h2>
        <div className="dialog__body">{children}</div>
        <div className="dialog__foot">{footer}</div>
      </div>
    </div>
  )
}
