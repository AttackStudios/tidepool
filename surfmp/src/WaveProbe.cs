using System;
using System.Text;
using HarmonyLib;
using Il2CppSurf;

namespace TidePool.SurfMP;

/// <summary>
/// Reads the wave surface, to find out whether the plan is buildable.
///
/// The design rests on the host reading the surface and broadcasting it. The
/// simulation lives in <c>Surf.m</c> behind 22 obfuscated
/// <c>NativeArray&lt;float&gt;</c> buffers, but the class exposes
/// <c>public float ex(int)</c> — exactly the shape of a sampler. If it is one,
/// the surface can be read without touching the buffers at all.
///
/// Hooks the constructor rather than a method that might run per frame. Patching
/// <c>eq</c> produced nothing, and rather than work through er, es and eu one
/// build at a time, the constructor is the one thing guaranteed to run — it
/// hands over the instance, and sampling happens on our own clock afterwards.
/// </summary>
internal static class WaveProbe
{
    private const int Samples = 321;

    private static m _wave;
    private static float _next;

    internal static void Capture(m instance)
    {
        if (instance == null) return;
        _wave = instance;
        Mod.Log.Msg("[wave] simulation instance captured");
    }

    /// <summary>Sample every few seconds. This is a look, not a feature.</summary>
    internal static void Tick()
    {
        if (_wave == null) return;
        if (UnityEngine.Time.time < _next) return;
        _next = UnityEngine.Time.time + 3f;

        try
        {
            var row = new StringBuilder();
            float min = float.MaxValue, max = float.MinValue;

            for (var i = 0; i < Samples; i += 20)
            {
                var h = _wave.ex(i);
                if (float.IsNaN(h)) { Mod.Log.Warning($"[wave] ex({i}) returned NaN"); return; }
                if (h < min) min = h;
                if (h > max) max = h;
                row.Append(h.ToString("F2")).Append(' ');
            }

            Mod.Log.Msg($"[wave] range {min:F2}..{max:F2} | {row}");
        }
        catch (Exception e)
        {
            Mod.Log.Error($"[wave] ex(int) is not a sampler: {e.GetType().Name}: {e.Message}");
            _wave = null;
        }
    }
}

/// <summary>The wave simulation is constructed with its own parameters; that is our way in.</summary>
[HarmonyPatch(typeof(m), MethodType.Constructor,
    typeof(float), typeof(float), typeof(float), typeof(float), typeof(float), typeof(int))]
internal static class WaveCtorPatch
{
    private static void Postfix(m __instance) => WaveProbe.Capture(__instance);
}
