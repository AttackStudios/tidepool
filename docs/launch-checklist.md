# Launch readiness — Surf Sandbox, 25 Aug 2026 (Tuesday)

What has actually been verified, and what has not. Kept in the repo because
this state otherwise lives only in a chat log.

## Verified

- **In-app updater** — an rc→rc update performed inside the app.
- **Windows install** — packaged build installed and run on Windows.
- **Game detection** — reads `installdir` from `appmanifest_4480760.acf` rather
  than guessing a folder name; derives the exe from Unity's `<Name>_Data`
  convention; manual "Locate game" fallback exists; `detectBackend()` reports
  mono vs IL2CPP.
- **Site download unlock** — `classify()` in `site/download.js` run against the
  real CI filenames: installer and portable classify, `latest.yml` and
  `.blockmap` drop. The page bails early if zero assets classify, so this was
  worth proving rather than assuming.
- **Zip Slip** — path containment enforced in `install.ts`; attacks blocked.
- **Announce routing logic** — all three branches executed against simulated
  releases: `v1.0.0` → announcements with launch copy and `@everyone`;
  `v1.0.1`/`v2.0.0` → announcements with `@everyone`; any prerelease → beta
  channel pinging the Beta Tester role only.

- **The release pipeline, end to end** — `rc.9` tagged, built on Windows,
  published with the version stamped from the tag, `latest.yml` correct, marked
  prerelease, and announced to the beta channel by CI itself.

## Fixed by rehearsing

- **The 1.0 announcement would never have posted.** GitHub refuses to raise
  workflow-triggering events for anything created with `GITHUB_TOKEN`, so the
  release CI publishes could not start an `on: release` workflow. `announce.yml`
  had only ever run because it was dispatched by hand, which hid the problem
  completely. The announcer now lives in `tools/announce.py` and is called
  directly from the build job. Verified: *"Announced v1.0.0-rc.9 to the beta
  channel."*

## Not verified

- **The stable branch of the announcer has not run in CI.** Its prerelease
  branch has, and they share one code path, so the remaining risk is the
  `@everyone` mention and the launch copy — both verified locally.
- **The prerelease badge has not been seen on screen.** It ships in the rc.9
  installer; install it on Windows and it should read
  `PreRelease Build (rc.9)` bottom left.
- **The install pipeline has only ever seen Mono packs** from the borrowed
  Lethal Company catalogue. A BepInEx 6 IL2CPP pack is a different shape, and
  cannot be tested until the game exists.

Tagging an `rc.9` closes the middle two outright and exercises the machinery of
the first. The last one is blocked until launch day by definition.

## Launch day

1. Tag `v1.0.0`, publish the release. Everything else is automatic:
   announcements posts with `@everyone`, the site unlocks itself because
   `download.js` only counts non-prerelease releases.
2. M0 recon — see `il2cpp-rehearsal.md`. Find the wave state before writing any
   netcode; if it is unreadable, stop and redesign.
3. Flip `essentials/index.json` entries from `planned` to `released` as they
   become real. No app release needed.

## Open

- `site/assets/surf.jpg` is a Surf Sandbox screenshot used without permission.
  Either ask nocanwin or replace it with original art.
- Three webhook URLs have passed through chat logs and should be rotated.
