using MelonLoader;

[assembly: MelonInfo(typeof(TidePool.SurfMP.Mod), "SurfMP", "0.28.0", "AttackStudioYT")]
[assembly: MelonGame("nocanwin", "SurfSandbox")]

namespace TidePool.SurfMP;

/// <summary>
/// Multiplayer for Surf Sandbox.
///
/// Host-authoritative by design: the host simulates the wave and broadcasts it,
/// so everyone provably sees the same ocean rather than two machines hoping
/// their float maths agrees. Surfers are simulated locally and synced, because
/// input has to feel instant.
///
/// This milestone does none of that. It answers the question the whole design
/// rests on — can the wave surface be read at all, cheaply enough to send
/// twenty times a second — because if it cannot, the plan changes before a line
/// of netcode is written.
/// </summary>
public class Mod : MelonMod
{
    internal static MelonLogger.Instance Log = null!;

    public override void OnInitializeMelon()
    {
        Log = LoggerInstance;
        Log.Msg("SurfMP 0.25.0 — F6 calls a synchronised beach load.");
        Sync.GameHook.Install(HarmonyInstance);
        Net.SteamRelay.Start();

        // The netcode has no game dependency, so that it can be tested headless.
        // This is where it gets one.
        Net.NetLog.Info = Log.Msg;
        Net.NetLog.Warn = Log.Warning;
        Net.NetLog.Error = Log.Error;
    }

    /// <summary>Cheap: a float compare until the simulation exists.</summary>
    public override void OnUpdate()
    {
        var dt = UnityEngine.Time.deltaTime;
        var now = UnityEngine.Time.time;

        Sync.WaveParams.Capture();
        Sync.LocalSurfer.Tick(dt);

        // Packets arrive on the socket thread and are queued; this is where they
        // get handled, because Unity's API is main-thread-only.
        Net.SteamRelay.Tick();
        SessionControl.Lobby.Tick(now);
        Sync.SurferSync.Tick(dt, now);
        Sync.WaveSync.Tick(now, Sync.SurferSync.Session);
        Sync.WaveSync.Observe(now);
        Sync.BeachSync.Tick(now);
    }

    /// <summary>Say goodbye rather than leaving peers to time us out.</summary>
    public override void OnApplicationQuit()
    {
        SessionControl.Lobby.Leave();
        Net.SteamRelay.Stop();
    }
}
