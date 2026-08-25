using System;
using System.Net;
using System.Net.Sockets;
using System.Threading;

namespace TidePool.SurfMP.Net;

/// <summary>
/// A UDP socket with a receive thread.
///
/// One socket serves both roles. A host binds a known port and learns each
/// client from the packets they send; a client binds any free port and talks to
/// the host's. That symmetry is what makes two instances on one machine work,
/// which is the only way to test this without a second person.
/// </summary>
internal sealed class UdpTransport : ITransport
{
    private readonly Socket _socket;
    private readonly Thread _pump;
    private volatile bool _running;

    public event Action<Peer, byte[], int> Received;

    public int Port { get; }

    internal UdpTransport(int port)
    {
        _socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);

        // On Windows an ICMP port-unreachable from a peer that has gone away
        // otherwise surfaces as ConnectionReset on the *next* receive and kills
        // the pump. A host outliving its clients is the normal case, not an error.
        try { _socket.IOControl(unchecked((int)0x9800000C), new byte[] { 0, 0, 0, 0 }, null); }
        catch (Exception) { /* not Windows, or not supported; the pump handles it either way */ }

        _socket.Bind(new IPEndPoint(IPAddress.Any, port));
        Port = ((IPEndPoint)_socket.LocalEndPoint).Port;

        _pump = new Thread(Pump) { IsBackground = true, Name = "SurfMP receive" };
    }

    public void Start()
    {
        if (_running) return;
        _running = true;
        _pump.Start();
    }

    public void Send(Peer to, byte[] data, int length)
    {
        if (!_running || to.EndPoint == null) return;
        try { _socket.SendTo(data, 0, length, SocketFlags.None, to.EndPoint); }
        catch (SocketException e) { NetLog.Warn($"[net] send to {to}: {e.SocketErrorCode}"); }
        catch (ObjectDisposedException) { /* shutting down */ }
    }

    private void Pump()
    {
        // Each datagram gets its own buffer. The handler hands bytes to the main
        // thread through a queue, so a shared buffer would be overwritten by the
        // next packet before anyone read the last one.
        EndPoint from = new IPEndPoint(IPAddress.Any, 0);

        while (_running)
        {
            try
            {
                var buf = new byte[Wire.MaxPacket];
                var n = _socket.ReceiveFrom(buf, ref from);
                if (n > 0) Received?.Invoke(new Peer((IPEndPoint)from), buf, n);
            }
            catch (SocketException e)
            {
                // A peer vanishing is routine and must not end the session.
                if (e.SocketErrorCode is SocketError.ConnectionReset or SocketError.Interrupted) continue;
                if (_running) NetLog.Error($"[net] receive: {e.SocketErrorCode}");
                break;
            }
            catch (ObjectDisposedException) { break; }
        }
    }

    public void Dispose()
    {
        _running = false;
        try { _socket.Close(); } catch (Exception) { }
        // The pump is a background thread blocked in ReceiveFrom; closing the
        // socket is what wakes it, and it exits on the next loop check.
    }
}
