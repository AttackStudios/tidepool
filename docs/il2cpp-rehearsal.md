# IL2CPP dress rehearsal

**Goal:** on 25 August, know the toolchain works. Not learn it.

M0 of the SurfMP plan gates everything else: find the wave heightfield, find the
surfer controller. That work assumes a BepInEx 6 IL2CPP setup that has never been
run. This rehearsal removes that assumption while it is still cheap to be wrong.

Do it on the Windows PC. None of it needs Surf Sandbox.

## Pick a target

Any Unity game that ships **IL2CPP** and that you own. Among Us is the usual
choice: small, cheap, and the most documented BepInEx IL2CPP target, so when
something breaks the answer already exists somewhere.

How to tell IL2CPP from Mono, which is the distinction that matters:

| Look for | Backend |
| --- | --- |
| `GameAssembly.dll` next to the exe | **IL2CPP** |
| `<Game>_Data/Managed/Assembly-CSharp.dll` | Mono |

Only the IL2CPP path rehearses anything useful. Mono is the easy case and is not
what nocanwin confirmed.

## The run

1. **Install BepInEx 6 (IL2CPP build) by hand, once.** Doing it manually first
   means that when TidePool does it later you know what correct looks like.
2. **Launch, then quit.** First run generates the interop assemblies — this is
   slow and looks like a hang. Let it finish.
3. **Read `BepInEx/LogOutput.log`.** This is the whole checkpoint. You are looking
   for the interop generation finishing and the plugin loader starting without
   exceptions. If this log is empty, Doorstop never injected and nothing below
   will work — fix that before continuing.
4. **Dump the assemblies** with Cpp2IL or Il2CppDumper. Output is a set of `.dll`
   stubs with real type and method names, which is what makes step 6 possible.
5. **Write the smallest possible plugin.** One `BasePlugin`, one log line in
   `Load()`. Confirm your line appears in `LogOutput.log`. That proves the entire
   chain end to end and is the single most valuable moment of this exercise.
6. **Now do the thing you will do on the 25th.** Open the dumped assemblies in
   ILSpy or dnSpy and answer, for that game:
   - Where is the main gameplay state stored?
   - Is there a `float[]` or `NativeArray<float>` you could read every frame?
   - Could you Harmony-patch the method that updates it?

   You are not modding this game. You are practising the search.

## Done when

- Your own log line appears in `LogOutput.log`
- You have opened a dumped assembly and found a named gameplay class
- You have written down what you had to look up

That last one is the deliverable. On the 25th the difference between fast and slow
is whether the tooling is a known quantity.

## Traps already known

- **Doorstop 3 and 4 use different flag names.** `--doorstop-enable` /
  `--doorstop-target` versus `--doorstop-enabled` /
  `--doorstop-target-assembly`. The wrong pair launches the game **unmodded and
  silent** — no error, just a vanilla game and an empty log. TidePool already
  handles this; a manual run will not.
- **Interop assemblies are tied to the game's Unity version.** A game update can
  invalidate them and the failure reads as unrelated nonsense. Regenerate before
  believing any other error.
- **A missing log is not a plugin problem.** It means injection failed. Do not
  debug the plugin.

## Feed it back

Two things come out of this that are worth keeping:

- **A TidePool bug list.** Install the same BepInEx 6 IL2CPP pack *through
  TidePool* afterwards and compare against the manual install. Everything
  TidePool has been tested against so far is Mono.
- **A sharper M0.** If the wave state turns out to be unreadable on release day,
  the plan says stop and redesign before writing netcode. Having practised the
  search is what lets you make that call on day one instead of day four.
