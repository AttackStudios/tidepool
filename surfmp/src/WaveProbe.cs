using System;
using System.Collections.Generic;
using System.Reflection;
using System.Text;
using HarmonyLib;
using Il2CppSurf;

namespace TidePool.SurfMP;

/// <summary>
/// Finds the live wave simulation and reads its surface.
///
/// <c>ex(int)</c> is confirmed callable and never throws \u2014 the biggest risk in
/// the whole design, and it is retired. What is not settled is which <c>m</c>
/// to call it on. Instance #0 is built about 60ms into startup, long before a
/// beach exists, and reads a flat 0.00 forever.
///
/// So capture by two independent routes rather than betting on one:
///
/// 1. The constructors, which say when an instance comes into being.
/// 2. <c>ex(int)</c> itself. If the game samples its own wave surface, that
///    postfix hands over the live instance directly \u2014 no inference required.
///
/// Route 2 is the one that cannot really fail: an instance the game is actively
/// sampling is by definition the one carrying the water.
/// </summary>
internal static class WaveProbe
{
    private const int Samples = 321;
    private const float Period = 3f;

    private static readonly List<m> Instances = new List<m>();

    /// <summary>Set from ex()'s own postfix. Hot path \u2014 an assignment and nothing else.</summary>
    private static m _sampledByGame;

    private static float _next;
    private static int _live = -1;
    private static int _ctorHits;
    private static int _ticks;

    /// <summary>The instance carrying wave data, once one has proven itself.</summary>
    internal static m Live => _live >= 0 && _live < Instances.Count ? Instances[_live] : _sampledByGame;

    internal static void Install(HarmonyLib.Harmony harmony)
    {
        var capture = new HarmonyMethod(typeof(WaveProbe).GetMethod(
            nameof(OnConstructed), BindingFlags.NonPublic | BindingFlags.Static));

        var ctors = 0;
        foreach (var ctor in AccessTools.GetDeclaredConstructors(typeof(m)))
        {
            // Skip the static constructor: it has no instance to hand back, and
            // patching type initialisers is a good way to break a type outright.
            if (ctor.IsStatic) continue;
            try { harmony.Patch(ctor, postfix: capture); ctors++; }
            catch (Exception e) { Mod.Log.Warning($"[probe] ctor: {e.Message}"); }
        }
        Mod.Log.Msg($"[probe] {ctors} instance constructor(s) patched");

        try
        {
            var ex = AccessTools.Method(typeof(m), "ex", new[] { typeof(int) });
            if (ex == null) { Mod.Log.Error("[probe] ex(int) not found"); return; }
            harmony.Patch(ex, postfix: new HarmonyMethod(typeof(WaveProbe).GetMethod(
                nameof(OnSampled), BindingFlags.NonPublic | BindingFlags.Static)));
            Mod.Log.Msg("[probe] ex(int) patched \u2014 will catch whichever instance the game reads");
        }
        catch (Exception e) { Mod.Log.Error($"[probe] ex(int): {e.Message}"); }
    }

    /// <summary>
    /// Nothing here may throw. A postfix that does propagates into the game's own
    /// constructor, and the previous build's silence is exactly what that looks
    /// like: no instance, no error, no wave.
    /// </summary>
    private static void OnConstructed(m __instance)
    {
        try
        {
            if (__instance == null) return;
            Instances.Add(__instance);
            _ctorHits++;
        }
        catch (Exception) { /* never disturb the game */ }
    }

    /// <summary>
    /// Called as often as the game samples its own wave, so it does exactly one
    /// thing. No logging, no allocation, no Unity API.
    /// </summary>
    private static void OnSampled(m __instance) => _sampledByGame = __instance;

    /// <summary>
    /// Watch a handful of fixed points every frame.
    ///
    /// The range across all 321 samples was stable at 0.00..35.00 for twenty
    /// seconds of actual surfing, and the profile decays from shore to offshore
    /// like a seabed. But a steady swell would hold a steady crest-to-trough
    /// envelope too, so that reading fits both a static ground profile and live
    /// water, and those two have opposite consequences for SurfMP.
    ///
    /// A single point settles it. Ground does not move between frames; water
    /// does. So track each point's spread over time rather than the surface's
    /// spread over space.
    /// </summary>
    private static readonly int[] Watched = { 20, 60, 100, 140, 180, 220 };
    private static readonly float[] Lo = new float[6];
    private static readonly float[] Hi = new float[6];
    private static bool _watching;

    internal static void Tick()
    {
        var wave = Live;
        if (wave == null)
        {
            if (UnityEngine.Time.time < _next) return;
            _next = UnityEngine.Time.time + Period;
            _ticks++;
            if (_ticks % 5 == 1)
                Mod.Log.Msg($"[probe] waiting \u2014 {_ctorHits} construction(s), game has not sampled ex() yet");
            return;
        }

        // Every frame, not every three seconds: the question is whether these
        // points move at all, and sampling slowly would miss it.
        if (!_watching)
        {
            _watching = true;
            for (var k = 0; k < Watched.Length; k++) { Lo[k] = float.MaxValue; Hi[k] = float.MinValue; }
        }

        for (var k = 0; k < Watched.Length; k++)
        {
            float h;
            try { h = wave.ex(Watched[k]); }
            catch (Exception) { continue; }
            if (float.IsNaN(h)) continue;
            if (h < Lo[k]) Lo[k] = h;
            if (h > Hi[k]) Hi[k] = h;
        }

        if (UnityEngine.Time.time < _next) return;
        _next = UnityEngine.Time.time + Period;

        var moved = 0f;
        var row = new StringBuilder();
        for (var k = 0; k < Watched.Length; k++)
        {
            if (Lo[k] > Hi[k]) continue;
            var spread = Hi[k] - Lo[k];
            if (spread > moved) moved = spread;
            row.Append($"[{Watched[k]}]{Lo[k]:F2}~{Hi[k]:F2} ");
            Lo[k] = float.MaxValue; Hi[k] = float.MinValue;
        }

        Mod.Log.Msg(moved > 0.001f
            ? $"[wave] MOVING, max spread {moved:F3} over 3s \u2014 this is the water surface | {row}"
            : $"[wave] static over 3s \u2014 this is terrain, not water | {row}");
    }

    /// <summary>One full read, to see the surface's shape rather than just its range.</summary>
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
