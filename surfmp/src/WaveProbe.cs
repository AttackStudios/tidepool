using System;
using System.Collections.Generic;
using System.Reflection;
using System.Text;
using HarmonyLib;
using Il2CppSurf;

namespace TidePool.SurfMP;

/// <summary>
/// Finds the wave surface in the live simulation.
///
/// What is settled so far. <c>ex(int)</c> is a real sampler that never throws,
/// but it reads terrain: its values are integers matching the .lvl format's
/// 1/32 quantisation of ground heights, and they hold still except when the
/// beach changes. The simulation carries 22 NativeArray buffers. Of the ones
/// readable as floats, <c>vg</c> and <c>vk</c> move as a matched pair while
/// surfing — but their non-zero values cluster at 48-80, 144-176 and 240-272
/// with exact zeros between, repeating every 96. That is a per-wave structure,
/// not a surface, so those buffers are not indexed by position along the beach.
///
/// Six buffers were dismissed only for refusing a float indexer, which is what
/// a mesh of vertices does. So record what each member actually is — element
/// type and length — before deciding anything. GroundHeights is 321 long, so a
/// buffer of that length is indexed by position along the beach.
/// </summary>
internal static class WaveProbe
{
    private const int Samples = 321;
    private const float Period = 3f;

    /// <summary>Il2Cpp leaves untouched buffers filled with this; it is not data.</summary>
    private const float Sentinel = 1e30f;

    /// <summary>Spread along the beach, avoiding the dry end where nothing happens.</summary>
    private static readonly int[] Probe = { 60, 110, 160, 210 };

    private sealed class Candidate
    {
        internal string Name;
        internal Func<int, float> Read;
        /// <summary>Per index. Pooling these conflates a slope along the beach with motion.</summary>
        internal float[] Lo;
        internal float[] Hi;
    }

    private static readonly List<Candidate> Candidates = new List<Candidate>();
    private static readonly List<m> Instances = new List<m>();

    /// <summary>Set from ex()'s own postfix. Hot path — an assignment and nothing else.</summary>
    private static m _sampledByGame;

    private static float _next;
    private static int _ctorHits;
    private static int _ticks;
    private static bool _scanned;

    internal static m Live => _sampledByGame ?? (Instances.Count > 0 ? Instances[0] : null);

    // ---- installation ----------------------------------------------------

    internal static void Install(HarmonyLib.Harmony harmony)
    {
        var capture = new HarmonyMethod(typeof(WaveProbe).GetMethod(
            nameof(OnConstructed), BindingFlags.NonPublic | BindingFlags.Static));

        var ctors = 0;
        foreach (var ctor in AccessTools.GetDeclaredConstructors(typeof(m)))
        {
            // Skip the static constructor: no instance to hand back, and patching
            // type initialisers is a good way to break a type outright.
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
            Mod.Log.Msg("[probe] ex(int) patched — will catch whichever instance the game reads");
        }
        catch (Exception e) { Mod.Log.Error($"[probe] ex(int): {e.Message}"); }
    }

    /// <summary>
    /// Nothing here may throw. A postfix that does propagates into the game's own
    /// constructor: an earlier build called Time.time here, the wave simulation is
    /// built by the job system where that throws, and the result was silence.
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

    /// <summary>Runs as often as the game samples its wave, so it does one thing.</summary>
    private static void OnSampled(m __instance) => _sampledByGame = __instance;

    // ---- measurement -----------------------------------------------------

    internal static void Tick()
    {
        var wave = Live;
        if (wave == null)
        {
            if (UnityEngine.Time.time < _next) return;
            _next = UnityEngine.Time.time + Period;
            _ticks++;
            if (_ticks % 5 == 1)
                Mod.Log.Msg($"[probe] waiting — {_ctorHits} construction(s), game has not sampled ex() yet");
            return;
        }

        if (!_scanned) { _scanned = true; Scan(wave); }

        // Every frame. The question is whether a given point changes between
        // frames, and sampling once every three seconds would miss it.
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
        foreach (var c in Candidates)
        {
            // The most any single point moved. A buffer sloping along the beach
            // but frozen in time scores zero here, which is the whole point.
            var worst = 0f;
            for (var k = 0; k < Probe.Length; k++)
            {
                if (c.Lo[k] <= c.Hi[k])
                {
                    var d = c.Hi[k] - c.Lo[k];
                    if (d > worst) worst = d;
                }
                c.Lo[k] = float.MaxValue; c.Hi[k] = float.MinValue;
            }
            if (worst > 0.001f) moving.Append($"{c.Name}:{worst:F2} ");
        }

        if (moving.Length == 0)
        {
            // Worth logging: when the ocean went idle every buffer froze at once,
            // which is what says this measurement tracks waves and not noise.
            Mod.Log.Msg($"[wave] nothing moved ({Candidates.Count} candidates) — sim idle");
            return;
        }

        Mod.Log.Msg($"[wave] per-point motion over 3s — {moving}");

        // Ranking by magnitude was misleading: vl runs to thousands and vy to
        // 1e20, so both won on scale while being the wrong quantity. Height is not
        // the biggest number in a simulation. Print shapes and let them show.
        foreach (var c in Candidates) if (Interesting(c.Name)) Profile(c);
    }

