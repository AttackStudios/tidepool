import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GameInstallStore, gameInstallsFile } from './gameinstalls'

let dir: string
let store: GameInstallStore
let game: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tidepool-gi-'))
  store = new GameInstallStore(gameInstallsFile(dir))
  game = mkdtempSync(join(tmpdir(), 'tidepool-game-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  rmSync(game, { recursive: true, force: true })
})

/** Write a file the way an install would, and hand back its path. */
function place(...parts: string[]): string {
  const path = join(game, ...parts)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, 'x')
  return path
}

describe('remembering what went into the game folder', () => {
  it('reports a recorded install, which the profile never could', () => {
    const files = [place('Mods', 'SurfMP.dll'), place('steam_api64.dll')]
    store.record(game, { id: 'surfmp', version: '1.0.4', files })

    expect(store.list(game).map((e) => e.id)).toEqual(['surfmp'])
    expect(store.find(game, 'surfmp')).toMatchObject({ version: '1.0.4' })
  })

  it('keeps separate records per game folder', () => {
    const other = mkdtempSync(join(tmpdir(), 'tidepool-game2-'))
    store.record(game, { id: 'surfmp', version: '1.0.4', files: [place('Mods', 'a.dll')] })
    expect(store.list(other)).toEqual([])
    rmSync(other, { recursive: true, force: true })
  })

  it('forgets an install whose files someone deleted by hand', () => {
    const file = place('Mods', 'SurfMP.dll')
    store.record(game, { id: 'surfmp', version: '1.0.4', files: [file] })
    expect(store.list(game)).toHaveLength(1)

    // Verifying game files through Steam, or a manual tidy-up, does this.
    rmSync(file)
    expect(store.list(game)).toEqual([])
    expect(store.find(game, 'surfmp')).toBeNull()
  })

  it('removes exactly the files it wrote, and nothing beside them', () => {
    const ours = place('Mods', 'SurfMP.dll')
    const theirs = place('Mods', 'SomeoneElsesMod.dll')
    store.record(game, { id: 'surfmp', version: '1.0.4', files: [ours] })

    expect(store.remove(game, 'surfmp')).toEqual([ours])
    expect(existsSync(ours)).toBe(false)
    // The folder holds the user's own mods; removing ours must not take theirs.
    expect(existsSync(theirs)).toBe(true)
    expect(store.list(game)).toEqual([])
  })

  it('is unbothered by removing something that is not there', () => {
    expect(store.remove(game, 'never-installed')).toEqual([])
  })

  it('survives a corrupt record rather than refusing to install', () => {
    writeFileSync(gameInstallsFile(dir), 'not json at all {{{')
    expect(store.list(game)).toEqual([])
    // And can still record afterwards, overwriting the damage.
    store.record(game, { id: 'surfmp', version: '1.0.4', files: [place('Mods', 'a.dll')] })
    expect(store.list(game)).toHaveLength(1)
  })

  it('replaces the record when the same mod is installed again', () => {
    store.record(game, { id: 'surfmp', version: '1.0.3', files: [place('Mods', 'old.dll')] })
    store.record(game, { id: 'surfmp', version: '1.0.4', files: [place('Mods', 'new.dll')] })
    expect(store.list(game)).toHaveLength(1)
    expect(store.find(game, 'surfmp')?.version).toBe('1.0.4')
  })

  it('has nothing to say when no game folder is known', () => {
    expect(store.list(null)).toEqual([])
    expect(store.find(null, 'surfmp')).toBeNull()
  })
})
