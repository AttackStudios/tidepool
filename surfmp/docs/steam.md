# Steam Datagram Relay

Surf Sandbox ships **no Steam integration** — no `steam_api64.dll`, no
Steamworks assemblies. SurfMP brings its own, initialised against the game's app
id (`4480760`), which is legitimate: the player owns the game and it is already
running under Steam.

## Why bother

Connections must not involve anyone's IP address, and nobody should have to
configure a router. Datagram Relay gives exactly that — peers address each other
by Steam ID, Valve's network carries the packets, and invites can go through the
friends list instead of a code someone types. No server to run, nothing to pay
for.

## The two files

| File | Where | Which one |
| --- | --- | --- |
| `Steamworks.NET.dll` | `<game>/UserLibs/` | The **runtime** assembly, copied from `runtimes/win-x64/` **by path** |
| `steam_api64.dll` | `<game>/` | Valve's native redistributable |

Both are easy to get wrong, and each cost a launch:

**The reference stub.** Without a `RuntimeIdentifier` the build copies the
package's *reference* assembly (307 KB). MelonLoader refuses it — "cannot load a
reference assembly for execution" — and the mod loads with its Steam dependency
unresolved and no `[steam]` line in the log at all. Setting
`<RuntimeIdentifier>win-x64</RuntimeIdentifier>` picks the real one.

**The wrong native version.** `steam_api64.dll` is bundled with most Steam games,
but versions differ and its `FileVersion` is Valve's internal numbering, not the
SDK version — picking the highest gave a CS2 build missing
`SteamAPI_ISteamClient_GetISteamGameSearch`, and an older one was missing
`SteamInternal_SteamAPI_Init`. Do not sort by version. Search for the exports
instead:

```powershell
Get-ChildItem 'C:\Program Files (x86)\Steam\steamapps\common' -Filter 'steam_api64.dll' -Recurse |
  ForEach-Object {
    $s = [Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes($_.FullName))
    if ($s.Contains('SteamInternal_SteamAPI_Init') -and
        $s.Contains('SteamAPI_ISteamClient_GetISteamGameSearch')) { $_.FullName }
  }
```

Shipping it with the mod needs settling before release — it is Valve's
redistributable and is bundled with games routinely, but a mod is not a game.

## Testing it

Not over SSH. Steam's IPC pipe is per-session: an SSH command runs in session 0
while Steam runs on the desktop, so a standalone probe reports "Steam is
probably not running" while Steam is plainly running. It has to run inside the
game.

## Installing the mod after the RID change

`<RuntimeIdentifier>win-x64</RuntimeIdentifier>` moves the build output to
`bin/Release/win-x64/`, and the old `bin/Release/` copy stays behind. An install
that takes the **first** match found by a recursive search silently picks the
stale one — a whole test ran against a version three builds old, hosting on UDP
while the log cheerfully reported Steam had signed in.

Always sort by `LastWriteTime` and take the newest:

```powershell
Get-ChildItem "$env:USERPROFILE\tidepool-recon\surfmp\bin\Release" -Filter 'TidePool.SurfMP.dll' -Recurse |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
```

The give-away is the log's `SurfMP vX.Y.Z` line disagreeing with what was just
built. Check it whenever a change appears to have had no effect.

## Never pick Steamworks.NET.dll by size

The package ships several builds and they are within a kilobyte of each other:
`win-x64` is 379 KB and `win-x86` is 380 KB. Sorting by size and taking the
largest installs the 32-bit assembly, which fails with a FileLoadException that
names only the assembly and not the reason — and takes the whole Steam
initialisation down with it.

Copy it from `runtimes/win-x64/lib/netstandard2.1/` by explicit path. The
reference stub under `ref/` is 307 KB and is also wrong, but at least says so.

## Installing while the game is running

`Stop-Process -Force` returns before Windows has released the file handle, so a
`Copy-Item` in the same breath fails and leaves the old DLL in place. It does
not error — the install reports the source it *meant* to copy, and the game then
loads the previous build.

Sleep after killing, and verify the destination afterwards:

```powershell
Get-Process SurfSandbox -EA SilentlyContinue | Stop-Process -Force
Start-Sleep 3
Copy-Item $newest '<game>\Mods\TidePool.SurfMP.dll' -Force
(Get-Item '<game>\Mods\TidePool.SurfMP.dll').LastWriteTime   # must match $newest
```

Twice now a whole test has run against a stale build — once from this, once from
the RID moving the output directory. The symptom is always the same: the change
appears to do nothing, with no error anywhere. Check the log's `SurfMP vX.Y.Z`
against what was just built before believing any negative result.
