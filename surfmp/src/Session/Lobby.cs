using System;
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
            // step by step without depending on when each was launched.
            else if (Input.GetKeyDown(KeyCode.F8)) Sync.Determinism.Restart();
            // Still water: takes the rider out of the fluid so the ocean runs
            // unforced, which is the only way to test the simulation alone.
            else if (Input.GetKeyDown(KeyCode.F7)) Sync.Determinism.SuppressRider();
            // Host only: everyone loads this beach together, which is what puts
            // every player in the same ocean.
            else if (Input.GetKeyDown(KeyCode.F6)) Sync.BeachSync.Call(Current, Time.time);
        }
        catch (Exception) { /* input unavailable during load */ }
    }

    internal static void Host()
    {
        try
        {
            Current.Host(DefaultPort, Name());
            SurferSync.Attach(Current);
            Mod.Log.Msg($"[lobby] hosting on {DefaultPort} — others press F10 to join");
        }
        catch (Exception e) { Mod.Log.Error($"[lobby] hosting: {e.Message}"); }
    }

    internal static void Join(string address)
    {
        try
        {
            // The client binds any free port, so a second instance on the same
            // machine does not collide with the host's socket.
            Current.Join(address, DefaultPort, Name());
            SurferSync.Attach(Current);
            Mod.Log.Msg($"[lobby] joining {address}:{DefaultPort}");
        }
        catch (Exception e) { Mod.Log.Error($"[lobby] joining: {e.Message}"); }
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
