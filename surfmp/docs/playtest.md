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

**Host:** load a beach, press **F9**. The session is listed publicly straight
away, and a **Join Game** button also appears beside your name for friends.

**Anyone else:** press **F10** for the server list, then click **Join**. No
friendship, no invite, nothing typed.

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
- **Surfers pass through each other**, deliberately. A remote rider used to be a
  solid wall, so someone sitting further inside could pen you in with no way
  past. Two people in the same water costs nothing; being unable to paddle out
  costs the session.
- **No nametags, chat, or kick.**
- **The browser is IMGUI**, not the game's own interface. It works and it lists
  real sessions; it is not pretty.

## Testing alone, with two clients on one machine

Steam addresses peers by Steam ID, and two clients on one PC share one account —
so the relay cannot tell them apart and a Steam join between them never
connects. It is not a fault in the code and does not affect two real people.

To exercise everything else without a second person, hold **shift**:

- **Shift+F9** — host locally, over UDP on 127.0.0.1
- **Shift+F10** — join that local host

Everything above the transport is then exactly what ships: surfer sync, remote
surfers, synchronised beach loads. Only the Steam relay hop is skipped, and that
part is proven separately by the session listing publicly.

## Watching two riders take the same wave

Two clients share one keyboard, so only the focused window responds — which
makes the most interesting case, two people on one wave, the hardest to see.

The game ships an AI surfer, `Surf.Character.AutoSurf`, with real turn and popup
parameters. **F7** switches it on for that client:

1. Both clients in a session, same beach.
2. In the client you are not driving, press **F7** — its rider starts surfing.
3. Focus the other window and paddle out alongside it.

A genuine second surfer catching genuine waves, rather than a puppet replaying
canned positions. F7 again takes control back.
