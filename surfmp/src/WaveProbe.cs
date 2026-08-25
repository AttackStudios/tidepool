using System;
using System.Text;
using HarmonyLib;
using MelonLoader;
using Il2CppSurf;

namespace TidePool.SurfMP;

/// <summary>
/// Reads the wave surface, to find out whether the plan is buildable.
///
/// The wave simulation lives in <c>Surf.m</c>, which holds 22
/// <c>NativeArray&lt;float&gt;</c> buffers under obfuscated names — vf, vg, vh
/// and so on. Identifying the surface among them would have meant watching
/// which changed as a wave passed.
///
/// It may not be necessary. The class exposes <c>public float ex(int)</c>,
/// which has exactly the shape of a sampler: give it an index, get a height.
/// If that is what it is, the host can read the surface without touching the
/// buffers at all, and M0's blocking question is answered.
///
/// So: call it across the level's width, print what comes back, and see whether
/// it looks like an ocean.
/// </summary>
[HarmonyPatch(typeof(m), "eq")]
internal static class WaveHook
{
    private const int Samples = 321;
    private static int _frames;

    private static void Postfix(m __instance)
    {
        // Every few seconds, not every frame: this is a look, not a feature.
        if (__instance == null || _frames++ % 300 != 0) return;

        try
        {
            var row = new StringBuilder();
            float min = float.MaxValue, max = float.MinValue;

            for (var i = 0; i < Samples; i += 20)
            {
                var h = __instance.ex(i);
                if (h < min) min = h;
                if (h > max) max = h;
                row.Append(h.ToString("F2")).Append(' ');
            }

            Mod.Log.Msg($"[wave] range {min:F2}..{max:F2}  {row}");
        }
        catch (Exception e)
        {
            Mod.Log.Error($"ex(int) is not a sampler: {e.GetType().Name}: {e.Message}");
        }
    }
}
