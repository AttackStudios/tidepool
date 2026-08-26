using System;
using System.Reflection;
using UnityEngine;
using TidePool.SurfMP.Sync;

namespace TidePool.SurfMP.UI;

/// <summary>
/// The chat window.
///
/// Typing is read from Input.inputString rather than GUI.TextField. This build
/// has most of IMGUI stripped — GUILayout is gone entirely — so depending on a
/// text field existing would be a gamble, where the legacy input string is
/// already proven by the hotkeys.
///
/// Collapsed by default: nothing should sit over the water, and a message
/// appearing mid-ride is exactly the wrong moment to look away.
/// </summary>
internal static class ChatPanel
{
    private const float Width = 420f;
    private const float LineHeight = 18f;
    private const int Visible = 8;
    private const int MaxLength = 120;

    private static bool _typing;
    private static string _draft = "";
    private static int _unread;
    private static object _controls;
    private static bool _lookedForControls;

    internal static bool Typing => _typing;

    internal static void Install()
    {
        ChatSync.Changed += () => { if (!_typing) _unread++; };
    }

    internal static void Tick()
    {
        if (!_typing)
        {
            // Enter opens it. Not T, which is a perfectly good thing to press
            // while surfing.
            if (Input.GetKeyDown(KeyCode.Return) || Input.GetKeyDown(KeyCode.KeypadEnter))
            {
                _typing = true;
                _draft = "";
                _unread = 0;
                SteerLocked(true);
            }
            return;
        }

        if (Input.GetKeyDown(KeyCode.Escape)) { Stop(); return; }

        if (Input.GetKeyDown(KeyCode.Return) || Input.GetKeyDown(KeyCode.KeypadEnter))
        {
            ChatSync.Say(_draft);
            Stop();
            return;
        }

        foreach (var c in Input.inputString)
        {
            if (c == '\b')
            {
                if (_draft.Length > 0) _draft = _draft.Substring(0, _draft.Length - 1);
            }
            else if (c != '\n' && c != '\r' && _draft.Length < MaxLength)
            {
                _draft += c;
            }
        }
    }

    private static void Stop()
    {
        _typing = false;
        _draft = "";
        SteerLocked(false);
    }

    /// <summary>
    /// Stop the board reacting while someone types.
    ///
    /// The game reads input directly, so without this every letter also steers —
    /// and a message is usually typed while sitting in the lineup, which is
    /// exactly when drifting off matters.
    /// </summary>
    private static void SteerLocked(bool locked)
    {
        try
        {
            if (!_lookedForControls)
            {
                _lookedForControls = true;
                _controls = GameHook.Manager?.GetType()
                    .GetProperty("Controls", BindingFlags.Public | BindingFlags.Instance)
                    ?.GetValue(GameHook.Manager);
            }

            if (_controls is Behaviour behaviour) behaviour.enabled = !locked;
        }
        catch (Exception) { /* typing is not worth an exception */ }
    }

    internal static void Draw()
    {
        var log = ChatSync.Log;
        if (log.Count == 0 && !_typing) return;

        var x = 16f;
        var height = Math.Min(Visible, log.Count) * LineHeight + (_typing ? 26f : 0f) + 12f;
        var y = Screen.height - height - 16f;

        // Only boxed while typing. Otherwise the log floats over the water and
        // stays out of the way.
        if (_typing) GUI.Box(new Rect(x - 6f, y - 6f, Width + 12f, height + 12f), "");

        var first = Math.Max(0, log.Count - Visible);
        for (var i = first; i < log.Count; i++)
        {
            GUI.Label(new Rect(x, y + (i - first) * LineHeight, Width, LineHeight), log[i]);
        }

        if (_typing)
        {
            GUI.Label(new Rect(x, y + Math.Min(Visible, log.Count) * LineHeight + 4f, Width, 22f),
                "> " + _draft + "_");
        }
        else if (_unread > 0)
        {
            GUI.Label(new Rect(x, y - LineHeight, Width, LineHeight),
                _unread + " new - press Enter");
        }
    }
}
