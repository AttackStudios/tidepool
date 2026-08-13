import AdmZip from 'adm-zip'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Catalog } from './catalog'
import { Installer } from './installer'
import { ProfileStore } from './profiles'
import type { Package } from '../../shared/types'

let root: string
let cache: string
let profiles: ProfileStore

const zipFor = (entries: Record<string, string>) => {
  const zip = new AdmZip()
  for (const [name, body] of Object.entries(entries)) zip.addFile(name, Buffer.from(body))
  return zip.toBuffer()
}

const pkg = (full: string, version: string, deps: string[] = []): Package => ({
  name: full.split('-').slice(1).join('-'),
  full_name: full,
  owner: full.split('-')[0] ?? '',
  is_deprecated: false,
  versions: [{
    full_name: `${full}-${version}`, name: 'x', version_number: version,
    download_url: `https://example.test/${full}-${version}.zip`,
    dependencies: deps, file_size: 1, downloads: 1,
  }],
})

/** Serve the package index and any package zip from one fake fetch. */
function stubFetch(packages: Package[], zips: Record<string, Buffer>) {
  const impl = vi.fn(async (url: string) => {
    if (url.includes('/api/v1/package/')) {
      return { status: 200, ok: true, json: async () => packages } as unknown as Response
    }
    const body = zips[url]
    if (!body) return { status: 404, ok: false } as unknown as Response
    return { status: 200, ok: true, arrayBuffer: async () => body } as unknown as Response
  })
  vi.stubGlobal('fetch', impl)
  return impl
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'tidepool-p-'))
  cache = mkdtempSync(join(tmpdir(), 'tidepool-c-'))
  profiles = new ProfileStore(root)
})
afterEach(() => {
  vi.unstubAllGlobals()
  rmSync(root, { recursive: true, force: true })
  rmSync(cache, { recursive: true, force: true })
})

