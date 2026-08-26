using System;
using System.IO;
using UnityEngine;
using TidePool.SurfMP.Sync;

namespace TidePool.SurfMP.SessionControl;

/// <summary>
/// Starting and joining a session.
///
/// Hotkeys rather than a menu, deliberately: the point of this milestone is two
/// people in the same water, and a UI is separate work that would delay finding
/// out whether the netcode holds up inside the game.
///
/// The default join target is localhost, because two instances on one machine
/// is the only way to test this without a second person — which is also why the
/// transport is UDP rather than anything Steam-shaped.
/// </summary>
internal static class Lobby
{
    internal const int DefaultPort = 27581;

    private static readonly Net.Session Current = new Net.Session();

    internal static void Tick(float now)
    {
        Hotkeys();
        Current.Pump(now);
    }

    private static void Hotkeys()
    {
        try
        {
            if (Input.GetKeyDown(KeyCode.F9)) Host();
            // F10 opens the list. Joining used to guess at a target, which only
            // ever worked for a friend already hosting or a pasted ID.
            else if (Input.GetKeyDown(KeyCode.F10)) UI.ServerBrowser.Toggle();
            else if (Input.GetKeyDown(KeyCode.F11)) Leave();
            // Marks the start of a determinism run, so two runs can be lined up
            // Still water: takes the rider out of the fluid so the ocean runs
            // unforced, which is the only way to test the simulation alone.
            // Host only: everyone loads this beach together, which is what puts
            // every player in the same ocean.
            else if (Input.GetKeyDown(KeyCode.F6)) Sync.BeachSync.Call(Current, Time.time);
        }
        catch (Exception) { /* input unavailable during load */ }
    }

    internal static void Host()
    {
        if (Current.Role == Net.Role.Host)
        {
            var count = 0;
            foreach (var _ in Current.Members) count++;
            Mod.Log.Msg($"[lobby] already hosting — {count} peer(s) connected");
            return;
        }

        try
        {
            // Steam whenever it is available: it is the only route that connects
            // two people without either of them sharing an IP or touching a
            // router. UDP remains for localhost testing.
            var steam = Net.SteamRelay.Ready;
            Current.Host(DefaultPort, Name(), steam);

            if (steam)
            {
                var id = Net.SteamRelay.SelfId;
                // Advertising is what puts a Join Game button beside your name in
                // your friends' Steam lists. The ID file stays as a fallback for
                // anyone not on your friends list.
                Net.SteamPresence.Advertise(id);
                // And list it publicly, so people who are not friends can find it.
                Net.SteamLobbies.Advertise(Name(), Sync.BeachSync.CurrentBeach());
                Mod.Log.Msg($"[lobby] hosting over Steam — friends can Join Game, or use your ID: {id}");
                WriteShareFile(id);
            }
            else
            {
                Mod.Log.Msg($"[lobby] Steam unavailable — hosting on {DefaultPort} for localhost only");
            }

            SurferSync.Attach(Current);
        }
        catch (Exception e) { Mod.Log.Error($"[lobby] hosting: {e.Message}"); }
    }

    /// <summary>
    /// Drop the host's Steam ID somewhere a person can find it.
    ///
    /// There is no UI yet, and reading it out of a log file is not something to
    /// ask of a tester.
    /// </summary>
    private static void WriteShareFile(ulong id)
    {
        try
        {
            var path = Path.Combine(UserData(), "surfmp-my-id.txt");
            File.WriteAllText(path, id.ToString());
            Mod.Log.Msg($"[lobby] your ID is also in {path}");
        }
        catch (Exception e) { Mod.Log.Warning($"[lobby] could not write your ID: {e.Message}"); }
    }

    internal static void Join(string address)
    {
        if (Current.Role == Net.Role.Client)
        {
            Mod.Log.Msg("[lobby] already in a session — F11 to leave first");
            return;
        }

        // Look for a friend who is hosting before asking anyone to type anything.
        // The file stays as a fallback for someone not on the friends list, and
        // localhost for the ghost peer.
        var target = FriendHosting();
        if (target == 0) target = ReadHostId();

        try
        {
            if (target != 0 && Net.SteamRelay.Ready)
            {
                Current.JoinSteam(new Steamworks.CSteamID(target), Name());
                Mod.Log.Msg($"[lobby] joining {target} over the Steam relay");
            }
            else
            {
                if (target != 0) Mod.Log.Warning("[lobby] Steam unavailable — falling back to localhost");
                Current.Join(address, DefaultPort, Name());
                Mod.Log.Msg($"[lobby] joining {address}:{DefaultPort}");
            }

            SurferSync.Attach(Current);
        }
        catch (Exception e) { Mod.Log.Error($"[lobby] joining: {e.Message}"); }
    }

    /// <summary>
    /// A friend currently hosting, if there is one.
    ///
    /// Reads their Steam rich presence, so nothing is exchanged and nobody types
    /// an ID. With more than one hosting, the first is taken and the rest are
    /// named in the log — picking between them wants a UI, which this is not.
    /// </summary>
    private static ulong FriendHosting()
    {
        var hosts = Net.SteamPresence.HostingFriends();
        if (hosts.Count == 0) return 0;

        foreach (var h in hosts) Mod.Log.Msg($"[lobby] {h.Name} is hosting");
        Mod.Log.Msg($"[lobby] joining {hosts[0].Name}");
        return hosts[0].Id.m_SteamID;
    }

    /// <summary>The host's Steam ID, if a tester has been given one to paste in.</summary>
    private static ulong ReadHostId()
    {
        try
        {
            var path = Path.Combine(UserData(), "surfmp-join.txt");
            if (!File.Exists(path)) return 0;
            var text = File.ReadAllText(path).Trim();
            return ulong.TryParse(text, out var id) ? id : 0;
        }
        catch (Exception) { return 0; }
    }

    private static string UserData()
    {
        var dir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "UserData");
        if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
        return dir;
    }

    /// <summary>Join a specific host — used by Steam's Join Game button.</summary>
    internal static void JoinSteam(Steamworks.CSteamID host)
    {
        if (Current.Role != Net.Role.Offline) Leave();
        try
        {
            Current.JoinSteam(host, Name());
            SurferSync.Attach(Current);
            Mod.Log.Msg($"[lobby] joining {host} via Steam invite");
        }
        catch (Exception e) { Mod.Log.Error($"[lobby] invite join: {e.Message}"); }
    }

    internal static void Leave()
    {
        // Take the Join Game button down with the session, so nobody clicks
        // through to a host that has gone.
        Net.SteamPresence.Withdraw();
        Net.SteamLobbies.Withdraw();

        SurferSync.Detach();
        Current.Shutdown("left");
        Mod.Log.Msg("[lobby] left the session");
    }

    /// <summary>
    /// No Steamworks in this game, so there is no Steam name to borrow. The
    /// account name stands in until SurfMP asks for one.
    /// </summary>
    private static string Name()
    {
        try { return Environment.UserName ?? "Surfer"; }
        catch (Exception) { return "Surfer"; }
    }
}
