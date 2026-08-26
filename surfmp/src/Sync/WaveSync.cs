using System;
using System.Reflection;
using UnityEngine;
using TidePool.SurfMP.Net;

namespace TidePool.SurfMP.Sync;

/// <summary>
/// Keeps everyone's ocean in step by syncing what generates it.
///
/// Two earlier designs are ruled out by measurement, and both are worth
/// recording so they are not tried again:
///
/// Broadcasting the surface does not work. The water is a FLIP particle
/// simulation, not a heightfield — FluidSim's only per-column array, nl/nn/no,
/// turned out to be the seabed, and writing waves into it painted them onto the
/// sand. There is nothing to overwrite because the surface is emergent.
///
/// Bit-exact lockstep does not work either. Two runs on one machine from an
/// identical flat start held bit-identical for twelve seconds and then parted,
/// almost certainly because Burst accumulates in thread-completion order.
///
/// But the same measurement, read at the scale a surfer cares about, is far
/// kinder than it first looked: mean surface height across those runs
/// correlates at r = 0.75, and the difference is 3% of wave amplitude. The wave
/// train is reproducible; only the froth is not. Waves arrive at the same time,
/// the same size, in the same order.
///
/// So sync the generator, not the water. Sim.Wave holds Period, Lull, the
/// side flags and a phase, and ol()/om() read and write that phase. Give every
/// client the same generator state and they grow the same swell — a few dozen
/// bytes, and the detail no one can see is allowed to differ.
/// </summary>
internal static class WaveSync
{
    /// <summary>Generator state changes slowly; there is nothing to gain from spamming it.</summary>
    private const float SendEvery = 0.5f;

    /// <summary>
    /// Only correct phase when it has slipped by more than this, in seconds.
    /// Writing it constantly would fight the local generator and stutter the
    /// swell; letting it slide would put people on different waves.
    /// </summary>
    private const float MaxSlip = 0.05f;

    private static readonly byte[] Out = new byte[Wire.MaxPacket];

    private static object _wave;
    private static MethodInfo _getPhase;   // ol()
    private static MethodInfo _setPhase;   // om(float)
    private static PropertyInfo _period, _lull, _right, _left;
    private static bool _looked;
    private static float _nextSend;

    internal static void Tick(float now, Session session)
    {
        if (!_looked) { _looked = true; Locate(); }
        if (_wave == null || session == null || session.Role != Role.Host) return;
        if (now < _nextSend) return;
        _nextSend = now + SendEvery;

        var w = new PacketWriter(Out, Op.WaveFrame);
        w.Float(Phase());
        w.Float(GetFloat(_period, 10f));
        w.Float(GetFloat(_lull, 30f));
        w.Bool(GetBool(_right, true));
        w.Bool(GetBool(_left, false));
        session.Broadcast(Out, w.Length);
    }

    /// <summary>
    /// Read-only for now.
    ///
    /// The previous build wrote Period, Lull and a phase straight into the live
    /// generator, and it visibly corrupted the game: the log shows the phase
    /// being forced by 0.51s a hundred times running, never converging. Two
    /// things were wrong. The test host has no game behind it, so the phase it
    /// sent was its own wall clock and meant nothing here. And the constant
    /// delta says the value did not move after being set, which suggests om()
    /// is not the phase setter at all.
    ///
    /// Writing unverified state into a running simulation is how that ends. So
    /// this observes and reports until ol() is understood, and applies nothing.
    /// </summary>
    internal static void Apply(PacketReader r)
    {
        var phase = r.Float();
        var period = r.Float();
        var lull = r.Float();
        r.Bool();
        r.Bool();
        if (!r.Ok || _wave == null) return;

        if (_reports++ % 20 != 0) return;
        Mod.Log.Msg($"[wave] host says phase {phase:F2} period {period:F1} lull {lull:F1}; " +
                    $"local phase {Phase():F2} period {GetFloat(_period, -1):F1}");
    }

    private static int _reports;

    /// <summary>
    /// Watch what ol() does on its own, so it can be identified rather than
    /// guessed at. A value climbing at one unit per second is a clock and can be
    /// synced; anything else is not a phase and must not be written.
    /// </summary>
    internal static void Observe(float now)
    {
        if (_wave == null || now < _nextObserve) return;
        var first = _nextObserve == 0f;
        _nextObserve = now + 1f;

        var p = Phase();
        if (!first)
        {
            var rate = (p - _lastPhase) / 1f;
            Mod.Log.Msg($"[wave] ol() = {p:F3}  (changing {rate:+0.000;-0.000}/s)");
        }
        _lastPhase = p;
    }

    private static float _nextObserve;
    private static float _lastPhase;

    private static float Phase()
    {
        try
        {
            var v = _getPhase?.Invoke(_wave, null);
            return v is float f && !float.IsNaN(f) ? f : 0f;
        }
        catch (Exception) { return 0f; }
    }

    private static float GetFloat(PropertyInfo p, float fallback)
    {
        try { return p?.GetValue(_wave) is float f ? f : fallback; }
        catch (Exception) { return fallback; }
    }

    private static bool GetBool(PropertyInfo p, bool fallback)
    {
        try { return p?.GetValue(_wave) is bool b ? b : fallback; }
        catch (Exception) { return fallback; }
    }

    private static void SetFloat(PropertyInfo p, float v)
    {
        try { if (p != null && p.CanWrite) p.SetValue(_wave, v); } catch (Exception) { }
    }

    private static void SetBool(PropertyInfo p, bool v)
    {
        try { if (p != null && p.CanWrite) p.SetValue(_wave, v); } catch (Exception) { }
    }

    private static void Locate()
    {
        if (!GameHook.Ready) { _looked = false; return; }

        try
        {
            _wave = GameHook.Manager.GetType()
                .GetProperty("Wave", BindingFlags.Public | BindingFlags.Instance)
                ?.GetValue(GameHook.Manager);
            if (_wave == null) { _looked = false; return; }

            var t = _wave.GetType();
            const BindingFlags Any = BindingFlags.Public | BindingFlags.Instance;

            _period = t.GetProperty("Period", Any);
            _lull = t.GetProperty("Lull", Any);
            _right = t.GetProperty("RightWave", Any);
            _left = t.GetProperty("LeftWave", Any);

            // ol() and om(float) are a get/set pair on Sim.Wave, and the only
            // float-valued state it carries besides its configuration — so the
            // phase the swell is generated from. Logged, not assumed.
            _getPhase = t.GetMethod("ol", Any, null, Type.EmptyTypes, null);
            _setPhase = t.GetMethod("om", Any, null, new[] { typeof(float) }, null);

            Mod.Log.Msg($"[wave] generator found — period {GetFloat(_period, -1):F1}, " +
                        $"lull {GetFloat(_lull, -1):F1}, phase {Phase():F2}, " +
                        $"settable {(_setPhase != null ? "yes" : "no")}");
        }
        catch (Exception e) { Mod.Log.Error($"[wave] {e.GetType().Name}: {e.Message}"); }
    }
}
