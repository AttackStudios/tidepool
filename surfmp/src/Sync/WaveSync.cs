using System;
using System.Reflection;
using UnityEngine;
using TidePool.SurfMP.Net;

namespace TidePool.SurfMP.Sync;

/// <summary>
/// Notices when oceans have drifted apart, and asks for them to be put back.
///
/// Clients each run their own simulation from the same start, which measurement
/// showed holds bit-exact for about twelve seconds and then slowly parts —
/// Burst accumulates in thread-completion order, and a fluid amplifies any
/// difference. Over a few minutes that becomes visibly different waves with
/// nobody having touched anything.
///
/// Correcting on a timer would interrupt play constantly and usually for no
/// reason. So the host publishes what its water looks like, clients compare
/// against their own, and a reload is asked for only once the two have actually
/// diverged. The comparison is cheap; the correction is the expensive part, and
/// it now happens when it is needed rather than on a schedule.
/// </summary>
internal static class WaveSync
{
    /// <summary>Often enough to catch drift early, rarely enough to be free.</summary>
    private const float Every = 5f;

    /// <summary>Across the surfable span; LeftWallX is 0 and RightWallX 7.75.</summary>
    private const int Columns = 8;
    private const float FirstX = 0.6f;
    private const float StepX = 0.9f;

    private const float MinH = -1f;
    private const float MaxH = 8f;

    /// <summary>
    /// How far apart before it counts as drift.
    ///
    /// Two runs of the same beach agreed to within 3% of wave amplitude — about
    /// 3cm — and riders displace water differently on each client because
    /// buoyancy is off on the clones. This has to sit well above that noise, or
    /// it would call a reload every few seconds for nothing.
    /// </summary>
    private const float Apart = 0.35f;

    /// <summary>Two readings in a row, so a passing wake never triggers a reload.</summary>
    private const int Consecutive = 2;

    private static readonly byte[] Out = new byte[Wire.MaxPacket];

    private static object _surfaceData;
    private static MethodInfo _heightAt;
    private static bool _looked;
    private static float _next;
    private static int _drifting;

    internal static void Tick(float now, Session session)
    {
        if (!_looked) { _looked = true; Locate(); }
        if (_heightAt == null || session == null || session.Role == Role.Offline) return;
        if (now < _next) return;
        _next = now + Every;

        if (session.Role != Role.Host) return;

        var w = new PacketWriter(Out, Op.WaveFrame);
        for (var i = 0; i < Columns; i++) w.Height(Height(FirstX + i * StepX), MinH, MaxH);
        session.Broadcast(Out, w.Length);
    }

    /// <summary>Client: compare the host's water with ours.</summary>
    internal static void Apply(PacketReader r, Session session)
    {
        if (_heightAt == null) return;

        var total = 0f;
        for (var i = 0; i < Columns; i++)
        {
            var theirs = r.Height(MinH, MaxH);
            var ours = Height(FirstX + i * StepX);
            var d = theirs - ours;
            total += d * d;
        }

        // A truncated packet would compare against whatever was in the buffer.
        if (!r.Ok) return;

        var apart = Mathf.Sqrt(total / Columns);

        if (apart < Apart) { _drifting = 0; return; }

        if (++_drifting < Consecutive) return;
        _drifting = 0;

        Mod.Log.Msg($"[wave] drifted {apart:F2}m from the host — asking for a resync");

        var w = new PacketWriter(Out, Op.Resync);
        session?.SendToHost(Out, w.Length);
    }

    private static float Height(float x)
    {
        try
        {
            var v = _heightAt.Invoke(_surfaceData, new object[] { new Vector3(x, 0f, 0f) });
            return v is float h && !float.IsNaN(h) ? h : 0f;
        }
        catch (Exception) { return 0f; }
    }

    private static void Locate()
    {
        if (!GameHook.Ready) { _looked = false; return; }

        try
        {
            _surfaceData = GameHook.Manager.GetType()
                .GetProperty("SurfaceData", BindingFlags.Public | BindingFlags.Instance)
                ?.GetValue(GameHook.Manager);
            if (_surfaceData == null) { _looked = false; return; }

            // oc(Vector3) is the water height at a position — what the character's
            // own physics asks, so it is what a rider would actually notice.
            _heightAt = _surfaceData.GetType().GetMethod("oc",
                BindingFlags.Public | BindingFlags.Instance, null, new[] { typeof(Vector3) }, null);
        }
        catch (Exception e) { Mod.Log.Error($"[wave] {e.GetType().Name}: {e.Message}"); }
    }
}
