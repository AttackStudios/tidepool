import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SURF_SANDBOX_APP_ID, findGameInstall, parseInstallDir, parseLibraryFolders, steamRoots } from './steam'

describe('parseLibraryFolders', () => {
  it('pulls every library path out of the KeyValues file', () => {
    const vdf = `
"libraryfolders"
{
  "0" { "path" "C:\\\\Program Files (x86)\\\\Steam" "apps" { "4480760" "1" } }
  "1" { "path" "D:\\\\SteamLibrary" }
}`
    expect(parseLibraryFolders(vdf)).toEqual([
      'C:\\Program Files (x86)\\Steam',
      'D:\\SteamLibrary',
    ])
  })

  it('returns nothing for a file with no paths', () => {
    expect(parseLibraryFolders('"libraryfolders" { }')).toEqual([])
  })
})

describe('parseInstallDir', () => {
  it('reads the folder Steam actually installed into', () => {
    // The folder name is chosen by the developer and cannot be derived from the
    // store page, so for an unreleased game any guess would be wrong.
    expect(parseInstallDir('"AppState" { "installdir" "Surf Sandbox" }')).toBe('Surf Sandbox')
  })
  it('returns null when the key is absent', () => {
    expect(parseInstallDir('"AppState" { "name" "x" }')).toBeNull()
  })
})

describe('steamRoots', () => {
  it('looks in Application Support on macOS', () => {
    expect(steamRoots('darwin', '/Users/x')).toEqual(['/Users/x/Library/Application Support/Steam'])
  })
  it('checks both Program Files variants on Windows', () => {
    expect(steamRoots('win32', 'C:\\Users\\x')).toHaveLength(2)
  })
})

describe('findGameInstall', () => {
  let home: string
  const steamapps = () => join(home, 'Library', 'Application Support', 'Steam', 'steamapps')

  beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'tidepool-steam-')) })
  afterEach(() => rmSync(home, { recursive: true, force: true }))

  const install = (installdir: string, buildGame = true) => {
    mkdirSync(steamapps(), { recursive: true })
    writeFileSync(join(steamapps(), 'libraryfolders.vdf'), '"libraryfolders" { }')
    writeFileSync(
      join(steamapps(), `appmanifest_${SURF_SANDBOX_APP_ID}.acf`),
      `"AppState" { "installdir" "${installdir}" }`,
    )
    if (buildGame) {
      const dir = join(steamapps(), 'common', installdir)
      mkdirSync(join(dir, `${installdir}_Data`, 'Managed'), { recursive: true })
      writeFileSync(join(dir, `${installdir}.exe`), 'MZ')
      writeFileSync(join(dir, `${installdir}_Data`, 'Managed', 'Assembly-CSharp.dll'), 'x')
    }
  }

  it('finds the game via the app manifest and reports its backend', () => {
    install('Surf Sandbox')
    expect(findGameInstall('darwin', home)).toEqual({
      root: join(steamapps(), 'common', 'Surf Sandbox'),
      source: 'steam',
      backend: 'mono',
    })
  })

  it('follows whatever folder name the manifest declares', () => {
    // Proves we are not hardcoding "Surf Sandbox" anywhere in the lookup.
    install('SomeOtherName')
    expect(findGameInstall('darwin', home)?.root).toContain('SomeOtherName')
  })

  it('returns null when the manifest points at a folder that is not there', () => {
    install('Surf Sandbox', false)
    expect(findGameInstall('darwin', home)).toBeNull()
  })

  it('returns null when Steam is not installed at all', () => {
    expect(findGameInstall('darwin', join(home, 'empty'))).toBeNull()
  })
})
