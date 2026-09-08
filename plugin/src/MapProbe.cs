using System;
using System.Reflection;
using System.Linq;
using HarmonyLib;
using MelonLoader;
using UnityEngine;
using Il2CppSurf.UI;
using Il2CppTMPro;

namespace ExternalBeachSupport;

/// <summary>
/// Puts external levels on the break-select map.
///
/// The map's sixteen markers are authored in the scene rather than built from
/// the Levels folder, which is why dropping a .lvl in leaves a file the game
/// never looks for. The binding turned out to be the simplest thing it could
/// be: each marker's GameObject is named after its level. So a marker for an
/// external level is a clone with a new name.
///
/// Hooks Start rather than searching for the map — both FindObjectOfType
/// overloads are stripped from this IL2CPP build and interop throws trying to
/// rebuild them.
/// </summary>
[HarmonyPatch(typeof(Map), "Start")]
internal static class MapStartPatch
{
    /// <summary>Gap between the island's leftmost marker and the first column.</summary>
    private const float ColumnGap = 90f;

    /// <summary>Gap between a marker and its label, in pixels.</summary>
    private const float LabelGap = 12f;

    /// <summary>Smaller than the game's 32pt prompt; these sit in tight columns.</summary>
    private const float LabelFontSize = 20f;

    /// <summary>
    /// Vertical pitch between entries.
    ///
    /// Comfortably more than the line height at <see cref="LabelFontSize"/>, so
    /// two names can never touch however many levels are installed. Spreading
    /// entries evenly across the island's height instead — the obvious approach —
    /// works for nine and turns into overlapping text at thirty.
    /// </summary>
    private const float RowPitch = 34f;

    /// <summary>
    /// Horizontal pitch between columns.
    ///
    /// Wide enough for a name truncated to <see cref="MaxNameChars"/> at this
    /// font size, so a long label cannot reach the column beside it.
    /// </summary>
    private const float ColumnPitch = 200f;

    /// <summary>Longer names are truncated; the column width is finite.</summary>
    private const int MaxNameChars = 20;

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

        var external = LevelScanner.ExternalLevels();
        if (external.Length == 0) { log.Msg("No external levels to add."); return; }

        // Existing names, so reopening the map does not stack duplicates.
        var present = Enumerable.Range(0, root.childCount)
            .Select(i => root.GetChild(i).name)
            .ToHashSet(StringComparer.Ordinal);

        var template = root.GetChild(0);
        var bounds = MarkerBounds(root);

        // Fixed pitch, wrapping into further columns, rather than dividing the
        // island's height by however many levels there happen to be.
        var rows = Math.Max(1, (int)((bounds.Top - bounds.Bottom) / RowPitch) + 1);
        var added = 0;
        var index = 0;

        foreach (var name in external)
        {
            if (present.Contains(name)) { index++; continue; }

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

                var column = index / rows;
                var row = index % rows;
                rect.anchoredPosition = new Vector2(
                    bounds.MinX - ColumnGap - column * ColumnPitch,
                    bounds.Top - row * RowPitch);
            }

            Label(clone.transform, name, log);

