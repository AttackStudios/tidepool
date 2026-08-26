using System;
using System.IO;
using Steamworks;

namespace TidePool.SurfMP.Net;

/// <summary>
/// Brings Steam to a game that has none.
///
/// Jack's requirement is that nobody hands out an IP address and nobody
/// configures a router. Steam Datagram Relay does exactly that: peers address
/// each other by Steam ID and Valve's relay network carries the packets, so an
/// IP is never exposed on either side. It also means invites can go through the
/// friends list rather than a code someone has to type.
///
/// Surf Sandbox ships no Steamworks, so this initialises its own against the
/// game's app id — legitimate because the player owns the game and it is
/// already running under Steam.
///
/// This step only establishes whether that works. Steam's IPC pipe is
/// per-session, so it cannot be tested over SSH from outside the desktop; it
/// has to run where the game runs, which is here.
/// </summary>
internal static class SteamRelay
{
    private const uint AppId = 4480760;

    internal static bool Ready { get; private set; }

    /// <summary>This player's Steam ID — what someone else needs in order to join.</summary>
    internal static ulong SelfId { get; private set; }

    internal static void Start()
    {
        try
        {
            // Steam identifies the caller by this file when the process was not
            // launched by Steam directly. The game usually is, but a mod cannot
            // assume it.
            var beside = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "steam_appid.txt");
            if (!File.Exists(beside)) File.WriteAllText(beside, AppId.ToString());
        }
        catch (Exception e) { Mod.Log.Warning($"[steam] steam_appid.txt: {e.Message}"); }

        try
        {
            var result = SteamAPI.InitEx(out var error);
            if (result != ESteamAPIInitResult.k_ESteamAPIInitResult_OK)
            {
                Mod.Log.Warning($"[steam] not available: {result} — {error}");
                return;
            }

            Ready = true;
            SelfId = SteamUser.GetSteamID().m_SteamID;
            Mod.Log.Msg($"[steam] signed in as {SteamFriends.GetPersonaName()} ({SelfId})");

            // The relay is the entire point: it is what removes IP addresses
            // from the picture. Access takes a moment to come up, so this only
            // starts it and the status is reported later.
            SteamNetworkingUtils.InitRelayNetworkAccess();
            Mod.Log.Msg("[steam] relay network requested");
        }
        catch (DllNotFoundException)
        {
            // Expected until steam_api64.dll ships beside the game. Worth naming
            // precisely rather than letting it look like a Steam outage.
            Mod.Log.Warning("[steam] steam_api64.dll not found — relay unavailable");
        }
        catch (Exception e)
        {
            Mod.Log.Error($"[steam] {e.GetType().Name}: {e.Message}");
        }
    }

    /// <summary>Steam callbacks need pumping, or nothing it reports ever arrives.</summary>
    internal static void Tick()
    {
        if (!Ready) return;
        try { SteamAPI.RunCallbacks(); } catch (Exception) { }
    }

    internal static void Stop()
    {
        if (!Ready) return;
        Ready = false;
        try { SteamAPI.Shutdown(); } catch (Exception) { }
    }
}
