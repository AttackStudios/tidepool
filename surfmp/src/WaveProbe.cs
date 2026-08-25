using System;
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

    private static m _wave;
    private static float _next;
    private static bool _dead;
    private static bool _announced;

    /// <summary>Patch every constructor, plus each candidate update method, independently.</summary>
    internal static void Install(HarmonyLib.Harmony harmony)
    {
        var capture = new HarmonyMethod(typeof(WaveProbe).GetMethod(
            nameof(OnConstructed), BindingFlags.NonPublic | BindingFlags.Static));
        var witness = new HarmonyMethod(typeof(WaveProbe).GetMethod(
            nameof(OnCalled), BindingFlags.NonPublic | BindingFlags.Static));

        var ctors = 0;
        foreach (var ctor in AccessTools.GetDeclaredConstructors(typeof(m)))
        {
            try { harmony.Patch(ctor, postfix: capture); ctors++; }
            catch (Exception e) { Mod.Log.Warning($"[probe] ctor ({ctor.GetParameters().Length} args): {e.Message}"); }
        }
        Mod.Log.Msg($"[probe] {ctors} constructor(s) patched");

        // Which of these actually runs is unknown; eq produced nothing. Patch them
        // all and let the game answer, rather than spending a launch per guess.
        foreach (var name in new[] { "eq", "er", "es", "eu", "ey" })
        {
            try
            {
                var mi = AccessTools.Method(typeof(m), name, Type.EmptyTypes);
                if (mi == null) { Mod.Log.Msg($"[probe] {name}() not found"); continue; }
                harmony.Patch(mi, postfix: witness);
            }
            catch (Exception e) { Mod.Log.Warning($"[probe] {name}(): {e.Message}"); }
        }
    }

    private static void OnConstructed(m __instance) => Adopt(__instance, "constructor");

    private static void OnCalled(m __instance, MethodBase __originalMethod)
        => Adopt(__instance, $"{__originalMethod.Name}()");

    private static void Adopt(m instance, string via)
    {
        if (instance == null || _wave != null) return;
        _wave = instance;
        Mod.Log.Msg($"[probe] wave simulation captured via {via}");
    }

    /// <summary>Sample on our own clock — which is what a host broadcasting the wave needs anyway.</summary>
    internal static void Tick()
    {
        if (_dead) return;

        if (_wave == null)
        {
            if (!_announced && UnityEngine.Time.time > 30f)
            {
                _announced = true;
                Mod.Log.Warning("[probe] no wave instance after 30s — none of the patched members ran");
            }
            return;
        }

        if (UnityEngine.Time.time < _next) return;
        _next = UnityEngine.Time.time + Period;

        try
        {
            var row = new StringBuilder();
            float min = float.MaxValue, max = float.MinValue;

            for (var i = 0; i < Samples; i += 20)
            {
                var h = _wave.ex(i);
                if (h < min) min = h;
                if (h > max) max = h;
                row.Append(h.ToString("F2")).Append(' ');
            }

            Mod.Log.Msg($"[wave] range {min:F2}..{max:F2} | {row}");
        }
        catch (Exception e)
        {
            // A negative answer is still an answer, and worth one clear line rather
            // than the same exception every three seconds for the rest of the session.
            Mod.Log.Error($"[wave] ex(int) is not a sampler: {e.GetType().Name}: {e.Message}");
            _dead = true;
        }
    }
}
