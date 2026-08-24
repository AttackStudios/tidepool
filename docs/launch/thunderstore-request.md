# Thunderstore — new community request

Post in the Thunderstore Discord (<https://discord.thunderstore.io>) → **#game-requests**.
**Read the Post Guidelines beside the New Post button first and match their format** — the text below
is content, not a substitute for their template.

Their bar is "pre-existing mod developer interest" and mods "ready for immediate upload". Do not post
until the GitHub release is live, because that link is what satisfies both criteria at once.

---

**Title:** Surf Sandbox

**Game:** Surf Sandbox
**Steam:** https://store.steampowered.com/app/4480760/Surf_Sandbox/
**App ID:** 4480760
**Developer:** nocanwin
**Engine:** Unity (IL2CPP backend)
**Released:** 25 August 2026

**Mod loader:** BepInEx 6 (IL2CPP). {{LOADER_STATUS}} No anti-cheat or third-party DRM.

<!-- LOADER_STATUS must be replaced with what you have actually verified, e.g.
     "Confirmed working — the game loads plugins and writes LogOutput.log normally."
     Do not send this claiming a working loader until you have seen your own log
     line in BepInEx/LogOutput.log. Thunderstore's whole bar is that mods are
     ready; a claim that turns out to be false is the one thing that would
     genuinely cost you the community. -->

**Ready to upload:**
- BepInExPack for Surf Sandbox — the loader, packaged for one-click install
- {{FIRST_MOD_NAME}} — {{FIRST_MOD_DESCRIPTION}}

Both are published and downloadable now: {{RELEASE_URL}}

**Modding interest:** we've built **TidePool**, an open-source mod manager for the game
(https://github.com/AttackStudios/tidepool), which already speaks the Thunderstore API — package
listing, dependency resolution with correct install ordering, profile management and installs. It was
developed and tested against existing communities ahead of release. The project Discord is at
https://discord.gg/RRu3gevbXS.

The game ships with an in-game break editor — Steam's own feature list is "Design: name your spot,
restore the reef, and make your break unique" — so shareable custom breaks are an obvious content
category alongside code mods.

Happy to provide anything else you need.

---

## Notes for filing

- Be patient and polite. Approvals are human-paced and may take days regardless of how ready you are.
- Follow up once, not repeatedly.
- While it's pending, GitHub, Steam and GameBanana already establish you publicly — see `00-checklist.md`.
