using System;
using System.Collections.Generic;
using System.Reflection;
using System.Text;
using TidePool.SurfMP.Net;

namespace TidePool.SurfMP.Sync;

/// <summary>
/// Keeps everyone on the same wave by syncing the generator that makes them.
///
/// Three designs were tried and two are ruled out by measurement:
///
/// Broadcasting the surface cannot work — the water is a FLIP particle
/// simulation, and FluidSim's only per-column array turned out to be the
/// seabed, so writing waves into it painted them onto the sand.
///
/// Bit-exact lockstep cannot work either: two runs from an identical flat start
/// on one machine held bit-identical for twelve seconds and then parted.
///
/// But read at the scale a surfer cares about, those same runs correlate at
/// r = 0.75 and differ by 3% of wave amplitude. The wave train reproduces;
/// only the froth does not. So the generator is what needs syncing.
///
/// Its state was found by watching, not guessing — which matters, because
/// guessing here already corrupted a live session. ol() looked like a phase and
/// is actually the wave distance; it sat at 1.375 for an entire session while a
/// rising clock was written into it. What actually counts is bei and bej, which
/// climb and reset together as beh and bob take the next wave's size.
///
/// A wave therefore starts on an edge, and that is the only moment anything is
/// sent: one small message every ten seconds or so, rather than continuous
/// writes into a running simulation.
/// </summary>
internal static class WaveSync
{
    private static readonly byte[] Out = new byte[Wire.MaxPacket];

    private static object _wave;
    private static PropertyInfo _period, _lull, _right, _left;

    /// <summary>Live generator state, named by observation.</summary>
    private static PropertyInfo _beh, _bei, _bej, _bob;

    private static bool _looked;
    private static bool _writable;
    private static float _lastCount;
    private static int _sent, _applied;

    // ---- host ------------------------------------------------------------

    internal static void Tick(float now, Session session)
    {
        if (!_looked) { _looked = true; Locate(); }
        if (_wave == null || session == null || session.Role != Role.Host) return;

        var count = GetFloat(_bei, 0f);
        var started = count < _lastCount - 0.001f;
        _lastCount = count;
        if (!started) return;

        var w = new PacketWriter(Out, Op.WaveFrame);
        w.Float(GetFloat(_beh, 0f));
        w.Float(count);
        w.Float(GetFloat(_bej, 0f));
        w.Float(GetFloat(_period, 10f));
        w.Float(GetFloat(_lull, 30f));
        w.Bool(GetBool(_right, true));
        w.Bool(GetBool(_left, false));
        session.Broadcast(Out, w.Length);

        if (_sent++ % 10 == 0) Mod.Log.Msg($"[wave] sent wave {_sent}, size {GetFloat(_beh, -1):F3}");
    }

    // ---- client ----------------------------------------------------------

    internal static void Apply(PacketReader r)
    {
        var size = r.Float();
        var countA = r.Float();
        var countB = r.Float();
        var period = r.Float();
        var lull = r.Float();
        var right = r.Bool();
        var left = r.Bool();

        // A truncated read would reconfigure the ocean from whatever was left in
        // the buffer — the same shape of mistake that glitched a session before.
        if (!r.Ok || _wave == null || !_writable) return;

        SetFloat(_period, period);
        SetFloat(_lull, lull);
        SetBool(_right, right);
        SetBool(_left, left);

        // Start the wave the host just started: same size, counters where theirs
        // are. Between waves both sides count on their own at the same rate, so
        // there is nothing to say until the next one begins.
        SetFloat(_beh, size);
        SetFloat(_bob, size);
        SetFloat(_bei, countA);
        SetFloat(_bej, countB);

        if (_applied++ % 10 == 0)
            Mod.Log.Msg($"[wave] wave {_applied} from host, size {size:F3} (now {GetFloat(_beh, -1):F3})");
    }

    // ---- observation -----------------------------------------------------

    private static List<PropertyInfo> _watched;
    private static float[] _previous;
    private static float _nextObserve;

    /// <summary>
    /// Report the generator's state periodically. This is what identified the
    /// fields in the first place, and it stays so a wrong one shows up as a
    /// number rather than as a glitching game.
    /// </summary>
    internal static void Observe(float now)
    {
        if (_wave == null || now < _nextObserve) return;
        var first = _nextObserve == 0f;
        _nextObserve = now + 5f;

        if (_watched == null)
        {
            _watched = new List<PropertyInfo>();
            foreach (var p in new[] { _beh, _bei, _bej, _bob })
                if (p != null) _watched.Add(p);
            _previous = new float[_watched.Count];
        }

        var row = new StringBuilder();
        for (var i = 0; i < _watched.Count; i++)
        {
            var v = GetFloat(_watched[i], float.NaN);
            row.Append($"{_watched[i].Name}={v:F3} ");
            _previous[i] = v;
        }

        if (!first) Mod.Log.Msg($"[wave] {row}");
    }

    // ---- plumbing --------------------------------------------------------

    private static float GetFloat(PropertyInfo p, float fallback)
    {
        try { return p?.GetValue(_wave) is float f && !float.IsNaN(f) ? f : fallback; }
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

            _beh = t.GetProperty("beh", Any);
            _bei = t.GetProperty("bei", Any);
            _bej = t.GetProperty("bej", Any);
            _bob = t.GetProperty("bob", Any);

            _writable = _beh is { CanWrite: true } && _bei is { CanWrite: true }
                     && _bej is { CanWrite: true } && _bob is { CanWrite: true };

            Mod.Log.Msg($"[wave] generator found — period {GetFloat(_period, -1):F1}, " +
                        $"lull {GetFloat(_lull, -1):F1}, size {GetFloat(_beh, -1):F3}, " +
                        $"syncable {(_writable ? "yes" : "NO")}");
        }
        catch (Exception e) { Mod.Log.Error($"[wave] {e.GetType().Name}: {e.Message}"); }
    }
}
