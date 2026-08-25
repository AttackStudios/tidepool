using System.Linq;
using MelonLoader;
using UnityEngine;
using Il2CppSurf.UI;

namespace TidePool.SurfMod;

/// <summary>
/// Reports the break-select map's real structure, once, the first time it appears.
///
/// The markers are authored in the scene rather than built from the Levels
/// folder, so adding one for a custom level means cloning an existing button —
/// and that needs to be done against what is actually there, not against field
/// names guessed from a dump. <c>MapLocationButton</c> has no fields at all, so
/// how a marker knows which level it is can only be answered at runtime.
/// </summary>
internal static class MapProbe
{
    private static bool _reported;

    internal static void Tick(MelonLogger.Instance log)
    {
        if (_reported) return;

        var map = Object.FindObjectOfType<Map>();
        if (map == null) return;
        _reported = true;

        log.Msg("--- break-select map ---");
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
            var button = child.GetComponent<MapLocationButton>();
            log.Msg($"    [{i,2}] {child.name}  marker={(button != null)}  active={child.gameObject.activeSelf}");
        }
    }
}
