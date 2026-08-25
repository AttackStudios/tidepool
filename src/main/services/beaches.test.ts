import AdmZip from 'adm-zip'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  BEACH_EXT,
  CODE_PREFIX,
  InvalidBeachCodeError,
  METRES_PER_UNIT,
  decodeBeach,
  deleteBeach,
  describeBeach,
  encodeBeach,
  findBeachDir,
  importBeach,
  installBeachPack,
  readBeaches,
  safeFileName,
} from './beaches'

/** A level in the game's own shape: 321 heights, shore first, plus swell/tide. */
function level(maxDepthUnits = 0.5): string {
  const heights = Array.from({ length: 321 }, (_, i) =>
    Math.round((1 - (maxDepthUnits * i) / 320) * 32) / 32,
  )
  return JSON.stringify({ GroundHeights: heights, Swell: 0.8, Tide: 1.0 })
}

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'tp-beach-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('describeBeach', () => {
  it('reads the shape out of a level file', () => {
    const s = describeBeach(level(0.5))
    expect(s).not.toBeNull()
    expect(s!.samples).toBe(321)
    expect(s!.swell).toBe(0.8)
    expect(s!.tide).toBe(1)
    // Depth is Tide - height, converted at the fitted scale.
    expect(s!.maxDepthM).toBeCloseTo(0.5 * METRES_PER_UNIT, 1)
    expect(s!.clamped).toBe(false)
  })

  it('flags a profile that hits the game floor, where the real bed is deeper', () => {
    expect(describeBeach(level(1))!.clamped).toBe(true)
  })

  it('returns null for anything unreadable rather than throwing', () => {
    // A corrupt file must still list, so it can be deleted.
    for (const bad of ['', 'not json', '{}', '{"GroundHeights":[]}', '[]', 'null']) {
      expect(describeBeach(bad)).toBeNull()
    }
  })
})

describe('findBeachDir', () => {
  it('prefers an explicit override', () => {
    expect(findBeachDir(null, dir)).toBe(dir)
  })

  it('derives the Levels folder from the game install', () => {
    // Beaches live inside the game, not in a Unity save folder.
    const levels = join(dir, 'SurfSandbox_Data', 'StreamingAssets', 'Levels')
    mkdirSync(levels, { recursive: true })
    expect(findBeachDir(dir)).toBe(levels)
  })

  it('is null without a game, because there is nowhere for beaches to be', () => {
    expect(findBeachDir(null)).toBeNull()
    expect(findBeachDir(dir)).toBeNull() // game folder with no Levels
  })

  it('ignores an override that does not exist', () => {
    expect(findBeachDir(null, join(dir, 'nope'))).toBeNull()
  })
})

describe('readBeaches', () => {
  it('lists levels newest first, with their shape', () => {
    writeFileSync(join(dir, `Pipeline${BEACH_EXT}`), level(1))
    writeFileSync(join(dir, `Kewalo${BEACH_EXT}`), level(0.25))
    const list = readBeaches(dir)
    expect(list).toHaveLength(2)
    expect(list.map((b) => b.name).sort()).toEqual(['Kewalo', 'Pipeline'])
    expect(list.find((b) => b.name === 'Pipeline')!.shape!.clamped).toBe(true)
  })

  it('ignores files that are not levels', () => {
    writeFileSync(join(dir, `Real${BEACH_EXT}`), level())
    writeFileSync(join(dir, 'notes.txt'), 'x')
    writeFileSync(join(dir, 'old.json'), '{}')
    expect(readBeaches(dir).map((b) => b.name)).toEqual(['Real'])
  })

  it('still lists a corrupt level so it can be deleted', () => {
    writeFileSync(join(dir, `Broken${BEACH_EXT}`), 'not json at all')
    const list = readBeaches(dir)
    expect(list).toHaveLength(1)
    expect(list[0]!.name).toBe('Broken')
    expect(list[0]!.shape).toBeNull()
  })

  it('returns nothing for a folder that is not there', () => {
    expect(readBeaches(join(dir, 'missing'))).toEqual([])
  })
})

describe('safeFileName', () => {
  it('strips any path so an imported name cannot escape the folder', () => {
    expect(safeFileName('../../evil')).not.toContain('..')
    expect(safeFileName('/etc/passwd')).not.toContain('/')
    expect(safeFileName('a\\b\\c')).not.toContain('\\')
  })

  it('always ends in the level extension', () => {
    expect(safeFileName('Pipeline')).toBe(`Pipeline${BEACH_EXT}`)
    expect(safeFileName(`Pipeline${BEACH_EXT}`)).toBe(`Pipeline${BEACH_EXT}`)
  })

  it('never produces an empty or dotfile name', () => {
    for (const n of ['', '.', '..', '/', BEACH_EXT]) {
      const out = safeFileName(n)
      expect(out.startsWith('.')).toBe(false)
      expect(out.length).toBeGreaterThan(BEACH_EXT.length)
    }
  })
})

