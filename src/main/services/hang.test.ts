/**
 * A server that accepts the connection and then never answers.
 *
 * Every network service already took an `AbortSignal` and nothing ever passed
 * one, so this hung `fetch` indefinitely — measured still pending after 30
 * seconds. On a captive portal that is the whole user experience: a spinner
 * that never becomes an error.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { Socket } from 'node:net'
import type { AddressInfo } from 'node:net'
import { fetchEssentials } from './essentials'
import { REQUEST_TIMEOUT_MS, isTimeout, withTimeout } from './http'

const open: { server: Server; sockets: Socket[] }[] = []

function blackHole(): Promise<string> {
  return new Promise((resolve) => {
    const sockets: Socket[] = []
    const server = createServer((_req, res) => {
      // Deliberately never respond.
      if (res.socket) sockets.push(res.socket)
    })
    open.push({ server, sockets })
    server.listen(0, '127.0.0.1', () => {
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}/essentials.json`)
    })
  })
}

afterAll(() => {
  for (const { server, sockets } of open) {
    sockets.forEach((s) => s.destroy())
    server.close()
  }
})

describe('a request that never comes back', () => {
  it('gives up instead of spinning forever', async () => {
    const url = await blackHole()
    // A real deadline would keep the suite waiting, so the same helper the
    // services use is given a short one. What is under test is that a deadline
    // exists at all and that the failure is phrased usefully.
    const signal = withTimeout(undefined, 300)
    await expect(fetchEssentials({ url, signal })).rejects.toThrow(/took too long/)
  })

  it('tells "took too long" apart from "could not be reached"', async () => {
    // Nothing is listening on this port, so it is refused rather than ignored.
    await expect(fetchEssentials({ url: 'http://127.0.0.1:1/none.json' }))
      .rejects.toThrow(/could not be reached/)
  })

  it('keeps the caller\'s own cancellation working alongside the deadline', () => {
    const controller = new AbortController()
    const signal = withTimeout(controller.signal, 60_000)
    expect(signal.aborted).toBe(false)
    controller.abort()
    expect(signal.aborted).toBe(true)
  })

  it('recognises both kinds of abort', () => {
    const timedOut = Object.assign(new Error('x'), { name: 'TimeoutError' })
    const cancelled = Object.assign(new Error('x'), { name: 'AbortError' })
    expect(isTimeout(timedOut)).toBe(true)
    expect(isTimeout(cancelled)).toBe(true)
    expect(isTimeout(new Error('something else'))).toBe(false)
  })

  it('allows enough time for a slow connection to answer', () => {
    expect(REQUEST_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000)
  })
})
