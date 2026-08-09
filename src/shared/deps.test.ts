import { describe, expect, it } from 'vitest'
import { compareVersions, indexPackages, parseRef, resolve } from './deps'
import type { Package } from './types'

const pkg = (full: string, versions: Record<string, string[]>): Package => {
  const [owner = '', ...rest] = full.split('-')
  return {
    name: rest.join('-'),
    full_name: full,
    owner,
    is_deprecated: false,
    versions: Object.entries(versions).map(([version, dependencies]) => ({
      full_name: `${full}-${version}`,
      name: rest.join('-'),
      version_number: version,
      download_url: `https://example.test/${full}-${version}.zip`,
      dependencies,
      file_size: 1,
    })),
  }
}

describe('parseRef', () => {
  it('splits owner, name and version', () => {
    expect(parseRef('Owner-Mod-1.2.3')).toEqual({
      owner: 'Owner', name: 'Mod', fullName: 'Owner-Mod', version: '1.2.3',
    })
  })

  it('keeps hyphens that belong to the package name', () => {
    // The real case this protects: BepInEx-BepInExPack-5.4.2100 style refs
    // where a name itself contains hyphens.
    expect(parseRef('Owner-My-Cool-Mod-0.1.0')).toEqual({
      owner: 'Owner', name: 'My-Cool-Mod', fullName: 'Owner-My-Cool-Mod', version: '0.1.0',
    })
  })

  it('rejects refs whose last segment is not a version', () => {
    expect(parseRef('Owner-Mod-beta')).toBeNull()
    expect(parseRef('Owner-Mod')).toBeNull()
  })
})

describe('compareVersions', () => {
  it('orders numerically, not lexically', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0)
  })
  it('treats missing segments as zero', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
  })
})

describe('resolve', () => {
  it('puts dependencies before their dependents', () => {
    const index = indexPackages([
      pkg('A-Top', { '1.0.0': ['B-Mid-1.0.0'] }),
      pkg('B-Mid', { '1.0.0': ['C-Base-1.0.0'] }),
      pkg('C-Base', { '1.0.0': [] }),
    ])
    const order = resolve(['A-Top-1.0.0'], index).order.map((r) => r.fullName)
    expect(order).toEqual(['C-Base', 'B-Mid', 'A-Top'])
  })

  it('reports packages missing from the index', () => {
    const index = indexPackages([pkg('A-Top', { '1.0.0': ['Nope-Gone-9.9.9'] })])
    expect(resolve(['A-Top-1.0.0'], index).missing).toContain('Nope-Gone-9.9.9')
  })

  it('flags a package pulled in at two versions', () => {
    const index = indexPackages([
      pkg('A-One', { '1.0.0': ['Shared-Lib-1.0.0'] }),
      pkg('B-Two', { '1.0.0': ['Shared-Lib-2.0.0'] }),
      pkg('Shared-Lib', { '1.0.0': [], '2.0.0': [] }),
    ])
    const { conflicts } = resolve(['A-One-1.0.0', 'B-Two-1.0.0'], index)
    expect(conflicts).toEqual([{ fullName: 'Shared-Lib', versions: ['1.0.0', '2.0.0'] }])
  })

  it('survives a dependency cycle instead of hanging', () => {
    const index = indexPackages([
      pkg('A-One', { '1.0.0': ['B-Two-1.0.0'] }),
      pkg('B-Two', { '1.0.0': ['A-One-1.0.0'] }),
    ])
    const { order } = resolve(['A-One-1.0.0'], index)
    expect(order.map((r) => r.fullName).sort()).toEqual(['A-One', 'B-Two'])
  })

  it('does not install the same package twice', () => {
    const index = indexPackages([
      pkg('A-One', { '1.0.0': ['Shared-Lib-1.0.0'] }),
      pkg('B-Two', { '1.0.0': ['Shared-Lib-1.0.0'] }),
      pkg('Shared-Lib', { '1.0.0': [] }),
    ])
    const order = resolve(['A-One-1.0.0', 'B-Two-1.0.0'], index).order
    expect(order.filter((r) => r.fullName === 'Shared-Lib')).toHaveLength(1)
  })
})
