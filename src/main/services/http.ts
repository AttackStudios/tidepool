/**
 * Deadlines for the requests TidePool makes.
 *
 * Every network service already accepted an `AbortSignal` — and nothing ever
 * passed one. A server that accepts the connection and then says nothing leaves
 * `fetch` waiting indefinitely, so a captive portal, a stalled connection, or
 * DNS pointing at something that is not listening all end the same way: the
 * Browse tab spins forever and never becomes an error anyone can act on.
 *
 * Measured before fixing — a request to a black-hole server was still pending
 * after 30 seconds with no sign of stopping.
 */

/**
 * How long a metadata request may take before it counts as a failure.
 *
 * These fetch small JSON documents, so anything past a few seconds is a
 * connection that is not going to work. Generous enough for a slow phone
 * tether, short enough that the message arrives while someone is still looking.
 */
export const REQUEST_TIMEOUT_MS = 15_000

/**
 * The caller's signal, if any, plus a deadline.
 *
 * Deliberately combined rather than replaced: cancelling a request when the user
 * switches tabs still has to work.
 */
export function withTimeout(signal?: AbortSignal, ms: number = REQUEST_TIMEOUT_MS): AbortSignal {
  const deadline = AbortSignal.timeout(ms)
  return signal ? AbortSignal.any([signal, deadline]) : deadline
}

/** Did this fail because it ran out of time, rather than being refused? */
export function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
}
