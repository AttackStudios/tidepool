import { useEffect, useState } from 'react'

/**
 * Debounce a rapidly-changing value.
 *
 * Typing in the search box would otherwise fire an IPC round trip per keystroke,
 * each one re-scanning a 50k-package index in the main process.
 */
export function useDebounced<T>(value: T, delayMs = 200): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}
