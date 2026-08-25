# What the game actually looks like

Read straight off `Assembly-CSharp.dll` with `tools/TypeDump` — no game launch
required. Full dump in `game-types.txt`.

```
dotnet run -c Release --project tools/TypeDump -- \
  "<game>/MelonLoader/Il2CppAssemblies/Assembly-CSharp.dll" Surf
```

## The lesson

Only `Surf.m` is obfuscated. Everything else is plainly named, and nine surf
sessions went into reverse-engineering `m`'s 22 anonymous buffers while
`Surf.Sim.Wave` and `Surf.Game.Manager` sat next to it fully readable.

Read the metadata before instrumenting the runtime. A probe answers one
question per launch and needs a person to go surfing; the assembly answers
every question at once, offline, in two seconds.

## The parts that matter

`Surf.Game.Manager` is the root and holds a reference to everything else:
`State`, `Levels`, `FluidSim`, `FluidRenderer`, `SurfaceData`, `TurbulenceData`,
`Wave`, and **`PlayerCharacter`**.

| Type | Carries |
| --- | --- |
| `Sim.Wave` | `Period`, `Lull`, `Curve`, `RightWave`, `LeftWave` — the generator's inputs |
| `Sim.FluidSim` | FLIP settings: `SimWidth/Height/Resolution`, `Gravity`, `FlipRatio`, `Density`, `InitialWaterHeight`, `InitialGroundHeight`, `LeftWallX`, `RightWallX`, `Paused`, plus `WaterHeightChanged` / `GroundHeightChanged` events |
| `Character.Movement` | The surfer: `DuckDive`, `Kickout`, `Wipeout`, `Reset`, and its force/limit tunables |
| `Character.Controls` | Input: `Move`, `Jump`, `Boost`, `Stall`, `Snap`, `Popup`, `Air`, `DuckDive` |
| `Level.LevelFile` | `GroundHeights`, `Swell`, `Tide` — matching the `.lvl` format |

## Consequences for SurfMP

**The wave cannot be broadcast.** It is a FLIP particle simulation over a
321 x 97 grid — `Surf.m`'s ten 31137-float buffers. That is 124 KB a frame, or
2.5 MB/s per peer at 20 Hz, against the plan's estimate of 40 KB/s. The plan
was out by sixty times, and `Surf.m` never held a heightfield to send.

**So sync the generator, not the water.** `Sim.Wave` exposes the handful of
parameters the ocean is built from, and `LevelFile` supplies the rest. Hand a
client those plus the level and a shared clock and it grows the same sea for a
few bytes on join.

Determinism across machines is unproven and is the next thing to test: FLIP is
particle-based, and Burst float behaviour needs checking before anything is
built on it. If it drifts, the fallback is to keep waves local and sync only
surfers — which still delivers the session, because what people came for is
each other.
