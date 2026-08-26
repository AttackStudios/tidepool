using System;
using UnityEngine;

namespace TidePool.SurfMP.Sync;

/// <summary>
/// Lets a client surf itself, so one person can test two riders.
///
/// Two clients on one machine share a keyboard: only the focused window takes
/// input, so there is no way to have both riders surfing at once — which is
/// exactly the case worth testing, since two people on one wave is the whole
/// point of the mod.
///
/// The game already contains the answer. Surf.Character.AutoSurf is an AI
/// surfer with real parameters — bottom and top turn timing, popup, turn angle
/// limits — presumably driving the menu background. Switching it on in one
/// client gives a genuine second rider catching genuine waves, rather than a
/// puppet replaying canned positions.
/// </summary>
internal static class AutoPilot
{
    private static bool _on;

    internal static bool Engaged => _on;

    internal static void Toggle()
    {
        var rider = LocalSurfer.Template;
        if (rider == null) { Mod.Log.Warning("[auto] no rider yet"); return; }

        _on = !_on;

        var changed = 0;
        try
        {
            var all = rider.GetComponentsInChildren(
                Il2CppInterop.Runtime.Il2CppType.Of<Component>(), true);
            if (all == null) { Mod.Log.Error("[auto] no components on the rider"); return; }

            foreach (var component in all)
            {
                if (component == null) continue;
                if (ClassName(component.Pointer) != "AutoSurf") continue;

                var behaviour = component.TryCast<Behaviour>();
                if (behaviour == null) continue;
                behaviour.enabled = _on;
                changed++;
            }
        }
        catch (Exception e) { Mod.Log.Error($"[auto] {e.GetType().Name}: {e.Message}"); return; }

        if (changed == 0)
        {
            Mod.Log.Warning("[auto] no AutoSurf on this rider");
            _on = false;
            return;
        }

        Mod.Log.Msg(_on
            ? "[auto] this client is surfing itself — press F7 again to take back over"
            : "[auto] back under your control");
    }

    /// <summary>GetType() on an interop wrapper reports the wrapper, not the class.</summary>
    private static string ClassName(IntPtr obj)
    {
        try
        {
            var klass = Il2CppInterop.Runtime.IL2CPP.il2cpp_object_get_class(obj);
            var namePtr = Il2CppInterop.Runtime.IL2CPP.il2cpp_class_get_name(klass);
            return System.Runtime.InteropServices.Marshal.PtrToStringAnsi(namePtr) ?? "";
        }
        catch (Exception) { return ""; }
    }
}
