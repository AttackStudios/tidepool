using System;
using System.Collections.Generic;
using System.Reflection;
using System.Text;
using HarmonyLib;
using Il2CppSurf;

namespace TidePool.SurfMP;

/// <summary>
/// Reads the wave surface, to find out whether SurfMP is buildable at all.
///
/// The design rests on the host reading the surface and broadcasting it. The
/// simulation lives in <c>Surf.m</c> behind 22 obfuscated
/// <c>NativeArray&lt;float&gt;</c> buffers, but the class exposes
/// <c>public float ex(int)</c> — exactly the shape of a sampler. If it is one,
/// the surface can be read without touching the buffers at all.
///
/// Patches are applied by enumeration and each one is wrapped separately. The
/// names here are obfuscated and will churn between game builds, so anything
/// that assumes a signature is a guess that costs a launch to disprove — and
/// one bad patch must never take the working ones down with it.
/// </summary>
internal static class WaveProbe
{
    private const int Samples = 321;
    private const float Period = 3f;

    /// <summary>
    /// Every instance ever constructed, not just the first.
    ///
    /// The first attempt adopted instance #0 and held it, and every sample came
    /// back exactly 0.00 forever \u2014 because that one is built about 60ms into
    /// startup, long before a beach is loaded. It was never the live simulation.
    /// Which one is cannot be known in advance, so keep them all and let the
    /// numbers say: the live one is whichever stops reading flat.
    /// </summary>
    private static readonly List<m> Instances = new List<m>();

    private static float _next;
    private static int _live = -1;

    /// <summary>The instance actually carrying wave data, once one has proven itself.</summary>
    internal static m Live => _live >= 0 && _live < Instances.Count ? Instances[_live] : null;

    internal static void Install(HarmonyLib.Harmony harmony)
    {
        var capture = new HarmonyMethod(typeof(WaveProbe).GetMethod(
            nameof(OnConstructed), BindingFlags.NonPublic | BindingFlags.Static));

        var ctors = 0;
        foreach (var ctor in AccessTools.GetDeclaredConstructors(typeof(m)))
        {
            try { harmony.Patch(ctor, postfix: capture); ctors++; }
            catch (Exception e) { Mod.Log.Warning($"[probe] ctor ({ctor.GetParameters().Length} args): {e.Message}"); }
        }
        Mod.Log.Msg($"[probe] {ctors} constructor(s) patched");
    }

    private static void OnConstructed(m __instance)
    {
        if (__instance == null) return;
        Instances.Add(__instance);
        Mod.Log.Msg($"[probe] instance #{Instances.Count - 1} constructed at t={UnityEngine.Time.time:F1}s");
    }

    /// <summary>Sample on our own clock \u2014 which is what a host broadcasting the wave needs anyway.</summary>
    internal static void Tick()
    {
        if (Instances.Count == 0) return;
        if (UnityEngine.Time.time < _next) return;
        _next = UnityEngine.Time.time + Period;

        var summary = new StringBuilder();
        var found = -1;

        for (var idx = 0; idx < Instances.Count; idx++)
        {
            float min = float.MaxValue, max = float.MinValue;
            var ok = true;

            for (var i = 0; i < Samples; i += 10)
            {
                float h;
                try { h = Instances[idx].ex(i); }
                catch (Exception e)
                {
                    summary.Append($"#{idx}:{e.GetType().Name} ");
                    ok = false;
                    break;
                }
                if (float.IsNaN(h)) continue;
                if (h < min) min = h;
                if (h > max) max = h;
            }

            if (!ok) continue;
            summary.Append($"#{idx}:{min:F2}..{max:F2} ");

            // Flat means either the wrong instance or a dead one. A range means water.
            if (max - min > 0.001f && found < 0) found = idx;
        }

        if (found >= 0 && found != _live)
        {
            _live = found;
            Mod.Log.Msg($"[probe] instance #{found} is the live wave \u2014 ex(int) IS a height sampler");
            Dump(Instances[found]);
        }

        Mod.Log.Msg($"[wave] {Instances.Count} instance(s) | {summary}");
    }

    /// <summary>One full read of the surface, to see its actual shape rather than its range.</summary>
    private static void Dump(m wave)
    {
        var row = new StringBuilder();
        for (var i = 0; i < Samples; i += 20)
        {
            try { row.Append(wave.ex(i).ToString("F2")).Append(' '); }
            catch (Exception) { return; }
        }
        Mod.Log.Msg($"[wave] surface: {row}");
    }
}
