import { describe, expect, it } from 'vitest'
import { isPrerelease, prereleaseBadge, prereleaseLabel } from './version'

describe('prereleaseLabel', () => {
  it('returns the identifier after the hyphen', () => {
    expect(prereleaseLabel('1.0.0-rc.9')).toBe('rc.9')
    expect(prereleaseLabel('0.1.0-rc.5')).toBe('rc.5')
    expect(prereleaseLabel('1.0.0-beta.1')).toBe('beta.1')
  })

  it('is null for a stable version', () => {
    expect(prereleaseLabel('1.0.0')).toBeNull()
    expect(prereleaseLabel('0.2.13')).toBeNull()
  })

  // A stray hyphen with nothing after it would otherwise badge the build as a
  // prerelease called "".
  it('treats a trailing hyphen as stable', () => {
    expect(prereleaseLabel('1.0.0-')).toBeNull()
    expect(prereleaseLabel('1.0.0-  ')).toBeNull()
  })

  it('drops build metadata, which is not a prerelease identifier', () => {
    expect(prereleaseLabel('1.0.0-rc.9+a1b2c3')).toBe('rc.9')
  })
})

describe('isPrerelease', () => {
  it('agrees with prereleaseLabel', () => {
    for (const v of ['1.0.0-rc.9', '0.1.0-rc.5', '1.0.0-beta.1']) {
      expect(isPrerelease(v)).toBe(true)
    }
    for (const v of ['1.0.0', '0.2.13', '1.0.0-']) {
      expect(isPrerelease(v)).toBe(false)
    }
  })
})

describe('prereleaseBadge', () => {
  it('reads as a label a tester can quote back in a bug report', () => {
    expect(prereleaseBadge('1.0.0-rc.9')).toBe('PreRelease Build (rc.9)')
  })

  it('is null on a stable build, so nothing renders', () => {
    expect(prereleaseBadge('1.0.0')).toBeNull()
  })
})
