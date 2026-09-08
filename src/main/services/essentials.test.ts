import { describe, expect, it } from 'vitest'
import {
  EssentialsUnavailableError, downloadFor, fetchEssentials, findEssential, parseMod, toSummary,
} from './essentials'

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response

const base = {
  id: 'AttackStudioYT-SurfMP', name: 'SurfMP', owner: 'AttackStudioYT',
  summary: 'Multiplayer for Surf Sandbox.', description: 'Long text.',
  status: 'planned', version: null, downloadUrl: null,
  icon: 'https://example.test/i.png', homepage: 'https://example.test',
  categories: ['Multiplayer'], dependencies: [],
}

describe('parseMod', () => {
  it('parses a planned entry', () => {
    expect(parseMod(base)).toMatchObject({ id: 'AttackStudioYT-SurfMP', status: 'planned' })
  })

  it('accepts a released entry that has a download', () => {
    expect(parseMod({ ...base, status: 'released', version: '1.0.0', downloadUrl: 'https://x/y.zip' }))
      .toMatchObject({ status: 'released', version: '1.0.0' })
  })

  it('demotes a released entry with no download to planned', () => {
    // Otherwise the UI offers an install that cannot possibly work.
    expect(parseMod({ ...base, status: 'released', downloadUrl: null })?.status).toBe('planned')
  })

  it('treats an unknown status as planned rather than installable', () => {
    expect(parseMod({ ...base, status: 'whatever', downloadUrl: 'https://x/y.zip' })?.status)
      .toBe('planned')
  })

  it('drops entries with no id or name', () => {
    expect(parseMod({ ...base, id: undefined })).toBeNull()
    expect(parseMod({ ...base, name: 123 })).toBeNull()
    expect(parseMod(null)).toBeNull()
  })

  it('ignores non-string junk in list fields', () => {
    expect(parseMod({ ...base, categories: ['a', 5, null], dependencies: 'nope' }))
      .toMatchObject({ categories: ['a'], dependencies: [] })
  })
})

describe('toSummary', () => {
  it('claims no downloads, rating or pinning', () => {
    // Those are Thunderstore concepts. A curated entry showing "0 downloads"
    // and a "pinned" badge reads as a broken row rather than a considered one.
    const s = toSummary(parseMod(base)!)
    expect(s.downloads).toBe(0)
    expect(s.rating).toBe(0)
    expect(s.isPinned).toBe(false)
  })

  it('leaves the version blank while a mod is unreleased', () => {
    expect(toSummary(parseMod(base)!).latestVersion).toBe('')
  })

  it('marks a planned mod as not installable', () => {
    const s = toSummary(parseMod(base)!)
    expect(s.installable).toBe(false)
    expect(s.planned).toBe(true)
    expect(s.source).toBe('essentials')
  })

  it('marks a released mod as installable', () => {
    const s = toSummary(parseMod({ ...base, status: 'released', version: '1.0.0', downloadUrl: 'https://x/y.zip' })!)
    expect(s.installable).toBe(true)
    expect(s.planned).toBe(false)
    expect(s.latestVersion).toBe('1.0.0')
  })

  it('falls back to the first description line when there is no summary', () => {
    expect(toSummary(parseMod({ ...base, summary: '', description: 'First line.\nSecond.' })!).description)
      .toBe('First line.')
  })
})

describe('fetchEssentials', () => {
  it('returns the parsed list', async () => {
    const fetchImpl = (async () => ok({ mods: [base] })) as unknown as typeof fetch
    expect(await fetchEssentials({ fetchImpl })).toHaveLength(1)
  })

  it('skips malformed entries instead of failing the whole list', async () => {
    const fetchImpl = (async () => ok({ mods: [base, { junk: true }, null] })) as unknown as typeof fetch
    expect(await fetchEssentials({ fetchImpl })).toHaveLength(1)
  })

  it('raises a typed error when the list is unreachable', async () => {
    const fetchImpl = (async () => { throw new Error('offline') }) as unknown as typeof fetch
    await expect(fetchEssentials({ fetchImpl })).rejects.toBeInstanceOf(EssentialsUnavailableError)
  })

  it('raises a typed error on a bad status', async () => {
    const fetchImpl = (async () => ({ ok: false, status: 404 }) as Response) as unknown as typeof fetch
    await expect(fetchEssentials({ fetchImpl })).rejects.toThrow(/returned 404/)
  })

  it('raises a typed error when the payload has no mods', async () => {
    const fetchImpl = (async () => ok({ nope: 1 })) as unknown as typeof fetch
    await expect(fetchEssentials({ fetchImpl })).rejects.toThrow(/no mods/)
  })
})

describe('findEssential', () => {
  it('finds by id and returns null for anything else', async () => {
    const fetchImpl = (async () => ok({ mods: [base] })) as unknown as typeof fetch
    expect((await findEssential('AttackStudioYT-SurfMP', { fetchImpl }))?.name).toBe('SurfMP')
    expect(await findEssential('nope', { fetchImpl })).toBeNull()
  })
})

describe('picking the right download per platform', () => {
  const entry = {
    downloadUrl: 'https://example.com/MelonLoader.x64.zip',
    downloadUrls: {
      win32: 'https://example.com/MelonLoader.x64.zip',
      darwin: 'https://example.com/MelonLoader.macOS.x64.zip',
      linux: 'https://example.com/MelonLoader.Linux.x64.zip',
    },
  }

  it('gives a Mac the macOS build, not the Windows one', () => {
    // The bug this replaces: every platform got MelonLoader.x64.zip, so a Mac
    // install had no bootstrap dylib, nothing injected, and the game ran
    // unmodded with no error to explain why.
    expect(downloadFor(entry, 'darwin')).toContain('macOS')
    expect(downloadFor(entry, 'win32')).toBe(entry.downloadUrls.win32)
    expect(downloadFor(entry, 'linux')).toContain('Linux')
  })

  it('falls back to the single URL for an entry that is one file everywhere', () => {
    expect(downloadFor({ downloadUrl: 'https://example.com/mod.zip' }, 'darwin'))
      .toBe('https://example.com/mod.zip')
  })

  it('falls back when this platform is not listed', () => {
    expect(downloadFor(entry, 'freebsd')).toBe(entry.downloadUrl)
  })

  it('has nothing to offer when there is no download at all', () => {
    expect(downloadFor({}, 'darwin')).toBeNull()
    expect(downloadFor({ downloadUrls: 'not an object' }, 'darwin')).toBeNull()
  })

  it('ignores a non-string entry rather than trusting it', () => {
    expect(downloadFor({ downloadUrls: { darwin: 42 }, downloadUrl: 'https://x/y.zip' }, 'darwin'))
      .toBe('https://x/y.zip')
  })
})
