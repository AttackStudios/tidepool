import { describe, expect, it } from 'vitest'
import { isPrerelease } from './updates-app'

describe('isPrerelease', () => {
  it('recognises a release candidate', () => {
    // Someone on 0.1.0-rc.5 should be offered rc.6, not told they are current
    // until a stable build exists.
    expect(isPrerelease('0.1.0-rc.5')).toBe(true)
    expect(isPrerelease('1.0.0-beta.1')).toBe(true)
  })
  it('treats a plain version as stable', () => {
    expect(isPrerelease('1.0.0')).toBe(false)
    expect(isPrerelease('0.2.13')).toBe(false)
  })
})
