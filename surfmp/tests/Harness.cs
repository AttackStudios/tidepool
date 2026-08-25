using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using TidePool.SurfMP.Net;

namespace TidePool.SurfMP.Harness;

/// <summary>
/// Runs a host and two clients over real localhost sockets and checks what
/// actually arrives. Not a mock: the same Session and UdpTransport that ship.
/// </summary>
internal static class Harness
{
    private const int HostPort = 27581;

    private static int _failed;
    private static readonly Stopwatch Clock = Stopwatch.StartNew();

    private static float Now => (float)Clock.Elapsed.TotalSeconds;

    private static int Main()
    {
        NetLog.Warn = m => Console.WriteLine("    warn: " + m);
        NetLog.Error = m => Console.WriteLine("    error: " + m);

        HandshakeAdmitsTwoClients();
        ProtocolMismatchIsRefused();
        ChatRelaysThroughTheHost();
        SilenceDropsAPeer();
        TruncatedPacketsDoNotThrow();

        Console.WriteLine();
        Console.WriteLine(_failed == 0 ? "PASS — all checks green" : $"FAIL — {_failed} check(s) failed");
        return _failed == 0 ? 0 : 1;
    }

    // ---- checks ----------------------------------------------------------

    private static void HandshakeAdmitsTwoClients()
    {
        Console.WriteLine("handshake: two clients join a host");

        var host = new Session();
        var a = new Session();
        var b = new Session();

        var announced = new List<string>();
        host.Joined += m => announced.Add(m.Name);

        try
        {
            host.Host(HostPort, "Jack");
            a.Join("127.0.0.1", HostPort, "Ripper");
            b.Join("127.0.0.1", HostPort, "Kook");

            Settle(host, a, b);

            Is(Count(host) == 2, $"host sees both clients (saw {Count(host)})");
            Is(announced.Count == 2, $"host raised Joined twice (raised {announced.Count})");
            Is(a.SelfId != 0 && b.SelfId != 0, "each client was assigned an id");
            Is(a.SelfId != b.SelfId, "the two clients got different ids");

            // The first client was already in when the second arrived, so it must
            // have learned about it through PeerJoin rather than the Welcome list.
            Is(Count(a) == 2, $"first client sees host and the later joiner (saw {Count(a)})");
            Is(Count(b) == 2, $"second client sees host and the earlier joiner (saw {Count(b)})");
        }
        finally { Close(host, a, b); }
    }

    private static void ProtocolMismatchIsRefused()
    {
        Console.WriteLine("handshake: a mismatched protocol is refused, with a reason");

        var host = new Session();
        try
        {
            host.Host(HostPort, "Jack");

            // Speak by hand from a socket that stays open, so the host's reply can
            // actually be read. No real client joins here: the whole point is that
            // the host admits nobody, and a legitimate peer would mask that.
            using var sock = new System.Net.Sockets.Socket(
                System.Net.Sockets.AddressFamily.InterNetwork,
                System.Net.Sockets.SocketType.Dgram,
                System.Net.Sockets.ProtocolType.Udp);
            sock.Bind(new System.Net.IPEndPoint(System.Net.IPAddress.Loopback, 0));
            sock.ReceiveTimeout = 1000;

            var buf = new byte[Wire.MaxPacket];
            var w = new PacketWriter(buf, Op.Hello);
            w.UShort((ushort)(Wire.Protocol + 99));
            w.Str("Stranger");
            sock.SendTo(buf, 0, w.Length, System.Net.Sockets.SocketFlags.None,
                new System.Net.IPEndPoint(System.Net.IPAddress.Loopback, HostPort));

            Settle(host);

            Is(Count(host) == 0, $"the mismatched peer was not admitted (host sees {Count(host)})");

            var reply = new byte[Wire.MaxPacket];
            var got = 0;
            try { got = sock.Receive(reply); } catch (Exception) { }

            if (!Is(got > 0, "the host answered rather than ignoring it")) return;

            var r = new PacketReader(reply, got);
            var op = r.Opcode();
            if (!Is(op == Op.Reject, $"the answer is a refusal (got {op})")) return;

            var reason = r.Str();
            Is(r.Ok && reason.Length > 0, $"the refusal carries a reason (\"{reason}\")");
            Is(reason.Contains("version") || reason.Contains("protocol"),
               "the reason names the version mismatch rather than being generic");
        }
        finally { Close(host); }
    }

