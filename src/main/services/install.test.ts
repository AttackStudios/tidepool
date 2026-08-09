import { describe, expect, it } from 'vitest'
import { cacheKey, targetPathFor } from './install'
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

  it('normalises Windows separators found in zip entries', () => {
    expect(targetPathFor('BepInEx\\plugins\\Thing.dll', '/p', 'Owner-Mod'))
      .toBe('/p/BepInEx/plugins/Thing.dll')
  })
})
