# Steam guide — "How to mod Surf Sandbox"

Post to the Surf Sandbox hub → Guides → Create. Highest-leverage post available: every day-one player
is already on that page. Title it exactly **How to mod Surf Sandbox**.

---

## How to mod Surf Sandbox

Surf Sandbox has no official mod support, but it's built in Unity, which means the community can add
it. This guide gets you from a clean install to running mods in about five minutes.

**You need:** Surf Sandbox on Steam, and Windows. That's it.

### 1. Install TidePool

[TidePool]({{RELEASE_URL}}) is a free, open-source mod manager for Surf Sandbox. Download
`TidePool-Setup-{{TIDEPOOL_VERSION}}.exe` and run it.

It's unsigned, so Windows SmartScreen will warn you. Click **More info → Run anyway**. If you'd rather
not, the source is at https://github.com/AttackStudios/tidepool and you can build it yourself.

### 2. Let it find your game

TidePool reads Steam's own install records, so it should find Surf Sandbox on its own. If it doesn't —
non-Steam copy, unusual install location — click **Locate game** and pick the folder containing the
game's executable.

### 3. Install the mod loader

Mods need [BepInEx]({{RELEASE_URL}}), which loads them into the game. TidePool installs it for you:
open **Browse**, find **BepInExPack**, and hit **Install**. Anything a mod depends on is pulled in
automatically, so you never have to work out install order yourself.

### 4. Install a mod

Still in **Browse** — search, pick something, **Install**. The panel on the right shows exactly what
will be installed before you commit, including dependencies.

### 5. Play

Hit **▶ Run** in TidePool and the game starts with your mods loaded.

Prefer launching from Steam so you keep the overlay, playtime and cloud saves? Click **Copy Steam
options**, then in Steam right-click Surf Sandbox → Properties → paste into **Launch Options**. After
that, launching from Steam works normally.

### Profiles

Profiles are separate sets of mods. Make one per playstyle — a clean one, a heavily modded one, one for
testing. Switching profiles never touches your game install, so vanilla is always one click away.

### If something breaks

**The game starts but no mods load.** Check BepInEx is installed in the profile you're actually running.
If you launch from Steam, the launch options must be pasted in.

**The game won't start.** Hit **Vanilla** in TidePool. If it launches fine unmodded, a mod is the cause —
disable them one at a time with the toggles in **Installed**.

**A mod misbehaves after an update.** Surf Sandbox is early in development and game updates break mods.
Check the mod's page for an update before reporting anything.

**Never report a modded bug to nocanwin.** Surf Sandbox is made by one person, and modded bug reports
waste their time on problems they didn't cause. If a mod broke it, bring it to us instead.

### Get help

- Discord: https://discord.gg/RRu3gevbXS
- Issues: https://github.com/AttackStudios/tidepool/issues

TidePool is free and open source, MIT licensed. Mods are made by the community — if you build one,
come share it.
