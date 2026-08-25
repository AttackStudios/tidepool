using System.Collections.Generic;
using MelonLoader;
using UnityEngine;
using Il2CppSurf.UI;

namespace TidePool.SurfMod;

/// <summary>
/// Shows a marker's name only while the map's locator is on it.
///
/// The marker's own "select" text is never revealed by the game — a frame-by-
/// frame watch across a whole session of moving around the map recorded not one
/// activation, on our markers or the presets'. So there is no reveal to inherit
/// and the label has to be driven here.
///
/// Driving it off <c>Map.LocatorTransform</c> rather than pointer events means
/// it follows whatever the game considers "current", whether that is the mouse
/// or the left/right arrows, without caring which.
/// </summary>
internal static class LabelWatch
{
    /// <summary>How close the locator must be, in pixels, to count as on a marker.</summary>
    private const float Reach = 60f;

    private static Map _map;
    private static readonly List<Transform> Markers = new();
    private static readonly List<Transform> Labels = new();
    private static int _shown = -1;

    internal static void Arm(Map map, Transform root)
    {
        _map = map;
        Markers.Clear();
        Labels.Clear();
        _shown = -1;

        for (var i = 0; i < root.childCount; i++)
        {
            var marker = root.GetChild(i);
            Markers.Add(marker);
            Labels.Add(marker.Find(MapStartPatch.LabelName));
        }
    }

    internal static void Tick(MelonLogger.Instance log)
    {
        if (_map == null || Markers.Count == 0) return;

        var locator = _map.LocatorTransform;
        if (locator == null) return;

        var nearest = -1;
        var best = Reach * Reach;
        var at = locator.position;

        for (var i = 0; i < Markers.Count; i++)
        {
            var m = Markers[i];
            if (m == null || Labels[i] == null) continue;
            var d = (m.position - at).sqrMagnitude;
            if (d < best) { best = d; nearest = i; }
        }

        if (nearest == _shown) return;

        if (_shown >= 0 && _shown < Labels.Count && Labels[_shown] != null)
        {
            Labels[_shown].gameObject.SetActive(false);
        }
        if (nearest >= 0)
        {
            // The prompt itself stays hidden, as the game leaves it. Only the
            // name we added is shown.
            Labels[nearest].gameObject.SetActive(true);
            log.Msg($"[label] {Markers[nearest].name}");
        }
        _shown = nearest;
    }
}
