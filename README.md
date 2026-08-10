# TidePool Mod Manager

A mod loader package, mod manager, and eventually a multiplayer mod for
**[Surf Sandbox](https://store.steampowered.com/app/4480760/Surf_Sandbox/)**
(nocanwin, Unity, Steam app id `4480760`, releases **Aug 25 2026**).

> **Status:** pre-release. The game is not out yet. Everything here is groundwork built
> ahead of launch day so that day one is spent on the game-specific gaps, not scaffolding.

## What this is

Surf Sandbox ships with a level editor but no mod support and no multiplayer. TidePool aims to add
all three layers the community will need, in the order they become possible:

1. **Loader pack** — a preconfigured BepInEx drop-in for Surf Sandbox, so a player can install mods
   without knowing what a DLL override is.
2. **Manager** — install, update, enable/disable and profile-switch mods, plus a browser for custom
   breaks (the game's own level editor makes shareable levels the obvious content economy, and no
   generic manager understands that format).
3. **Multiplayer mod** — host-authoritative shared lineups. See the plan for why this is tractable here.

## Plan

The full launch runbook — timeline, distribution strategy, and the reverse-engineering steps for
day one — lives at **[docs/PLAN.html](docs/PLAN.html)**.

Published (private) copy: https://claude.ai/code/artifact/aac6462b-6407-4998-ac80-b6cd509bfab6

## Day-one summary

Everything hinges on one check the moment the game unlocks:

| If the install folder contains | Backend | Then |
| --- | --- | --- |
| `SurfSandbox_Data/Managed/Assembly-CSharp.dll` | Mono | Decompiles to readable C#. Patching within the hour. |
| `GameAssembly.dll` + `il2cpp_data/` | IL2CPP | Needs Il2CppDumper/Cpp2IL first. Add ~1 day. |

Then: install BepInEx → decompile → map the wave simulation and the surfer controller → ship a
proof-of-life Harmony patch → tag a release → file platform requests with that release linked.

## Why speed matters on day one

Thunderstore and Nexus Mods both refuse to create a page for a game until you already have
ready-to-upload mods. There is no spot to reserve in advance — whoever arrives first *with a working
mod in hand* founds the community. That makes the pre-release prep in this repo the whole ballgame.

## Stack

Electron + TypeScript + React, matching r2modman (the dominant Thunderstore manager, also
Electron/TypeScript). Development happens on macOS; the Windows build is produced on a
`windows-latest` CI runner, so nothing is ever cross-compiled.

```
src/shared/      types + dependency resolution (pure, fully tested)
src/main/        Electron main process
  services/      thunderstore, steam, profiles, install, launch
src/renderer/    React UI
docs/            plan, runbook, Discord docs
```

## Development

```sh
npm install
npm test          # 43 unit tests, no network required
npm run typecheck
npm start         # build + launch Electron
npm run dist:win  # Windows build (CI does this on a Windows runner)
```

### What already works without the game

The whole dependency and packaging layer is game-agnostic and testable today:

- **Dependency resolution** — parses `Owner-Name-1.2.3` refs (including names containing hyphens),
  produces an install order with dependencies first, and reports missing packages and version
  conflicts. Verified against the live Thunderstore API on a real 3-deep dependency chain.
- **Thunderstore client** — Thunderstore answers an unknown community with **503, not 404**, so an
  unknown slug is indistinguishable from an outage on one request. The client probes a known-good
  community to tell "surf-sandbox doesn't exist yet" from "Thunderstore is down".
- **Profiles** — each profile owns its own BepInEx tree, so switching never touches the game install.
- **Launch plan** — Doorstop 3 and Doorstop 4 use *different* flag names (`--doorstop-enable` vs
  `--doorstop-enabled`, `--doorstop-target` vs `--doorstop-target-assembly`); the wrong pair fails
  silently by launching unmodded.
- **Package layout normalisation** — Thunderstore zips are inconsistent, some carrying a `BepInEx/`
  tree and some just loose DLLs. Both are normalised into the profile's plugin folder.

### Mod browser

Search, sort, category filter and paginated results, with a detail panel that shows the resolved
dependency chain before you install anything.

The architecture here is driven by a measurement rather than a guess. A mature community's full
package index is **311 MB** (lethal-company: 50,362 packages, 190,959 versions), so it can never cross
the IPC boundary — sending it would stall the app. Instead the main process holds the index (dependency
resolution needs every version, because dependencies pin exact ones) and serves pages of trimmed
summaries. Measured against the live API:

| Query | Matches | Page payload | Time |
| --- | --- | --- | --- |
| Default, by downloads | 38,667 | 35 KB | 37 ms |
| Search "bepinex" | 5,215 | 35 KB | 29 ms |
| Category: Tools | 828 | 34 KB | 18 ms |

Roughly a 9,000x reduction over shipping the index. Search is weighted so an exact name match beats an
incidental mention — searching "bepinex" returns BepInExPack first, ahead of the 5,214 packages that
merely name it in a description.

A community selector points the browser at a real community during development, since `surf-sandbox`
will not exist until mods are published for it — that is what makes the entire UI exercisable today.
**Shipped builds never see it**: they default to Surf Sandbox and the picker is hidden entirely, because
a stranger opening a Surf Sandbox mod manager and finding Lethal Company mods would rightly be baffled.
The flag comes from `app.isPackaged` via `additionalArguments`, not an environment variable — the
preload runs in the renderer process, where main's environment is not guaranteed.

### Install pipeline

Installing is download-and-unpack into a profile folder, which needs no game at all — only *launching*
does. So the entire pipeline is already proven end to end against live Thunderstore packages.

A real run installing `Evaisa-LethalLib-1.2.0` pulled its whole transitive chain in the right order:

```
BepInEx-BepInExPack -> Evaisa-HookGenPatcher -> MonoDetour-MonoDetour
  -> MonoDetour-MonoDetour_BepInEx_5 -> Evaisa-LethalLib
```

Five packages, 2.8 s, 35 files, 21 non-empty DLLs — including `BepInEx/core/BepInEx.Preloader.dll`,
which is exactly the path the Doorstop launch arguments point at, so the install and launch layers agree.
Uninstalling LethalLib then removed exactly its own 3 files and left the four dependencies intact.

Each installed mod records the profile-relative paths it wrote, so uninstall removes precisely what was
added rather than guessing from the package name, and upgrading clears the previous version's files
first — otherwise a stale DLL sits in `plugins/` and gets loaded alongside the new one.

### Core loop

Browse -> install -> launch is complete.

- **Game detection reads Steam's app manifest** rather than guessing a folder name. `installdir` is
  chosen by the developer and can't be derived from the store page, so for an unreleased game any
  hardcoded guess would simply be wrong.
- **The executable is derived from Unity's own convention** — a build always contains `<Name>_Data`
  beside `<Name>.exe` — so TidePool works without knowing what Surf Sandbox's executable is called.
- **A manual folder picker** is the fallback when detection misses, validated against the same
  `_Data` convention so you can't point it at nonsense. Without this, a wrong guess on day one would
  brick the app with no workaround.
- **Launching** spawns the game detached with the Doorstop arguments on Windows. Elsewhere it says so
  plainly and offers the Steam launch options instead, which work through Proton and Wine too.
- **Profiles** support create, rename, duplicate and delete. Renaming changes the label only: the id
  is the folder name that Doorstop is pointed at, so moving it would break a running game.

### Visual design

Prismarine dark blues over a pixel-art surf backdrop, which fades to solid prismarine at every corner
and edge so window chrome and text always sit on settled ground.

Two rules keep it readable rather than pretty-but-unusable:

- **Every text colour is verified against the worst case**, not the average one — a translucent panel
  sitting over the brightest pixel in the artwork, after the vignette. The lowest-contrast pair in the
  UI measures **4.95:1**, clear of WCAG AA. The previous tertiary ink was around 3.0:1 against panels,
  which is why small meta text was hard to read.
- **The macOS window buttons get reserved space.** The renderer stamps the real platform onto
  `<html>`, and the stylesheet keys 104px of topbar padding off that, matched to a
  `trafficLightPosition` that centres the buttons in the 58px bar. The previous approach inferred
  macOS from an `@supports` query, which is why the traffic lights ended up over the content.

Interaction details that were audited rather than assumed:

- **No native dialogs.** `window.prompt` and `window.confirm` cannot be styled and render as an OS
  sheet over a fully custom window, which reads as a bug even when working. Creating, renaming and
  deleting profiles all use in-app dialogs that close on Escape and move focus in on open.
- **Every action reports itself.** Installs, removals, toggles, updates and imports raise a toast, and
  failures raise a longer-lived one — silence after clicking a button is indistinguishable from a hang.
- **Broken package icons fall back** to the placeholder. Icons are third-party URLs and do 404.
- **Paging returns you to the top** of the list, rather than leaving you halfway down the next page.

The backdrop is smoothed rather than nearest-neighboured: at typical window sizes it is a downscale,
where hard pixel edges only produce shimmer.

### Catalog caching and offline use

The index is cached to disk, gzipped, and consulted before the network. Without it every launch
re-downloaded the whole index — slow for the user and rude to Thunderstore. Measured against
lethal-company's real 50,364-package index:

| | Time | Notes |
| --- | --- | --- |
| Cold start (network) | 12.8 s | |
| Warm start (disk) | 1.7 s | **7.7x faster** |
| Cache size | 33.2 MB | vs 311 MB uncompressed — the JSON is repetitive and compresses ~9x |

If the network fails and a cached copy exists, that copy is served and flagged stale, and the UI shows
an "Offline · cached 2h ago" chip. An out-of-date list beats an error page. With no cache and no
network it still throws, because there is genuinely nothing to show. Cache files are written
write-then-rename so a crash can't leave a truncated file, and are keyed by a hash of the community
slug so an odd slug can't escape the cache directory.

### Sharing profiles

**Share** turns the active profile into a code; **Import** rebuilds it as a new profile. Codes are
self-contained — no server, no account — and carry the mod list rather than the files, so the
recipient downloads fresh from Thunderstore. A five-mod profile encodes to about 230 characters.

Codes arrive from strangers and trigger downloads, so decoding validates defensively rather than
trusting its own format: entries must survive the same reference parsing that installs use, the list
is capped at 500 mods, and a damaged or truncated code says so instead of half-importing. Disabled
mods stay disabled on the other side.

Verified live by installing LethalLib and its four dependencies, disabling one, exporting, importing,
and comparing: identical mod sets, identical versions, identical enabled states, 35 files each side.

### Running the game

Three routes, because they trade off differently:

| Button | What it does | Trade-off |
| --- | --- | --- |
| **▶ Run** | Spawns the executable directly with the Doorstop arguments | One click, no Steam round trip, guaranteed to load this profile. Windows only; Steam records no playtime and the overlay is absent. |
| **Via Steam** | Opens `steam://rungameid/4480760` | Keeps overlay, playtime and cloud saves, and works anywhere Steam runs the game — but applies whatever launch options are saved in Steam, not ours. |
| **Vanilla** | Spawns the executable with no arguments and no Wine override | The fastest way to answer "is this bug actually caused by a mod?" |

The Steam URL is constructed in the main process, so the renderer can never hand the shell an
arbitrary protocol.

### Installed mods

A dedicated tab lists what's in the active profile, with dependencies sorted below the mods you
actually chose.

- **Enable/disable without uninstalling.** BepInEx only loads `.dll` files from `plugins`, so
  disabling suffixes them with `.disabled`. Only DLLs are touched — renaming configs would throw away
  the user's settings on every toggle. Verified live: 13 DLLs parked and restored, config preserved.
- **Update detection** compares each installed mod against the catalog and never suggests a
  downgrade, since running ahead of the catalog is normal after a package is pulled. Verified live by
  installing BepInExPack 5.4.2100, detecting 5.4.2305, applying it, and re-checking to zero.

### Packaging

```sh
npm run icons      # regenerate build/icon.{png,ico,icns} from tools/make-icon.py
npm run dist:win   # NSIS installer + portable zip
npm run dist:mac   # dmg + zip, arm64 and x64
```

Icons are generated from code rather than committed as opaque binaries. Both targets build from macOS —
electron-builder fetches wine automatically for the Windows NSIS step. Verified output:

| Artifact | Size | Notes |
| --- | --- | --- |
| `TidePool-Setup-0.0.1.exe` | 78 MB | NSIS, choose install dir, desktop + start menu shortcuts |
| `TidePool-0.0.1-x64.zip` | 106 MB | Portable Windows |
| `TidePool-0.0.1-arm64.dmg` | 94 MB | macOS Apple Silicon |
| `TidePool-0.0.1-x64.dmg` | 99 MB | macOS Intel |

Neither build is code-signed yet, so Windows SmartScreen and macOS Gatekeeper will both warn on first
run. That needs paid certificates and is worth sorting before the public release, not before.

### What needs the game

Backend detection (Mono vs IL2CPP), the actual BepInEx pack, and anything touching Surf Sandbox's
own level format.

## Open decisions

- **Licence.** MIT for now, as is conventional for BepInEx-adjacent tooling. Easy to change while the
  repo is young.

## Development notes

Mods build natively on Apple Silicon — a compiled mod is just a DLL. Only *running* the game needs
Windows, since Surf Sandbox ships no macOS build.

To pull the Windows game files onto macOS for decompilation without a Windows machine:

```sh
steamcmd +@sSteamCmdForcePlatformType windows +login <user> +app_update 4480760 validate +quit
```

If you run the game through Wine or CrossOver, BepInEx will silently fail to load unless you override
the DLL it hooks:

```sh
WINEDLLOVERRIDES="winhttp.dll=n,b"
```

## Licence

MIT — see [LICENSE](LICENSE).
