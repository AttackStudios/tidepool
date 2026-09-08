# External Beach Support

The game's break select is a **map of Oahu with markers authored in the scene**,
not a list built from the Levels folder. `Surf.UI.Map` holds
`LocationButtonsRoot`, paging buttons and a `List<RectTransform>`;
`Surf.UI.MapLocationButton` has no fields at all. So a `.lvl` in the folder that
the game did not ship is a file it never looks for.

That covers more than installed packs. The game writes the player's own saved
beaches into the same folder and then never offers them again either.

Nothing outside the process can fix this. The current selection lives only in
memory — no PlayerPrefs key, no config file — which is why TidePool cannot
launch you into a beach from outside either.

Hence a mod. It adds a marker for **every beach that is not one of the shipped
sixteen**, labelled, in columns beside the island.

## Layout

Entries use a fixed vertical pitch and wrap into further columns rather than
being spread evenly across the island's height. Spreading works for nine beaches
and turns into overlapping text at thirty. Labels are right-aligned, pivot on
their right edge so long names grow away from the island, sit in a fixed-width
box, and are truncated past twenty characters — so a name can never reach the
column beside it.

Display names are tidied: a `[BP] ` pack prefix and the game's own `_User`
suffix are filing rather than names, and underscores become spaces.

## Finding the marker list

The map's `List<RectTransform>` of markers is found **by type, not by name**.
It was `map.xl` until a game update renamed it, and the map silently stopped
showing external breaks — a `MissingMethodException` on a property that no
longer exists. These names churn with every patch. There is exactly one
`List<RectTransform>` on the type, so its shape identifies it far more durably.

## Building

MelonLoader must have run **once** against the game before this compiles: the
interop assemblies it references are generated on first launch and are specific
to that build.

```bash
dotnet build -c Release
```

The game folder defaults to the usual Steam location on Windows and macOS;
override with `-p:GameDir=...` if yours is elsewhere.

Drop `bin/Release/ExternalBeachSupport.dll` into the game's `Mods` folder, or
install it from TidePool's Essentials list.

## macOS

Works, but the loader needs setting up first — MelonLoader does not run on
Apple Silicon out of the box. See `tools/melonloader-macos/` in this repository.
