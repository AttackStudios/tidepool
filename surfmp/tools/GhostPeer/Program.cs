using System;
using System.Diagnostics;
using System.Threading;
using TidePool.SurfMP.Net;

namespace TidePool.SurfMP.Ghost;

/// <summary>
/// Joins a SurfMP session and surfs, without being a game.
///
/// Testing multiplayer normally needs two copies of Surf Sandbox, and a second
/// copy dies on launch. But the session layer has no idea what its peers are —
/// it moves position, heading and velocity between sockets. So this joins as a
/// real peer and streams a rider along the beach.
///
/// That exercises everything except a second player: handshake, peer table,
/// packet decode, the clone spawning in-game, and interpolation. If a surfer
/// appears in the water and moves smoothly, the netcode is proven end to end.
/// </summary>
internal static class Program
{
    private const float Extent = 512f;
    private const float SendEvery = 1f / 20f;

    private static int Main(string[] argv)
    {
        // "host" mode broadcasts a wave nobody could mistake for the game's own.
        // The game joins as a client, and if its water becomes this shape then
        // host-authoritative water works end to end — with one instance, which
        // matters because a second copy of the game dies on launch.
        if (argv.Length > 0 && argv[0] == "host") return HostWater(argv);

        var host = argv.Length > 0 ? argv[0] : "127.0.0.1";
        var port = argv.Length > 1 ? int.Parse(argv[1]) : 27581;
        var name = argv.Length > 2 ? argv[2] : "Ghost";
        var seconds = argv.Length > 3 ? double.Parse(argv[3]) : 90.0;

        NetLog.Info = m => Console.WriteLine("  " + m);
        NetLog.Warn = m => Console.WriteLine("  warn: " + m);
        NetLog.Error = m => Console.WriteLine("  error: " + m);

        var clock = Stopwatch.StartNew();
        var session = new Session();
        var joined = false;
        string refused = null;

        session.Joined += p => { joined = true; Console.WriteLine($"  saw peer: {p.Name}"); };

        // Report a called beach and the moment this peer would load it. The
        // countdown minus one trip time is what should put every peer on the
        // same instant, and this is where that arithmetic can be checked rather
        // than assumed.
        session.Payload += (from, op, r) =>
        {
            if (op != Op.Beach) return;
            var beach = r.Str();
            var delay = r.Float();
            if (!r.Ok) { Console.WriteLine("  beach call was truncated"); return; }
            var at = (float)clock.Elapsed.TotalSeconds + delay - session.Latency;
            Console.WriteLine($"  beach \"{beach}\" called: delay {delay:F2}s, " +
                              $"latency {session.Latency:F4}s, loading at t={at:F3}s");
        };
        session.Refused += r => refused = r;

        session.Join(host, port, name);

        var buffer = new byte[Wire.MaxPacket];
        var nextSend = 0.0;
        var sent = 0;

        // The lineup sits inside the sim's walls: RightWallX is 7.75 and the
        // player was found at about y=3, so a rider tracks across that span
        // rather than somewhere off in the void where nobody would see it.
        // y = 3.06 was read once at startup, before a beach had loaded, and put the
        // ghost in the sky. The rider actually sits near 1.10 in the water — a real
        // peer sends its own position, so only this invented one needed fixing.
        const float MinX = 1.0f, MaxX = 6.5f, WaterY = 1.10f;

        while (clock.Elapsed.TotalSeconds < seconds)
        {
            var now = (float)clock.Elapsed.TotalSeconds;
            session.Pump(now);

            if (refused != null) { Console.WriteLine($"  refused: {refused}"); return 1; }

            if (joined && now >= nextSend)
            {
                nextSend = now + SendEvery;

                // Track back and forth across the break, the way a rider works a
                // wave, so the motion is obviously driven rather than a drift.
                var phase = (float)((Math.Sin(now * 0.5) + 1.0) * 0.5);
                var x = MinX + (MaxX - MinX) * phase;
                var z = (float)Math.Sin(now * 1.3) * 0.4f;
                var vx = (float)(Math.Cos(now * 0.5) * 0.5 * (MaxX - MinX) * 0.5);
                var heading = vx >= 0 ? 90f : 270f;

                var w = new PacketWriter(buffer, Op.SurferState);
                w.Byte(session.SelfId);
                w.Height(x, -Extent, Extent);
                w.Height(WaterY, -Extent, Extent);
                w.Height(z, -Extent, Extent);
                w.Height(heading, 0f, 360f);
                w.Height(vx, -64f, 64f);
                w.Height(0f, -64f, 64f);
                w.Height(0f, -64f, 64f);

                session.SendToHost(buffer, w.Length);

                if (sent++ % 40 == 0)
                    Console.WriteLine($"  surfing at x={x:F2} z={z:F2}  ({sent} updates sent)");
            }

            Thread.Sleep(5);
        }

        session.Shutdown("done");
        Console.WriteLine(joined
            ? $"  finished — {sent} updates sent"
            : "  never got a Welcome; is the host up and hosting?");
        return joined ? 0 : 1;
    }

