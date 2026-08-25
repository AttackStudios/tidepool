using System;
using System.Linq;
using HarmonyLib;
using MelonLoader;
using UnityEngine;
using Il2CppInterop.Runtime;
using Il2CppSurf.UI;

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
    /// <summary>Where custom markers go, as a fraction of the map's width and height.</summary>
    private const float ColumnX = -0.44f;
    private const float TopY = 0.40f;
    private const float StepY = 0.085f;

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
                // Laid out in a column down one side rather than on the island.
                // These are real breaks from all over the world; pretending
                // Nazaré is off Oahu would be worse than plainly listing it.
                rect.anchorMin = rect.anchorMax = new Vector2(0.5f, 0.5f);
                rect.anchoredPosition = new Vector2(
                    ColumnX * ((RectTransform)root).rect.width,
                    (TopY - StepY * added) * ((RectTransform)root).rect.height);
            }

            if (map.xl != null) map.xl.Add(clone.GetComponent<RectTransform>());
            added++;
            log.Msg($"  added marker: {name}");
        }

        log.Msg($"Custom levels on the map: {added} added, {root.childCount} markers total.");
    }
}