describe('share codes', () => {
  it('round-trips a level', () => {
    const contents = level(0.75)
    // encodeBeach reads from disk, so this needs a real file.
    const path = join(dir, `Pipeline${BEACH_EXT}`)
    writeFileSync(path, contents)
    const [beach] = readBeaches(dir)
    const code = encodeBeach(beach!)
    expect(code.startsWith(CODE_PREFIX)).toBe(true)
    const back = decodeBeach(code)
    expect(back.contents).toBe(contents)
    expect(back.fileName).toBe(`Pipeline${BEACH_EXT}`)
  })

  it('rejects codes that are not ours, truncated, or hostile', () => {
    for (const bad of ['nonsense', `${CODE_PREFIX}!!!!`, CODE_PREFIX]) {
      expect(() => decodeBeach(bad)).toThrow(InvalidBeachCodeError)
    }
  })
})

describe('importBeach', () => {
  it('writes the level and returns its path', () => {
    const p = importBeach(dir, { fileName: `Sunset${BEACH_EXT}`, contents: level() })
    expect(existsSync(p)).toBe(true)
    expect(readFileSync(p, 'utf8')).toBe(level())
  })

  it('never overwrites a level the player already has', () => {
    writeFileSync(join(dir, `Sunset${BEACH_EXT}`), 'MINE')
    importBeach(dir, { fileName: `Sunset${BEACH_EXT}`, contents: level() })
    expect(readFileSync(join(dir, `Sunset${BEACH_EXT}`), 'utf8')).toBe('MINE')
    expect(readdirSync(dir)).toContain(`Sunset (2)${BEACH_EXT}`)
  })
})

describe('deleteBeach', () => {
  it('removes a level', () => {
    writeFileSync(join(dir, `Gone${BEACH_EXT}`), level())
    deleteBeach(dir, `Gone${BEACH_EXT}`)
    expect(existsSync(join(dir, `Gone${BEACH_EXT}`))).toBe(false)
  })

  it('cannot be talked into deleting outside the folder', () => {
    const outside = join(dir, '..', 'keepme')
    writeFileSync(outside, 'x')
    try {
      deleteBeach(dir, '../keepme')
    } catch { /* refusing is also fine */ }
    expect(existsSync(outside)).toBe(true)
    rmSync(outside, { force: true })
  })
})

describe('installBeachPack', () => {
  const packZip = (entries: Record<string, string>): string => {
    const zip = new AdmZip()
    for (const [name, body] of Object.entries(entries)) zip.addFile(name, Buffer.from(body))
    const file = join(mkdtempSync(join(tmpdir(), 'tp-bp-')), 'pack.zip')
    zip.writeZip(file)
    return file
  }

  it('writes every level into the Levels folder', () => {
    installBeachPack(packZip({
      [`Pipeline${BEACH_EXT}`]: level(1),
      [`Nazare${BEACH_EXT}`]: level(1),
    }), dir)
    expect(readdirSync(dir).sort()).toEqual([`Nazare${BEACH_EXT}`, `Pipeline${BEACH_EXT}`])
  })

  it('skips packaging metadata and anything that is not a level', () => {
    installBeachPack(packZip({
      [`Reef${BEACH_EXT}`]: level(), 'manifest.json': '{}', 'icon.png': 'x',
      'README.md': 'x', 'notes.txt': 'x', 'old.json': '{}',
    }), dir)
    expect(readdirSync(dir)).toEqual([`Reef${BEACH_EXT}`])
  })

  it('flattens paths, so an archive cannot choose where its files land', () => {
    installBeachPack(packZip({
      [`../../escape${BEACH_EXT}`]: level(),
      [`nested/deep/Reef${BEACH_EXT}`]: level(),
    }), dir)
    expect(readdirSync(dir).sort()).toEqual([`Reef${BEACH_EXT}`, `escape${BEACH_EXT}`])
  })

  it('never overwrites a level the player already has', () => {
    writeFileSync(join(dir, `Reef${BEACH_EXT}`), 'MINE')
    installBeachPack(packZip({ [`Reef${BEACH_EXT}`]: level() }), dir)
    expect(readFileSync(join(dir, `Reef${BEACH_EXT}`), 'utf8')).toBe('MINE')
    expect(readdirSync(dir)).toContain(`Reef (2)${BEACH_EXT}`)
  })
})