describe('Installer', () => {
  it('installs a mod and its dependency, dependency first', async () => {
    stubFetch(
      [pkg('A-Top', '1.0.0', ['B-Base-1.0.0']), pkg('B-Base', '1.0.0')],
      {
        'https://example.test/A-Top-1.0.0.zip': zipFor({ 'BepInEx/plugins/Top.dll': 'top' }),
        'https://example.test/B-Base-1.0.0.zip': zipFor({ 'BepInEx/plugins/Base.dll': 'base' }),
      },
    )
    const profile = profiles.create('Test')
    const installer = new Installer(new Catalog(), profiles, cache)

    const phases: string[] = []
    const result = await installer.install(profile.id, ['A-Top-1.0.0'], 'x', (p) =>
      phases.push(p.phase),
    )

    expect(result.installed.map((m) => m.fullName)).toEqual(['B-Base', 'A-Top'])
    expect(existsSync(join(profiles.dir(profile.id), 'BepInEx/plugins/Top.dll'))).toBe(true)
    expect(existsSync(join(profiles.dir(profile.id), 'BepInEx/plugins/Base.dll'))).toBe(true)
    expect(phases[0]).toBe('resolving')
    expect(phases.at(-1)).toBe('done')
  })

  it('marks dependencies so the UI can tell them from chosen mods', async () => {
    stubFetch(
      [pkg('A-Top', '1.0.0', ['B-Base-1.0.0']), pkg('B-Base', '1.0.0')],
      {
        'https://example.test/A-Top-1.0.0.zip': zipFor({ 'Top.dll': 't' }),
        'https://example.test/B-Base-1.0.0.zip': zipFor({ 'Base.dll': 'b' }),
      },
    )
    const profile = profiles.create('Test')
    const r = await new Installer(new Catalog(), profiles, cache)
      .install(profile.id, ['A-Top-1.0.0'], 'x')
    expect(r.installed.find((m) => m.fullName === 'B-Base')?.viaDependency).toBe(true)
    expect(r.installed.find((m) => m.fullName === 'A-Top')?.viaDependency).toBe(false)
  })

  it('records the files it wrote so uninstall is exact', async () => {
    stubFetch([pkg('A-Top', '1.0.0')], {
      'https://example.test/A-Top-1.0.0.zip': zipFor({ 'BepInEx/plugins/Top.dll': 'top' }),
    })
    const profile = profiles.create('Test')
    const installer = new Installer(new Catalog(), profiles, cache)
    await installer.install(profile.id, ['A-Top-1.0.0'], 'x')

    const stored = profiles.read(profile.id)!.mods[0]!
    expect(stored.files).toEqual([join('BepInEx', 'plugins', 'Top.dll')])
  })

  it('skips a mod already installed at the same version', async () => {
    stubFetch([pkg('A-Top', '1.0.0')], {
      'https://example.test/A-Top-1.0.0.zip': zipFor({ 'Top.dll': 'top' }),
    })
    const profile = profiles.create('Test')
    const installer = new Installer(new Catalog(), profiles, cache)
    await installer.install(profile.id, ['A-Top-1.0.0'], 'x')
    const second = await installer.install(profile.id, ['A-Top-1.0.0'], 'x')

    expect(second.installed).toHaveLength(0)
    expect(second.skipped).toEqual(['A-Top-1.0.0'])
    expect(profiles.read(profile.id)!.mods).toHaveLength(1)
  })

  it('clears the old version files when upgrading', async () => {
    // A stale DLL left behind by v1 would otherwise sit in plugins/ alongside
    // v2 and get loaded too.
    stubFetch(
      [{ ...pkg('A-Top', '1.0.0'), versions: [
        pkg('A-Top', '1.0.0').versions[0]!, pkg('A-Top', '2.0.0').versions[0]!,
      ] }],
      {
        'https://example.test/A-Top-1.0.0.zip': zipFor({ 'BepInEx/plugins/Old.dll': 'v1' }),
        'https://example.test/A-Top-2.0.0.zip': zipFor({ 'BepInEx/plugins/New.dll': 'v2' }),
      },
    )
    const profile = profiles.create('Test')
    const installer = new Installer(new Catalog(), profiles, cache)
    await installer.install(profile.id, ['A-Top-1.0.0'], 'x')
    await installer.install(profile.id, ['A-Top-2.0.0'], 'x')

    const dir = profiles.dir(profile.id)
    expect(existsSync(join(dir, 'BepInEx/plugins/Old.dll'))).toBe(false)
    expect(existsSync(join(dir, 'BepInEx/plugins/New.dll'))).toBe(true)
    expect(profiles.read(profile.id)!.mods).toHaveLength(1)
  })

  it('uninstall removes the files and prunes the empty folders', async () => {
    stubFetch([pkg('A-Top', '1.0.0')], {
      'https://example.test/A-Top-1.0.0.zip': zipFor({ 'Nested/Deep/Top.dll': 'top' }),
    })
    const profile = profiles.create('Test')
    const installer = new Installer(new Catalog(), profiles, cache)
    await installer.install(profile.id, ['A-Top-1.0.0'], 'x')

    const dir = profiles.dir(profile.id)
    const nested = join(dir, 'BepInEx/plugins/A-Top/Nested/Deep')
    expect(existsSync(join(nested, 'Top.dll'))).toBe(true)

    const remaining = installer.uninstall(profile.id, 'A-Top')
    expect(remaining).toHaveLength(0)
    expect(existsSync(nested)).toBe(false)
    // The profile's own folders must survive the prune.
    expect(existsSync(dir)).toBe(true)
  })

  it('reports missing dependencies without aborting the install', async () => {
    stubFetch([pkg('A-Top', '1.0.0', ['Gone-Missing-9.9.9'])], {
      'https://example.test/A-Top-1.0.0.zip': zipFor({ 'Top.dll': 'top' }),
    })
    const profile = profiles.create('Test')
    const r = await new Installer(new Catalog(), profiles, cache)
      .install(profile.id, ['A-Top-1.0.0'], 'x')
    expect(r.missing).toContain('Gone-Missing-9.9.9')
    expect(r.installed.map((m) => m.fullName)).toEqual(['A-Top'])
  })

  it('disabling parks the DLLs so BepInEx stops loading them', async () => {
    stubFetch([pkg('A-Top', '1.0.0')], {
      'https://example.test/A-Top-1.0.0.zip':
        zipFor({ 'BepInEx/plugins/Top.dll': 'x', 'BepInEx/config/Top.cfg': 'keep' }),
    })
    const profile = profiles.create('Test')
    const installer = new Installer(new Catalog(), profiles, cache)
    await installer.install(profile.id, ['A-Top-1.0.0'], 'x')

    const dir = profiles.dir(profile.id)
    installer.setEnabled(profile.id, 'A-Top', false)
    expect(existsSync(join(dir, 'BepInEx/plugins/Top.dll'))).toBe(false)
    expect(existsSync(join(dir, 'BepInEx/plugins/Top.dll.disabled'))).toBe(true)
    // Configs must survive, or the user loses their settings on every toggle.
    expect(existsSync(join(dir, 'BepInEx/config/Top.cfg'))).toBe(true)
    expect(profiles.read(profile.id)!.mods[0]!.enabled).toBe(false)

    installer.setEnabled(profile.id, 'A-Top', true)
    expect(existsSync(join(dir, 'BepInEx/plugins/Top.dll'))).toBe(true)
    expect(profiles.read(profile.id)!.mods[0]!.enabled).toBe(true)
  })

  it('uninstall clears parked files from a disabled mod too', async () => {
    stubFetch([pkg('A-Top', '1.0.0')], {
      'https://example.test/A-Top-1.0.0.zip': zipFor({ 'BepInEx/plugins/Top.dll': 'x' }),
    })
    const profile = profiles.create('Test')
    const installer = new Installer(new Catalog(), profiles, cache)
    await installer.install(profile.id, ['A-Top-1.0.0'], 'x')
    installer.setEnabled(profile.id, 'A-Top', false)
    installer.uninstall(profile.id, 'A-Top')

    const dir = profiles.dir(profile.id)
    expect(existsSync(join(dir, 'BepInEx/plugins/Top.dll.disabled'))).toBe(false)
  })

  it('installs straight from a URL, for curated Essentials entries', async () => {
    stubFetch([], { 'https://example.test/surfmp.zip': zipFor({ 'BepInEx/plugins/SurfMP.dll': 'mp' }) })
    const profile = profiles.create('Test')
    const installer = new Installer(new Catalog(), profiles, cache)

    const installed = await installer.installDirect(profile.id, {
      fullName: 'AttackStudioYT-SurfMP', version: '1.0.0',
      downloadUrl: 'https://example.test/surfmp.zip',
    })

    expect(installed.fullName).toBe('AttackStudioYT-SurfMP')
    expect(existsSync(join(profiles.dir(profile.id), 'BepInEx/plugins/SurfMP.dll'))).toBe(true)
    // Records its files like any other install, so uninstall stays exact.
    expect(profiles.read(profile.id)!.mods[0]!.files).toHaveLength(1)
  })

  it('a URL-installed mod uninstalls like any other', async () => {
    stubFetch([], { 'https://example.test/surfmp.zip': zipFor({ 'BepInEx/plugins/SurfMP.dll': 'mp' }) })
    const profile = profiles.create('Test')
    const installer = new Installer(new Catalog(), profiles, cache)
    await installer.installDirect(profile.id, {
      fullName: 'AttackStudioYT-SurfMP', version: '1.0.0',
      downloadUrl: 'https://example.test/surfmp.zip',
    })
    installer.uninstall(profile.id, 'AttackStudioYT-SurfMP')
    expect(existsSync(join(profiles.dir(profile.id), 'BepInEx/plugins/SurfMP.dll'))).toBe(false)
  })

  it('rejects a direct install whose reference is unusable', async () => {
    stubFetch([], {})
    const profile = profiles.create('Test')
    await expect(
      new Installer(new Catalog(), profiles, cache).installDirect(profile.id, {
        fullName: 'nonsense', version: 'not-a-version', downloadUrl: 'https://x/y.zip',
      }),
    ).rejects.toThrow(/not a usable package reference/i)
  })

  it('refuses to install into a profile that does not exist', async () => {
    stubFetch([pkg('A-Top', '1.0.0')], {})
    await expect(
      new Installer(new Catalog(), profiles, cache).install('nope', ['A-Top-1.0.0'], 'x'),
    ).rejects.toThrow(/No such profile/)
  })

  it('writes the real file contents, not empty placeholders', async () => {
    stubFetch([pkg('A-Top', '1.0.0')], {
      'https://example.test/A-Top-1.0.0.zip': zipFor({ 'BepInEx/plugins/Top.dll': 'REAL BYTES' }),
    })
    const profile = profiles.create('Test')
    await new Installer(new Catalog(), profiles, cache).install(profile.id, ['A-Top-1.0.0'], 'x')
    expect(readFileSync(join(profiles.dir(profile.id), 'BepInEx/plugins/Top.dll'), 'utf8'))
      .toBe('REAL BYTES')
  })
})

