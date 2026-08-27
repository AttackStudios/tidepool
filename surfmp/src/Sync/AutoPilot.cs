using System;
using System.Reflection;
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
    /// <summary>Surf.Character.SurfMode+Mode: Auto = 0, Expert = 1, Tutorial = 2.</summary>
    private const int Auto = 0;
    private const int Expert = 1;

    private static bool _on;
    private static object _surfMode;
    private static MethodInfo _setMode;

    internal static bool Engaged => _on;

    internal static void Toggle()
    {
        if (_setMode == null && !Locate()) return;

        _on = !_on;

        try
        {
            // The character picks a controller by mode; enabling the AutoSurf
            // component alone changed nothing, because the mode still said
            // Expert and that is what the game was listening to.
            var mode = Enum.ToObject(_setMode.GetParameters()[0].ParameterType, _on ? Auto : Expert);
            _setMode.Invoke(_surfMode, new[] { mode });

            Mod.Log.Msg(_on
                ? "[auto] surfing itself — F7 again to take back over"
                : "[auto] back under your control");
        }
        catch (Exception e)
        {
            _on = !_on;
            Mod.Log.Error($"[auto] switching mode: {e.GetType().Name}: {e.Message}");
        }
    }

    private static bool Locate()
    {
        var rider = LocalSurfer.Template;
        if (rider == null) { Mod.Log.Warning("[auto] no rider yet"); return false; }

        try
        {
            var all = rider.GetComponentsInChildren(
                Il2CppInterop.Runtime.Il2CppType.Of<Component>(), true);
            if (all == null) return false;

            foreach (var component in all)
            {
                if (component == null) continue;
                if (ClassName(component.Pointer) != "SurfMode") continue;

                _surfMode = component;
                // to(Mode) sets it; tn() reads it back.
                _setMode = component.GetType().GetMethod("to",
                    BindingFlags.Public | BindingFlags.Instance);
                if (_setMode != null) return true;
            }
        }
        catch (Exception e) { Mod.Log.Error($"[auto] {e.GetType().Name}: {e.Message}"); }

        Mod.Log.Warning("[auto] no SurfMode on this rider");
        return false;
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
