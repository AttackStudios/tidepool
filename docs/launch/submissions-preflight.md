# Before you send any submission

Thunderstore, Nexus and GameBanana all gate on the same thing: are there real
mods, ready now. Being first is worth a lot, but a claim that turns out to be
false is the one thing that could genuinely cost you the community — so this
page is the gate between "written" and "sendable".

## Three facts that must be true first

Every submission asserts these. None of them is verified as of 23 August.

1. **BepInEx 6 (IL2CPP) actually loads on Surf Sandbox.** Not "should" — you have
   seen your own log line in `BepInEx/LogOutput.log`. Until then
   `{{LOADER_STATUS}}` in the Thunderstore request stays unfilled.
2. **No anti-cheat or third-party DRM.** The store page mentions none, and Steam
   requires third-party anti-cheat to be disclosed there, so this is very likely
   — but confirm against the install before asserting it.
3. **At least one real mod exists and is downloadable.** A packaged BepInEx
   loader counts as one. It needs a public URL before you file anything.

## Placeholders, and where the values come from

| Placeholder | Value |
| --- | --- |
| `{{RELEASE_URL}}` | The v1.0.0 GitHub release page |
| `{{TIDEPOOL_VERSION}}` | `1.0.0` |
| `{{DISCORD_INVITE}}` | `https://discord.gg/RRu3gevbXS` — already filled in |
| `{{LOADER_STATUS}}` | Written only after fact 1 is verified |
| `{{FIRST_MOD_NAME}}` | See below |

## What the first mod should be

**Break Pack** is the strongest candidate and it is nearly done. Nine real
breaks, including Pleasure Point measured from NOAA CUDEM soundings rather than
described. The game's own feature list is "Design: name your spot, restore the
reef, and make your break unique" — so a pack of real-world breaks lands exactly
where the game already invites content.

The only unknown is the beach file format, which `tools/build-breaks.mjs`
deliberately stops short of. Mapping nine validated profiles onto a known schema
is an afternoon; the research behind them does not change.

If the format turns out to be awkward, the fallback is the packaged BepInEx
loader on its own. That satisfies "mods ready for immediate upload" by itself.

## Order

1. Tag `v1.0.0`. Everything below needs that URL.
2. Verify the three facts.
3. **GameBanana first** — fastest to accept a brand-new game, so it plants a flag
   while the others queue.
4. **Thunderstore** — post in `#game-requests` on their Discord, matching their
   template. Their bar is met by a live release link.
5. **Nexus** — via the mod upload flow, ADD NEW GAME.
6. **Steam guide** — post last, once the links above resolve, because it is the
   one every day-one player will actually see.

Steam's guide is the highest-leverage of the four and the only one nobody has to
approve. If a day goes badly, do that one.