    /// <summary>
    /// Sends a travelling sine as the ocean surface.
    ///
    /// Deliberately nothing like a real break: a clean, obvious, repeating swell
    /// is unmistakable on screen, so the test cannot be passed by the client
    /// quietly showing its own water.
    /// </summary>
    /// <summary>
    /// Hosts a wave generator set to something unmistakable.
    ///
    /// The surface itself is no longer sent — the water is a particle
    /// simulation with no heightfield to overwrite. What syncs is the generator
    /// behind it, so this sends a period far shorter than the game's default of
    /// ten seconds. A client that starts producing waves every three seconds is
    /// obeying the host, and nothing else would cause that.
    /// </summary>
    /// <summary>
    /// Hosts wave starts.
    ///
    /// The wire format changed with the design: a wave is its size plus the two
    /// counters, sent once when it begins rather than continuously. Sending the
    /// old shape here would be read as generator state and written into the
    /// game — which is exactly how a live session got corrupted.
    ///
    /// The size alternates between clearly small and clearly large so the effect
    /// is unmistakable, and only ever changes at the start of a wave, which is
    /// the signature worth confirming.
    /// </summary>
    private static int HostWater(string[] argv)
    {
        var port = argv.Length > 1 ? int.Parse(argv[1]) : 27581;
        var seconds = argv.Length > 2 ? double.Parse(argv[2]) : 600.0;
        var every = argv.Length > 3 ? double.Parse(argv[3]) : 8.0;

        var session = new Session();
        session.Joined += p => Console.WriteLine($"  {p.Name} joined — sending wave starts");
        session.Host(port, "WaveHost");
        Console.WriteLine($"  hosting on {port}; a wave start every {every}s. Join with F10.");

        var clock = Stopwatch.StartNew();
        var buffer = new byte[Wire.MaxPacket];
        var next = 2.0;
        var n = 0;

        while (clock.Elapsed.TotalSeconds < seconds)
        {
            var now = (float)clock.Elapsed.TotalSeconds;
            session.Pump(now);

            if (now >= next)
            {
                next = now + every;

                // Alternating big and small, both well clear of the 1.4-2.2 the
                // game was observed producing, so neither could be mistaken for
                // the client's own wave.
                var size = (n % 2 == 0) ? 4.5f : 0.6f;

                var w = new PacketWriter(buffer, Op.WaveFrame);
                w.Float(size);   // beh / bob
                w.Float(0f);     // bei, reset as a wave begins
                w.Float(0f);     // bej
                w.Float(7f);     // period
                w.Float(15f);    // lull
                w.Bool(true);    // right
                w.Bool(false);   // left
                session.Broadcast(buffer, w.Length);

                n++;
                Console.WriteLine($"  wave {n} sent, size {size:F1}");
            }

            Thread.Sleep(5);
        }

        session.Shutdown("done");
        Console.WriteLine($"  finished — {n} wave starts");
        return 0;
    }
}