    private static void ChatRelaysThroughTheHost()
    {
        Console.WriteLine("relay: a client's payload reaches the other client via the host");

        var host = new Session();
        var a = new Session();
        var b = new Session();

        var heardByHost = new List<string>();
        var heardByB = new List<string>();

        host.Payload += (from, op, r) =>
        {
            if (op != Op.Chat) return;
            var text = r.Str();
            heardByHost.Add(text);

            // What the host does with it: stamp the sender and pass it on. Chat
            // never goes peer to peer, so mute is enforced somewhere a client
            // cannot patch out.
            var buf = new byte[Wire.MaxPacket];
            var w = new PacketWriter(buf, Op.Chat);
            w.Byte(from.Id);
            w.Str(text);
            host.Broadcast(buf, w.Length, from.Id);
        };

        b.Payload += (from, op, r) =>
        {
            if (op != Op.Chat) return;
            r.Byte();
            heardByB.Add(r.Str());
        };

        try
        {
            host.Host(HostPort, "Jack");
            a.Join("127.0.0.1", HostPort, "Ripper");
            b.Join("127.0.0.1", HostPort, "Kook");
            Settle(host, a, b);

            var msg = new byte[Wire.MaxPacket];
            var mw = new PacketWriter(msg, Op.Chat);
            mw.Str("surf's up");
            a.SendToHost(msg, mw.Length);

            Settle(host, a, b);

            Is(heardByHost.Contains("surf's up"), "the host received the message");
            Is(heardByB.Contains("surf's up"), "the other client received the relay");
        }
        finally { Close(host, a, b); }
    }

    private static void SilenceDropsAPeer()
    {
        Console.WriteLine("liveness: a peer that stops responding is dropped");

        var host = new Session();
        var client = new Session();
        Member dropped = null;
        host.Left += (m, _) => dropped = m;

        try
        {
            host.Host(HostPort, "Jack");
            client.Join("127.0.0.1", HostPort, "Ghost");
            Settle(host, client);
            Is(Count(host) == 1, "the client is in");

            // Kill the client without a goodbye — the pulled-power case, which is
            // the only one a timeout exists for. A clean quit sends Bye.
            client.Dispose();

            // Sweep uses the clock the caller passes, so the timeout can be
            // crossed directly rather than by waiting eight real seconds.
            for (var i = 0; i < 40; i++) { host.Pump(Now + 20f); Thread.Sleep(5); }

            Is(Count(host) == 0, $"the silent peer was dropped (host still sees {Count(host)})");
            Is(dropped != null && dropped.Name == "Ghost", "the host reported who left");
        }
        finally { Close(host); }
    }

    private static void TruncatedPacketsDoNotThrow()
    {
        Console.WriteLine("robustness: malformed packets are survived, not trusted");

        var host = new Session();
        try
        {
            host.Host(HostPort, "Jack");

            // A Hello claiming a name far longer than the bytes that follow: the
            // shape of a truncated packet, and of a hostile one.
            var buf = new byte[Wire.MaxPacket];
            buf[0] = (byte)Op.Hello;
            buf[1] = 1; buf[2] = 0;
            buf[3] = 200;
            RawSend(buf, 8, HostPort);

            RawSend(new byte[] { (byte)Op.Hello }, 1, HostPort);
            RawSend(new byte[] { 200, 200, 200 }, 3, HostPort);
            RawSend(new byte[0], 0, HostPort);

            Settle(host);

            Is(Count(host) == 0, "no half-read peer was admitted");
            Is(true, "the session survived the malformed packets");
        }
        catch (Exception e) { Is(false, $"a malformed packet threw: {e.GetType().Name}: {e.Message}"); }
        finally { Close(host); }
    }

    // ---- plumbing --------------------------------------------------------

    /// <summary>Pump everyone for a while, since delivery is asynchronous even on loopback.</summary>
    private static void Settle(params Session[] sessions)
    {
        for (var i = 0; i < 60; i++)
        {
            foreach (var s in sessions) s.Pump(Now);
            Thread.Sleep(5);
        }
    }

    private static int Count(Session s)
    {
        var n = 0;
        foreach (var _ in s.Members) n++;
        return n;
    }

    private static void RawSend(byte[] data, int length, int port)
    {
        using var sock = new System.Net.Sockets.Socket(
            System.Net.Sockets.AddressFamily.InterNetwork,
            System.Net.Sockets.SocketType.Dgram,
            System.Net.Sockets.ProtocolType.Udp);
        sock.SendTo(data, 0, length, System.Net.Sockets.SocketFlags.None,
            new System.Net.IPEndPoint(System.Net.IPAddress.Loopback, port));
    }

    private static void Close(params Session[] sessions)
    {
        foreach (var s in sessions) { try { s.Dispose(); } catch (Exception) { } }
        Thread.Sleep(120); // let the ports come free before the next check binds them
    }

    private static bool Is(bool ok, string what)
    {
        Console.WriteLine((ok ? "  ok   " : "  FAIL ") + what);
        if (!ok) _failed++;
        return ok;
    }
}
