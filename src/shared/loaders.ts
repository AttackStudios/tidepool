/**
 * Which mod loader a game install is using.
 *
 * Surf Sandbox forced this to exist. It is Unity 6.3 (6000.3.8f1), and BepInEx 6
 * does not run on it: the Thunderstore build never bootstraps at all, and the
 * newest bleeding-edge build loads CoreCLR and then spins indefinitely
 * generating interop. MelonLoader 0.7.3 generates the same assemblies in about
 * forty seconds and loads cleanly.
 *
 * So TidePool cannot assume BepInEx. The two differ in every mechanical detail:
 * the proxy DLL the game loads, where mods live, and how you turn the loader off.
 */
export type LoaderKind = 'bepinex' | 'melonloader'

export interface LoaderSpec {
  kind: LoaderKind
  label: string
  /** The DLL the game loads to bootstrap the loader, beside the executable. */
  proxyDll: string
  /** Folder inside the game install that proves this loader is present. */
  marker: string
  /** Where a mod's assemblies belong, relative to a profile. */
  modsDir: string
}

export const LOADERS: Record<LoaderKind, LoaderSpec> = {
  bepinex: {
    kind: 'bepinex',
    label: 'BepInEx',
    proxyDll: 'winhttp.dll',
    marker: 'BepInEx',
    modsDir: 'BepInEx/plugins',
  },
  melonloader: {
    kind: 'melonloader',
    label: 'MelonLoader',
    // MelonLoader proxies version.dll rather than winhttp.dll, which is why the
    // two can be installed side by side and fight over the same process.
    proxyDll: 'version.dll',
    marker: 'MelonLoader',
    modsDir: 'Mods',
  },
}

/**
 * The loader Surf Sandbox actually runs.
 *
 * Not a preference. BepInEx is retained because the code understands it and it
 * may work on a future build, but nothing should default to it.
 */
export const DEFAULT_LOADER: LoaderKind = 'melonloader'
