**Pre-release, ahead of the game.** Surf Sandbox launches on 25 August 2026. This build is everything
that could be finished before it exists — the remaining work needs the actual game to point at.

You can install it, see the interface, create profiles, and browse real mod listings. What you can't
do yet is mod Surf Sandbox, because neither Thunderstore nor GameBanana has a page for it. Those are
created once mods exist to upload, which is day-one work.

### What's in it

- **Browse Thunderstore or GameBanana.** Thunderstore installs resolve dependencies and install them
  in the right order, showing exactly what will land before you commit. GameBanana entries open in
  your browser — it carries no dependency data and mods often ship several alternative files, so
  guessing an install would break things.
- **Profiles.** Separate sets of mods, each with its own BepInEx folder. Switching never touches your
  game install, so vanilla is always one click. Rename, duplicate, delete, and share a whole setup as
  a code — no server, no account.
- **Enable or disable** without uninstalling, update mods individually or all at once, and get warned
  before removing something other mods depend on.
- **Three ways to play.** Run directly with your mods, hand off to Steam to keep the overlay and
  playtime, or launch vanilla to check whether a mod caused a bug.
- **Works offline** from a cached package list, rather than showing an error page.

### Known and expected

- **Windows will warn on first run.** The build is unsigned. Click *More info → Run anyway*. This is
  deliberate: Microsoft removed EV certificates' instant SmartScreen bypass, so a certificate bought
  now would start at zero reputation and produce the same prompt.
- **The Surf Sandbox mod list will be empty.** Nothing exists to list yet.
- **macOS builds are for development.** Surf Sandbox ships a Windows executable only.

### Install

`TidePool-Setup-<version>.exe` for the installer, or the `.zip` for a portable copy.
