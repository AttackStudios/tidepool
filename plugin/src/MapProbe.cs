using System;
using System.Linq;
using HarmonyLib;
using MelonLoader;
using UnityEngine;
using Il2CppSurf.UI;
using Il2CppTMPro;

namespace TidePool.SurfMod;

/// <summary>
/// Puts custom levels on the break-select map.
///
/// The map's sixteen markers are authored in the scene rather than built from
/// the Levels folder, which is why dropping a .lvl in leaves a file the game
/// never looks for. The binding turned out to be the simplest thing it could
/// be: each marker's GameObject is named after its level. So a marker for a
/// custom level is a clone with a new name.
///
/// Hooks Start rather than searching for the map — both FindObjectOfType
/// overloads are stripped from this IL2CPP build and interop throws trying to
/// rebuild them.
/// </summary>
[HarmonyPatch(typeof(Map), "Start")]
internal static class MapStartPatch
{
    /// <summary>Gap between the island's leftmost marker and our column, in pixels.</summary>
    private const float ColumnGap = 90f;

    /// <summary>Gap between a marker and its label, in pixels.</summary>
    private const float LabelGap = 12f;

    /// <summary>Smaller than the game's 32pt prompt; these sit in a tight column.</summary>
    private const float LabelFontSize = 20f;

    private static void Postfix(Map __instance)
    {
        if (__instance == null) return;
        try
        {
            Add(__instance, Mod.Log);
        }
        catch (Exception e)
        {
            Mod.Log.Error($"Adding map markers failed: {e.GetType().Name}: {e.Message}");
        }
    }

    private static void Add(Map map, MelonLogger.Instance log)
    {
        var root = map.LocationButtonsRoot;
        if (root == null) { log.Warning("No LocationButtonsRoot; cannot add markers."); return; }
        if (root.childCount == 0) { log.Warning("No markers to clone from."); return; }

        var custom = LevelScanner.CustomLevels();
        if (custom.Length == 0) { log.Msg("No custom levels to add."); return; }

        // Existing names, so reopening the map does not stack duplicates.
        var present = Enumerable.Range(0, root.childCount)
            .Select(i => root.GetChild(i).name)
            .ToHashSet(StringComparer.Ordinal);

        var template = root.GetChild(0);
        var bounds = MarkerBounds(root);
        // Spread over the same vertical extent the island markers use, so the
        // column fits whatever the canvas size turns out to be.
        var step = custom.Length > 1 ? (bounds.Top - bounds.Bottom) / (custom.Length - 1) : 0f;
        var added = 0;

        foreach (var name in custom)
        {
            if (present.Contains(name)) continue;

            var clone = UnityEngine.Object.Instantiate(template.gameObject, root);
            // The name is the binding. Everything else is presentation.
            clone.name = name;
            clone.SetActive(true);

            var rect = clone.GetComponent<RectTransform>();
            if (rect != null)
            {
                // Calibrated off the markers already placed. At Start the root's
                // own rect is still zero, which put all nine in one spot.
                var t = template.GetComponent<RectTransform>();
                rect.anchorMin = t.anchorMin;
                rect.anchorMax = t.anchorMax;
                rect.anchoredPosition = new Vector2(bounds.MinX - ColumnGap, bounds.Top - step * added);
            }

            Label(clone.transform, name, log);

            if (map.xl != null) map.xl.Add(clone.GetComponent<RectTransform>());
            added++;
        }

        log.Msg($"Custom levels on the map: {added} added, {root.childCount} markers total.");
    }

    /// <summary>
    /// Put the level's name beside its marker, always visible.
    ///
    /// The marker's Text child reads "select" and the game never once reveals
    /// it — a frame-by-frame watch across a full session recorded no activation
    /// on any marker, ours or the presets'. So it is dead weight, and reusing it
    /// costs nothing: it already carries the game's font and material, and it is
    /// the one thing here proven to render.
    ///
    /// Shown permanently rather than on hover. A reveal the game does not use
    /// cannot be borrowed, and driving one ourselves meant tracking a map
    /// instance that turned out not to be the one on screen. A name that is
    /// always there beats a clever one that never appears.
    /// </summary>
    private static void Label(Transform marker, string levelName, MelonLogger.Instance log)
    {
        var text = marker.Find("Text");
        if (text == null) { log.Warning($"  {levelName}: no Text child"); return; }

        var tmp = text.GetComponent<TextMeshProUGUI>();
        if (tmp == null) { log.Warning($"  {levelName}: Text child has no TextMeshProUGUI"); return; }

        // The bracket prefix groups the pack in the file list; on the map the
        // column already does that, and "Pleasure Point" reads better.
        var display = levelName.StartsWith("[BP] ", StringComparison.Ordinal)
            ? levelName.Substring(5)
            : levelName;

        tmp.text = display;
        tmp.fontSize = LabelFontSize;
        tmp.alignment = TextAlignmentOptions.MidlineRight;
        tmp.enableWordWrapping = false;

        var rect = text.GetComponent<RectTransform>();
        var markerRect = marker.GetComponent<RectTransform>();
        if (rect != null && markerRect != null)
        {
            // Pivot on the right edge and sit left of the marker, so a long name
            // grows away from the island instead of across it.
            rect.anchorMin = rect.anchorMax = new Vector2(0.5f, 0.5f);
            rect.pivot = new Vector2(1f, 0.5f);
            rect.anchoredPosition = new Vector2(-(markerRect.rect.width * 0.5f + LabelGap), 0f);
        }

        text.gameObject.SetActive(true);
        log.Msg($"    labelled {display}");
    }

    private readonly struct Bounds
    {
        internal Bounds(float minX, float top, float bottom) { MinX = minX; Top = top; Bottom = bottom; }
        internal float MinX { get; }
        internal float Top { get; }
        internal float Bottom { get; }
    }

    /// <summary>The extent of the markers already on the map, in their own coordinates.</summary>
    private static Bounds MarkerBounds(Transform root)
    {
        float minX = float.MaxValue, top = float.MinValue, bottom = float.MaxValue;
        var seen = 0;

        for (var i = 0; i < root.childCount; i++)
        {
            var r = root.GetChild(i).GetComponent<RectTransform>();
            if (r == null) continue;
            var p = r.anchoredPosition;
            if (p.x < minX) minX = p.x;
            if (p.y > top) top = p.y;
            if (p.y < bottom) bottom = p.y;
            seen++;
        }

        // Nothing to calibrate against; something visible beats stacking at the origin.
        return seen == 0 ? new Bounds(-300f, 200f, -200f) : new Bounds(minX, top, bottom);
    }
}
