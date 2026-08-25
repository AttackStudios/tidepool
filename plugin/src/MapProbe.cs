using System;
using System.Linq;
using HarmonyLib;
using MelonLoader;
using UnityEngine;
using Il2CppInterop.Runtime;
using Il2CppSurf.UI;
using Il2CppTMPro;

namespace TidePool.SurfMod;

/// <summary>
/// Adds a map marker for every custom level, so they can actually be selected.
///
/// The break select is a map of Oahu whose sixteen markers are authored in the
/// scene, not built from the Levels folder — which is why dropping a .lvl in
/// leaves a file the game never looks for.
///
/// The binding turned out to be the simplest possible: each marker's GameObject
/// is named after its level, and the sixteen names match the sixteen shipped
/// files exactly. That is why <c>MapLocationButton</c> has no fields — it does
/// not need any. So a marker for a custom level is a clone with a new name.
///
/// Hooks Start rather than searching: both FindObjectOfType overloads are
/// stripped from this build, and interop throws trying to rebuild them.
/// </summary>
[HarmonyPatch(typeof(Map), "Start")]
internal static class MapStartPatch
{
    /// <summary>Gap between the island's leftmost marker and our column, in pixels.</summary>
    private const float ColumnGap = 90f;

    /// <summary>Gap between a marker and its label, in pixels.</summary>
    private const float LabelGap = 10f;

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

        // Existing marker names, so re-entering the map does not stack duplicates.
        var present = Enumerable.Range(0, root.childCount)
            .Select(i => root.GetChild(i).name)
            .ToHashSet(StringComparer.Ordinal);

        var template = root.GetChild(0);
        var bounds = MarkerBounds(root);
        // Spread our column over the same vertical extent the island markers use,
        // so it fits whatever the canvas size turns out to be.
        var step = custom.Length > 1 ? (bounds.top - bounds.bottom) / (custom.Length - 1) : 0f;
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
                // Calibrated off the markers already on the map rather than off
                // the root's rect. At Start the layout has not run, so that rect
                // is still zero — which put all nine on top of each other in the
                // middle. The existing markers are positioned correctly by then,
                // so they are the reliable reference.
                rect.anchorMin = template.GetComponent<RectTransform>().anchorMin;
                rect.anchorMax = template.GetComponent<RectTransform>().anchorMax;
                rect.anchoredPosition = new Vector2(bounds.minX - ColumnGap, bounds.top - step * added);
            }

            Label(clone.transform, name, log);

            if (map.xl != null) map.xl.Add(clone.GetComponent<RectTransform>());
            added++;
            log.Msg($"  added marker: {name} at {clone.GetComponent<RectTransform>().anchoredPosition}");
        }

        log.Msg($"Custom levels on the map: {added} added, {root.childCount} markers total.");

        DescribeMarker(template, log);
    }

    private readonly struct Bounds
    {
        internal Bounds(float minX, float top, float bottom) { this.minX = minX; this.top = top; this.bottom = bottom; }
        internal readonly float minX;
        internal readonly float top;
        internal readonly float bottom;
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

        // Nothing to calibrate against; fall back to something visible rather
        // than stacking everything at the origin.
        if (seen == 0) return new Bounds(-300f, 200f, -200f);
        return new Bounds(minX, top, bottom);
    }

    /// <summary>
    /// Log what a marker is built from.
    ///
    /// Labels should use whatever text component the game already uses, so they
    /// inherit its font and styling instead of looking bolted on. That cannot be
    /// guessed from the type dump — it has to be read off a real one.
    /// </summary>
    private static void DescribeMarker(Transform marker, MelonLogger.Instance log)
    {
        log.Msg($"--- marker template: {marker.name} ---");
        foreach (var c in marker.GetComponents<Component>())
        {
            log.Msg($"  component: {c.GetIl2CppType().FullName}");
        }
        for (var i = 0; i < marker.childCount; i++)
        {
            var child = marker.GetChild(i);
            log.Msg($"  child [{i}] {child.name}");
            foreach (var c in child.GetComponents<Component>())
            {
                log.Msg($"      {c.GetIl2CppType().FullName}");
            }
        }
    }

    /// <summary>
    /// Put the level's name on the marker, the way the game does it.
    ///
    /// Every marker already carries a TextMeshProUGUI child, so a clone
    /// inherits one — still reading "Waikiki" from the template. Setting that
    /// rather than adding our own means the label picks up the game's font,
    /// size and colour for free.
    ///
    /// Its visibility is left exactly as the template had it. The game reveals
    /// these on hover, and forcing them on turned a tidy column into a wall of
    /// overlapping text. Whatever shows the preset labels shows ours, because
    /// the clone carries the same components.
    ///
    /// The label sits to the left of the marker and is right-aligned, so it
    /// grows away from the island rather than across it.
    /// </summary>
    private static void Label(Transform marker, string levelName, MelonLogger.Instance log)
    {
        var text = marker.Find("Text");
        if (text == null) { log.Warning($"  {levelName}: no Text child to label"); return; }

        var tmp = text.GetComponent<TextMeshProUGUI>();
        if (tmp == null) { log.Warning($"  {levelName}: Text child has no TextMeshProUGUI"); return; }

        var display = levelName.StartsWith("[BP] ", StringComparison.Ordinal)
            ? levelName.Substring(5)
            : levelName;
        tmp.text = display;

        var rect = text.GetComponent<RectTransform>();
        var markerRect = marker.GetComponent<RectTransform>();
        if (rect != null && markerRect != null)
        {
            var before = rect.anchoredPosition;
            // Pivot on the right edge so the text extends leftwards from the
            // marker however long the name is.
            rect.anchorMin = rect.anchorMax = new Vector2(0.5f, 0.5f);
            rect.pivot = new Vector2(1f, 0.5f);
            rect.anchoredPosition = new Vector2(-(markerRect.rect.width * 0.5f + LabelGap), 0f);
            tmp.alignment = TextAlignmentOptions.MidlineRight;
            log.Msg($"    {display}: label {before} -> {rect.anchoredPosition}, hover-only");
        }
    }
}
