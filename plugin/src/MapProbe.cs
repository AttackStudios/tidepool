using System;
using HarmonyLib;
using MelonLoader;
using UnityEngine;
using Il2CppInterop.Runtime;
using Il2CppSurf.UI;

namespace TidePool.SurfMod;

/// <summary>
/// Reports the break-select map's real structure the first time it is built.
///
/// Hooks the map's own Start rather than searching for it. Both FindObjectOfType
/// overloads are stripped out of this IL2CPP build — interop tries to rebuild
/// them and throws "Method unstripping failed" — so there is nothing to search
/// with. A Harmony postfix is handed the instance directly, which is both more
/// reliable and cheaper than polling every frame.
///
/// The markers are authored in the scene rather than built from the Levels
/// folder, and <c>MapLocationButton</c> has no fields, so how a marker binds to
/// a level can only be answered by looking at a real one.
/// </summary>
[HarmonyPatch(typeof(Map), "Start")]
internal static class MapStartPatch
{
    private static bool _done;

    private static void Postfix(Map __instance)
    {
        if (_done || __instance == null) return;
        _done = true;
        Report(__instance, Mod.Log);
    }

    private static void Report(Map map, MelonLogger.Instance log)
    {
        log.Msg("--- break-select map ---");
        try
        {
            log.Msg($"  buttons in list      : {(map.xl != null ? map.xl.Count : -1)}");

            var root = map.LocationButtonsRoot;
            if (root == null)
            {
                log.Warning("  LocationButtonsRoot is null");
                return;
            }

            log.Msg($"  LocationButtonsRoot  : {root.name}, {root.childCount} children");
            for (var i = 0; i < root.childCount; i++)
            {
                var child = root.GetChild(i);
                var marker = child.GetComponent(Il2CppType.Of<MapLocationButton>()) != null;
                log.Msg($"    [{i,2}] {child.name}  marker={marker}  active={child.gameObject.activeSelf}");
            }
        }
        catch (Exception e)
        {
            log.Error($"Reading the map failed: {e.GetType().Name}: {e.Message}");
        }
    }
}
