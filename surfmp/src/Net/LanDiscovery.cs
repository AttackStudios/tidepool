using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

namespace TidePool.SurfMP.Net;

/// <summary>
/// Finding sessions on the same network, without Steam and without typing.
///
/// Two people in one house will already see each other through the Steam
/// browser, but that routes every packet out to Valve and back for a machine
/// three metres away, and it stops working the moment Steam does. A broadcast
/// finds them directly.
///
/// Hosts listen for a probe and answer it. Clients broadcast the probe and
/// collect whatever replies. Only hosts bind the well-known port, so several
/// clients on one machine never collide over it.
/// </summary>
internal static class LanDiscovery
{
    /// <summary>Separate from the game port, so discovery never disturbs a session.</summary>
    private const int Port = 27580;

    /// <summary>Identifies our traffic; anything else on this port is not ours.</summary>
    private const string Probe = "SURFMP?";
    private const string Reply = "SURFMP!";

    internal readonly struct Found
    {
        internal readonly IPAddress Address;
        internal readonly int GamePort;
        internal readonly string Name;
        internal readonly string Beach;

        internal Found(IPAddress address, int gamePort, string name, string beach)
        {
            Address = address; GamePort = gamePort; Name = name; Beach = beach;
        }
    }

    private static readonly Dictionary<string, Found> Seen = new();
    private static readonly object Lock = new();

    private static UdpClient _responder;
    private static Thread _answering;
    private static volatile bool _hosting;

    private static Func<string> _describe;

    // ---- hosting ---------------------------------------------------------

    /// <summary>Answer probes from the network. <paramref name="describe"/> supplies name and beach.</summary>
    internal static void StartAnswering(Func<string> describe, int gamePort)
    {
        StopAnswering();
        _describe = describe;

        try
        {
            _responder = new UdpClient();
            _responder.Client.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
            _responder.Client.Bind(new IPEndPoint(IPAddress.Any, Port));

            _hosting = true;
            _answering = new Thread(() => Answer(gamePort)) { IsBackground = true, Name = "SurfMP LAN" };
            _answering.Start();
            NetLog.Info("[lan] answering probes on the local network");
        }
        catch (Exception e)
        {
            _hosting = false;
            NetLog.Warn($"[lan] cannot answer probes: {e.Message}");
        }
    }

    internal static void StopAnswering()
    {
        _hosting = false;
        try { _responder?.Close(); } catch (Exception) { }
        _responder = null;
    }

    private static void Answer(int gamePort)
    {
        var from = new IPEndPoint(IPAddress.Any, 0);
        while (_hosting)
        {
            try
            {
                var packet = _responder.Receive(ref from);
                if (Encoding.UTF8.GetString(packet) != Probe) continue;

                // Name and beach travel with the reply, so a browser can show
                // something meaningful without a second round trip.
                var reply = Encoding.UTF8.GetBytes($"{Reply}|{gamePort}|{_describe?.Invoke() ?? "Surfer|"}");
                _responder.Send(reply, reply.Length, from);
            }
            catch (SocketException) { if (_hosting) continue; break; }
            catch (ObjectDisposedException) { break; }
            catch (Exception) { }
        }
    }

    // ---- browsing --------------------------------------------------------

    /// <summary>Ask the network who is hosting. Replies arrive over the next second or so.</summary>
    internal static void Sweep()
    {
        try
        {
            var probe = new UdpClient { EnableBroadcast = true };
            probe.Client.ReceiveTimeout = 900;

            var bytes = Encoding.UTF8.GetBytes(Probe);
            probe.Send(bytes, bytes.Length, new IPEndPoint(IPAddress.Broadcast, Port));

            new Thread(() => Collect(probe)) { IsBackground = true, Name = "SurfMP LAN sweep" }.Start();
        }
        catch (Exception e) { NetLog.Warn($"[lan] sweep: {e.Message}"); }
    }

    private static void Collect(UdpClient probe)
    {
        var from = new IPEndPoint(IPAddress.Any, 0);
        var found = new Dictionary<string, Found>();

        try
        {
            // Read until the socket times out; every host on the network gets a
            // chance to answer rather than only the quickest.
            while (true)
            {
                var packet = probe.Receive(ref from);
                var text = Encoding.UTF8.GetString(packet);
                if (!text.StartsWith(Reply, StringComparison.Ordinal)) continue;

                var parts = text.Split('|');
                if (parts.Length < 4) continue;
                if (!int.TryParse(parts[1], out var gamePort)) continue;

                found[from.Address.ToString()] = new Found(from.Address, gamePort, parts[2], parts[3]);
            }
        }
        catch (Exception) { /* timeout ends the sweep */ }
        finally { try { probe.Close(); } catch (Exception) { } }

        lock (Lock)
        {
            Seen.Clear();
            foreach (var kv in found) Seen[kv.Key] = kv.Value;
        }

        if (found.Count > 0) NetLog.Info($"[lan] {found.Count} session(s) on this network");
    }

    internal static List<Found> Servers()
    {
        lock (Lock) return new List<Found>(Seen.Values);
    }
}
