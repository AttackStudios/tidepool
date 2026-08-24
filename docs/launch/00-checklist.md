# Day one — 25 Aug 2026

Everything in this folder is pre-written so launch day is paste-and-publish. Placeholders in
`{{BRACES}}` are the handful of facts that cannot be known until the game exists.

## Before the day

- [x] ~~`gh auth refresh -s workflow`, then commit the CI workflow~~ — done. `build.yml` is tracked and
      green on every push; three jobs (check, windows, release).
- [x] ~~Decide on code signing~~ — **decided: ship unsigned on day one.** Microsoft removed EV's
      instant SmartScreen bypass, so any new certificate starts with zero reputation and earns it
      through clean download volume. Signing on 25 Aug would cost money and still show the warning.
      The Steam guide documents the *More info → Run anyway* path. Get a certificate after launch so
      reputation starts building — see `code-signing.md`.
- [x] ~~Flip the repo public~~ — done, with description and ten discoverability topics
      (`surf-sandbox`, `bepinex`, `thunderstore`, `mod-manager`, …).
- [x] ~~Message nocanwin about mod support~~ — **decided against.** Shipping first and seeing how it
      goes. Two consequences worth holding in mind: there's no shortcut if official mod hooks were
      already planned, so day one assumes reverse-engineering; and nocanwin's first impression of this
      project will be the mod scene itself rather than a message. That makes the norm already written
      into the Steam guide — *never report a modded bug to the developer* — the thing carrying the
      relationship. Worth repeating in Discord and in release notes rather than saying once.
- [ ] **Install the release on a Windows machine and click through setup.** The binary is verified as a
      real PE32 NSIS installer and CI builds it reproducibly, but no human has run it. It is the only
      step in the whole pipeline still untested.

## Confirmed by nocanwin (13 Aug 2026)

Asked directly in their Discord, so these are answers rather than assumptions:

- **The build is IL2CPP.** Confirmed directly: *"IL2CPP helps, but unity's job system does the heavy
  lifting."* This was the single biggest unknown and it is the harder of the two answers — see below.
- **No mod hooks planned** ("not at the moment"). Day one is full reverse-engineering; there is no
  official API to build on and no shortcut.
- **No Steam Workshop.**
- **Beaches are saved as local JSON files**, and the developer explicitly said they can be shared
  manually. That is the important one — see below.

### Why the beach format changes the plan

Sharing beaches needs **no BepInEx, no decompiling and no code injection**. It is file management,
which is exactly what TidePool already does well. Consequences:

- It can ship on **day one**, before any code mod exists, and probably before anyone else has a
  working loader.
- With no Workshop, there is a real gap and no incumbent filling it.
- The developer has effectively blessed manual sharing, so this stays firmly on the friendly side.

Unknown until release: the save directory and the JSON schema. Unity writes user data to
`%USERPROFILE%/AppData/LocalLow/<Company>/<Product>` on Windows, so that is where to look first.

## Verified state (11 Aug 2026)

Audited rather than remembered:

| Item | Result |
| --- | --- |
| CI workflow tracked, latest `main` run | green |
| Typecheck | clean |
| Tests | 168 passing, 20 files |
| Public release downloadable unauthenticated | `v0.1.0-rc.5`, prerelease, 2 assets |
| `npm run launch:check` | correctly blocks unfilled placeholders |
| Every placeholder documented | yes |
| Font licences vendored | Silkscreen OFL + Departure Mono |
| Secrets in a now-public repo | none |
| Working tree | clean, nothing unpushed |

## Release process (rehearsed 9 Aug 2026)

Tagging is the whole thing:

```sh
git tag -a v0.1.0 -m "First release"
git push origin v0.1.0
```

CI then checks, builds on Windows, and publishes a GitHub release with the installer and portable zip
attached. Tags containing `-rc`, `-beta` or `-alpha` are marked prerelease automatically. The version
in the artifact names comes from the tag, so they always agree with the release.

Verified end to end three times, most recently on `v0.1.0-rc.5`. The downloaded installer was
confirmed to be a real PE32 NSIS binary with the expected contents — though see the unticked item
above: nobody has actually run it.

## Hour by hour

### What IL2CPP means

The Mono-versus-IL2CPP fork is closed, so day one no longer branches — but it landed on the slower
side. Concretely:

- **BepInEx 6 (IL2CPP branch)**, not BepInEx 5. Different pack, different install.
- **No readable decompile.** `Assembly-CSharp.dll` does not exist. Recovering type and method names
  needs Il2CppDumper or Cpp2IL against `GameAssembly.dll` and `global-metadata.dat` first, and the
  result is less pleasant to read than Mono output. Budget roughly an extra day.
- **Patching goes through Il2CppInterop**, which generates managed proxy assemblies on first run.
- **Doorstop 4 argument names are the right ones** — `--doorstop-enabled` and
  `--doorstop-target-assembly`. TidePool already defaults to those, so nothing changes there.

The job-system remark matters for multiplayer too. If the wave simulation runs as Burst-compiled jobs
then its state is very likely a contiguous `NativeArray<float>` heightfield, which is *good* news for
the broadcast plan — contiguous floats are exactly what you want to ship over the wire. Reading it
from an IL2CPP patch is fiddlier than from Mono, but the shape of the data is favourable.

| When | Do |
| --- | --- |
| H+0:00 | Install. Confirm `GameAssembly.dll` and `global-metadata.dat` are present (IL2CPP is expected, not in doubt). Note the Unity version in `globalgamemanagers`. Check whether Steamworks assemblies are present — that decides multiplayer transport. |
| H+0:15 | Point TidePool at the folder. It reads Steam's app manifest, so detection should just work; if not, use **Locate game**. Confirm the backend chip reads mono or il2cpp. |
| H+0:30 | Install BepInEx for the matching backend and architecture. Confirm it injects and writes `LogOutput.log`. |
| H+1:00 | Decompile. Find the wave/water simulation and how its state is stored, and the surfer controller. Everything downstream depends on those two. |
| H+3:00 | Ship the proof-of-life mod: a Harmony patch drawing a debug HUD with wave height and surfer velocity. |
| H+4:00 | Tag `v0.1.0`. GitHub release with the TidePool installer, the BepInEx pack and the example mod. **You are now first.** |
| H+4:30 | Publish to the ungated platforms: GitHub release notes, Steam guide, GameBanana. |
| H+5:00 | File the gated requests with the release linked: Thunderstore `#game-requests`, then Nexus. |
| H+6:00 | Announce in your Discord and anywhere the game's players gather. Then answer everything. |

## Fill in these on the day

| Placeholder | Where it comes from |
| --- | --- |
| `IL2CPP` | mono or il2cpp, from the H+0:00 check |
| `6 (IL2CPP)` | 5.x for Mono, 6.x for IL2CPP |
| `{{TIDEPOOL_VERSION}}` | the tag you ship |
| `{{RELEASE_URL}}` | `https://github.com/AttackStudios/tidepool/releases/tag/v{{TIDEPOOL_VERSION}}` |
| `https://discord.gg/RRu3gevbXS` | your server's permanent invite |
| `{{STEAM_GUIDE_URL}}` | the guide's URL, once Steam has published it |
| `{{FIRST_MOD_NAME}}` | the proof-of-life mod you ship at H+3:00 |
| `{{FIRST_MOD_DESCRIPTION}}` | one line on what it does |

Run `npm run launch:check` after filling these in. It fails if any placeholder is still unfilled, so
nothing goes out with `{{RELEASE_URL}}` in it.