    /// <summary>
    /// Buffers worth seeing in full: the coherent movers, plus every vector
    /// component, since a water mesh keeps its surface in one of those.
    /// </summary>
    private static readonly string[] Shortlist = { "vf", "vg", "vh", "vi", "vk", "vx" };

    private static bool Interesting(string name) =>
        name.Contains(".") || Array.IndexOf(Shortlist, name) >= 0;

    /// <summary>
    /// The whole array at one instant. Where the crest sits matters as much as
    /// how high it is: a wave has its peak out in the water and travels
    /// shorewards between reads, which is what tells it from a buffer that
    /// merely changes.
    /// </summary>
    private static void Profile(Candidate c)
    {
        var row = new StringBuilder();
        float lo = float.MaxValue, hi = float.MinValue;
        var crest = -1;

        for (var i = 0; i < Samples; i += 16)
        {
            float v;
            try { v = c.Read(i); } catch (Exception) { return; }
            if (float.IsNaN(v) || Math.Abs(v) > Sentinel) { row.Append("-- "); continue; }
            row.Append(v.ToString("F2")).Append(' ');
            if (v < lo) lo = v;
            if (v > hi) { hi = v; crest = i; }
        }

        if (lo > hi) return;
        Mod.Log.Msg($"[wave] {c.Name} [{lo:F2}..{hi:F2}] peak@{crest} : {row}");
    }

    // ---- discovery -------------------------------------------------------

    private static void Scan(m wave)
    {
        Mod.Log.Msg("[probe] scanning the live instance");

        const BindingFlags Any = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;

        foreach (var f in typeof(m).GetFields(Any))
            Consider(f.Name, f.FieldType, () => f.GetValue(wave));

        foreach (var pr in typeof(m).GetProperties(Any))
        {
            if (pr.GetIndexParameters().Length != 0) continue;
            Consider(pr.Name, pr.PropertyType, () => pr.GetValue(wave));
        }

        // Methods shaped like a sampler: one int in, one float out. ex is the
        // known terrain one; its siblings are where water might hide.
        foreach (var mi in typeof(m).GetMethods(Any))
        {
            if (mi.ReturnType != typeof(float)) continue;
            var ps = mi.GetParameters();
            if (ps.Length != 1 || ps[0].ParameterType != typeof(int)) continue;
            var method = mi;
            Add($"{method.Name}()", i => (float)method.Invoke(wave, new object[] { i }));
            Mod.Log.Msg($"[probe]   {method.Name}(int) -> float");
        }

        Mod.Log.Msg($"[probe] {Candidates.Count} readable candidate(s)");
    }

    /// <summary>
    /// Record what a member actually is before trying to read it.
    ///
    /// Element type and length are the two facts that would have settled this
    /// several builds ago and were never printed. A buffer logged as
    /// "NativeArray`1" hides whether it holds floats or vectors, and six were
    /// dismissed purely for refusing a float indexer.
    /// </summary>
    private static void Consider(string name, Type declared, Func<object> get)
    {
        object value;
        try { value = get(); } catch (Exception) { return; }
        if (value == null) return;

        var actual = value.GetType();
        var element = actual.IsGenericType ? actual.GetGenericArguments()[0] : null;

        var length = -1;
        try
        {
            var lp = actual.GetProperty("Length");
            if (lp != null && lp.PropertyType == typeof(int)) length = (int)lp.GetValue(value);
        }
        catch (Exception) { }

        var label = element == null ? declared.Name : $"{declared.Name.Split('`')[0]}<{element.Name}>";
        // A length of 321 means indexed by position along the beach, like GroundHeights.
        Mod.Log.Msg($"[probe]   {name} : {label}{(length >= 0 ? $"  len={length}" : "")}{(length == Samples ? "   <-- beach-length" : "")}");

        if (value is float[] arr) { Add(name, i => i < arr.Length ? arr[i] : float.NaN); return; }

        var item = actual.GetMethod("get_Item", new[] { typeof(int) });
        if (item == null) return;

        if (item.ReturnType == typeof(float))
        {
            Add(name, i => (float)item.Invoke(value, new object[] { i }));
            return;
        }

        // The interesting case: a water mesh stores its surface as vertices, and
        // the height is one component. Watch every float component rather than
        // assuming which axis is up.
        var parts = new List<FieldInfo>();
        foreach (var f in item.ReturnType.GetFields(BindingFlags.Public | BindingFlags.Instance))
            if (f.FieldType == typeof(float)) parts.Add(f);
        if (parts.Count == 0) return;

        foreach (var part in parts)
        {
            var component = part;
            Add($"{name}.{component.Name}", i =>
            {
                var v = item.Invoke(value, new object[] { i });
                return v == null ? float.NaN : (float)component.GetValue(v);
            });
        }
        Mod.Log.Msg($"[probe]     ^ {item.ReturnType.Name}, watching .{string.Join("/.", parts.ConvertAll(f => f.Name))}");
    }

    private static void Add(string name, Func<int, float> read)
    {
        var c = new Candidate
        {
            Name = name,
            Read = read,
            Lo = new float[Probe.Length],
            Hi = new float[Probe.Length],
        };
        for (var k = 0; k < Probe.Length; k++) { c.Lo[k] = float.MaxValue; c.Hi[k] = float.MinValue; }
        Candidates.Add(c);
    }
}
