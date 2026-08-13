import { describe, expect, it } from 'vitest'
import { cacheKey, isInside, targetPathFor } from './install'
import type { PackageVersion } from '../../shared/types'

const version = (url: string): PackageVersion => ({
  full_name: 'Owner-Mod-1.0.0', name: 'Mod', version_number: '1.0.0',
  download_url: url, dependencies: [], file_size: 1,
})

describe('cacheKey', () => {
  it('changes when the download url changes', () => {
    // Keyed on URL, not version, so a republished package can't serve a stale zip.
    expect(cacheKey(version('https://a.test/x.zip')))
      .not.toBe(cacheKey(version('https://b.test/x.zip')))
  })
  it('is stable for the same url', () => {
    expect(cacheKey(version('https://a.test/x.zip')))
      .toBe(cacheKey(version('https://a.test/x.zip')))
  })
})

describe('targetPathFor', () => {
  it('preserves an existing BepInEx tree', () => {
    expect(targetPathFor('BepInEx/plugins/Thing.dll', '/p', 'Owner-Mod'))
      .toBe('/p/BepInEx/plugins/Thing.dll')
  })

  it('finds a BepInEx tree nested under a wrapper folder', () => {
    expect(targetPathFor('Owner-Mod/BepInEx/plugins/Thing.dll', '/p', 'Owner-Mod'))
      .toBe('/p/BepInEx/plugins/Thing.dll')
  })

  it('routes a loose dll into the profile plugin folder', () => {
    expect(targetPathFor('Thing.dll', '/p', 'Owner-Mod'))
      .toBe('/p/BepInEx/plugins/Owner-Mod/Thing.dll')
  })

  it('skips Thunderstore metadata and directories', () => {
    expect(targetPathFor('manifest.json', '/p', 'Owner-Mod')).toBeNull()
    expect(targetPathFor('icon.png', '/p', 'Owner-Mod')).toBeNull()
    expect(targetPathFor('plugins/', '/p', 'Owner-Mod')).toBeNull()
  })

  it('refuses entries that would escape the profile directory', () => {
    // Zip Slip. Archive names are attacker-controlled and this tool exists to
    // unpack downloaded archives, so an unchecked `..` is arbitrary file write.
    for (const evil of [
      '../../../../../../tmp/pwned.dll',
      'BepInEx/../../../../../../tmp/pwned.dll',
      'BepInEx/plugins/../../../../../../../tmp/pwned.dll',
      'BepInEx/core/../../../../Library/LaunchAgents/evil.plist',
      'BepInEx\\..\\..\\..\\evil.dll',
    ]) {
      expect(targetPathFor(evil, '/p/profiles/default', 'Owner-Mod'), evil).toBeNull()
    }
  })

  it('refuses absolute entry names', () => {
    expect(targetPathFor('/etc/passwd', '/p', 'Owner-Mod')).toBeNull()
    expect(targetPathFor('C:/Windows/System32/evil.dll', '/p', 'Owner-Mod')).toBeNull()
  })

  it('still allows a harmless .. that stays inside', () => {
    // Over-blocking would break legitimate archives, so only escapes are refused.
    expect(targetPathFor('BepInEx/plugins/sub/../Thing.dll', '/p', 'Owner-Mod'))
      .toBe('/p/BepInEx/plugins/Thing.dll')
  })

  it('normalises Windows separators found in zip entries', () => {
    expect(targetPathFor('BepInEx\\plugins\\Thing.dll', '/p', 'Owner-Mod'))
      .toBe('/p/BepInEx/plugins/Thing.dll')
  })
})

describe('isInside', () => {
  it('accepts a path within the root', () => {
    expect(isInside('/p', '/p/BepInEx/plugins/x.dll')).toBe(true)
    expect(isInside('/p', '/p')).toBe(true)
  })
  it('rejects escapes and sibling directories', () => {
    expect(isInside('/p', '/p/../q/x.dll')).toBe(false)
    expect(isInside('/p', '/other/x.dll')).toBe(false)
    // A prefix match on the string alone would wrongly accept this one.
    expect(isInside('/p', '/pwned/x.dll')).toBe(false)
  })
})
