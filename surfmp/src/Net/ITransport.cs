using System;
using System.Net;

namespace TidePool.SurfMP.Net;

/// <summary>Where a packet came from, and where a reply goes back to.</summary>
/// <summary>
/// Where a packet came from, and where a reply goes.
///
/// Carries either a UDP endpoint or a Steam connection handle, because the two
/// transports address peers in completely different ways and the layers above
/// should not care which is in use. Only one is ever set.
/// </summary>
internal readonly struct Peer : IEquatable<Peer>
{
    internal readonly IPEndPoint EndPoint;
    internal readonly uint Connection;

    internal Peer(IPEndPoint endPoint) { EndPoint = endPoint; Connection = 0; }

    internal Peer(uint connection) { EndPoint = null; Connection = connection; }

    internal bool IsSteam => EndPoint == null && Connection != 0;

    public bool Equals(Peer other)
    {
        if (IsSteam || other.IsSteam) return Connection == other.Connection;
        return EndPoint != null && other.EndPoint != null &&
               EndPoint.Port == other.EndPoint.Port &&
               EndPoint.Address.Equals(other.EndPoint.Address);
    }

    public override bool Equals(object o) => o is Peer p && Equals(p);

    public override int GetHashCode() =>
        IsSteam ? Connection.GetHashCode() : EndPoint?.GetHashCode() ?? 0;

    public override string ToString() =>
        IsSteam ? $"steam:{Connection}" : EndPoint?.ToString() ?? "<none>";
}

/// <summary>
/// The seam under the netcode.
///
/// The game ships no Steamworks and no networking library of its own, so
/// SurfMP brings the whole stack. UDP is the implementation: it works on
/// localhost, which is the only way to test this alone, and unchanged on a LAN
/// or over the internet. Anything that needs NAT traversal or Steam invites
/// later is a new class behind this interface rather than a rewrite.
///
/// Delivery is unreliable by design. The two things sent constantly — the wave
/// surface and surfer positions — are snapshots where the newest supersedes
/// the last, so a dropped one costs a frame rather than correctness.
/// Handshake and chat need delivery guarantees and get them a layer up.
/// </summary>
internal interface ITransport : IDisposable
{
    /// <summary>Fired on the socket thread. Implementations must marshal before touching Unity.</summary>
    event Action<Peer, byte[], int> Received;

    /// <summary>Local port actually bound, which matters when the caller asked for any.</summary>
    int Port { get; }

    void Send(Peer to, byte[] data, int length);

    /// <summary>Begin receiving. Separate from the constructor so handlers can be attached first.</summary>
    void Start();
}
