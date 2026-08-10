import { describe, expect, it, vi } from 'vitest'
import { GameNotOnGameBananaError, fetchMods, findGameId, toSummary } from './gamebanana'

const json = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response

describe('findGameId', () => {
  it('requires an exact title match', async () => {
    // NameMatch is fuzzy: searching "surf" really does return Subway Surfers
    // and Audiosurf, so taking the first hit would point at the wrong game.
    const fetchImpl = (async () =>
      json({ _aRecords: [
        { _idRow: 19833, _sName: 'Subway Surfers' },
        { _idRow: 8312, _sName: 'Audiosurf' },
        { _idRow: 4242, _sName: 'Surf Sandbox' },
      ] })) as unknown as typeof fetch
    expect(await findGameId('Surf Sandbox', { fetchImpl })).toBe(4242)
  })

  it('is case-insensitive about the title', async () => {
    const fetchImpl = (async () =>
      json({ _aRecords: [{ _idRow: 7, _sName: 'SURF SANDBOX' }] })) as unknown as typeof fetch
    expect(await findGameId('Surf Sandbox', { fetchImpl })).toBe(7)
  })

  it('raises a typed error when only near matches come back', async () => {
    const fetchImpl = (async () =>
      json({ _aRecords: [{ _idRow: 19833, _sName: 'Subway Surfers' }] })) as unknown as typeof fetch
    await expect(findGameId('Surf Sandbox', { fetchImpl })).rejects
      .toBeInstanceOf(GameNotOnGameBananaError)
  })

  it('raises the same error when nothing comes back at all', async () => {
    const fetchImpl = (async () => json({})) as unknown as typeof fetch
    await expect(findGameId('Surf Sandbox', { fetchImpl })).rejects
      .toBeInstanceOf(GameNotOnGameBananaError)
  })
})

describe('toSummary', () => {
  const record = {
    _idRow: 511954,
    _sName: 'Bigger Waves',
    _sProfileUrl: 'https://gamebanana.com/mods/511954',
    _tsDateModified: 1786324703,
    _aSubmitter: { _sName: 'someone' },
    _aRootCategory: { _sName: 'Gameplay' },
    _nViewCount: 4200,
    _nLikeCount: 12,
    _aPreviewMedia: { _aImages: [{ _sBaseUrl: 'https://images.gb/img', _sFile: 'a.png' }] },
  }

  it('maps a record onto the shared summary shape', () => {
    const s = toSummary(record)!
    expect(s).toMatchObject({
      fullName: 'gb:511954', name: 'Bigger Waves', owner: 'someone',
      source: 'gamebanana', categories: ['Gameplay'],
      packageUrl: 'https://gamebanana.com/mods/511954',
    })
    expect(s.icon).toBe('https://images.gb/img/a.png')
  })

  it('marks GameBanana entries as not installable', () => {
    // No dependency metadata and no predictable archive layout, and a single mod
    // often ships several alternative files. Guessing would break saves.
    expect(toSummary(record)!.installable).toBe(false)
  })

  it('drops records missing an id or name', () => {
    expect(toSummary({ _sName: 'x' })).toBeNull()
    expect(toSummary({ _idRow: 1 })).toBeNull()
  })

  it('survives a record with no preview image', () => {
    expect(toSummary({ _idRow: 1, _sName: 'x' })!.icon).toBeNull()
  })
})

describe('fetchMods', () => {
  it('returns mapped items and the total count', async () => {
    const fetchImpl = (async () =>
      json({
        _aMetadata: { _nRecordCount: 160678 },
        _aRecords: [{ _idRow: 1, _sName: 'One' }, { _idRow: 2, _sName: 'Two' }, { nope: true }],
      })) as unknown as typeof fetch
    const page = await fetchMods(8694, 1, { fetchImpl })
    expect(page.items.map((i) => i.name)).toEqual(['One', 'Two'])
    expect(page.total).toBe(160678)
  })

  it('throws on a non-ok response', async () => {
    const fetchImpl = (async () => ({ ok: false, status: 503 }) as Response) as unknown as typeof fetch
    await expect(fetchMods(1, 1, { fetchImpl })).rejects.toThrow(/503/)
  })
})
