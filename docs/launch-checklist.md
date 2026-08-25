# Launch readiness — Surf Sandbox, Tue 25 Aug 2026, 10:00 Pacific

Release time confirmed by nocanwin directly. TidePool 1.0 targets early
afternoon rather than 10am, because a mod manager wants at least one mod.

Kept in the repo because this state otherwise lives only in a chat log.

## The plan for the day

1. **10:00** — game unlocks. Play it. Nothing below waits on this.
2. **Whenever** — make a beach in-game and save it. That is the only thing the
   Break Pack is blocked on, and it takes seconds.
3. Read the beach JSON, fill in `FIELDS` and `GRID` in `tools/beach-format.mjs`,
   set `SCHEMA_KNOWN = true`, run `npm run breaks`. Upload the zip, set
   `downloadUrl` and `status: "released"` on the Break Pack entry. **No app
   release needed** — the manifest is fetched at runtime.
4. Tag `v1.0.0` and publish. Everything else is automatic: the build stamps the
   version from the tag, announces to `#mods-and-creations` with `@everyone`,
   and the site unlocks itself because `download.js` only counts non-prerelease
   releases.
5. M0 recon — see `il2cpp-rehearsal.md`. Find the wave state *before* writing
   any netcode; if it is unreadable, stop and redesign.
6. File the submissions in order — GameBanana, Thunderstore, Nexus, then the
   Steam guide. See `submissions-preflight.md`; it gates on facts that are only
   true once the game exists.

## Verified

- **Release pipeline, end to end** — `rc.9` tagged, built on Windows, version
  stamped from the tag, `latest.yml` correct, marked prerelease, announced to
  the beta channel by CI itself.
- **In-app updater** — an rc→rc update performed inside the app.
- **Windows install** — packaged build installed and run.
- **Game detection** — reads `installdir` from `appmanifest_4480760.acf` rather
  than guessing a folder name; derives the exe from Unity's `<Name>_Data`
  convention; manual "Locate game" fallback; `detectBackend()` reports mono vs
  IL2CPP.
- **Essentials is live and serves a loader** — the manifest resolves over
  `raw.githubusercontent`, and the full chain runs: Thunderstore serves
  BepInExPack_IL2CPP 6.0.755 in ~1s, 229 files extract, four land beside the
  exe, and all three Doorstop targets resolve to files that exist.
- **Site download unlock** — `classify()` run against real CI filenames.
- **Every site link** — 18 distinct URLs across both pages, all 2xx/3xx.
- **Zip Slip** — path containment enforced, including through the new staging
  route.
- **IL2CPP toolchain** — rehearsed on Among Us (Unity 2022.3.44f1). See
  `il2cpp-rehearsal.md` for the three traps; the stable Cpp2IL release cannot
  read modern metadata and GitHub's latest-release endpoint hides the
  pre-release that can.

## Fixed on 23–24 August

Every one of these produced the same user-visible outcome: install succeeds,
game launches, nothing happens, no error anywhere.

- **Essentials carried no loader at all.** Two `planned` entries with no
  downloads, and Thunderstore empty until the community is approved — so Browse
  offered nothing on day one. BepInEx now pinned at 6.0.755.
- **The 1.0 announcement would never have posted.** GitHub refuses to raise
  workflow-triggering events for anything created with `GITHUB_TOKEN`.
  Announcing now happens inside the build job.
- **The loader installed where Windows never looks** — `winhttp.dll`,
  `doorstop_config.ini` and 187 files of .NET runtime filed as plugins.
- **Vanilla launches passed no Doorstop arguments**, so they fell back to
  `doorstop_config.ini` where `enabled = true` and loaded BepInEx anyway.
- **Doorstop was aimed at `BepInEx.Preloader.dll`** — the Mono name, present in
  no IL2CPP pack — and never told where the bundled CoreCLR was.
- **Both Steam routes skipped loader placement**, including the one the setup
  guide recommends.
- **Beach packs had no install route**, so Break Pack would have landed in a
  profile's plugins folder.
- **The update check threw** because the Thunderstore community does not exist
  yet, showing a first-time user an error on a healthy install.
- **Toggling the loader off renamed a CoreCLR install** — 185 of the pack's 217
  DLLs. A disabled loader now refuses to launch instead of running vanilla while
  reporting itself modded.

## Not verified, and cannot be until the game exists

- **BepInEx actually loading Surf Sandbox.** Every link that can be checked
  without the binary now checks out; whether the loader attaches is the one
  thing only day one can answer.
- **The stable branch of the announcer in CI.** Its prerelease branch has run and
  they share a code path; the `@everyone` mention and launch copy are verified
  locally.
- **The beach file format**, which is the single thing `tools/beach-format.mjs`
  waits on.

## Open — yours

- **Reset the bot token** and **rotate the three webhooks**; all passed through
  chat.
- **Trim the bot off Administrator.** It needs View Channel, Send Messages,
  Mention Everyone.
- **Decide the announcement channel.** There is no `#announcements`; 1.0's
  `@everyone` will land in `#mods-and-creations`.
- **Tag `rc.10`.** The entire core has been rewritten since rc.9 — install,
  launch, launcher, ipc, preload, beaches, updates — and the release chain has
  not run on any of it. 1.0 will be built from this code.
