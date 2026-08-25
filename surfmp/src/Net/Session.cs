using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net;

namespace TidePool.SurfMP.Net;

internal enum Role { Offline, Host, Client }

/// <summary>Someone in the water with you.</summary>
internal sealed class Member
{
    internal byte Id;
    internal string Name;
    internal Peer Peer;
    /// <summary>Unity time of the last packet. Silence past a threshold means gone.</summary>
    internal float LastHeard;
}

/// <summary>
/// Session lifecycle and the peer table.
///
/// Host-authoritative: the host owns the member list, assigns ids and relays
/// everything. Clients only ever talk to the host, so mute and kick are
/// enforced at the one place a client cannot patch out.
///
/// Every packet arrives on the socket thread and is queued rather than handled
/// there. Unity's API is main-thread-only, and a netcode thread reaching into
/// it is the kind of crash that appears once an hour with no useful stack.
/// </summary>
internal sealed class Session : IDisposable
{
    /// <summary>Long enough to ride out a stall, short enough that a quit is noticed.</summary>
    private const float Timeout = 8f;
    private const float PingEvery = 2f;

    private readonly ConcurrentQueue<(Peer From, byte[] Data, int Length)> _inbound = new();
    private readonly Dictionary<byte, Member> _members = new();
    private readonly byte[] _out = new byte[Wire.MaxPacket];

    private ITransport _transport;
    private Peer _host;
    private byte _nextId = 1;
    private float _nextPing;

    internal Role Role { get; private set; } = Role.Offline;
    internal byte SelfId { get; private set; }
    internal string SelfName { get; private set; } = "Surfer";
    internal IEnumerable<Member> Members => _members.Values;

    internal event Action<Member> Joined;
    internal event Action<Member, string> Left;
    /// <summary>Payload that is not session bookkeeping: wave, surfer state, chat.</summary>
    internal event Action<Member, Op, PacketReader> Payload;
    internal event Action<string> Refused;

    // ---- lifecycle -------------------------------------------------------

    internal void Host(int port, string name)
    {
        Shutdown("restarting");
        SelfName = name;
        _transport = new UdpTransport(port);
        _transport.Received += Enqueue;
        _transport.Start();
        Role = Role.Host;
        SelfId = 0;
        NetLog.Info($"[net] hosting on port {_transport.Port} as {name}");
    }

    internal void Join(string address, int port, string name)
    {
        Shutdown("restarting");
        SelfName = name;
        _transport = new UdpTransport(0);
        _transport.Received += Enqueue;
        _transport.Start();
        Role = Role.Client;
        _host = new Peer(new IPEndPoint(IPAddress.Parse(address), port));

        var w = new PacketWriter(_out, Op.Hello);
        w.UShort(Wire.Protocol);
        w.Str(name);
        _transport.Send(_host, _out, w.Length);
        NetLog.Info($"[net] joining {address}:{port} as {name}");
    }

    internal void Shutdown(string why)
    {
        if (Role == Role.Offline) return;

        // Say goodbye rather than letting everyone discover it by timeout.
        var w = new PacketWriter(_out, Op.Bye);
        w.Str(why);
        if (Role == Role.Host) foreach (var m in _members.Values) _transport?.Send(m.Peer, _out, w.Length);
        else _transport?.Send(_host, _out, w.Length);

        _transport?.Dispose();
        _transport = null;
        _members.Clear();
        Role = Role.Offline;
        SelfId = 0;
        while (_inbound.TryDequeue(out _)) { }
    }

    public void Dispose() => Shutdown("closing");

    // ---- send ------------------------------------------------------------

    /// <summary>Host to everyone. <paramref name="except"/> skips the originator on a relay.</summary>
    internal void Broadcast(byte[] data, int length, byte except = 255)
    {
        if (Role != Role.Host) return;
        foreach (var m in _members.Values)
            if (m.Id != except) _transport.Send(m.Peer, data, length);
    }

    /// <summary>Client to host. Anything reaching other players is relayed by the host.</summary>
    internal void SendToHost(byte[] data, int length)
    {
        if (Role == Role.Client) _transport.Send(_host, data, length);
    }

    // ---- receive ---------------------------------------------------------

    private void Enqueue(Peer from, byte[] data, int length) => _inbound.Enqueue((from, data, length));

    /// <summary>Drain and service the session. Main thread only — call from OnUpdate.</summary>
    internal void Pump(float now)
    {
        if (Role == Role.Offline) return;

        while (_inbound.TryDequeue(out var packet))
        {
            var r = new PacketReader(packet.Data, packet.Length);
            var op = r.Opcode();
            if (!r.Ok) continue;
            Handle(packet.From, op, ref r, now);
        }

        Sweep(now);
    }