            MarkerList(map)?.Add(clone.GetComponent<RectTransform>());
            added++;
            index++;
        }

        log.Msg($"External levels on the map: {added} added, {root.childCount} markers total.");
    }

    /// <summary>
    /// The map's own list of markers, found by shape rather than by name.
    ///
    /// It was `map.xl` until a game update renamed it, and the map silently
    /// stopped showing external breaks — MissingMethodException on a property
    /// that no longer exists. These names churn with every patch, and anything
    /// compiled against one is broken by the next.
    ///
    /// There is exactly one List&lt;RectTransform&gt; on this type and it is the
    /// marker list, so its type identifies it far more durably than its name.
    /// </summary>
    private static Il2CppSystem.Collections.Generic.List<RectTransform> MarkerList(Map map)
    {
        if (_markerList == null)
        {
            foreach (var p in typeof(Map).GetProperties(BindingFlags.Public | BindingFlags.Instance))
            {
                if (p.PropertyType != typeof(Il2CppSystem.Collections.Generic.List<RectTransform>)) continue;
                _markerList = p;
                break;
            }
            if (_markerList == null) return null;
        }

        try
        {
            return _markerList.GetValue(map) as Il2CppSystem.Collections.Generic.List<RectTransform>;
        }
        catch (Exception)
        {
            return null;
        }
    }

    private static PropertyInfo _markerList;

    /// <summary>Our label object, named so it is never created twice.</summary>
    private const string LabelName = "ExternalBeachName";

    /// <summary>
    /// Put the level's name beside its marker, on an object of our own.
    ///
    /// The marker already has a Text child reading "select", and reusing it
    /// almost worked — until selecting a marker made the name vanish. The game
    /// hides that child as part of its own state handling, so anything living
    /// inside it is at the mercy of logic we do not control.
    ///
    /// So the label is a separate child of the marker. It is copied from the
    /// prompt, which gives it the game's font and material for free, then the
    /// prompt is put back exactly as it was. The game can do what it likes with
    /// its own object; ours is not part of that conversation.
    /// </summary>
    private static void Label(Transform marker, string levelName, MelonLogger.Instance log)
    {
        if (marker.Find(LabelName) != null) return;

        var prompt = marker.Find("Text");
        if (prompt == null) { log.Warning($"  {levelName}: no Text child to copy"); return; }

        var promptTmp = prompt.GetComponent<TextMeshProUGUI>();
        if (promptTmp == null) { log.Warning($"  {levelName}: Text child has no TextMeshProUGUI"); return; }
        var promptText = promptTmp.text;

        var label = UnityEngine.Object.Instantiate(prompt.gameObject, marker);
        label.name = LabelName;

        var tmp = label.GetComponent<TextMeshProUGUI>();
        if (tmp == null) { log.Warning($"  {levelName}: label copy lost its TextMeshProUGUI"); return; }
        tmp.text = Display(levelName);
        tmp.fontSize = LabelFontSize;
        tmp.alignment = TextAlignmentOptions.MidlineRight;
        tmp.enableWordWrapping = false;
        // Truncation is handled in Display; overflow would otherwise let a long
        // name run under the column beside it rather than being cut.
        tmp.overflowMode = TextOverflowModes.Truncate;

        var rect = label.GetComponent<RectTransform>();
        var markerRect = marker.GetComponent<RectTransform>();
        if (rect != null && markerRect != null)
        {
            // Pivot on the right edge and sit left of the marker, so a long name
            // grows away from the island instead of across it.
            rect.anchorMin = rect.anchorMax = new Vector2(0.5f, 0.5f);
            rect.pivot = new Vector2(1f, 0.5f);
            rect.anchoredPosition = new Vector2(-(markerRect.rect.width * 0.5f + LabelGap), 0f);
            // A fixed box, so the text cannot render wider than its column.
            rect.sizeDelta = new Vector2(ColumnPitch - LabelGap * 2f, RowPitch);
        }

        label.SetActive(true);

        // Leave the game's prompt exactly as found, including its own text.
        promptTmp.text = promptText;
    }

    /// <summary>How a level's file name should read on the map.</summary>
    internal static string Display(string levelName)
    {
        // The bracket prefix groups a pack in the file list; on the map the
        // column already does that, and "Pleasure Point" reads better.
        var display = levelName.StartsWith("[BP] ", StringComparison.Ordinal)
            ? levelName.Substring(5)
            : levelName;

        // The game's own saves end "_User"; that is filing, not a name.
        if (display.EndsWith("_User", StringComparison.Ordinal))
            display = display.Substring(0, display.Length - 5);

        display = display.Replace('_', ' ').Trim();

        return display.Length <= MaxNameChars
            ? display
            : display.Substring(0, MaxNameChars - 1).TrimEnd() + "…";
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
