import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectBackend, inspectGameFolder, isPlausibleGameFolder, detectLoader, installedLoaders } from './gamefolder'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'tidepool-g-')) })
afterEach(() => rmSync(root, { recursive: true, force: true }))

const build = (name: string) => {
  mkdirSync(join(root, `${name}_Data`), { recursive: true })
  writeFileSync(join(root, `${name}.exe`), 'MZ')
}

describe('inspectGameFolder', () => {
  it('derives the executable from the _Data folder, whatever the game is called', () => {
    // Surf Sandbox is unreleased, so its executable name is unknown. Unity's
    // <Name>_Data convention is what makes this work without hardcoding a guess.
    build('Surf Sandbox')
    expect(inspectGameFolder(root)).toMatchObject({
      executable: 'Surf Sandbox.exe',
      dataDir: 'Surf Sandbox_Data',
    })
  })

  it('works just as well for a differently-named build', () => {
    build('SurfSim2000')
    expect(inspectGameFolder(root)?.executable).toBe('SurfSim2000.exe')
  })

  it('still identifies the folder when the executable is missing', () => {
    mkdirSync(join(root, 'Game_Data'), { recursive: true })
    expect(inspectGameFolder(root)).toMatchObject({ dataDir: 'Game_Data', executable: null })
  })

  it('rejects a folder with no _Data directory', () => {
    writeFileSync(join(root, 'readme.txt'), 'x')
    expect(inspectGameFolder(root)).toBeNull()
    expect(isPlausibleGameFolder(root)).toBe(false)
  })

  it('rejects a path that does not exist', () => {
    expect(inspectGameFolder(join(root, 'nope'))).toBeNull()
    expect(inspectGameFolder('')).toBeNull()
  })
})

describe('detectBackend', () => {
  it('reports il2cpp when GameAssembly.dll is present', () => {
    build('Game')
    writeFileSync(join(root, 'GameAssembly.dll'), 'x')
    expect(detectBackend(root, 'Game_Data')).toBe('il2cpp')
  })

  it('reports mono when Assembly-CSharp.dll is present', () => {
    build('Game')
    mkdirSync(join(root, 'Game_Data', 'Managed'), { recursive: true })
    writeFileSync(join(root, 'Game_Data', 'Managed', 'Assembly-CSharp.dll'), 'x')
    expect(detectBackend(root, 'Game_Data')).toBe('mono')
  })

  it('prefers il2cpp when both markers somehow exist', () => {
    build('Game')
    writeFileSync(join(root, 'GameAssembly.dll'), 'x')
    mkdirSync(join(root, 'Game_Data', 'Managed'), { recursive: true })
    writeFileSync(join(root, 'Game_Data', 'Managed', 'Assembly-CSharp.dll'), 'x')
    expect(detectBackend(root, 'Game_Data')).toBe('il2cpp')
  })

  it('returns null when neither marker is there', () => {
    build('Game')
    expect(detectBackend(root, 'Game_Data')).toBeNull()
  })
})

describe('detectLoader', () => {
  const mk = () => mkdtempSync(join(tmpdir(), 'tp-loader-'))

  it('finds MelonLoader by its own folder', () => {
    const d = mk()
    mkdirSync(join(d, 'MelonLoader'), { recursive: true })
    expect(detectLoader(d)).toBe('melonloader')
    rmSync(d, { recursive: true, force: true })
  })

  it('finds BepInEx by its own folder', () => {
    const d = mk()
    mkdirSync(join(d, 'BepInEx'), { recursive: true })
    expect(detectLoader(d)).toBe('bepinex')
    rmSync(d, { recursive: true, force: true })
  })

  it('is null for a clean install', () => {
    const d = mk()
    expect(detectLoader(d)).toBeNull()
    rmSync(d, { recursive: true, force: true })
  })

  it('reports both when a stale proxy is left beside a working loader', () => {
    // Exactly the state a half-finished uninstall leaves: MelonLoader working,
    // BepInEx's winhttp.dll still there, both hooking the same process.
    const d = mk()
    mkdirSync(join(d, 'MelonLoader'), { recursive: true })
    writeFileSync(join(d, 'winhttp.dll'), 'MZ')
    expect(installedLoaders(d).sort()).toEqual(['bepinex', 'melonloader'])
    rmSync(d, { recursive: true, force: true })
  })
})