    private void Handle(Peer from, Op op, ref PacketReader r, float now)
    {
        var member = Find(from);
        if (member != null) member.LastHeard = now;

        switch (op)
        {
            case Op.Hello when Role == Role.Host:
                Admit(from, ref r, now);
                return;

            case Op.Welcome when Role == Role.Client:
                SelfId = r.Byte();
                var count = r.Byte();
                for (var i = 0; i < count && r.Ok; i++)
                {
                    var m = new Member { Id = r.Byte(), Name = r.Str(), Peer = from, LastHeard = now };
                    if (r.Ok) { _members[m.Id] = m; Joined?.Invoke(m); }
                }
                NetLog.Info($"[net] joined as peer {SelfId}, {_members.Count} already here");
                return;

            case Op.Reject when Role == Role.Client:
                var reason = r.Str();
                NetLog.Warn($"[net] refused: {reason}");
                Refused?.Invoke(reason);
                Shutdown("refused");
                return;

            case Op.Ping:
                var pong = new PacketWriter(_out, Op.Pong);
                if (Role == Role.Host) _transport.Send(from, _out, pong.Length);
                else SendToHost(_out, pong.Length);
                return;

            case Op.Pong:
                return;

            case Op.PeerJoin when Role == Role.Client:
                var joiner = new Member { Id = r.Byte(), Name = r.Str(), Peer = from, LastHeard = now };
                if (!r.Ok) return;
                _members[joiner.Id] = joiner;
                Joined?.Invoke(joiner);
                return;

            case Op.PeerLeave when Role == Role.Client:
                var goneId = r.Byte();
                if (_members.Remove(goneId, out var gone)) Left?.Invoke(gone, r.Str());
                return;

            case Op.Bye:
                if (Role == Role.Client)
                {
                    // The host going away ends the session for everyone; there is
                    // no migration, and pretending otherwise would strand people
                    // in a lineup with no wave.
                    NetLog.Info("[net] host closed the session");
                    Refused?.Invoke("The host ended the session.");
                    Shutdown("host left");
                }
                else if (member != null) Drop(member, "left");
                return;
        }

        // Anything else is for a layer above, and only from someone already admitted.
        if (member != null) Payload?.Invoke(member, op, r);
    }

    private void Admit(Peer from, ref PacketReader r, float now)
    {
        var protocol = r.UShort();
        var name = r.Str();
        if (!r.Ok) return;

        var existing = Find(from);
        if (existing != null) return; // A repeated Hello means our Welcome was lost, not a second player.

        if (protocol != Wire.Protocol)
        {
            var no = new PacketWriter(_out, Op.Reject);
            no.Str($"Different SurfMP version — host speaks protocol {Wire.Protocol}, you speak {protocol}.");
            _transport.Send(from, _out, no.Length);
            return;
        }

        if (_members.Count >= 7)
        {
            var full = new PacketWriter(_out, Op.Reject);
            full.Str("This session is full.");
            _transport.Send(from, _out, full.Length);
            return;
        }

        var m = new Member { Id = _nextId++, Name = name, Peer = from, LastHeard = now };

        // Tell the newcomer who is already here, before adding them — otherwise
        // the list they receive includes themselves.
        var hi = new PacketWriter(_out, Op.Welcome);
        hi.Byte(m.Id);
        hi.Byte((byte)(_members.Count + 1));
        hi.Byte(0);
        hi.Str(SelfName);
        foreach (var other in _members.Values) { hi.Byte(other.Id); hi.Str(other.Name); }
        _transport.Send(from, _out, hi.Length);

        var news = new PacketWriter(_out, Op.PeerJoin);
        news.Byte(m.Id);
        news.Str(m.Name);
        Broadcast(_out, news.Length);

        _members[m.Id] = m;
        NetLog.Info($"[net] {name} joined as peer {m.Id}");
        Joined?.Invoke(m);
    }

    private void Sweep(float now)
    {
        if (now >= _nextPing)
        {
            _nextPing = now + PingEvery;
            var ping = new PacketWriter(_out, Op.Ping);
            if (Role == Role.Host) Broadcast(_out, ping.Length);
            else SendToHost(_out, ping.Length);
        }

        if (Role != Role.Host) return;

        List<Member> lost = null;
        foreach (var m in _members.Values)
            if (now - m.LastHeard > Timeout) (lost ??= new List<Member>()).Add(m);
        if (lost != null) foreach (var m in lost) Drop(m, "timed out");
    }

    private void Drop(Member m, string why)
    {
        _members.Remove(m.Id);
        var bye = new PacketWriter(_out, Op.PeerLeave);
        bye.Byte(m.Id);
        bye.Str(why);
        Broadcast(_out, bye.Length);
        NetLog.Info($"[net] {m.Name} {why}");
        Left?.Invoke(m, why);
    }

    private Member Find(Peer p)
    {
        foreach (var m in _members.Values) if (m.Peer.Equals(p)) return m;
        return null;
    }
}
