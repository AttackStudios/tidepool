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

    /// <summary>Quaternion components are always within this, by definition.</summary>
    private const float Unit = 1f;

    private static readonly Dictionary<byte, RemoteSurfer> Remotes = new();
    private static readonly byte[] Out = new byte[Wire.MaxPacket];

    private static Session _session;
    private static float _nextSend;

    internal static Session Session => _session;

    internal static void Attach(Session session)
    {
        Detach();

        _session = session;
        ChatSync.Attach(session);
        BeachSync.Watch(session);
        session.Payload += OnPayload;
        session.Left += OnLeft;
    }

    internal static void Detach()
    {
        if (_session != null)
        {
            _session.Payload -= OnPayload;
            ChatSync.Detach();
            _session.Left -= OnLeft;
            _session = null;
        }

        foreach (var r in Remotes.Values) r.Despawn();
        Remotes.Clear();
    }

    /// <summary>Everyone else's name and where they are, for the nametags.</summary>
    internal static IEnumerable<(string Name, Vector3 Position)> Surfers()
    {
        foreach (var r in Remotes.Values)
            if (r != null) yield return (r.Name, r.Position);
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
        Write(ref w, p, v, LocalSurfer.Rotation);

        // Clients send to the host, which relays. Peer-to-peer would be one hop
        // shorter and would also put every player beyond the reach of a kick.
        if (_session.Role == Role.Host) _session.Broadcast(Out, w.Length);
        else _session.SendToHost(Out, w.Length);
    }

    private static void Write(ref PacketWriter w, Vector3 p, Vector3 v, Quaternion r)
    {
        // 16 bits an axis over 512 m is about 8 mm — well under anything visible
        // on a rider, and half the size of sending floats.
        w.Height(p.x, -Extent, Extent);
        w.Height(p.y, -Extent, Extent);
        w.Height(p.z, -Extent, Extent);

        // All four components, rather than a yaw angle. Six bytes more per
        // update buys an orientation that cannot be mistaken for its mirror.
        w.Height(r.x, -Unit, Unit);
        w.Height(r.y, -Unit, Unit);
        w.Height(r.z, -Unit, Unit);
        w.Height(r.w, -Unit, Unit);

        // Velocity only needs to be good enough to carry a rider between updates.
        w.Height(v.x, -64f, 64f);
        w.Height(v.y, -64f, 64f);
        w.Height(v.z, -64f, 64f);
    }

    private static void OnPayload(Member from, Op op, PacketReader r)
    {
        if (op == Op.WaveFrame) { WaveSync.Apply(r); return; }
        if (op == Op.Beach) { BeachSync.Receive(r, _session, UnityEngine.Time.time); return; }
        if (op == Op.Chat) { ChatSync.Receive(from, r); return; }
        if (op == Op.Resync) { BeachSync.ResyncRequested(UnityEngine.Time.time); return; }
        if (op != Op.SurferState) return;

        var id = r.Byte();
        var p = new Vector3(
            r.Height(-Extent, Extent), r.Height(-Extent, Extent), r.Height(-Extent, Extent));
        var rot = new Quaternion(
            r.Height(-Unit, Unit), r.Height(-Unit, Unit), r.Height(-Unit, Unit), r.Height(-Unit, Unit));
        var v = new Vector3(r.Height(-64f, 64f), r.Height(-64f, 64f), r.Height(-64f, 64f));

        // Quantising each component independently leaves the quaternion slightly
        // off unit length, which skews a rotation if left uncorrected.
        rot = Normalise(rot);

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

        surfer.Apply(p, rot, v);

        // The host is the only one that hears from everybody, so it is the only
        // one that can pass a rider on to the rest of the lineup.
        if (_session.Role == Role.Host)
        {
            var w = new PacketWriter(Out, Op.SurferState);
            w.Byte(id);
            Write(ref w, p, v, rot);
            _session.Broadcast(Out, w.Length, id);
        }
    }

    private static Quaternion Normalise(Quaternion q)
    {
        var len = Mathf.Sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
        if (len < 0.0001f) return Quaternion.identity;
        return new Quaternion(q.x / len, q.y / len, q.z / len, q.w / len);
    }

    private static void OnLeft(Member who, string why)
    {
        if (!Remotes.TryGetValue(who.Id, out var surfer)) return;
        surfer.Despawn();
        Remotes.Remove(who.Id);
        Mod.Log.Msg($"[surfer] {who.Name} left the water ({why})");
    }
}
