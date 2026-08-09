# WaterWay Mod Manager

A mod loader package, mod manager, and eventually a multiplayer mod for
**[Surf Sandbox](https://store.steampowered.com/app/4480760/Surf_Sandbox/)**
(nocanwin, Unity, Steam app id `4480760`, releases **Aug 25 2026**).

> **Status:** pre-release. The game is not out yet. Everything here is groundwork built
> ahead of launch day so that day one is spent on the game-specific gaps, not scaffolding.

## What this is

Surf Sandbox ships with a level editor but no mod support and no multiplayer. WaterWay aims to add
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

## Repo layout

```
docs/         plan, runbook, and modding documentation
```

Further directories get added once the stack is chosen — see below.

## Open decisions

- **Manager stack.** Not yet chosen. C#/.NET keeps one toolchain across mods and manager and matches
  the BepInEx ecosystem; a web stack (Tauri/Electron) trades that for faster UI work. Deliberately
  left open rather than guessed at.
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
