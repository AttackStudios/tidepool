using System;
using System.Text;

namespace TidePool.SurfMP.Net;

/// <summary>What a packet is. Ordered by how often it goes out, not by importance.</summary>
internal enum Op : byte
{
    /// <summary>Client to host: protocol number, name, mod set. First thing sent.</summary>
    Hello = 1,
    /// <summary>Host to client: you are in, here is your peer id and the peers already here.</summary>
    Welcome = 2,
    /// <summary>Host to client: you are not in, and here is exactly what is missing.</summary>
    Reject = 3,
    /// <summary>Keeps NAT bindings alive and doubles as the liveness check.</summary>
    Ping = 4,
    Pong = 5,
    /// <summary>Host to everyone: the wave surface. Lossy on purpose — the newest one wins.</summary>
    WaveFrame = 6,
    /// <summary>A surfer's position and state. Also lossy.</summary>
    SurferState = 7,
    /// <summary>Chat, relayed via the host so mute can be enforced somewhere a client cannot patch.</summary>
    Chat = 8,
    PeerJoin = 9,
    PeerLeave = 10,
    /// <summary>Host is going away; everyone falls back to single player.</summary>
    Bye = 11,
}

internal static class Wire
{
    /// <summary>
    /// Bumped only when the wire format changes incompatibly. Mod versions are
    /// tracked separately so a cosmetic release does not lock friends out of
    /// each other's sessions.
    /// </summary>
    internal const ushort Protocol = 1;

    /// <summary>
    /// Well under a typical 1500-byte MTU once IP and UDP headers are taken off.
    /// Staying inside one datagram means no IP fragmentation, where losing any
    /// one fragment silently costs the whole packet.
    /// </summary>
    internal const int MaxPacket = 1200;
}

/// <summary>Little-endian writer over a caller-owned buffer. No allocation per packet.</summary>
internal struct PacketWriter
{
    private readonly byte[] _buf;
    private int _at;

    internal PacketWriter(byte[] buffer, Op op)
    {
        _buf = buffer;
        _at = 0;
        Byte((byte)op);
    }

    internal int Length => _at;

    internal void Byte(byte v) => _buf[_at++] = v;

    internal void Bool(bool v) => Byte(v ? (byte)1 : (byte)0);

    internal void UShort(ushort v)
    {
        _buf[_at++] = (byte)v;
        _buf[_at++] = (byte)(v >> 8);
    }

    internal void Int(int v)
    {
        _buf[_at++] = (byte)v;
        _buf[_at++] = (byte)(v >> 8);
        _buf[_at++] = (byte)(v >> 16);
        _buf[_at++] = (byte)(v >> 24);
    }

    internal void Float(float v) => Int(BitConverter.SingleToInt32Bits(v));

    /// <summary>
    /// Height samples, quantised to 16 bits over a fixed range. Halves the
    /// wave frame outright, and at ~0.1 mm of resolution across a 6 m span the
    /// error is far below anything a rider could see.
    /// </summary>
    internal void Height(float metres, float lo, float hi)
    {
        var t = (metres - lo) / (hi - lo);
        if (t < 0f) t = 0f; else if (t > 1f) t = 1f;
        UShort((ushort)(t * ushort.MaxValue + 0.5f));
    }

    internal void Str(string s)
    {
        s ??= string.Empty;
        var bytes = Encoding.UTF8.GetBytes(s);
        // One length byte: names and chat lines are short, and a cap here is
        // also what stops a peer describing a string longer than the packet.
        if (bytes.Length > 255) Array.Resize(ref bytes, 255);
        Byte((byte)bytes.Length);
        Buffer.BlockCopy(bytes, 0, _buf, _at, bytes.Length);
        _at += bytes.Length;
    }
}

/// <summary>
/// Little-endian reader. Every read is bounds-checked, because the bytes come
/// off a socket: a truncated or hostile packet must fail cleanly rather than
/// read whatever happens to sit past the end of the buffer.
/// </summary>
internal struct PacketReader
{
    private readonly byte[] _buf;
    private readonly int _end;
    private int _at;

    internal PacketReader(byte[] buffer, int length)
    {
        _buf = buffer;
        _end = length;
        _at = 0;
        Ok = true;
    }

    /// <summary>False once any read ran past the end. Check before trusting anything read.</summary>
    internal bool Ok { get; private set; }

    private bool Want(int n)
    {
        if (Ok && _at + n <= _end) return true;
        Ok = false;
        return false;
    }

    internal Op Opcode() => (Op)Byte();

    internal byte Byte() => Want(1) ? _buf[_at++] : (byte)0;

    internal bool Bool() => Byte() != 0;

    internal ushort UShort()
    {
        if (!Want(2)) return 0;
        var v = (ushort)(_buf[_at] | (_buf[_at + 1] << 8));
        _at += 2;
        return v;
    }

    internal int Int()
    {
        if (!Want(4)) return 0;
        var v = _buf[_at] | (_buf[_at + 1] << 8) | (_buf[_at + 2] << 16) | (_buf[_at + 3] << 24);
        _at += 4;
        return v;
    }

    internal float Float() => BitConverter.Int32BitsToSingle(Int());

    internal float Height(float lo, float hi) => lo + (hi - lo) * (UShort() / (float)ushort.MaxValue);

    internal string Str()
    {
        var n = Byte();
        if (!Want(n)) return string.Empty;
        var s = Encoding.UTF8.GetString(_buf, _at, n);
        _at += n;
        return s;
    }
}
