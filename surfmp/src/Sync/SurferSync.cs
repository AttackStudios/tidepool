using System;
using System.Collections.Generic;
using UnityEngine;
using TidePool.SurfMP.Net;

namespace TidePool.SurfMP.Sync;

/// <summary>
/// Puts the riders on the wire.
///
/// This is the whole of what SurfMP transmits. The wave is not sent — it is a
/// FLIP simulation over a 321 x 97 grid, 124 KB a frame, and it does not need
/// to be: every client grows the same sea from the same parameters. What cannot
/// be reproduced locally is where the other people are, so that is what crosses
/// the wire, and nothing else.
/// </summary>
internal static class SurferSync
{
    /// <summary>
    /// Twenty a second. Fast enough that interpolation has little to invent,
    /// slow enough that eight riders cost a few KB/s rather than megabytes.
    /// </summary>
    private const float SendEvery = 1f / 20f;

    /// <summary>Position is quantised over this range, in metres, per axis.</summary>
    private const float Extent = 512f;

    private static readonly Dictionary<byte, RemoteSurfer> Remotes = new();
    private static readonly byte[] Out = new byte[Wire.MaxPacket];

    private static Session _session;
    private static float _nextSend;

    internal static Session Session => _session;

    internal static void Attach(Session session)
    {
        Detach();

        _session = session;
        session.Payload += OnPayload;
        session.Left += OnLeft;
    }

    internal static void Detach()
    {
        if (_session != null)
        {
            _session.Payload -= OnPayload;
            _session.Left -= OnLeft;
            _session = null;
        }

        foreach (var r in Remotes.Values) r.Despawn();
        Remotes.Clear();
    }

    internal static void Tick(float dt, float now)
    {
        foreach (var r in Remotes.Values) r.Tick(dt);

        if (_session == null || _session.Role == Role.Offline) return;
        if (now < _nextSend || !LocalSurfer.Found) return;
        _nextSend = now + SendEvery;

        var p = LocalSurfer.Position;
        var v = LocalSurfer.Velocity;

        var w = new PacketWriter(Out, Op.SurferState);
        w.Byte(_session.SelfId);
        Write(ref w, p, v, LocalSurfer.Heading);

        // Clients send to the host, which relays. Peer-to-peer would be one hop
        // shorter and would also put every player beyond the reach of a kick.
        if (_session.Role == Role.Host) _session.Broadcast(Out, w.Length);
        else _session.SendToHost(Out, w.Length);
    }

    private static void Write(ref PacketWriter w, Vector3 p, Vector3 v, float heading)
    {
        // 16 bits an axis over 512 m is about 8 mm — well under anything visible
        // on a rider, and half the size of sending floats.
        w.Height(p.x, -Extent, Extent);
        w.Height(p.y, -Extent, Extent);
        w.Height(p.z, -Extent, Extent);
        w.Height(heading, 0f, 360f);
        // Velocity only needs to be good enough to carry a rider between updates.
        w.Height(v.x, -64f, 64f);
        w.Height(v.y, -64f, 64f);
        w.Height(v.z, -64f, 64f);
    }

    private static void OnPayload(Member from, Op op, PacketReader r)
    {
        if (op == Op.WaveFrame) { WaveSync.Apply(r); return; }
        if (op == Op.Beach) { BeachSync.Receive(r, _session, UnityEngine.Time.time); return; }
        if (op != Op.SurferState) return;

        var id = r.Byte();
        var p = new Vector3(
            r.Height(-Extent, Extent), r.Height(-Extent, Extent), r.Height(-Extent, Extent));
        var heading = r.Height(0f, 360f);
        var v = new Vector3(r.Height(-64f, 64f), r.Height(-64f, 64f), r.Height(-64f, 64f));

        // A truncated packet leaves the reader short; acting on half-read numbers
        // would teleport somebody to the origin.
        if (!r.Ok || id == _session.SelfId) return;

        if (!Remotes.TryGetValue(id, out var surfer))
        {
            var template = LocalSurfer.Template;
            if (template == null) return; // no local surfer to copy yet

            surfer = RemoteSurfer.Spawn(from.Name, template);
            if (surfer == null) return;
            Remotes[id] = surfer;
        }

        surfer.Apply(p, heading, v);

        // The host is the only one that hears from everybody, so it is the only
        // one that can pass a rider on to the rest of the lineup.
        if (_session.Role == Role.Host)
        {
            var w = new PacketWriter(Out, Op.SurferState);
            w.Byte(id);
            Write(ref w, p, v, heading);
            _session.Broadcast(Out, w.Length, id);
        }
    }

    private static void OnLeft(Member who, string why)
    {
        if (!Remotes.TryGetValue(who.Id, out var surfer)) return;
        surfer.Despawn();
        Remotes.Remove(who.Id);
        Mod.Log.Msg($"[surfer] {who.Name} left the water ({why})");
    }
}
