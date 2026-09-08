# Getting MelonLoader further on macOS

Not a finished fix. This is how far the macOS Il2Cpp path can be pushed, and
exactly where it still stops — kept because it took a day to find and the next
person (probably us) should not repeat it.

MelonLoader's own author sets expectations in the PR that added macOS support:
*"expect EXCELLENT mono support and don't expect much for il2cpp"*.

## Where it stops without any of this

MelonLoader loads, writes its config, opens a log — and writes nothing to it.
The default `debug_mode = false` hides the only output there is, and the
`--melonloader.debug` launch argument does not work on macOS, so
`UserData/Loader.cfg` has to be edited by hand. With debug on, the whole log is:

```
[BS DEBUG] Attaching Symbol Redirect...
[BS DEBUG] Plt hooked dlsym successfully
[BS DEBUG] Symbol Redirect Attached!
```

Then nothing, forever, while the game runs on unmodded.

## Why

MelonLoader PLT-hooks `dlsym` in `UnityPlayer.dylib` to catch the game resolving
`il2cpp_init`. On Apple Silicon the game runs its x86_64 slice under Rosetta so
the x64 bootstrap can inject — and in a translated process **the PLT hook never
fires**, though `plthook_replace` reports success.

Measured on Surf Sandbox (Unity 6000.3.22f1): `UnityPlayer.dylib` makes **234
`il2cpp_*` lookups** through `dlsym`, `il2cpp_init` among them, and the hook sees
none of them. A dyld interpose on the same symbol in the same process catches
every one. The module targeting is not the problem — all 234 calls come from
`UnityPlayer.dylib`, which is exactly what MelonLoader opens.

## What is here

- **`melonloader-export-detour.patch`** — against MelonLoader v0.7.3. Stops
  PLT-hooking on macOS and exports the existing `SymbolDetour` as
  `MelonSymbolDetour` so something else can drive it. No redirect logic changes.
- **`mlshim.c`** — a small library that interposes `dlsym` and forwards the
  symbols MelonLoader cares about to that export.

Three things had to be right, each of which silently produced "nothing happens":

1. **The interpose must live in its own library.** Interposing `dlsym` from
   inside MelonLoader's own dylib does not fire, even though its `setrlimit`
   interpose in the same source file does.
2. **The shim must not be code-signed.** Ad-hoc signing it stops the interpose
   firing at all. Unsigned works.
3. **It needs a re-entrancy guard.** MelonLoader's detour resolves the real
   symbol with `dlsym` itself, and that call gets interposed too — so without a
   per-thread guard it recurses forever, handing `il2cpp_init` to the detour over
   and over.

## Building it

```bash
# .NET 9 SDK for the bootstrap, and a .NET 6 x64 runtime for it to host.
# x64 matters: the game runs x86_64 under Rosetta and an arm64 runtime cannot
# load into that process.
./dotnet-install.sh --channel 9.0 --architecture arm64 --install-dir ~/.dotnet
./dotnet-install.sh --channel 6.0 --runtime dotnet --architecture x64 \
  --install-dir ~/.dotnet-x64

git clone --branch v0.7.3 --recurse-submodules \
  https://github.com/LavaGang/MelonLoader.git
cd MelonLoader && git apply .../melonloader-export-detour.patch
dotnet restore MelonLoader.Bootstrap/MelonLoader.Bootstrap.csproj -r osx-x64
dotnet build MelonLoader.Bootstrap/MelonLoader.Bootstrap.csproj --no-restore \
  -p:Platform=x64 -p:ForceRID=osx-x64 -p:Version=0.7.3 -c Release \
  -p:SolutionDir=$PWD

clang -arch x86_64 -dynamiclib -o mlshim.dylib mlshim.c   # do NOT codesign
```

Then launch with the shim ahead of the bootstrap:

```bash
DYLD_INSERT_LIBRARIES="/path/to/mlshim.dylib:$GAME/MelonLoader.Bootstrap.dylib" \
DYLD_LIBRARY_PATH="$GAME" \
DOTNET_ROOT="$HOME/.dotnet-x64" \
  "$GAME/SurfSandbox.app/Contents/MacOS/SurfSandbox-x86_64"
```

## How far that gets

Considerably further — from nothing at all to the managed loader starting:

```
Redirecting il2cpp_init
Redirecting il2cpp_runtime_invoke
In init detour
Using .NET runtime: '~/.dotnet-x64'
Initializing domain
Loading NativeHost assembly
Invoking NativeHost entry
```

## Where it stops now

At `Invoking NativeHost entry`, with `SIGABRT` about a second later. The crash
report shows `abort` ← `PROCAbort` ← `DispatchManagedException` ←
`RuntimeMethodHandle::InvokeMethod`: an **unhandled managed exception** inside
`BootstrapInterop.Initialize`, on the other side of an `UnmanagedCallersOnly`
boundary, which is why the runtime aborts rather than reporting it.

The message has not been recovered. `ConsoleHandler.NullHandles()` closes stdout
and stderr unless `capture_player_logs = true`, and turning that on did not
surface it either.

That is the next thing to chase, and it is plausibly the Il2Cpp flakiness the
author warned about rather than anything specific to this setup.
