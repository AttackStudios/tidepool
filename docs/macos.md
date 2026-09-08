# Surf Sandbox on macOS

nocanwin shipped a Mac build after release. It is a universal `.app` bundle —
Intel and Apple Silicon — using IL2CPP, with the same level format as Windows.

```
<steamapps>/common/Surf Sandbox/
└── SurfSandbox.app/Contents/Resources/Data/StreamingAssets/Levels/*.lvl
```

Nothing about that matches the Windows layout TidePool was written against:
there is no `<Name>_Data` beside a `<Name>.exe`, and the native library is
`GameAssembly.dylib` inside `Contents/Frameworks`. Both shapes are recognised
now.

## What works without a mod loader

**Beaches.** A `.lvl` is a data file, so Break Pack, installing, sharing and the
Beach Manager panel all work on macOS with nothing injected into the game.

## Mods: yes, but through Rosetta

MelonLoader does ship a macOS build, and it does inject — but only into an
**x86_64** process, and its bootstrap dylib is x64-only. An Apple Silicon Mac
runs the game's arm64 slice by default, and an x64 library cannot inject into an
arm64 process.

The game, `UnityPlayer` and `GameAssembly` are all universal, so the way through
is to run the x86_64 slice under Rosetta.

**Not with `arch -x86_64`.** That is a platform binary, and dyld purges every
`DYLD_*` variable before handing control to one — the injection is thrown away
in transit and the game starts unmodded with no error. Measured directly:

```
exec'd straight:        DYLD_INSERT_LIBRARIES survives
through /usr/bin/arch:  DYLD_INSERT_LIBRARIES=(gone)
```

Instead, thin the game binary and run that, so nothing sits in between:

```bash
lipo SurfSandbox -thin x86_64 -output SurfSandbox-x86_64
codesign --force --sign - SurfSandbox-x86_64   # lipo drops the signature
```

TidePool does this itself on "Drop In", which is why that is the route to use
rather than Steam Launch Options.

### Setting it up

1. Extract `MelonLoader.macOS.x64.zip` beside the `.app`, so the folder holds
   `SurfSandbox.app`, `MelonLoader/`, `MelonLoader.Bootstrap.dylib` and
   `melonloader-launch.sh`.
2. Patch the final `exec "$@"` in that script to `exec arch -x86_64 "$@"`.
3. In Steam: Surf Sandbox → Properties → Launch Options:

   ```
   "/full/path/to/Surf Sandbox/melonloader-launch.sh" %command%
   ```

   The path must be absolute — Steam on macOS does not resolve a relative one,
   and fails with a generic launch error that says nothing about why.

Mods go in `<game>/Mods`, exactly as on Windows, and TidePool detects the loader
by its `MelonLoader` folder without needing to know any of the above.

### Why this was in doubt

Three things had to hold, and all three do on this machine:

- **Rosetta is present** and can exec x86_64.
- **Every native binary is universal**, so an x86_64 run is possible at all.
- **The app is adhoc-signed with no hardened runtime**, so
  `DYLD_INSERT_LIBRARIES` is honoured. A hardened runtime would have ended it.

## Where it currently stops

Injection works, and so does the game.

**The game runs fine.** An earlier version of this document said Unity "stalls
about thirty lines into startup". That was wrong, and it sent the investigation
in the wrong direction for a while. The control proves it: launch the thinned
x86_64 binary with *no* MelonLoader at all and it also stops at thirty lines of
stdout — because Unity simply stops writing to stdout after the boot-config
dump. Sampled at that point the game has a window, is burning 126% CPU, and its
main thread is running the ordinary Unity loop into `GameAssembly.dylib`.

What actually fails is MelonLoader's own initialisation:

- `MelonLoader.Bootstrap.dylib` **is** loaded into the process — confirmed with
  `lsof`, which also shows it holding both log files open at zero bytes.
- It spawns an init thread which enters the bootstrap and **spins there
  indefinitely**. Sampling for three seconds put all 2081 samples in the same
  two frames, `Bootstrap+0x1a97c` calling `Bootstrap+0x663c2`, with nothing
  below them.
