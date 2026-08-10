# Day one — 25 Aug 2026

Everything in this folder is pre-written so launch day is paste-and-publish. Placeholders in
`{{BRACES}}` are the handful of facts that cannot be known until the game exists.

## Before the day

- [ ] `gh auth refresh -s workflow`, then commit `.github/workflows/build.yml` (currently untracked)
- [x] ~~Decide on code signing~~ — **decided: ship unsigned on day one.** Microsoft removed EV's
      instant SmartScreen bypass, so any new certificate starts with zero reputation and earns it
      through clean download volume. Signing on 25 Aug would cost money and still show the warning.
      The Steam guide documents the *More info → Run anyway* path. Get a certificate after launch so
      reputation starts building — see `code-signing.md`.
- [ ] Flip the repo public: `gh repo edit AttackStudios/tidepool --visibility public --accept-visibility-change-consequences`
- [ ] Message nocanwin about mod support. A planned modding API would delete most of the day.

## Release process (rehearsed 9 Aug 2026)

Tagging is the whole thing:

```sh
git tag -a v0.1.0 -m "First release"
git push origin v0.1.0
```

CI then checks, builds on Windows, and publishes a GitHub release with the installer and portable zip
attached. Tags containing `-rc`, `-beta` or `-alpha` are marked prerelease automatically. The version
in the artifact names comes from the tag, so they always agree with the release.

Verified end to end on `v0.1.0-rc.3`: three jobs green, release published, and the downloaded
`TidePool-Setup-0.1.0-rc.3.exe` confirmed as a real PE32 NSIS installer.

## Hour by hour

| When | Do |
| --- | --- |
| H+0:00 | Install. Check `Assembly-CSharp.dll` (Mono) vs `GameAssembly.dll` (IL2CPP). Note the Unity version in `globalgamemanagers`. Confirm whether Steamworks assemblies are present — that decides multiplayer transport. |
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
| `{{BACKEND}}` | mono or il2cpp, from the H+0:00 check |
| `{{BEPINEX_VERSION}}` | 5.x for Mono, 6.x for IL2CPP |
| `{{TIDEPOOL_VERSION}}` | the tag you ship |
| `{{RELEASE_URL}}` | `https://github.com/AttackStudios/tidepool/releases/tag/v{{TIDEPOOL_VERSION}}` |
| `{{DISCORD_INVITE}}` | your server's permanent invite |
| `{{STEAM_GUIDE_URL}}` | the guide's URL, once Steam has published it |
| `{{FIRST_MOD_NAME}}` | the proof-of-life mod you ship at H+3:00 |
| `{{FIRST_MOD_DESCRIPTION}}` | one line on what it does |

Run `npm run launch:check` after filling these in. It fails if any placeholder is still unfilled, so
nothing goes out with `{{RELEASE_URL}}` in it.
