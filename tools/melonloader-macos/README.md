# Code mods on macOS

**This works.** MelonLoader loads, generates IL2CPP interop assemblies, and runs
mods on Apple Silicon — verified on Surf Sandbox (Unity 6000.3.22f1, Il2Cpp,
macOS 26.2, M1):

```
MelonLoader v0.7.3 Open-Beta
Game Type: Il2cpp
[TidePool] HarmonyInit PatchAll: TidePool.SurfMod.MapStartPatch
[TidePool] TidePool mod loaded.
```

123 interop assemblies generated, Steamworks among them.

Getting there needed six separate fixes. Each failed silently, and several
looked identical from outside — an empty log and a game that runs unmodded.
They are written up here so none of it has to be rediscovered.

## 1. The shipped macOS assemblies behave as though built for Windows

The biggest one. `MelonLoader.dll` in `MelonLoader.macOS.x64.zip` calls
`kernel32!GetProcAddress`, and `Il2CppAssemblyGenerator.dll` asks GitHub for
`Cpp2IL-<version>-OSX.exe`, which 404s — the real asset has no `.exe`.

Both are correctly guarded by `#if WINDOWS` in source, so the fix is simply to
build the solution for `osx-x64` yourself.

## 2. The PLT hook on `dlsym` never fires under Rosetta

MelonLoader PLT-hooks `dlsym` in `UnityPlayer.dylib` to catch the game resolving
`il2cpp_init`. `plthook_replace` reports success and the hook then never fires.
Measured: `UnityPlayer` makes **234 `il2cpp_*` lookups** and the hook sees none.
A dyld interpose on the same symbol catches every one. All 234 calls come from
`UnityPlayer.dylib`, so the module targeting was never the problem.

`melonloader-export-detour.patch` stops PLT-hooking on macOS and exports
MelonLoader's existing detour as `MelonSymbolDetour`. `mlshim.c` interposes
`dlsym` and forwards to it. No redirect logic is reimplemented.

Three traps inside this one:

- **The interpose must live in its own library.** Interposing `dlsym` from
  inside MelonLoader's own dylib does not fire, though its `setrlimit` interpose
  in the same source file does.
- **The shim must not be code-signed.** Ad-hoc signing stops it firing entirely.
- **It needs a re-entrancy guard.** The detour resolves the real symbol with
  `dlsym` itself, which gets interposed too, so without a per-thread guard it
  recurses forever.

## 3. MelonLoader needs a .NET 6 runtime, and it must be x64

Neither archive ships one. The game runs its x86_64 slice under Rosetta so the
x64 bootstrap can inject, so the runtime it hosts must be **x64** — an arm64
runtime cannot load into that process, and arm64 is what the ordinary installer
gives you on Apple Silicon.

## 4. The game path is derived from the first inserted library

Leave the shim outside the game and MelonLoader reports
`Game::BasePath = ~/.claude/jobs`. Put it next to the game binary in
`Contents/MacOS/` and the paths come out right.

## 5. The executable name loses its last three characters

`SurfSandbox-x86_64` reaches Cpp2IL as `--exe-name "SurfSandbox-x86"`, and
`SurfSandboxRosetta` becomes `SurfSandboxRose`. Renaming around it is futile.
Make the thinned binary *be* `SurfSandbox`, replacing the original.

## 6. Cpp2IL cannot read a universal Mach-O

`Using binary type Universal Mach-O File` then
`NotSupportedException: Stream does not support writing`. This is what the
MelonLoader macOS PR warns about. Thin `GameAssembly.dylib` (and
`UnityPlayer.dylib`) to x86_64 and it reads them fine.

**This makes the game x86_64-only.** It no longer runs its arm64 slice, so a
plain Steam launch runs the same translated build. Keep the originals.

## The recipe

```bash
# Toolchain: .NET 9 SDK to build, .NET 6 x64 runtime for MelonLoader to host.
./dotnet-install.sh --channel 9.0 --architecture arm64 --install-dir ~/.dotnet
./dotnet-install.sh --channel 6.0 --runtime dotnet --architecture x64 \
  --install-dir ~/.dotnet-x64

# Build MelonLoader for macOS, patched.
git clone --branch v0.7.3 --recurse-submodules \
  https://github.com/LavaGang/MelonLoader.git && cd MelonLoader
git apply .../melonloader-export-detour.patch
dotnet restore -r osx-x64
dotnet build --no-restore -p:Platform=x64 -p:ForceRID=osx-x64 \
  -p:Version=0.7.3 -c Release

# Install over the shipped MelonLoader, keeping Mods/ and UserData/.
cp -R Output/Release/osx-x64/MelonLoader "$GAME/MelonLoader"
cp Output/Release/osx-x64/MelonLoader.Bootstrap.dylib "$GAME/"

# The shim, beside the game binary, unsigned.
clang -arch x86_64 -dynamiclib \
  -o "$GAME/SurfSandbox.app/Contents/MacOS/mlshim.dylib" mlshim.c

# x86_64 everywhere: the executable (keeping its name) and the frameworks.
cd "$GAME/SurfSandbox.app/Contents"
lipo MacOS/SurfSandbox -thin x86_64 -output /tmp/sb && mv /tmp/sb MacOS/SurfSandbox
lipo Frameworks/GameAssembly.dylib -thin x86_64 -output /tmp/ga
mv /tmp/ga Frameworks/GameAssembly.dylib
lipo Frameworks/UnityPlayer.dylib  -thin x86_64 -output /tmp/up
mv /tmp/up Frameworks/UnityPlayer.dylib
codesign --force --sign - MacOS/SurfSandbox Frameworks/*.dylib
# Sign before placing the unsigned shim: codesign refuses a bundle containing it.
```

Launch:

```bash
cd "$GAME"
DYLD_INSERT_LIBRARIES="$GAME/SurfSandbox.app/Contents/MacOS/mlshim.dylib:$GAME/MelonLoader.Bootstrap.dylib" \
DYLD_LIBRARY_PATH="$GAME" \
DYLD_FALLBACK_LIBRARY_PATH="$GAME:/usr/local/lib:/usr/lib" \
DOTNET_ROOT="$HOME/.dotnet-x64" \
  "$GAME/SurfSandbox.app/Contents/MacOS/SurfSandbox"
```

`DYLD_FALLBACK_LIBRARY_PATH` matters because Cpp2IL runs as a child process and
inherits the injection, so the bootstrap tries to load itself there by bare name.

First launch takes a few minutes to generate assemblies. Set
`debug_mode = true` in `UserData/Loader.cfg` to see anything at all — the
`--melonloader.debug` argument does not work on macOS.

## Still worth reporting upstream

Items 1, 2 and 5 are upstream bugs and none look hard to fix. Item 2 in
particular is small: `OSXEntry` already interposes `setrlimit`, so routing
`dlsym` the same way uses a mechanism that is already there and known to work.
