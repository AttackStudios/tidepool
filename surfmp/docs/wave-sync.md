# Will everyone see the same wave?

Yes — but only one design can promise it, and the measurement below is what
rules the other one out.

## The measurement

Two runs on one machine. Same beach, same binary, both started from the ocean's
canonical flat surface (0.9062 across the beach), rider removed so nothing was
forcing the water. 200 samples each, half a second apart.

```
bit-identical samples:  2 / 200
first real divergence:  #25  (t = 12.5s)
mean distance:          1.49x the natural change between samples
```

**Identical for twelve and a half seconds, then it drifts.**

That is on *one PC*. Anything that cannot reproduce itself locally will do
worse across two machines with different CPUs. The likely cause is the job
system: Burst parallelises the solver, and results accumulating in
thread-completion order vary run to run. Nothing a mod can fix.

Getting to this took six attempts, and every failure was the instrument rather
than the game — worth recording, because they are all the same mistake:

| Attempt | What it actually measured |
| --- | --- |
| Surf during both runs | The paddling |
| Do not move | The rider anyway; a board floats |
| Hash the surface | Bit-equality on a half-second grid, blind to phase |
| Press a key to start | When the key was pressed — one run began mid-swell |
| Detect flat water | An unloaded scene, which reads zero everywhere |
| Remove the rider on a keypress | A rider that respawned on reload |

Each fix addressed the symptom and left the flaw: a person was being asked to
hit a mark. The run that worked removes the person — it waits for a surface
that is uniform *and* wet, disables the rider in code at that instant, records a
fixed length, and stops.

## What this rules out

**Lockstep is dead.** Twelve seconds of agreement is nothing against a session
of minutes. Clients cannot each simulate and stay together, no matter how
carefully the inputs are synced.

## What it leaves

**Host-authoritative water.** The host simulates; clients do not simulate at
all. They are given the surface and read it for both what they see and what
they surf. Two clients cannot disagree about a wave neither of them computes.

`SurfaceData` is the seam:

- `bdw : List<List<Vector3>>` — the surface contours, which the renderer draws
- `oc(Vector3) -> Single` — water height at a position, which the character's
  physics asks

Both come off the same data, so replacing the contours on a client should carry
the visuals and the physics together. That matters: overriding only the height
query would leave a rider surfing a wave they cannot see, which is worse than
drifting apart.

Cost is affordable. A 2D slice needs x and y only, quantised to 16 bits: a few
hundred points is roughly 1.6 KB a frame, about 32 KB/s at 20 Hz. Compare the
full fluid volume — 321 x 97 cells, 124 KB a frame — which is what made
broadcasting look impossible earlier. The surface is not the simulation.

Clients also want `FluidSim.Paused` set, so a local simulation is not fighting
the incoming surface or burning a core computing water nobody will see.

## Open

Whether the renderer reads the contours late enough for an overwrite to take,
and whether `oc` derives from them or from the grid underneath. If the physics
reads the grid directly, the override has to go deeper — but the host-authority
principle is unchanged, only the seam moves.

## Drift during a session, and what is done about it

Two clients starting from the same beach load hold together for a while and then
part, with nobody touching anything. That is the twelve-second figure above
playing out over minutes: Burst accumulates in thread-completion order, and a
fluid amplifies any difference.

Correcting on a timer would interrupt play constantly and usually for nothing.
Instead the host publishes eight water heights every five seconds, clients
compare them against their own, and a reload is asked for only once the two have
genuinely diverged — 0.35m RMS, which sits well clear of the 3% of amplitude
that two honest runs differ by anyway, and of the difference riders make by
displacing water on their own client only.

Two consecutive readings are required, so a passing wake never triggers one.

The correction itself is the beach load everyone already shares, so a drift
resync, a joiner arriving and an editor change all end the same way: everybody
reloads together and every generator restarts on one clock.
