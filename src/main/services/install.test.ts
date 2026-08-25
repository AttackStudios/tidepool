import { tmpdir } from 'node:os'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import AdmZip from 'adm-zip'
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { cacheKey, isInside, LOADER_STAGING, targetPathFor, installLoaderPack } from './install'
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


describe('loader packs', () => {
  // A BepInEx pack ships four things at its own root that belong beside the
  // game executable, not in a profile. Filed as plugins they are inert, and the
  // failure is silent: the install reports success and the game runs vanilla.
  const pack = 'BepInEx-BepInExPack_IL2CPP-6.0.755'

  it('stages the Doorstop shim instead of filing it as a plugin', () => {
    const t = targetPathFor('BepInExPack/winhttp.dll', '/p', pack)
    expect(t).toBe(join('/p', LOADER_STAGING, 'winhttp.dll'))
    expect(t).not.toContain('plugins')
  })

  it('stages the Doorstop config and version marker', () => {
    expect(targetPathFor('BepInExPack/doorstop_config.ini', '/p', pack)).toBe(
      join('/p', LOADER_STAGING, 'doorstop_config.ini'),
    )
    expect(targetPathFor('BepInExPack/.doorstop_version', '/p', pack)).toBe(
      join('/p', LOADER_STAGING, '.doorstop_version'),
    )
  })

  it('stages the whole dotnet runtime BepInEx 6 executes on', () => {
    expect(targetPathFor('BepInExPack/dotnet/coreclr.dll', '/p', pack)).toBe(
      join('/p', LOADER_STAGING, 'dotnet', 'coreclr.dll'),
    )
  })

  it('still puts the BepInEx tree itself in the profile', () => {
    expect(targetPathFor('BepInExPack/BepInEx/core/BepInEx.Preloader.dll', '/p', pack)).toBe(
      join('/p', 'BepInEx', 'core', 'BepInEx.Preloader.dll'),
    )
  })

  it('does not mistake an ordinary mod\'s files for loader files', () => {
    // A mod may legitimately ship a DLL by any name; only the loader's own
    // root-level names are special, and only at the root.
    expect(targetPathFor('MyMod/plugins/winhttp.dll', '/p', 'MyMod')).toContain('plugins')
    expect(targetPathFor('MyMod/SomeMod.dll', '/p', 'MyMod')).toBe(
      join('/p', 'BepInEx', 'plugins', 'MyMod', 'MyMod/SomeMod.dll'),
    )
  })

  it('keeps traversal inside the profile, and refuses anything that leaves it', () => {
    // Containment is the guarantee, not the absence of "..". A path that walks
    // up and lands back inside is harmless and is kept.
    expect(targetPathFor('BepInExPack/../../../../evil.dll', '/p', pack)).toBe('/p/evil.dll')
    expect(targetPathFor('dotnet/../coreclr.dll', '/p', pack)).toBe(
      join('/p', LOADER_STAGING, 'coreclr.dll'),
    )
    // Walking out of the profile entirely is refused, including via the staging
    // route, which is a second join site and so a second chance to get it wrong.
    expect(targetPathFor('dotnet/../../../../../../evil.dll', '/p', pack)).toBeNull()
    expect(targetPathFor('BepInExPack/../../../../../../evil.dll', '/p', pack)).toBeNull()
  })
})

describe('installLoaderPack', () => {
  const packZip = (entries: Record<string, string>): string => {
    const zip = new AdmZip()
    for (const [name, body] of Object.entries(entries)) zip.addFile(name, Buffer.from(body))
    const file = join(mkdtempSync(join(tmpdir(), 'tp-lp-')), 'loader.zip')
    zip.writeZip(file)
    return file
  }

  it('writes the loader into the game, keeping its layout', () => {
    // MelonLoader's layout is the point: version.dll beside the exe, the rest
    // under MelonLoader/. Flattening it would break the loader.
    const game = mkdtempSync(join(tmpdir(), 'tp-g-'))
    installLoaderPack(packZip({
      'version.dll': 'MZ',
      'MelonLoader/net6/MelonLoader.dll': 'MZ',
      'MelonLoader/Documentation/README.md': 'x',
    }), game)
    expect(existsSync(join(game, 'version.dll'))).toBe(true)
    expect(existsSync(join(game, 'MelonLoader', 'net6', 'MelonLoader.dll'))).toBe(true)
    rmSync(game, { recursive: true, force: true })
  })

  it('refuses paths that escape the game folder', () => {
    const game = mkdtempSync(join(tmpdir(), 'tp-g2-'))
    installLoaderPack(packZip({ '../../evil.dll': 'MZ', 'version.dll': 'MZ' }), game)
    expect(existsSync(join(game, 'version.dll'))).toBe(true)
    expect(existsSync(join(game, '..', '..', 'evil.dll'))).toBe(false)
    rmSync(game, { recursive: true, force: true })
  })
})
