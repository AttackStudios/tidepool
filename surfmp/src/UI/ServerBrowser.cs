using System;
using UnityEngine;
using TidePool.SurfMP.Net;

namespace TidePool.SurfMP.UI;

/// <summary>
/// The server list.
///
/// Every session is listed publicly, so joining needs no friendship, no invite
/// and nothing typed.
///
/// Laid out by hand with explicit rectangles rather than GUILayout. The game
/// never uses IMGUI, so Unity stripped the auto-layout half out of the build
/// entirely and Il2CppInterop cannot restore it — GUILayout.BeginArea throws
/// "Method unstripping failed" and takes the whole window with it. The
/// immediate-mode GUI calls survive, so those are what this uses.
/// </summary>
internal static class ServerBrowser
{
    private const float Width = 520f;
    private const float Height = 340f;
    private const float Pad = 14f;
    private const float Row = 30f;
    private const float HeaderH = 64f;

    private static bool _open;
    private static float _lastRefresh;
    private static int _scroll;

    internal static bool Open => _open;

    internal static void Toggle()
    {
        _open = !_open;
        if (_open) { _scroll = 0; Refresh(); }
    }

    internal static void Close() => _open = false;

    private static void Refresh()
    {
        SteamLobbies.Browse();
        // Sessions on the same network answer a broadcast, so they show up with
        // nothing typed and connect directly rather than out through Valve.
        LanDiscovery.Sweep();
        _lastRefresh = Time.realtimeSinceStartup;
    }

    internal static void Draw()
    {
        if (!_open) return;

        try { Paint(); }
        catch (Exception e)
        {
            // A failure here fires every frame, so it closes itself rather than
            // filling the log and hiding whatever else is happening.
            _open = false;
            Mod.Log.Error($"[ui] browser closed after: {e.GetType().Name}: {e.Message}");
        }
    }

    private static void Paint()
    {
        var x = (Screen.width - Width) * 0.5f;
        var y = (Screen.height - Height) * 0.5f;

        GUI.Box(new Rect(x, y, Width, Height), "");
        GUI.Label(new Rect(x + Pad, y + Pad, 300f, 24f), "Sessions");

        if (GUI.Button(new Rect(x + Width - Pad - 80f, y + Pad - 4f, 80f, 24f), "Close")) { Close(); return; }
        if (GUI.Button(new Rect(x + Width - Pad - 176f, y + Pad - 4f, 90f, 24f),
                SteamLobbies.Browsing ? "..." : "Refresh"))
            Refresh();

        var servers = SteamLobbies.Servers;
        var lan = LanDiscovery.Servers();

        if (!SteamRelay.Ready && lan.Count == 0)
        {
            GUI.Label(new Rect(x + Pad, y + HeaderH, Width - Pad * 2, 24f),
                "Steam is unavailable and nothing is hosting on this network.");
            return;
        }

        // Sessions on this network first: same room beats a round trip to Valve.
        var rows = 0;
        foreach (var found in lan)
        {
            var rowY = y + HeaderH + rows * Row;
            var beach = string.IsNullOrEmpty(found.Beach) ? "somewhere" : found.Beach;
            GUI.Label(new Rect(x + Pad, rowY, Width - Pad * 2 - 90f, Row),
                $"{found.Name}  -  {beach}  -  on this network");

            if (GUI.Button(new Rect(x + Width - Pad - 80f, rowY, 80f, 24f), "Join"))
            {
                SessionControl.Lobby.JoinAddress(found.Address.ToString(), found.GamePort);
                Close();
                return;
            }
            rows++;
        }

        if (servers.Count == 0 && lan.Count > 0) { /* the LAN rows above are the list */ }
        else if (servers.Count == 0)
        {
            GUI.Label(new Rect(x + Pad, y + HeaderH, Width - Pad * 2, 24f),
                SteamLobbies.Browsing ? "Looking..." : "No sessions yet. F9 hosts one.");
            GUI.Label(new Rect(x + Pad, y + HeaderH + 24f, Width - Pad * 2, 24f),
                "Your own session is never listed here.");
        }
        else
        {
            // Paged rather than scrolled: a scroll view is GUILayout, which does
            // not exist in this build.
            var visible = (int)((Height - HeaderH - Pad * 3) / Row) - rows;
            if (_scroll > servers.Count - visible) _scroll = Math.Max(0, servers.Count - visible);

            for (var i = 0; i < visible && i + _scroll < servers.Count; i++)
            {
                var server = servers[i + _scroll];
                var rowY = y + HeaderH + (rows + i) * Row;

                var beach = string.IsNullOrEmpty(server.Beach) ? "somewhere" : server.Beach;
                GUI.Label(new Rect(x + Pad, rowY, Width - Pad * 2 - 90f, Row),
                    $"{server.Name}  -  {beach}  -  {server.Players} surfing");

                if (GUI.Button(new Rect(x + Width - Pad - 80f, rowY, 80f, 24f), "Join"))
                {
                    SessionControl.Lobby.JoinSteam(server.Host);
                    Close();
                    return;
                }
            }

            if (servers.Count > visible)
            {
                if (GUI.Button(new Rect(x + Pad, y + Height - Pad - 24f, 40f, 24f), "^"))
                    _scroll = Math.Max(0, _scroll - 1);
                if (GUI.Button(new Rect(x + Pad + 46f, y + Height - Pad - 24f, 40f, 24f), "v"))
                    _scroll++;
            }
        }

        GUI.Label(new Rect(x + Pad + 100f, y + Height - Pad - 24f, Width - Pad * 2 - 100f, 24f),
            "F9 host   F10 this list   F11 leave");

        // Refresh while open, so a session that appears meanwhile shows up.
        if (!SteamLobbies.Browsing && Time.realtimeSinceStartup - _lastRefresh > 8f) Refresh();
    }
}
