**Release rehearsal.** This is a pre-release cut to exercise the pipeline end to end before Surf
Sandbox launches on 25 August 2026 — build, artifact, release, install — so launch day is not the
first time any of it runs.

Surf Sandbox is not out yet, so there is nothing to mod. What you can do is install TidePool, see the
interface, create profiles, and confirm it starts cleanly on your machine.

### What's in it

- Browse Thunderstore with dependency-resolved installs, showing exactly what will land before you commit
- Profiles that keep separate sets of mods; switching never touches your game install
- Enable/disable without uninstalling, per-mod and bulk updates
- Three ways to play: direct, via Steam, or vanilla for A/B testing a bug
- Shareable profile codes — no server, no account
- Works offline from a cached package list
- Warns before removing a mod that something else depends on

### Known and expected

- **Windows will warn on first run.** The build is unsigned. Click *More info → Run anyway*. This is
  deliberate: Microsoft removed EV certificates' instant SmartScreen bypass, so a certificate bought now
  would start at zero reputation and show the same prompt anyway.
- **The mod list will be empty.** The Surf Sandbox community on Thunderstore is created once mods exist
  to upload, which is part of the day-one plan.

### Install

Download `TidePool-Setup-0.0.1.exe` and run it, or take the `.zip` for a portable copy.
