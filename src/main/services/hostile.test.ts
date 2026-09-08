/**
 * Hostile and malformed input at every boundary where data from outside
 * TidePool crosses into it.
 *
 * These are not hypotheticals. Each one was reproduced against the running app
 * before it was fixed: the gzip bomb wrote a 200 MB file into the game's Levels
 * folder from a 265 KB paste, and a folder containing a macOS `.framework`
 * killed the local-pack importer outright.
 */
import { describe, expect, it } from 'vitest'
import {
  existsSync, mkdirSync, mkdtempSync, readdirSync, statSync, symlinkSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32, gzipSync } from 'node:zlib'
import {
  CODE_PREFIX, InvalidBeachCodeError, MAX_CODE_DECODED_BYTES, decodeBeach, safeFileName,
} from './beaches'
import {
  CODE_PREFIX as PROFILE_PREFIX, InvalidProfileCodeError, decodeProfile,
} from './profilecode'
import { UnreadablePackError, importLocalPack } from './install'
import { slugify } from './profiles'

const scratch = (): string => mkdtempSync(join(tmpdir(), 'tp-hostile-'))

/**
 * Build a zip by hand, keeping entry names exactly as given.
 *
 * adm-zip's *writer* silently normalises `../` out of an entry name, so an
 * archive built with it cannot express Zip Slip at all — a test written that
 * way passes without exercising the defence it claims to cover. Real archives
 * come from whatever tool an attacker likes, so the bytes are assembled here.
 * Entries are stored uncompressed, which keeps this to a header and a name.
 */
function hostileZip(entries: [string, string][]): Buffer {
  const locals: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0

  for (const [name, contents] of entries) {
    const nameBuf = Buffer.from(name, 'utf8')
    const data = Buffer.from(contents)
    const sum = crc32(data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 8) // stored, not deflated
    local.writeUInt16LE(0x21, 12)
    local.writeUInt32LE(sum, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    locals.push(local, nameBuf, data)

    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4)
    entry.writeUInt16LE(20, 6)
    entry.writeUInt16LE(0x21, 14)
    entry.writeUInt32LE(sum, 16)
    entry.writeUInt32LE(data.length, 20)
    entry.writeUInt32LE(data.length, 24)
    entry.writeUInt16LE(nameBuf.length, 28)
    entry.writeUInt32LE(offset, 42)
    central.push(entry, nameBuf)

    offset += local.length + nameBuf.length + data.length
  }

  const dir = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(dir.length, 12)
  end.writeUInt32LE(offset, 16)

  return Buffer.concat([...locals, dir, end])
}

/** A code that is tiny to paste and enormous once unpacked. */
function bombCode(prefix: string, body: (filler: Buffer) => Buffer, megabytes: number): string {
  const filler = Buffer.alloc(megabytes * 1024 * 1024, 0x41)
  return prefix + gzipSync(body(filler), { level: 9 }).toString('base64url')
}

describe('gzip bombs in share codes', () => {
  it('refuses a beach code that unpacks to more than any beach could be', () => {
    const code = bombCode(CODE_PREFIX, (filler) => Buffer.concat([
      Buffer.from('{"n":"b","f":"b.lvl","d":"'), filler, Buffer.from('"}'),
    ]), 64)
    // Small enough to paste into the box without noticing anything is wrong.
    expect(code.length).toBeLessThan(200 * 1024)
    expect(() => decodeBeach(code)).toThrow(InvalidBeachCodeError)
    expect(() => decodeBeach(code)).toThrow(/unpacks to far more data/)
  })

  it('refuses a profile code that unpacks past the ceiling', () => {
    const code = PROFILE_PREFIX + gzipSync(
      Buffer.from(JSON.stringify({ n: 'x'.repeat(8_000_000), m: [] })), { level: 9 },
    ).toString('base64url')
    expect(() => decodeProfile(code)).toThrow(/unpacks to far more data/)
  })

  it('refuses an absurdly long code before spending memory inflating it', () => {
    expect(() => decodeBeach(CODE_PREFIX + 'A'.repeat(5 * 1024 * 1024))).toThrow(/far too long/)
    expect(() => decodeProfile(PROFILE_PREFIX + 'A'.repeat(1024 * 1024))).toThrow(/far too long/)
  })

  it('still accepts a beach comfortably under the ceiling', () => {
    const contents = JSON.stringify({ name: 'Kewalo', points: Array.from({ length: 400 }, (_, i) => i) })
    const code = CODE_PREFIX + gzipSync(
      Buffer.from(JSON.stringify({ n: 'Kewalo', f: 'Kewalo.lvl', d: contents })),
    ).toString('base64url')
    const decoded = decodeBeach(code)
    expect(decoded.fileName).toBe('Kewalo.lvl')
    expect(decoded.contents).toBe(contents)
    expect(Buffer.byteLength(decoded.contents)).toBeLessThan(MAX_CODE_DECODED_BYTES)
  })
})

