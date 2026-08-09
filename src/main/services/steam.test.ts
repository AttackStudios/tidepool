import { describe, expect, it } from 'vitest'
import { parseLibraryFolders, steamRoots } from './steam'

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

describe('steamRoots', () => {
  it('looks in Application Support on macOS', () => {
    expect(steamRoots('darwin', '/Users/x')).toEqual([
      '/Users/x/Library/Application Support/Steam',
    ])
  })
  it('checks both Program Files variants on Windows', () => {
    expect(steamRoots('win32', 'C:\\Users\\x')).toHaveLength(2)
  })
})
