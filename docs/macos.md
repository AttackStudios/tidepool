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

Injection works. Launching the thinned binary with `DYLD_INSERT_LIBRARIES` set
gets MelonLoader's bootstrap running inside the game — it creates its own
timestamped log file, which nothing else would do.

It then writes nothing to that log, and Unity stalls about thirty lines into
startup. So the bootstrap loads and its initialisation does not complete.
MelonLoader's macOS support for IL2CPP is young, and that is the next thing to
chase — not the injection, which is settled.

Note that a system binary is the wrong thing to test against — SIP strips
`DYLD_*` for those, so the injection silently does nothing and looks like a
failure of the loader.
