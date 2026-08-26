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

    /// <summary>
    /// Reads what the host sends and writes nothing.
    ///
    /// Three ways of driving this generator have now been tried on a live game
    /// and all three did visible damage or nothing useful:
    ///
    ///  - Writing the surface into FluidSim's per-column array painted waves
    ///    onto the seabed, because that array is the ground.
    ///  - Writing ol() as a phase wound the wave distance upward all session and
    ///    glitched the rendering; ol() is not a clock.
    ///  - Writing beh/bob and zeroing bei/bej injected a block of water every
    ///    few seconds, so those counters are not a phase to be set — the
    ///    generator feeds water in as they advance, and resetting them makes it
    ///    dump a wave's worth at once.
    ///
    /// The pattern is consistent: this generator's state is meant to be advanced
    /// by the simulation, not assigned from outside. So nothing is written.
    ///
    /// Identical waves come instead from starting the same generator at the same
    /// moment — a synchronised beach load — which needs no reaching inside at
    /// all. The measurement supports it: two loads of one beach already agree to
    /// within 3% of wave amplitude for a hundred seconds.
    /// </summary>
    internal static void Apply(PacketReader r)
    {
        var size = r.Float();
        r.Float();
        r.Float();
        var period = r.Float();
        var lull = r.Float();
        r.Bool();
        r.Bool();
        if (!r.Ok || _wave == null) return;

        if (_applied++ % 10 != 0) return;
        Mod.Log.Msg($"[wave] host wave size {size:F2} period {period:F1} lull {lull:F1}; " +
                    $"local size {GetFloat(_beh, -1):F2} (not applied)");
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
