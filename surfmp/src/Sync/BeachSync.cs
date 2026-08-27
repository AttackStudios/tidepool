using System;
using System.Reflection;
using TidePool.SurfMP.Net;

namespace TidePool.SurfMP.Sync;

/// <summary>
/// Everyone loads the same beach at the same moment, so everyone gets the same
/// ocean.
///
/// This is the design that does not reach inside the simulation. Three that did
/// were tried on a live game and all three misfired: writing the surface
/// painted waves onto the seabed, writing ol() wound the wave distance upward,
/// and writing the generator's counters made it dump a block of water every few
/// seconds. That state is advanced by the simulation, not assigned from
/// outside.
///
/// Starting the same generator at the same instant needs none of it. The
/// measurement says it is enough: two loads of one beach, with nothing synced
/// at all, already agree to within 3% of wave amplitude and stay within 10cm
/// for 87 of 100 seconds. The waves were never really different — they just
/// started at different times.
///
/// So the only intervention is one call to load a beach, once, at an agreed
/// moment. Nothing is touched during play.
/// </summary>
internal static class BeachSync
{
    /// <summary>
    /// Long enough for the slowest peer to receive the message and settle,
    /// short enough that nobody wonders whether it worked.
    /// </summary>
    private const float Countdown = 3f;

    private static object _levels;
    private static MethodInfo _load;      // lk(string) -> bool
    private static MethodInfo _current;   // le() -> string
    private static bool _looked;

    private static string _pending;
    private static float _loadAt;

    /// <summary>
    /// When to call a beach because somebody joined.
    ///
    /// A client that joins mid-session has its own wave generator running from
    /// whenever it loaded, so it sees a different ocean from everyone else — the
    /// beach is the same, the waves are not. Reloading together is what puts
    /// every generator back on the same clock.
    ///
    /// Delayed a little so several people arriving at once cause one reload
    /// rather than one each.
    /// </summary>
    private static float _resyncAt;
    private static Session _session;

    /// <summary>
    /// Notices the beach changing under us.
    ///
    /// The editor can reshape the ground or reset the water on one machine, and
    /// nothing tells anyone else — so one player is suddenly surfing a different
    /// seabed and the oceans have no hope of matching. Rather than hooking each
    /// editor action, the ground itself is watched: any cause of divergence
    /// shows up the same way, whether it is a brush, a reset, or something not
    /// thought of yet.
    ///
    /// Sampled sparsely and slowly. This is a safety net, not a hot path.
    /// </summary>
    private const float CheckEvery = 1f;
    private const int Samples = 8;
    private const float Moved = 0.01f;

    private static object _fluidSim;
    private static MethodInfo _groundAt;
    private static MethodInfo _groundCount;
    private static float[] _ground;
    private static float _nextCheck;

    private static void WatchGround(float now, Session session)
    {
        if (now < _nextCheck) return;
        _nextCheck = now + CheckEvery;

        var current = SampleGround();
        if (current == null) return;

        if (_ground == null) { _ground = current; return; } // first look sets the baseline

        var changed = false;
        for (var i = 0; i < current.Length; i++)
            if (Math.Abs(current[i] - _ground[i]) > Moved) { changed = true; break; }

        _ground = current;
        if (!changed) return;

        Mod.Log.Msg("[beach] the ground changed under us");

        if (session == null || session.Role == Role.Offline) return;

        if (session.Role == Role.Host)
        {
            _resyncAt = now + 2f;
        }
        else
        {
            // A client cannot put everyone back in step; only the host can call
            // a beach. So ask.
            var buffer = new byte[Wire.MaxPacket];
            var w = new PacketWriter(buffer, Op.Resync);
            session.SendToHost(buffer, w.Length);
        }
    }

    private static float[] SampleGround()
    {
        try
        {
            if (_groundAt == null)
            {
                _fluidSim = GameHook.Manager?.GetType()
                    .GetProperty("FluidSim", BindingFlags.Public | BindingFlags.Instance)
                    ?.GetValue(GameHook.Manager);
                if (_fluidSim == null) return null;

                var t = _fluidSim.GetType();
                const BindingFlags Any = BindingFlags.Public | BindingFlags.Instance;
                // nn(int) reads a column's ground height; no() is how many there are.
                _groundAt = t.GetMethod("nn", Any, null, new[] { typeof(int) }, null);
                _groundCount = t.GetMethod("no", Any, null, Type.EmptyTypes, null);
                if (_groundAt == null || _groundCount == null) return null;
            }

            var count = _groundCount.Invoke(_fluidSim, null) is int n ? n : 0;
            if (count <= 0) return null;

            var taken = new float[Samples];
            for (var i = 0; i < Samples; i++)
            {
                var v = _groundAt.Invoke(_fluidSim, new object[] { i * (count - 1) / (Samples - 1) });
                taken[i] = v is float f ? f : 0f;
            }
            return taken;
        }
        catch (Exception) { return null; }
    }

