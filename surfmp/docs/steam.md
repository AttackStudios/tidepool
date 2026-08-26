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
| `Steamworks.NET.dll` | `<game>/UserLibs/` | The **runtime** assembly, `runtimes/win-x64/` in the NuGet package — 379 KB |
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
