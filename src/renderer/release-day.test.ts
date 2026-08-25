import { describe, expect, it } from 'vitest'
import { RELEASE_DAY } from './Welcome'

describe('RELEASE_DAY', () => {
  // A calendar date is not an instant. Date.UTC(2026, 7, 25) is 5pm Pacific on
  // the 24th, which had the app announcing the game was out seventeen hours
  // early and sending people to locate an install that did not exist.
  it('is 10:00 Pacific on 25 August 2026, the time nocanwin confirmed', () => {
    const pacific = new Date(RELEASE_DAY).toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    })
    expect(pacific).toBe('08/25/2026, 10:00')
  })

  it('is not midnight UTC, which is the trap it replaced', () => {
    expect(RELEASE_DAY).not.toBe(Date.UTC(2026, 7, 25))
    expect(RELEASE_DAY).toBeGreaterThan(Date.UTC(2026, 7, 25))
  })
})