    /// <summary>A client reported its beach changed; put the whole lineup back in step.</summary>
    internal static void ResyncRequested(float now)
    {
        if (_session == null || _session.Role != Role.Host) return;
        Mod.Log.Msg("[beach] a player's beach changed; resyncing everyone");
        _resyncAt = now + 2f;
    }

    internal static void Watch(Session session)
    {
        _session = session;
        session.Joined += _ =>
        {
            if (session.Role != Role.Host) return;
            _resyncAt = UnityEngine.Time.time + 2f;
        };
    }

    /// <summary>Host: tell everyone to load the beach we are on, together.</summary>
    internal static void Call(Session session, float now)
    {
        if (!_looked) { _looked = true; Locate(); }
        if (session == null || session.Role != Role.Host) { Mod.Log.Warning("[beach] only the host can call a beach"); return; }
        if (_load == null) { Mod.Log.Error("[beach] no level loader found"); return; }

        var name = CurrentName();
        if (string.IsNullOrEmpty(name)) { Mod.Log.Warning("[beach] no beach loaded to call"); return; }

        var packet = new byte[Wire.MaxPacket];
        var w = new PacketWriter(packet, Op.Beach);
        w.Str(name);
        w.Float(Countdown);
        session.Broadcast(packet, w.Length);

        // The host waits out the same countdown rather than loading at once, so
        // it lands with everybody else instead of a beat ahead.
        Schedule(name, now + Countdown);
        Mod.Log.Msg($"[beach] calling \"{name}\" in {Countdown:F0}s");
    }

    /// <summary>Client: a beach was called. Land on the same instant as the host.</summary>
    internal static void Receive(PacketReader r, Session session, float now)
    {
        var name = r.Str();
        var delay = r.Float();
        if (!r.Ok || string.IsNullOrEmpty(name)) return;

        // The message spent one trip in flight, so the host is already that far
        // into its countdown. Subtracting it is what makes both sides land
        // together rather than a ping apart.
        var at = now + delay - (session?.Latency ?? 0f);
        Schedule(name, at);
        Mod.Log.Msg($"[beach] \"{name}\" called, loading in {at - now:F2}s (latency {session?.Latency ?? 0f:F3}s)");
    }

    private static void Schedule(string name, float at)
    {
        _pending = name;
        _loadAt = at;
    }

    internal static void Tick(float now)
    {
        if (!_looked) { _looked = true; Locate(); }

        WatchGround(now, _session);

        // Someone joined: put the whole lineup back on one clock.
        if (_resyncAt > 0f && now >= _resyncAt)
        {
            _resyncAt = 0f;
            Mod.Log.Msg("[beach] syncing everyone to the host's waves");
            Call(_session, now);
        }

        if (_pending == null || now < _loadAt) return;

        var name = _pending;
        _pending = null;

        try
        {
            var ok = _load?.Invoke(_levels, new object[] { name });
            Mod.Log.Msg(ok is bool b && b
                ? $"[beach] loaded \"{name}\" — same ocean, same moment"
                : $"[beach] the game refused \"{name}\"");
        }
        catch (Exception e) { Mod.Log.Error($"[beach] loading \"{name}\": {e.GetType().Name}: {e.Message}"); }
    }

    /// <summary>The beach being surfed, for the server list to show.</summary>
    internal static string CurrentBeach()
    {
        if (!_looked) { _looked = true; Locate(); }
        return CurrentName() ?? "";
    }

    private static string CurrentName()
    {
        try { return _current?.Invoke(_levels, null) as string; }
        catch (Exception) { return null; }
    }

    private static void Locate()
    {
        if (!GameHook.Ready) { _looked = false; return; }

        try
        {
            _levels = GameHook.Manager.GetType()
                .GetProperty("Levels", BindingFlags.Public | BindingFlags.Instance)
                ?.GetValue(GameHook.Manager);
            if (_levels == null) { _looked = false; return; }

            var t = _levels.GetType();
            const BindingFlags Any = BindingFlags.Public | BindingFlags.Instance;

            // lk(string) -> bool loads a level by name and reports whether it
            // worked; le() -> string names the current one.
            _load = t.GetMethod("lk", Any, null, new[] { typeof(string) }, null);
            _current = t.GetMethod("le", Any, null, Type.EmptyTypes, null);

            Mod.Log.Msg($"[beach] loader {(_load != null ? "found" : "MISSING")}, " +
                        $"current beach \"{CurrentName()}\"");
        }
        catch (Exception e) { Mod.Log.Error($"[beach] {e.GetType().Name}: {e.Message}"); }
    }
}
