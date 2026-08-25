using System;
using System.Reflection;
using System.Text;

namespace TidePool.SurfMP.Sync;

/// <summary>
/// The numbers the ocean is grown from.
///
/// The original plan had the host broadcasting the wave surface. That is dead:
/// the surface is a FLIP particle simulation over a 321 x 97 grid — 124 KB a
/// frame, 2.5 MB/s per peer at 20 Hz, against a planned 40 KB/s.
///
/// But it does not need sending. Sim.Wave exposes the generator's inputs —
/// Period, Lull, Curve, RightWave, LeftWave — and FluidSim the solver's setup.
/// Hand a client those, the level, and a shared clock, and it grows the same
/// sea for a few dozen bytes on join instead of megabytes a second.
///
/// Whether two machines then agree is the open question, and the reason this
/// reads the values before anything is built on them.
/// </summary>
internal static class WaveParams
{
    /// <summary>Wave generator inputs, in the order they are sent.</summary>
    private static readonly string[] WaveKeys = { "Period", "Lull", "Curve", "RightWave", "LeftWave" };

    /// <summary>Solver setup. Included because a different grid is a different ocean.</summary>
    private static readonly string[] FluidKeys =
    {
        "SimWidth", "SimHeight", "SimResolution", "Gravity", "FlipRatio",
        "Density", "InitialWaterHeight", "InitialGroundHeight", "LeftWallX", "RightWallX",
    };

    internal static bool Captured { get; private set; }

    /// <summary>Read once the game is up. Cheap, and the values do not change mid-session.</summary>
    internal static void Capture()
    {
        if (Captured || !GameHook.Ready) return;

        try
        {
            var manager = GameHook.Manager;
            var wave = Get(manager, "Wave");
            var fluid = Get(manager, "FluidSim");
            if (wave == null || fluid == null) return; // not built yet

            Captured = true;
            Mod.Log.Msg($"[params] wave  {Describe(wave, WaveKeys)}");
            Mod.Log.Msg($"[params] fluid {Describe(fluid, FluidKeys)}");
        }
        catch (Exception e) { Mod.Log.Error($"[params] {e.GetType().Name}: {e.Message}"); }
    }

    private static object Get(object target, string name)
    {
        var p = target.GetType().GetProperty(name, BindingFlags.Public | BindingFlags.Instance);
        return p?.GetValue(target);
    }

    private static string Describe(object target, string[] keys)
    {
        var row = new StringBuilder();
        foreach (var key in keys)
        {
            object v;
            try { v = Get(target, key); } catch (Exception) { continue; }
            if (v != null) row.Append($"{key}={v} ");
        }
        return row.Length > 0 ? row.ToString() : "(nothing readable)";
    }
}
