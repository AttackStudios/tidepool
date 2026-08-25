using System;
using MelonLoader;
using UnityEngine;
using Il2CppInterop.Runtime;
using Il2CppSurf.UI;

namespace TidePool.SurfMod;

/// <summary>
/// Reports the break-select map's real structure, once, the first time it appears.
///
/// The markers are authored in the scene rather than built from the Levels
/// folder, so adding one for a custom level means cloning an existing button —
/// against what is really there, since <c>MapLocationButton</c> has no fields
/// and a dump cannot say how a marker binds to a level.
/// </summary>
internal static class MapProbe
{
    private static bool _done;

    internal static void Tick(MelonLogger.Instance log)
    {
        if (_done) return;

        Map map;
        try
        {
            // Not FindObjectOfType<T>(). The generic overload does not survive
            // IL2CPP stripping and interop throws "Method unstripping failed"
            // every frame. Passing the Il2Cpp type object goes through the
            // non-generic method, which is still present.
            var found = UnityEngine.Object.FindObjectOfType(Il2CppType.Of<Map>());
            map = found == null ? null : found.TryCast<Map>();
        }
        catch (Exception e)
        {
            // Report once and stop. A probe that floods the log every frame is
            // worse than one that fails.
            _done = true;
            log.Error($"Could not look for the map: {e.GetType().Name}: {e.Message}");
            return;
        }

        if (map == null) return;
        _done = true;

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