describe('concurrent safety', () => {
  it('serialises overlapping installs instead of losing one', async () => {
    // Reachable in the UI: "Update all" while a Browse install is in flight.
    // Both used to read the same starting profile, so the second write dropped
    // whatever the first had added.
    stubFetch(
      [pkg('A-One', '1.0.0'), pkg('B-Two', '1.0.0')],
      {
        'https://example.test/A-One-1.0.0.zip': zipFor({ 'BepInEx/plugins/A.dll': 'a' }),
        'https://example.test/B-Two-1.0.0.zip': zipFor({ 'BepInEx/plugins/B.dll': 'b' }),
      },
    )
    const profile = profiles.create('Test')
    const installer = new Installer(new Catalog(), profiles, cache)

    await Promise.all([
      installer.install(profile.id, ['A-One-1.0.0'], 'x'),
      installer.install(profile.id, ['B-Two-1.0.0'], 'x'),
    ])

    const names = profiles.read(profile.id)!.mods.map((m) => m.fullName).sort()
    expect(names).toEqual(['A-One', 'B-Two'])
  })

  it('a failed operation does not wedge the queue', async () => {
    stubFetch([pkg('A-One', '1.0.0')], {
      'https://example.test/A-One-1.0.0.zip': zipFor({ 'BepInEx/plugins/A.dll': 'a' }),
    })
    const profile = profiles.create('Test')
    const installer = new Installer(new Catalog(), profiles, cache)

    await expect(installer.install('does-not-exist', ['A-One-1.0.0'], 'x')).rejects.toThrow()
    // The next operation on a real profile must still run.
    await installer.install(profile.id, ['A-One-1.0.0'], 'x')
    expect(profiles.read(profile.id)!.mods).toHaveLength(1)
  })
})
