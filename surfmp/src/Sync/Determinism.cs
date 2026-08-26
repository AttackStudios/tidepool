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
