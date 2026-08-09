import { describe, expect, it } from 'vitest'
import {
  CODE_PREFIX, InvalidProfileCodeError, MAX_MODS,
  decodeProfile, encodeProfile, refsFor,
} from './profilecode'
import type { InstalledMod, Profile } from '../../shared/types'

const mod = (fullName: string, version = '1.0.0', over: Partial<InstalledMod> = {}): InstalledMod => ({
  fullName, version, enabled: true, installedAt: 'now', files: [], ...over,
})
const profile = (mods: InstalledMod[], name = 'My Setup'): Profile => ({ id: 'p', name, mods })

describe('encode / decode', () => {
  it('round-trips a profile', () => {
    const decoded = decodeProfile(encodeProfile(
      profile([mod('Owner-Mod'), mod('Other-Thing', '2.1.0', { viaDependency: true, enabled: false })]),
      'surf-sandbox',
    ))
    expect(decoded.name).toBe('My Setup')
    expect(decoded.community).toBe('surf-sandbox')
    expect(decoded.mods).toEqual([
      { fullName: 'Owner-Mod', version: '1.0.0', enabled: true, viaDependency: false },
      { fullName: 'Other-Thing', version: '2.1.0', enabled: false, viaDependency: true },
    ])
  })

  it('produces a code short enough to paste', () => {
    const many = Array.from({ length: 40 }, (_, i) => mod(`Owner-Mod${i}`, '1.2.3'))
    const code = encodeProfile(profile(many))
    expect(code.startsWith(CODE_PREFIX)).toBe(true)
    expect(code.length).toBeLessThan(900)
  })

  it('survives an empty profile', () => {
    expect(decodeProfile(encodeProfile(profile([]))).mods).toEqual([])
  })

  it('ignores surrounding whitespace from a sloppy paste', () => {
    const code = encodeProfile(profile([mod('Owner-Mod')]))
    expect(decodeProfile(`\n  ${code}  \n`).mods).toHaveLength(1)
  })

  it('turns into install refs', () => {
    const decoded = decodeProfile(encodeProfile(profile([mod('Owner-Mod', '3.0.0')])))
    expect(refsFor(decoded)).toEqual(['Owner-Mod-3.0.0'])
  })
})

describe('decode rejects bad input', () => {
  it('rejects a code without the prefix', () => {
    expect(() => decodeProfile('hello')).toThrow(InvalidProfileCodeError)
  })

  it('rejects a truncated code', () => {
    const code = encodeProfile(profile([mod('Owner-Mod')]))
    expect(() => decodeProfile(code.slice(0, code.length - 12))).toThrow(/damaged or was copied/)
  })

  it('rejects a payload that is not a profile', () => {
    const { gzipSync } = require('node:zlib')
    const junk = CODE_PREFIX + gzipSync(Buffer.from('[1,2,3]')).toString('base64url')
    expect(() => decodeProfile(junk)).toThrow(/missing a name or mod list/)
  })

  it('refuses an unreasonably large mod list', () => {
    // Codes come from strangers and trigger downloads, so cap the damage.
    const { gzipSync } = require('node:zlib')
    const payload = { n: 'x', m: Array.from({ length: MAX_MODS + 1 }, () => ['A-B', '1.0.0', 1, 0]) }
    const code = CODE_PREFIX + gzipSync(Buffer.from(JSON.stringify(payload))).toString('base64url')
    expect(() => decodeProfile(code)).toThrow(new RegExp(`more than the ${MAX_MODS} limit`))
  })

  it('drops entries that are not valid package references', () => {
    const { gzipSync } = require('node:zlib')
    const payload = { n: 'x', m: [['Owner-Mod', '1.0.0', 1, 0], ['nonsense', 'not-a-version', 1, 0]] }
    const code = CODE_PREFIX + gzipSync(Buffer.from(JSON.stringify(payload))).toString('base64url')
    expect(decodeProfile(code).mods).toHaveLength(1)
  })

  it('throws when every entry is invalid rather than importing nothing silently', () => {
    const { gzipSync } = require('node:zlib')
    const payload = { n: 'x', m: [['nope', 'bad', 1, 0]] }
    const code = CODE_PREFIX + gzipSync(Buffer.from(JSON.stringify(payload))).toString('base64url')
    expect(() => decodeProfile(code)).toThrow(/none of its entries/)
  })

  it('caps an absurdly long profile name', () => {
    const decoded = decodeProfile(encodeProfile(profile([mod('Owner-Mod')], 'x'.repeat(500))))
    expect(decoded.name.length).toBe(80)
  })
})
