# Laggy, and surfers desyncing — where to start

Reported after a real session: constant hitching and riders drifting out of
sync, "miserable to play". Not yet confirmed against logs; the machine was off.
Written down so tomorrow starts from a hypothesis rather than from scratch.

## Most likely cause: everything is cached across a beach reload

Three things now trigger a beach reload — somebody joining, an editor change,
and drift being detected. Each destroys and recreates the level and the player.

Nothing re-locates afterwards. Every service caches what it found and latches
`_looked = true` permanently:

| File | Cached | What happens after a reload |
| --- | --- | --- |
| `LocalSurfer` | `_transform`, `Template` | The player is recreated, so both point at destroyed objects. Unity's `!= null` is false for those, so `Found` goes false, **the local rider stops being sent**, and everyone else sees them frozen |
| `RemoteSurfer` | clones of `Template` | Cloned from a destroyed object |
| `WaveSync` | `_surfaceData` | Height reads return 0, so drift looks enormous |
| `BeachSync` | `_levels`, `_fluidSim` | Ground samples stop changing, or throw |

If that is right, it is self-reinforcing and explains both symptoms at once:
the first reload breaks position sending (desync), `WaveSync` then reads zero
heights and calls it drift, which triggers another reload, which is the
hitching.

**Check first:** count `beach] loaded` in one session's log. More than a couple
and this is it.

## Fix

Re-locate whenever the cached object dies rather than latching a flag. Unity's
destroyed objects compare equal to null, so the test is already available — it
just has to be applied every time rather than once:

```csharp
if (_transform == null) Locate()   // not: if (!_looked)
```

And `_looked` should mean "looked recently", not "looked once, ever".

## Second suspect: the drift threshold

0.35m RMS was chosen from a measurement taken with **no rider in the water**.
Two people surfing displace water on their own client only — buoyancy is
disabled on clones — so real sessions are noisier than the measurement that set
the threshold, and it may be firing on normal play.

Worth logging the measured distance every time rather than only when it trips,
so the real distribution during a session is visible before the number is
changed again.

## Third: reloads may be too blunt a correction

Even correct, a full beach reload mid-session is disruptive. If drift is real
and frequent, the answer may be to accept small drift rather than to correct it
— two people on slightly different waves is worse than a hitch only if the
difference is visible, and 3% of amplitude is not.
