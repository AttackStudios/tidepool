import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CODE_PREFIX, InvalidBeachCodeError, decodeBeach, deleteBeach, displayNameFor,
  encodeBeach, findBeachDir, importBeach, readBeaches, safeFileName, unitySaveRoots,
} from './beaches'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'tidepool-beach-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const write = (name: string, body: string) => writeFileSync(join(dir, name), body, 'utf8')

describe('unitySaveRoots', () => {
  it('points at LocalLow on Windows, which is where Unity writes user data', () => {
    expect(unitySaveRoots('win32', 'C:\\Users\\x')).toEqual([join('C:\\Users\\x', 'AppData', 'LocalLow')])
  })
  it('covers Application Support on macOS', () => {
    expect(unitySaveRoots('darwin', '/Users/x')[0]).toContain('Application Support')
  })
})

describe('displayNameFor', () => {
  it('uses a name field when the save has one', () => {
    expect(displayNameFor('{"name":"Pipeline"}', 'a.json')).toBe('Pipeline')
  })
  it('tries the other plausible keys, since the schema is unknown', () => {
    // The real key is not knowable before release, so several are attempted.
    expect(displayNameFor('{"beachName":"Teahupoo"}', 'a.json')).toBe('Teahupoo')
    expect(displayNameFor('{"title":"Uluwatu"}', 'a.json')).toBe('Uluwatu')
  })
  it('falls back to the file name rather than showing nothing', () => {
    expect(displayNameFor('{"unexpected":1}', 'my-break.json')).toBe('my-break')
    expect(displayNameFor('not json at all', 'broken.json')).toBe('broken')
  })
  it('caps an absurdly long name', () => {
    expect(displayNameFor(JSON.stringify({ name: 'x'.repeat(500) }), 'a.json')).toHaveLength(80)
  })
})

describe('readBeaches', () => {
  it('lists json saves, newest first', () => {
    write('a.json', '{"name":"Alpha"}')
    write('b.json', '{"name":"Beta"}')
    const list = readBeaches(dir)
    expect(list).toHaveLength(2)
    expect(list.map((b) => b.name).sort()).toEqual(['Alpha', 'Beta'])
  })
  it('ignores non-json files', () => {
    write('a.json', '{}')
    write('notes.txt', 'hi')
    expect(readBeaches(dir)).toHaveLength(1)
  })
  it('returns nothing for a folder that is not there', () => {
    expect(readBeaches(join(dir, 'nope'))).toEqual([])
  })
  it('still lists a corrupt save, so it can be deleted', () => {
    write('broken.json', '{ not json')
    expect(readBeaches(dir)[0]?.name).toBe('broken')
  })
})

describe('findBeachDir', () => {
  it('prefers an explicit override', () => {
    expect(findBeachDir('darwin', '/nowhere', dir)).toBe(dir)
  })

  it('finds the save folder under a Unity root by looking for json', () => {
    // The company and product folder names are the developer's choice and
    // cannot be predicted, so the search is by name hint plus actual content.
    const home = mkdtempSync(join(tmpdir(), 'tidepool-home-'))
    const saves = join(home, 'Library', 'Application Support', 'nocanwin', 'Surf Sandbox')
    mkdirSync(saves, { recursive: true })
    writeFileSync(join(saves, 'beach.json'), '{"name":"x"}', 'utf8')
    expect(findBeachDir('darwin', home)).toBe(saves)
    rmSync(home, { recursive: true, force: true })
  })

  it('looks one level deeper, where saves often sit', () => {
    const home = mkdtempSync(join(tmpdir(), 'tidepool-home2-'))
    const saves = join(home, 'Library', 'Application Support', 'Surf Sandbox', 'beaches')
    mkdirSync(saves, { recursive: true })
    writeFileSync(join(saves, 'a.json'), '{}', 'utf8')
    expect(findBeachDir('darwin', home)).toBe(saves)
    rmSync(home, { recursive: true, force: true })
  })

  it('returns null when nothing matches', () => {
    expect(findBeachDir('darwin', join(dir, 'empty-home'))).toBeNull()
  })
})

describe('safeFileName', () => {
  it('strips any path so an imported name cannot escape the folder', () => {
    // Codes come from strangers; a filename is not allowed to pick a location.
    expect(safeFileName('../../../evil.json')).toBe('evil.json')
    expect(safeFileName('/etc/passwd')).toBe('passwd.json')
    expect(safeFileName('a/b/c.json')).toBe('c.json')
  })
  it('always ends in .json', () => {
    expect(safeFileName('beach')).toBe('beach.json')
  })
  it('never produces an empty or dotfile name', () => {
    expect(safeFileName('...')).toBe('imported-beach.json')
  })
})

describe('share codes', () => {
  it('round-trips a beach', () => {
    write('pipeline.json', '{"name":"Pipeline","contours":[1,2,3]}')
    const code = encodeBeach(readBeaches(dir)[0]!)
    expect(code.startsWith(CODE_PREFIX)).toBe(true)

    const decoded = decodeBeach(code)
    expect(decoded.name).toBe('Pipeline')
    expect(JSON.parse(decoded.contents).contours).toEqual([1, 2, 3])
  })

  it('rejects a code without the prefix', () => {
    expect(() => decodeBeach('hello')).toThrow(InvalidBeachCodeError)
  })

  it('rejects a truncated code', () => {
    write('a.json', '{"name":"A"}')
    const code = encodeBeach(readBeaches(dir)[0]!)
    expect(() => decodeBeach(code.slice(0, code.length - 10))).toThrow(/damaged/)
  })

  it('refuses a code whose filename tries to escape', () => {
    const { gzipSync } = require('node:zlib')
    const payload = { n: 'evil', f: '../../../../etc/cron.d/evil.json', d: '{}' }
    const code = CODE_PREFIX + gzipSync(Buffer.from(JSON.stringify(payload))).toString('base64url')
    expect(decodeBeach(code).fileName).toBe('evil.json')
  })
})

describe('importBeach', () => {
  it('writes the beach and returns its path', () => {
    const path = importBeach(dir, { fileName: 'new.json', contents: '{"name":"New"}' })
    expect(readFileSync(path, 'utf8')).toContain('New')
  })

  it('never overwrites an existing save', () => {
    // Silently replacing someone's beach would be unforgivable.
    write('new.json', '{"name":"Original"}')
    const path = importBeach(dir, { fileName: 'new.json', contents: '{"name":"Imported"}' })
    expect(path).toContain('(2)')
    expect(readFileSync(join(dir, 'new.json'), 'utf8')).toContain('Original')
  })
})

describe('deleteBeach', () => {
  it('removes a save', () => {
    write('gone.json', '{}')
    deleteBeach(dir, 'gone.json')
    expect(readBeaches(dir)).toHaveLength(0)
  })
  it('cannot be talked into deleting outside the folder', () => {
    const outside = join(dir, '..', 'keepme.json')
    writeFileSync(outside, 'keep', 'utf8')
    deleteBeach(dir, '../keepme.json')
    expect(readFileSync(outside, 'utf8')).toBe('keep')
    rmSync(outside, { force: true })
  })
})
