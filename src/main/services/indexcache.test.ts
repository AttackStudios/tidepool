import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { IndexCache } from './indexcache'
import type { Package } from '../../shared/types'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'tidepool-ic-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const pkg = (full: string): Package => ({
  name: 'Mod', full_name: full, owner: 'Owner', is_deprecated: false,
  versions: [{
    full_name: `${full}-1.0.0`, name: 'Mod', version_number: '1.0.0',
    download_url: 'https://example.test/x.zip', dependencies: [], file_size: 1,
  }],
})

describe('IndexCache', () => {
  it('round-trips packages with their fetch time', () => {
    const cache = new IndexCache(dir)
    cache.write('lethal-company', [pkg('A-One')], 12345)
    expect(cache.read('lethal-company')).toEqual({ packages: [pkg('A-One')], fetchedAt: 12345 })
  })

  it('returns null for a community never cached', () => {
    expect(new IndexCache(dir).read('nope')).toBeNull()
  })

  it('keeps communities separate', () => {
    const cache = new IndexCache(dir)
    cache.write('a', [pkg('A-One')], 1)
    cache.write('b', [pkg('B-Two')], 2)
    expect(cache.read('a')?.packages[0]?.full_name).toBe('A-One')
    expect(cache.read('b')?.packages[0]?.full_name).toBe('B-Two')
  })

  it('never writes outside its directory, whatever the slug looks like', () => {
    const cache = new IndexCache(dir)
    cache.write('../../escape', [pkg('A-One')], 1)
    const files = readdirSync(dir)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/^index-[0-9a-f]{16}\.json\.gz$/)
  })

  it('discards a corrupt cache rather than throwing', () => {
    const cache = new IndexCache(dir)
    cache.write('a', [pkg('A-One')], 1)
    const file = join(dir, readdirSync(dir)[0]!)
    writeFileSync(file, Buffer.from('not gzip at all'))
    expect(cache.read('a')).toBeNull()
    // And the bad file is cleared so the next run refetches cleanly.
    expect(readdirSync(dir)).toHaveLength(0)
  })

  it('compresses, since the payload is repetitive JSON', () => {
    const cache = new IndexCache(dir)
    const many = Array.from({ length: 400 }, (_, i) => pkg(`Owner-Mod${i}`))
    cache.write('big', many, 1)
    const raw = JSON.stringify({ packages: many, fetchedAt: 1 }).length
    const onDisk = require('node:fs').statSync(join(dir, readdirSync(dir)[0]!)).size
    expect(onDisk).toBeLessThan(raw / 4)
  })
})
