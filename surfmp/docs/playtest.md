# Running a playtest

Connections go through Valve's relay network. Nobody shares an IP, nobody
forwards a port, and there is no server to keep alive.

## What a tester needs

1. **Surf Sandbox** on Steam.
2. **MelonLoader** — install through TidePool.
3. **SurfMP** — `TidePool.SurfMP.dll` in `<game>/Mods/`.
4. **Two support files**, which TidePool must ship alongside the mod:
   - `Steamworks.NET.dll` in `<game>/UserLibs/` — the **win-x64 runtime** build
   - `steam_api64.dll` in `<game>/` — Valve's native redistributable
5. **The same beach as the host.** There is no beach transfer yet, so a host on
   `[BP] Nazare` needs every tester to have Break Pack installed. Until that
   exists, agree the beach beforehand — a stock one is safest.

## Doing it

**Host:** load a beach, press **F9**. That advertises the session, and a **Join
Game** button appears beside your name in your friends' Steam lists.

**Testers:** load the same beach and either click **Join Game** in Steam, or
press **F10**, which finds any friend who is hosting and joins them. Nobody
types anything.

Not on the host's friends list? The host's ID is written to
`UserData/surfmp-my-id.txt`; put it in your own `UserData/surfmp-join.txt` and
press F10.

**Host, once everyone is in:** press **F6**. Everyone reloads the beach together
and every wave generator starts at the same instant, which is what puts the
whole lineup in the same ocean. Peers land within about 10ms of each other.

**F11** leaves.

## What works, and what does not yet

Working: relayed connections with no IP exposed, surfer positions at 20Hz,
remote surfers rendered as silenced clones of the local character, and
synchronised beach loads.

Not yet:
- **No beach transfer.** A tester without the host's beach cannot join it.
- **Remote riders do not displace water.** Buoyancy and FluidSlicer are disabled
  on clones to stop them surfing on the local player's input, so your ocean is
  not pushed by the other people in it. Oceans will drift apart slightly.
- **No nametags, chat, or kick.**
- **Only one hosting friend is offered.** With several, the first is joined and
  the rest are named in the log. Choosing between them wants a UI.