- No `libhostfxr` or `libcoreclr` is ever loaded, so it never reaches the point
  of starting the .NET runtime.

So the game plays normally while MelonLoader's init thread is wedged beside it,
and the log stays empty because nothing is ever flushed to it.

### The .NET runtime is a real prerequisite, and was missing

Separate from the hang, and worth knowing because it would bite the moment the
hang is fixed: **MelonLoader ships no .NET runtime**, on any platform. Neither
`MelonLoader.x64.zip` nor `MelonLoader.macOS.x64.zip` contains `libhostfxr`,
`libcoreclr` or a `dotnet/` folder. `MelonLoader.runtimeconfig.json` asks for
`Microsoft.NETCore.App` 6.0 with `rollForward: LatestMinor`, which stays inside
major version 6.

This machine had no .NET installed at all. On Windows people usually have it by
accident; on macOS they usually do not.

The runtime must be **x64**, not arm64. The game runs its x86_64 slice under
Rosetta so MelonLoader's x86_64 bootstrap can inject, and an arm64 runtime
cannot be loaded into an x86_64 process — but arm64 is what the ordinary
installer gives you on Apple Silicon. Install it beside, not over:

```bash
curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- \
  --channel 6.0 --runtime dotnet --architecture x64 --install-dir ~/.dotnet-x64
```

TidePool finds that automatically and passes `DOTNET_ROOT` when it launches, and
says so plainly when no suitable runtime exists rather than letting the game
start unmodded in silence.

### The actual root cause, proven

MelonLoader hooks `dlsym` so it can spot the game resolving `il2cpp_init` and
hand back its own detour. On this machine **that hook never fires**, and it is
the whole of the problem.

Turning on `debug_mode = true` in `UserData/Loader.cfg` is what finally made it
visible — the `--melonloader.debug` launch argument does nothing, and with debug
off the log is created and left at zero bytes. The entire log is:

```
[BS DEBUG] Attaching Symbol Redirect...
[BS DEBUG] Plt hooked dlsym successfully
[BS DEBUG] Symbol Redirect Attached!
```

Then it waits forever. The game, meanwhile, does exactly what MelonLoader is
waiting for. A probe dylib injected alongside it, interposing `dlsym` and
`dlopen` through `__DATA,__interpose`, caught all of it:

```
dlopen: .../Contents/Frameworks/GameAssembly.dylib
dlsym: il2cpp_init
dlsym: il2cpp_runtime_invoke
dlsym: il2cpp_method_get_name
... 234 il2cpp_* lookups in total
```

Those three are precisely the symbols `Il2CppLib` wants. Same process, same
symbols, two mechanisms — **dyld interposing catches them, PLT hooking does
not.** PLT hooking does not work in a Rosetta-translated process.

The fix belongs upstream and looks small: use interposing for `dlsym` on macOS,
exactly as `OSXEntry` already does for `setrlimit`. That mechanism is confirmed
working here — an interpose on `setrlimit` fires in this process.

Calling MelonLoader's own `Il2CppHandler.Initialize` from a shim was considered
and rejected: it is a managed NativeAOT method, not an exported entry point, and
invoking it from a foreign native thread is unsupported and more likely to
corrupt than to work.

### What is left

The blocker is upstream. 0.7.3 (May 2026) is the newest release, so there is no
newer build to try. The bug report with the evidence above is written up, and
the probe that demonstrates the difference is reproducible on demand.

`MelonLoader.Installer.MacOS.dmg` is not an alternative: it is only an Avalonia
GUI that downloads the same `MelonLoader.macOS.x64.zip`, with no arm64 bootstrap
of its own.

Whisky is not an alternative either — the repository is archived, Homebrew
disabled the cask in April 2026, and `data.getwhisky.app` now 404s, so it cannot
fetch the Wine runtime it needs. Running the Windows build under CrossOver
remains the only route that sidesteps this entirely.

Note that a system binary is the wrong thing to test injection against — SIP
strips `DYLD_*` for those, so it silently does nothing and looks like a failure
of the loader.
