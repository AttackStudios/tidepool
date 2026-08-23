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

## Not verified

- **The stable release path has never run.** rc.7 and rc.8 were both
  prereleases, so `isPrerelease=false` has never flowed through build → announce
  → site unlock for real.
- **The announce workflow has never executed in Actions with the new routing.**
  Its code has only been run locally with simulated secrets.
- **The prerelease badge has never appeared.** `package.json` is `0.0.1`, which
  has no hyphen, so it correctly hides locally. It only renders on a
  CI-stamped version like `1.0.0-rc.9`.
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
