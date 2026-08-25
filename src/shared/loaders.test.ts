import { describe, expect, it } from 'vitest'
import { DEFAULT_LOADER, LOADERS } from './loaders'

describe('loader specs', () => {
  it('defaults to the loader that actually runs this game', () => {
    // BepInEx 6 does not bootstrap on Unity 6.3; MelonLoader 0.7.3 does.
    expect(DEFAULT_LOADER).toBe('melonloader')
  })

  it('gives the two loaders different proxy DLLs, which is why they collide', () => {
    expect(LOADERS.bepinex.proxyDll).toBe('winhttp.dll')
    expect(LOADERS.melonloader.proxyDll).toBe('version.dll')
    expect(LOADERS.bepinex.proxyDll).not.toBe(LOADERS.melonloader.proxyDll)
  })

  it('puts mods where each loader looks for them', () => {
    expect(LOADERS.bepinex.modsDir).toBe('BepInEx/plugins')
    expect(LOADERS.melonloader.modsDir).toBe('Mods')
  })

  it('every spec is self-consistent', () => {
    for (const [key, spec] of Object.entries(LOADERS)) {
      expect(spec.kind).toBe(key)
      expect(spec.label.length).toBeGreaterThan(0)
      expect(spec.proxyDll.endsWith('.dll')).toBe(true)
    }
  })
})
