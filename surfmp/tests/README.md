# Netcode harness

Runs the real `Session` and `UdpTransport` over localhost sockets and checks
what arrives. No game, no Unity, no MelonLoader — about two seconds end to end.

```
dotnet run -c Release --project tests
```

`Session` and the transport deliberately have no game dependency; they talk to
`NetLog`, which the mod points at MelonLogger at startup and the harness points
at the console. That separation is the only reason these checks can exist, and
it is worth preserving: netcode that can only be tested by launching Surf
Sandbox twice and surfing is netcode that does not get tested.

Covered: the handshake and peer table, a client learning about a later joiner,
version refusal and its reason, host relay, timeout of a peer that dies without
a goodbye, and malformed packets.

The timeout check crosses the threshold by passing `Pump` a clock reading eight
seconds ahead rather than waiting — hence `Pump(float now)` taking the time
instead of reading it.
