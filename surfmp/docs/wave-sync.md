# Will everyone see the same wave?

Short answer: **not by default, and not for long.** Same ocean in character —
same period, same set rhythm, same break shape — but not the same wave at the
same instant. Anyone expecting to drop in together on one peak would notice.

This corrects an earlier, breezier claim that clients would simply "grow the
same sea". They grow the same *kind* of sea. Staying in step is extra work.

## Why it drifts

Ordered by how certain each one is.

**1. Riders push the water back.** The most important reason, and structural
rather than numerical. `Character.FluidSlicer`, `Character.Buoyancy`,
`Fx.WakeFx` and `Prop.FollowFluidSlicer` all say the surfer perturbs the fluid.
Each client only has its *own* player physically in its simulation, so client A's
ocean is being shoved by A's board and client B's by B's. Two different sets of
forces on two copies of a fluid produce two different oceans, and no amount of
float care fixes that. It is a modelling difference, not a rounding one.

**2. FLIP is chaotic.** `FlipRatio`, `Density`, `NumParticleIterations` and
`SeparateParticles` mark this as particle-based. Particles push the grid and the
grid moves the particles, so any difference — one bit in one cell — grows
instead of fading. Chaotic systems do not forgive small errors, they multiply
them.

**3. Burst may not agree across machines.** Same binary is not the same maths:
Burst picks SIMD paths by CPU features, and an AVX2 machine can produce results
an SSE4 one does not. Fine on one PC, not guaranteed between two.

**4. Timestep.** `FluidSim` exposes `FPS` and `UpdateSpeed` and steps in
`FixedUpdate`, which is the good case. But if the number of substeps ever
depends on frame rate, machines diverge the moment one of them stutters.

**5. Seed and phase.** `Lull` implies gaps between sets, which implies
randomness, which implies a seed. The constructor takes an int alongside its
five floats — a likely candidate. And a client joining mid-session starts from a
different point in the cycle unless elapsed sim time is synced too.

## What would keep them together

- **Put every rider in every simulation.** Since positions are already synced,
  remote surfers can drive fluid interaction locally. This means undoing part of
  what `RemoteSurfer.Silence` currently does: it disables *all* `Surf`
  behaviours on a clone, which is right for movement and input but wrong for
  `FluidSlicer` and `Buoyancy`. Those want re-enabling and feeding from network
  position. Necessary for shared waves, and not sufficient alone.
- **Sync seed, parameters and elapsed sim time on join.** Cheap, obvious, and
  worth doing regardless.
- **Correct periodically from the host.** Not the surface — that is the 124 KB
  a frame this design exists to avoid — but the generator's phase and state,
  which is small. Nudges clients back before drift becomes visible.
- **Pin the timestep** so the simulation never depends on frame rate.

## How to find out for real

Do not reason about this further; measure it. Both clients checksum the same
surface region every second and log it. Identical means it holds; diverging
means it does not, and the log shows how fast. `Surf.m`'s grid is reachable by
reflection, so this is an afternoon, not a project.

Run it three ways: two instances on one machine, two machines, and again with
one rider actually surfing — reason 1 predicts that last one diverges fastest,
and that prediction is worth testing because it decides how much of the rest
matters.

## If it cannot be fixed

Waves stay local and only surfers sync. Everyone gets their own ocean and sees
everybody else paddling, riding and wiping out in it. Positions are real,
conversation is real, the session is real; two people simply are not reliably
on the same peak.

That still delivers what people came for, which is each other — and it is the
honest fallback rather than a promise of shared waves that quietly is not true.
