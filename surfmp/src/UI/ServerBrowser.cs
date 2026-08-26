using System;
using UnityEngine;
using TidePool.SurfMP.Net;

namespace TidePool.SurfMP.UI;

/// <summary>
/// The server list.
///
/// Rich presence only reaches friends, and pasting a Steam ID is worse still.
/// This lists every public session and joins one with a click — no friendship,
/// no invite, nothing typed.
///
/// Drawn with IMGUI because it needs no prefabs, no scene surgery and no
/// dependency on the game's own UI, which is a Surf.UI type graph SurfMP would
/// otherwise have to reverse-engineer. It is not beautiful; it is a browser that
/// exists, which beats a browser that is still being designed.
/// </summary>
internal static class ServerBrowser
{
    private const int Width = 460;
    private const int Height = 320;

    private static bool _open;
    private static Vector2 _scroll;
    private static float _lastRefresh;

    internal static bool Open => _open;

    internal static void Toggle()
    {
        _open = !_open;
        if (_open) Refresh();
    }

    internal static void Close() => _open = false;

    private static void Refresh()
    {
        SteamLobbies.Browse();
        _lastRefresh = Time.realtimeSinceStartup;
    }

    internal static void Draw()
    {
        if (!_open) return;

        var x = (Screen.width - Width) / 2f;
        var y = (Screen.height - Height) / 2f;

        // A backing box, or the list reads as text floating over the ocean.
        GUI.Box(new Rect(x, y, Width, Height), GUIContent.none);
        GUILayout.BeginArea(new Rect(x + 12, y + 10, Width - 24, Height - 20));

        GUILayout.Label(SteamRelay.Ready
            ? "<b>Sessions</b>"
            : "<b>Sessions</b> — Steam unavailable, so nothing can be listed");

        GUILayout.BeginHorizontal();
        if (GUILayout.Button(SteamLobbies.Browsing ? "Refreshing..." : "Refresh", GUILayout.Width(100)))
            Refresh();
        GUILayout.FlexibleSpace();
        if (GUILayout.Button("Close", GUILayout.Width(80))) Close();
        GUILayout.EndHorizontal();

        GUILayout.Space(6);

        var servers = SteamLobbies.Servers;
        if (servers.Count == 0)
        {
            GUILayout.Label(SteamLobbies.Browsing
                ? "Looking..."
                : "No sessions. Press F9 to host one, and others will see it here.");
        }
        else
        {
            _scroll = GUILayout.BeginScrollView(_scroll);
            foreach (var server in servers)
            {
                GUILayout.BeginHorizontal();

                var beach = string.IsNullOrEmpty(server.Beach) ? "somewhere" : server.Beach;
                GUILayout.Label($"{server.Name}   <i>{beach}</i>   {server.Players} surfing");
                GUILayout.FlexibleSpace();

                if (GUILayout.Button("Join", GUILayout.Width(70)))
                {
                    SessionControl.Lobby.JoinSteam(server.Host);
                    Close();
                }

                GUILayout.EndHorizontal();
            }
            GUILayout.EndScrollView();
        }

        GUILayout.FlexibleSpace();
        GUILayout.Label("<size=11>F10 opens this  ·  F9 hosts  ·  F11 leaves</size>");
        GUILayout.EndArea();

        // Refresh occasionally while open, so a session that appears while
        // someone is looking at the list actually shows up.
        if (!SteamLobbies.Browsing && Time.realtimeSinceStartup - _lastRefresh > 8f) Refresh();
    }
}