describe('names Windows cannot create', () => {
  it('moves a reserved device name out of the way, for profiles and beaches', () => {
    for (const reserved of ['con', 'PRN', 'nul', 'COM1', 'lpt9', 'aux']) {
      expect(slugify(reserved)).toBe(`${reserved.toLowerCase()}-profile`)
      expect(safeFileName(`${reserved}.lvl`)).toBe(`${reserved}-beach.lvl`)
    }
  })

  it('leaves names that merely resemble reserved ones alone', () => {
    expect(slugify('console')).toBe('console')
    expect(safeFileName('Conway.lvl')).toBe('Conway.lvl')
  })

  it('truncates a very long profile name instead of failing to make the folder', () => {
    // A 300-character name reached mkdir as a raw ENAMETOOLONG.
    const slug = slugify('a'.repeat(300))
    expect(slug.length).toBeLessThanOrEqual(64)
    expect(slug).toMatch(/^a+$/)
  })

  it('never ends a slug on a separator after truncating', () => {
    expect(slugify(`${'a'.repeat(63)} tail`)).not.toMatch(/-$/)
  })
})

describe('importing a pack someone sent you', () => {
  it('skips symlinks rather than dying on them', () => {
    const src = scratch()
    const game = scratch()
    mkdirSync(join(src, 'Mods'))
    writeFileSync(join(src, 'Mods', 'SurfMP.dll'), 'real mod')
    // Exactly the shape of a macOS .framework, which is what made this crash.
    symlinkSync(join(src, 'Mods'), join(src, 'Current'))
    symlinkSync(join(src, 'nowhere'), join(src, 'dangling.dll'))

    const written = importLocalPack(src, game)
    expect(written).toHaveLength(1)
    expect(readdirSync(join(game, 'Mods'))).toEqual(['SurfMP.dll'])
  })

  it('does not copy a file the symlink points at outside the chosen folder', () => {
    const src = scratch()
    const game = scratch()
    const elsewhere = scratch()
    writeFileSync(join(elsewhere, 'secret'), 'not yours')
    symlinkSync(join(elsewhere, 'secret'), join(src, 'innocent.dll'))
    expect(importLocalPack(src, game)).toEqual([])
  })

  it('explains an unreadable zip in words a person can act on', () => {
    const game = scratch()
    const notAZip = join(scratch(), 'SurfMP.zip')
    writeFileSync(notAZip, 'a half-downloaded file')
    expect(() => importLocalPack(notAZip, game)).toThrow(UnreadablePackError)
    expect(() => importLocalPack(notAZip, game)).toThrow(/downloaded incompletely/)
    // The library's own wording must not reach the person.
    expect(() => importLocalPack(notAZip, game)).not.toThrow(/ADM-ZIP/)
  })

  it('explains a pack that has been moved or deleted', () => {
    expect(() => importLocalPack(join(scratch(), 'gone.zip'), scratch()))
      .toThrow(/no longer there/)
  })

  it('refuses an archive that tries to write outside the game folder', () => {
    const game = scratch()
    const path = join(scratch(), 'slip.zip')
    writeFileSync(path, hostileZip([
      ['../../../../../../tmp/tp-escaped.txt', 'escaped'],
      ['..\\..\\..\\..\\..\\..\\Windows\\System32\\tp.dll', 'escaped'],
      ['/etc/tp-absolute', 'escaped'],
      ['Mods/Fine.dll', 'fine'],
    ]))

    const written = importLocalPack(path, game)
    expect(written).toEqual([join(game, 'Mods', 'Fine.dll')])
    expect(existsSync('/tmp/tp-escaped.txt')).toBe(false)
  })

  it('imports an ordinary folder someone already extracted', () => {
    const src = scratch()
    const game = scratch()
    mkdirSync(join(src, 'Mods'))
    writeFileSync(join(src, 'Mods', 'SurfMP.dll'), 'mod')
    writeFileSync(join(src, 'steam_api64.dll'), 'lib')
    writeFileSync(join(src, 'README.md'), 'notes, not a mod')

    const written = importLocalPack(src, game)
    expect(written).toHaveLength(2)
    expect(statSync(join(game, 'Mods', 'SurfMP.dll')).isFile()).toBe(true)
    expect(readdirSync(game).sort()).toEqual(['Mods', 'steam_api64.dll'])
  })
})
