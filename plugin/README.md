# TidePool plugin for Surf Sandbox

The game's break select is a **map of Oahu with markers authored in the scene**,
not a list built from the Levels folder. `Surf.UI.Map` holds
`LocationButtonsRoot`, paging buttons and a `List<RectTransform>`;
`Surf.UI.MapLocationButton` has no fields at all. So a custom `.lvl` dropped
into the folder is a file the game never looks for.

Nothing outside the process can fix that. The current selection lives only in
memory — no PlayerPrefs key, no config file — which is why TidePool cannot
launch you into a beach either.

Hence a plugin.

## Building

BepInEx must have run **once** against the game before this compiles: the
interop assemblies it references are generated on first launch and are specific
to this build.

    dotnet build -c Release

Override the game location if it is elsewhere:

    dotnet build -c Release -p:GameDir="D:\SteamLibrary\steamapps\common\Surf Sandbox"

Copy the output DLL into `<game>/BepInEx/plugins/`.

## Where this is going

1. **Loads at all** — a line in `LogOutput.log`. Everything is downstream of it.
2. **Sees the levels** — read the folder, report which are custom.
3. **Adds map markers** for custom levels, so Break Pack becomes reachable.
4. **Launch into a chosen beach**, so TidePool can hand off a selection.
5. **Report the wave buffers** — which of `Surf.m`'s 22 `NativeArray<float>`
   fields is the surface heightfield. SurfMP's M0 is blocked on exactly this,
   and the names are obfuscated, so only runtime inspection answers it.
