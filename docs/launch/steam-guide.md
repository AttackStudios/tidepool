# Steam guide — "How to mod Surf Sandbox"

Post to the Surf Sandbox hub → Guides → Create. Highest-leverage post available: every player is
already on that page. Title it exactly **How to mod Surf Sandbox**.

Everything below the line is the guide body, written in **Steam's own formatting tags**, not
Markdown. Steam guides do not render Markdown — paste it verbatim into the editor's text view and
it formats itself. Do not "fix" the brackets.

---

[h1]How to mod Surf Sandbox[/h1]

Surf Sandbox has no official mod support, but it is built in Unity, so the community can add it.
This gets you from a clean install to running mods in a few minutes.

[b]You need:[/b] Surf Sandbox on Steam, and Windows.

[hr][/hr]

[h2]1. Install TidePool[/h2]

[url=https://attackstudios.github.io/tidepool/]TidePool[/url] is a free, open-source mod manager for
Surf Sandbox. Download the Windows installer and run it.

It is unsigned, so Windows SmartScreen will warn you. Click [b]More info[/b] then [b]Run anyway[/b].
If you would rather not, the source is on
[url=https://github.com/AttackStudios/tidepool]GitHub[/url] and you can build it yourself.

[h2]2. Let it find your game[/h2]

TidePool reads Steam's own install records, so it should find Surf Sandbox by itself. If it does not
— a non-Steam copy, or an unusual install location — click [b]Locate game[/b] and pick the folder
containing the game's executable.

[h2]3. Install the mod loader[/h2]

Code mods need a loader. For Surf Sandbox that is [b]MelonLoader[/b].

Open [b]Browse[/b], set the source to [b]Essentials[/b], and install [b]MelonLoader[/b]. It goes into
the game folder rather than a profile, because that is where it starts from.

[b]The first launch after installing it takes a minute or two.[/b] MelonLoader generates the files it
needs from your copy of the game, and opens a console window while it works. That is normal. Let it
finish.

[quote]Why not BepInEx? Surf Sandbox runs on Unity 6.3, and BepInEx does not work on it — the common
build never starts, and the newest development build runs forever without finishing. MelonLoader
works. If you have seen a BepInEx guide for another game, this is why it does not apply here.[/quote]

[h2]4. Install a mod[/h2]

Still in [b]Browse[/b] — pick something and hit [b]Install[/b]. The panel on the right shows exactly
what will be installed before you commit, dependencies included.

[h2]5. Play[/h2]

Hit [b]Run[/b] in TidePool, or just launch from Steam as normal. MelonLoader loads either way, so you
keep the overlay, playtime and cloud saves without configuring anything.

To play unmodded, use [b]Vanilla[/b] in TidePool. It starts the game with the loader switched off.

[hr][/hr]

[h2]Beaches need no loader[/h2]

Beaches are ordinary level files, so they work on a completely clean install — no MelonLoader, no
mods, nothing.

TidePool's [b]Beach Manager[/b] tab lists every break in your game, shows how deep each one gets and
what swell it is built for, and installs, shares or deletes them. A whole break shares as a single
code, so sending someone your spot is one paste.

[b]Break Pack[/b] in Essentials adds nine real waves rebuilt from their actual sea-floor shape:
Pipeline, Teahupo'o, Nazaré, Jeffreys Bay, Skeleton Bay, Mavericks, Puerto Escondido, Pleasure Point,
and one gentle sandbar to learn on.

[h2]Profiles[/h2]

Profiles are separate sets of mods. Make one per playstyle — a clean one, a heavily modded one, one
for testing. Switching profiles never touches your game install, so vanilla is always one click away,
and a whole setup shares as a code with no account and no server.

[hr][/hr]

[h2]If something breaks[/h2]

[b]The game starts but no mods load.[/b] Check MelonLoader is installed and that you are not launching
with mods disabled. Its console window says how many mods it loaded.

[b]The game will not start.[/b] Hit [b]Vanilla[/b] in TidePool. If it launches fine unmodded, a mod is
the cause — disable them one at a time with the toggles in [b]Installed[/b].

[b]A mod misbehaves after a game update.[/b] Updates break mods. Check the mod's page for a newer
version before reporting anything.

[b]Sending a log.[/b] MelonLoader writes one to
[i]Surf Sandbox\MelonLoader\Latest.log[/i]. Attach it and we can usually tell you what happened.

[h2]Please do not report modded bugs to nocanwin[/h2]

Surf Sandbox is made by one person. Modded bug reports cost them time on problems they did not cause.
Launch vanilla first to check, and if a mod is at fault bring it to us instead.

[h2]Get help[/h2]

[list]
[*][url=https://discord.gg/RRu3gevbXS]Discord[/url]
[*][url=https://github.com/AttackStudios/tidepool/issues]GitHub issues[/url]
[/list]

TidePool is free and open source, MIT licensed, and not affiliated with nocanwin. Mods are made by
the community — if you build one, come and share it.
