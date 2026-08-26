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
            else if (Input.GetKeyDown(KeyCode.F10)) Join("127.0.0.1");
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
                Mod.Log.Msg($"[lobby] hosting over Steam. Others join with your ID: {id}");
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

        // A Steam ID in the file means join that person over the relay. With no
        // file, fall back to localhost, which is what the ghost peer uses.
        var target = ReadHostId();

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

    internal static void Leave()
    {
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
