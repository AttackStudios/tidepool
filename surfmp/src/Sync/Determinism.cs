using System;
using System.Reflection;
using UnityEngine;

namespace TidePool.SurfMP.Sync;

/// <summary>
/// Asks the one question the whole design now rests on: does this simulation
/// produce the same ocean twice?
///
/// Identical waves for everyone means every client running the same simulation
/// from the same inputs, because the alternative — broadcasting the surface —
/// only sends what the water LOOKS like. SurfaceData's contours are render
/// geometry derived from the fluid, so a client given those would see the
/// host's wave while its physics still used its own. Surfing a wave you cannot
/// see is worse than drifting apart.
///
/// So: lockstep, or nothing. And lockstep is impossible if the simulation
/// cannot even reproduce itself on one machine.
///
/// This needs no second player and no second instance. Load a beach, let it
/// run, reload the same beach, and compare the two sequences. A simulation
/// that diverges from itself under identical conditions will never agree with
/// a copy on someone else's PC.
/// </summary>
internal static class Determinism
{
    /// <summary>Sim-time between samples. Keyed to time, not frames, so frame rate cannot shift the comparison.</summary>
    private const float Every = 0.5f;

    /// <summary>Enough of the surface to catch a difference, few enough to stay cheap.</summary>
    private const int Points = 64;

    private static MethodInfo _pointAt;
    private static object _surfaceData;
    private static bool _looked;

    private static float _next;
    private static int _sample;

    internal static void Tick(float now)
    {
        if (!_looked) { _looked = true; Locate(); }
        if (_pointAt == null || now < _next) return;
        _next = now + Every;

        var hash = Hash();
        if (hash == 0) return;

        // The rider's position goes in the same line as the hash.
        //
        // The first attempt at this test asked Jack to surf during both runs,
        // which guaranteed different inputs and made the divergence impossible
        // to attribute — a chaotic fluid being pushed differently will diverge
        // whether or not it is deterministic. Recording where the surfer was
        // turns "I did not move" from something to take on trust into something
        // the two logs can be checked against.
        var p = LocalSurfer.Found ? LocalSurfer.Position : Vector3.zero;

        // Sequence number, not timestamp: two runs are compared step by step,
        // and wall-clock start times will never match.
        Mod.Log.Msg($"[determinism] #{_sample++,-4} hash={hash:X8} at=({p.x:F2},{p.y:F2},{p.z:F2})");
    }

    /// <summary>Reset when a beach loads, so each run's sequence starts from zero.</summary>
    internal static void Restart()
    {
        _sample = 0;
        _next = 0f;
        Mod.Log.Msg("[determinism] --- run start ---");
    }

    /// <summary>
    /// Take the rider out of the water's physics.
    ///
    /// Two runs with no input still diverged, and the position log said why: the
    /// board floats. Buoyancy pushes water whether or not anyone paddles, the
    /// surfer drifted metres, and the two runs began from different spots — so
    /// the ocean was being forced differently before a single wave arrived.
    /// A rider in the water cannot be held still, so the only clean test is one
    /// with no rider in it.
    ///
    /// Disables only the components that couple the surfer to the fluid, rather
    /// than the whole character, so the camera keeps working and the run stays
    /// watchable.
    /// </summary>
    internal static void SuppressRider()
    {
        var template = LocalSurfer.Template;
        if (template == null) { Mod.Log.Warning("[determinism] no rider found"); return; }

        _suppressed = !_suppressed;

        // Switch the whole rider off rather than hunting for the components that
        // touch the fluid. Matching by name failed twice: first the generic
        // component lookup returned nothing, then every result reported its type
        // as "Behaviour" because GetType() on an interop wrapper describes the
        // wrapper. An inactive GameObject runs nothing at all, which needs no
        // names and cannot be got wrong.
        try { template.SetActive(!_suppressed); }
        catch (Exception e) { Mod.Log.Error($"[determinism] toggling rider: {e.Message}"); return; }

        Mod.Log.Msg(_suppressed
            ? "[determinism] STILL WATER \u2014 rider disabled, nothing is forcing the ocean"
            : "[determinism] rider back in the water");

        // Report the real class names while we are here: RemoteSurfer.Silence
        // needs them, and it is the same broken lookup that hid them.
        if (_suppressed) Inventory(template);

        Restart();
    }

    /// <summary>
    /// The rider's actual Il2Cpp class names.
    ///
    /// GetType() on an interop wrapper reports the wrapper, so every component
    /// looked like "Behaviour". Asking IL2CPP directly gives the real name.
    /// </summary>
    private static void Inventory(GameObject root)
    {
        try
        {
            var all = root.GetComponentsInChildren(
                Il2CppInterop.Runtime.Il2CppType.Of<Component>(), true);
            if (all == null) return;

            var names = new System.Text.StringBuilder();
            foreach (var component in all)
            {
                if (component == null) continue;
                names.Append(ClassName(component.Pointer)).Append(' ');
            }
            Mod.Log.Msg($"[determinism] rider components: {names}");
        }
        catch (Exception e) { Mod.Log.Error($"[determinism] inventory: {e.Message}"); }
    }

    private static string ClassName(IntPtr obj)
    {
        try
        {
            var klass = Il2CppInterop.Runtime.IL2CPP.il2cpp_object_get_class(obj);
            var namePtr = Il2CppInterop.Runtime.IL2CPP.il2cpp_class_get_name(klass);
            return System.Runtime.InteropServices.Marshal.PtrToStringAnsi(namePtr) ?? "?";
        }
        catch (Exception) { return "?"; }
    }

    private static bool _suppressed;

    private static void Locate()
    {
        if (!GameHook.Ready) { _looked = false; return; }

        try
        {
            var p = GameHook.Manager.GetType().GetProperty("SurfaceData",
                BindingFlags.Public | BindingFlags.Instance);
            _surfaceData = p?.GetValue(GameHook.Manager);
            if (_surfaceData == null) { _looked = false; return; }

            // ob(int, int) -> Vector3: a point on one of the surface contours.
            _pointAt = _surfaceData.GetType().GetMethod("ob",
                BindingFlags.Public | BindingFlags.Instance, null,
                new[] { typeof(int), typeof(int) }, null);

            Mod.Log.Msg(_pointAt != null
                ? "[determinism] watching the water surface"
                : "[determinism] SurfaceData.ob(int,int) not found");
        }
        catch (Exception e) { Mod.Log.Error($"[determinism] {e.GetType().Name}: {e.Message}"); }
    }

    /// <summary>
    /// FNV-1a over the raw bits of the sampled points.
    ///
    /// Raw bits deliberately: rounding first would hide exactly the small
    /// divergences this is looking for, and in a chaotic simulation small is
    /// how every large divergence begins.
    /// </summary>
    private static uint Hash()
    {
        unchecked
        {
            var h = 2166136261u;
            var read = 0;

            for (var i = 0; i < Points; i++)
            {
                object value;
                try { value = _pointAt.Invoke(_surfaceData, new object[] { 0, i * 4 }); }
                catch (Exception) { break; } // ran off the end of the contour
                if (value is not Vector3 v) break;

                foreach (var component in new[] { v.x, v.y, v.z })
                {
                    var bits = (uint)BitConverter.SingleToInt32Bits(component);
                    for (var b = 0; b < 4; b++)
                    {
                        h ^= (bits >> (b * 8)) & 0xFF;
                        h *= 16777619u;
                    }
                }
                read++;
            }

            // A hash of nothing is not evidence of agreement.
            return read < 8 ? 0u : h;
        }
    }
}
