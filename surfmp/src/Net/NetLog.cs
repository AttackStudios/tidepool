using System;

namespace TidePool.SurfMP.Net;

/// <summary>
/// The netcode's only route to a log.
///
/// Deliberately not MelonLogger. Keeping the transport and session free of any
/// game dependency means they can run headless in a test harness, which is how
/// the handshake, peer table and timeouts get exercised without launching Surf
/// Sandbox twice and surfing to find out. Netcode that can only be tested by
/// playing the game is netcode that does not get tested.
/// </summary>
internal static class NetLog
{
    internal static Action<string> Info = _ => { };
    internal static Action<string> Warn = _ => { };
    internal static Action<string> Error = _ => { };
}
