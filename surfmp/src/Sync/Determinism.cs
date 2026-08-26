using System;
using System.Reflection;
using System.Text;
using UnityEngine;

namespace TidePool.SurfMP.Sync;

/// <summary>
/// Asks whether this ocean can be reproduced, without needing anyone to time
/// anything.
///
/// Five attempts at this measurement failed, every one for the same reason:
/// the two runs were not comparable, and each fix asked a person to be more
/// precise than a person can be.
///
///  - Surfing during both runs measured the paddling.
///  - Not moving still measured the rider, because a board floats.
///  - Hashing was blind to phase on a half-second grid.
///  - Pressing a key to start measured when the key was pressed: one run began
///    at load on flat water, the other mid-swell.
///  - Detecting flat water caught an uninitialised surface of all zeros, and
///    the rider came back to life on reload and started pushing the water again.
///
/// So nothing here is left to timing. Recording begins when the water is
/// genuinely flat — uniform AND present, which is what separates the ocean's
/// starting state from a scene that has not loaded — the rider is removed at
/// that instant by this code rather than by a keypress, and the run ends itself
/// after a fixed length. Load a beach twice and the two runs are comparable by
/// construction.
/// </summary>
internal static class Determinism
{
    private const float Every = 0.5f;
    private const int MaxSamples = 200;

    /// <summary>Inside the simulated span: LeftWallX is 0, RightWallX 7.75.</summary>
    private const float FirstX = 0.5f;
    private const float StepX = 0.7f;
    private const int Columns = 10;

    /// <summary>Uniform to within this, across the beach.</summary>
    private const float Uniform = 0.02f;

    /// <summary>
    /// And actually wet. An unloaded scene reads a flat zero everywhere, which
    /// is uniform but is not an ocean; the real starting surface sits near
    /// InitialWaterHeight, about 0.97.
    /// </summary>
    private const float Wet = 0.3f;

    private static object _surfaceData;
    private static MethodInfo _heightAt;
    private static bool _looked;

    private static float _next;
    private static int _sample;
    private static bool _recording;
    private static bool _armed = true;
    private static bool _riderOff;

    internal static void Tick(float now)
    {
        if (!_looked) { _looked = true; Locate(); }
        if (_heightAt == null || now < _next) return;
        _next = now + Every;

        var h = Sample();
        if (h == null) return;

        if (!_recording)
        {
            if (!_armed || !IsStartingSurface(h)) return;

            // Take the rider out here rather than trusting that a key was pressed
            // and that the character survived a reload. It does not: reloading a
            // beach respawns it, and the last run recorded a surfer bobbing
            // through the whole thing.
            _riderOff = HideRider(true);
            _recording = true;
            _sample = 0;
            Mod.Log.Msg($"[determinism] === run start === flat at {h[0]:F4}, rider {(_riderOff ? "removed" : "STILL PRESENT")}");
        }

        Mod.Log.Msg($"[determinism] #{_sample++,-4} h= {Format(h)}");

        if (_sample < MaxSamples) return;

        _recording = false;
        _armed = false; // one run per load; reload the beach for the next
        if (_riderOff) HideRider(false);
        Mod.Log.Msg("[determinism] === run end === reload the beach for another");
    }

    /// <summary>Re-arm by hand if a run needs redoing without a reload.</summary>
    internal static void Restart()
    {
        _recording = false;
        _armed = true;
        Mod.Log.Msg("[determinism] armed — recording starts when the ocean is flat");
    }

    /// <summary>Kept on F7 for manual control; the run no longer depends on it.</summary>
    internal static void SuppressRider() => Restart();

    /// <summary>
    /// The ocean's canonical starting state: uniform across the beach, and wet.
    /// Both halves matter — zeros are uniform too, and they are not an ocean.
    /// </summary>
    private static bool IsStartingSurface(float[] h)
    {
        float lo = float.MaxValue, hi = float.MinValue;
        foreach (var v in h) { if (v < lo) lo = v; if (v > hi) hi = v; }
        return hi - lo < Uniform && lo > Wet;
    }

    private static bool HideRider(bool hide)
    {
        try
        {
            var rider = LocalSurfer.Template;
            if (rider == null) return false;
            rider.SetActive(!hide);
            return true;
        }
        catch (Exception e)
        {
            Mod.Log.Error($"[determinism] rider: {e.Message}");
            return false;
        }
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

            // oc(Vector3) -> Single is water height at a world position, and very
            // likely what the character's physics asks — which makes it both the
            // right thing to compare and the right thing to override later.
            var type = _surfaceData.GetType();
            _heightAt =
                type.GetMethod("oc", BindingFlags.Public | BindingFlags.Instance, null, new[] { typeof(Vector3) }, null) ??
                type.GetMethod("od", BindingFlags.Public | BindingFlags.Instance, null, new[] { typeof(Vector3) }, null);

            Mod.Log.Msg(_heightAt != null
                ? $"[determinism] armed — reading height via {_heightAt.Name}(Vector3)"
                : "[determinism] no height query on SurfaceData");
        }
        catch (Exception e) { Mod.Log.Error($"[determinism] {e.GetType().Name}: {e.Message}"); }
    }

    private static float[] Sample()
    {
        var values = new float[Columns];
        var read = 0;

        for (var i = 0; i < Columns; i++)
        {
            try
            {
                var v = _heightAt.Invoke(_surfaceData,
                    new object[] { new Vector3(FirstX + i * StepX, 0f, 0f) });
                if (v is not float h || float.IsNaN(h)) continue;
                values[i] = h;
                read++;
            }
            catch (Exception) { break; }
        }

        return read == Columns ? values : null;
    }

    private static string Format(float[] h)
    {
        var row = new StringBuilder();
        foreach (var v in h) row.Append(v.ToString("F4")).Append(' ');
        return row.ToString();
    }
}
