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
        /// <summary>Per index, not pooled. See the note on Tick.</summary>
        internal float[] Lo;
        internal float[] Hi;
    }

    private static readonly List<Candidate> Candidates = new List<Candidate>();
    private static bool _scanned;
    private static string _found;

    /// <summary>Spread along the beach, avoiding the dry end where nothing happens.</summary>
    private static readonly int[] Probe = { 60, 110, 160, 210 };

    /// <summary>Il2Cpp leaves untouched buffers filled with this; it is not data.</summary>
    private const float Sentinel = 1e30f;

    /// <summary>
    /// Track every probe point separately.
    ///
    /// The previous build pooled min and max across all four indices at once, so
    /// an array that merely varies ALONG the beach registered as moving even when
    /// it was perfectly static in time — vn reported a 0..18 range identical to
    /// ex(), which is proven terrain. Spatial variation is not motion.
    ///
    /// Keeping a range per index answers the actual question: does this one point
    /// change between frames? Terrain holds still at every point. Water does not.
    /// </summary>
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

        foreach (var c in Candidates)
        {
            for (var k = 0; k < Probe.Length; k++)
            {
                float v;
                try { v = c.Read(Probe[k]); } catch (Exception) { continue; }
                if (float.IsNaN(v) || float.IsInfinity(v) || Math.Abs(v) > Sentinel) continue;
                if (v < c.Lo[k]) c.Lo[k] = v;
                if (v > c.Hi[k]) c.Hi[k] = v;
            }
        }

        if (UnityEngine.Time.time < _next) return;
        _next = UnityEngine.Time.time + Period;

        var moving = new StringBuilder();
        var best = 0f;
        Candidate winner = null;

        foreach (var c in Candidates)
        {
            // The most any single point moved. A buffer sloping along the beach
            // but frozen in time scores zero here, which is the whole point.
            var worst = 0f;
            for (var k = 0; k < Probe.Length; k++)
            {
                if (c.Lo[k] > c.Hi[k]) continue;
                var d = c.Hi[k] - c.Lo[k];
                if (d > worst) worst = d;
                c.Lo[k] = float.MaxValue; c.Hi[k] = float.MinValue;
            }

            if (worst <= 0.001f) continue;
            moving.Append($"{c.Name}:{worst:F2} ");
            if (worst > best) { best = worst; winner = c; }
        }

        if (moving.Length == 0) { Mod.Log.Msg($"[wave] nothing moved ({Candidates.Count} candidates)"); return; }

        Mod.Log.Msg($"[wave] per-point motion over 3s \u2014 {moving}");

        if (winner != null && winner.Name != _found)
        {
            _found = winner.Name;
            Mod.Log.Msg($"[wave] strongest mover: {winner.Name} (moved {best:F2})");
            Profile(winner);
        }
    }

    /// <summary>The whole array at one instant, to see whether it looks like water.</summary>
    private static void Profile(Candidate c)
    {
        var row = new StringBuilder();
        for (var i = 0; i < Samples; i += 20)
        {
            try
            {
                var v = c.Read(i);
                row.Append(Math.Abs(v) > Sentinel ? "--" : v.ToString("F2")).Append(' ');
            }
            catch (Exception) { return; }
        }
        Mod.Log.Msg($"[wave] {c.Name} shape: {row}");
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
            Add($"{name}()", i => (float)mi.Invoke(wave, new object[] { i }));
            Mod.Log.Msg($"[probe]   method {name}(int) -> float");
        }

        Mod.Log.Msg($"[probe] {Candidates.Count} readable candidate(s)");
    }

    private static void Add(string name, Func<int, float> read)
    {
        var c = new Candidate { Name = name, Read = read, Lo = new float[Probe.Length], Hi = new float[Probe.Length] };
        for (var k = 0; k < Probe.Length; k++) { c.Lo[k] = float.MaxValue; c.Hi[k] = float.MinValue; }
        Candidates.Add(c);
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
            Add(name, i => i < arr.Length ? arr[i] : float.NaN);
            return;
        }

        // NativeArray and the Il2Cpp collection wrappers all expose an indexer or
        // a get_Item; take whichever answers rather than special-casing types that
        // may not even be generated in this interop build.
        var item = value.GetType().GetMethod("get_Item", new[] { typeof(int) });
        if (item == null || item.ReturnType != typeof(float)) return;

        Add(name, i => (float)item.Invoke(value, new object[] { i }));
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
