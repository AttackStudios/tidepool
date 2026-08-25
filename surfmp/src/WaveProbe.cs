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
    /// Find the water by looking for what moves.
    ///
    /// ex(int) turned out to be terrain: twenty-three static readings against
    /// one, and its values are integers matching the .lvl format's 1/32
    /// quantisation of ground heights. So the surface lives in one of the
    /// obfuscated buffers on this same instance.
    ///
    /// Guessing which, one launch at a time, is what the last four builds cost.
    /// Instead apply the trick that just worked: enumerate every member of the
    /// live instance, read whatever can be read, and report which values change
    /// between frames. Terrain holds still. Water does not.
    /// </summary>
    private sealed class Candidate
    {
        internal string Name;
        internal Func<int, float> Read;
        internal float Lo = float.MaxValue;
        internal float Hi = float.MinValue;
    }

    private static readonly List<Candidate> Candidates = new List<Candidate>();
    private static bool _scanned;

    /// <summary>Spread across the array, avoiding the dry-beach end where nothing happens.</summary>
    private static readonly int[] Probe = { 60, 110, 160, 210 };

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

        if (!_scanned) { _scanned = true; Scan(wave); }

        // Every frame. The question is whether these values move at all, and
        // sampling once every three seconds would miss it.
        foreach (var c in Candidates)
        {
            foreach (var i in Probe)
            {
                float v;
                try { v = c.Read(i); } catch (Exception) { continue; }
                if (float.IsNaN(v) || float.IsInfinity(v)) continue;
                if (v < c.Lo) c.Lo = v;
                if (v > c.Hi) c.Hi = v;
            }
        }

        if (UnityEngine.Time.time < _next) return;
        _next = UnityEngine.Time.time + Period;

        var moving = new StringBuilder();
        var still = 0;
        foreach (var c in Candidates)
        {
            if (c.Lo > c.Hi) { still++; continue; }
            var spread = c.Hi - c.Lo;
            if (spread > 0.001f) moving.Append($"{c.Name}:{c.Lo:F2}~{c.Hi:F2} ");
            else still++;
            c.Lo = float.MaxValue; c.Hi = float.MinValue;
        }

        Mod.Log.Msg(moving.Length > 0
            ? $"[wave] MOVING \u2014 {moving}"
            : $"[wave] nothing moved ({Candidates.Count} candidate(s), {still} static)");
    }

    /// <summary>
    /// List everything on the type, then keep whatever can actually be read as a
    /// float by index. Written defensively throughout: this is reflection over an
    /// obfuscated Il2Cpp type, and most of what it tries will fail.
    /// </summary>
    private static void Scan(m wave)
    {
        Mod.Log.Msg("[probe] scanning the live instance for readable buffers");

        const BindingFlags Any = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;

        foreach (var f in typeof(m).GetFields(Any))
            Consider(f.Name, f.FieldType, () => f.GetValue(wave));

        foreach (var pr in typeof(m).GetProperties(Any))
        {
            if (pr.GetIndexParameters().Length != 0) continue;
            Consider(pr.Name, pr.PropertyType, () => pr.GetValue(wave));
        }

        // Methods shaped like a sampler: one int in, one float out. ex is the
        // known terrain one; its siblings are exactly where water would hide.
        foreach (var mi in typeof(m).GetMethods(Any))
        {
            if (mi.ReturnType != typeof(float)) continue;
            var ps = mi.GetParameters();
            if (ps.Length != 1 || ps[0].ParameterType != typeof(int)) continue;
            var name = mi.Name;
            Candidates.Add(new Candidate
            {
                Name = $"{name}()",
                Read = i => (float)mi.Invoke(wave, new object[] { i }),
            });
            Mod.Log.Msg($"[probe]   method {name}(int) -> float");
        }

        Mod.Log.Msg($"[probe] {Candidates.Count} readable candidate(s)");
    }

    private static void Consider(string name, Type type, Func<object> get)
    {
        var typeName = type.Name;
        object value;
        try { value = get(); } catch (Exception) { return; }
        if (value == null) return;

        Mod.Log.Msg($"[probe]   {name} : {typeName}");

        if (value is float[] arr)
        {
            Candidates.Add(new Candidate { Name = name, Read = i => i < arr.Length ? arr[i] : float.NaN });
            return;
        }

        // NativeArray and the Il2Cpp collection wrappers all expose an indexer or
        // a get_Item; take whichever answers rather than special-casing types that
        // may not even be generated in this interop build.
        var item = value.GetType().GetMethod("get_Item", new[] { typeof(int) });
        if (item == null || item.ReturnType != typeof(float)) return;

        Candidates.Add(new Candidate { Name = name, Read = i => (float)item.Invoke(value, new object[] { i }) });
        Mod.Log.Msg($"[probe]     ^ indexable, watching it");
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
