using System;
using System.Collections.Generic;
using TidePool.SurfMP.Net;

namespace TidePool.SurfMP.Sync;

/// <summary>
/// Talking to the lineup.
///
/// Messages go to the host and the host passes them on. Never peer to peer:
/// relaying through one place is what makes muting somebody possible at all,
/// since a client-side check is a check that can be patched out.
///
/// The log carries joins and departures alongside what people type, so it
/// doubles as the record of who is in the water.
/// </summary>
internal static class ChatSync
{
    /// <summary>Enough to scroll back through a session, not enough to grow forever.</summary>
    private const int Keep = 60;

    private static readonly List<string> Lines = new();
    private static readonly byte[] Out = new byte[Wire.MaxPacket];

    private static Session _session;

    internal static IReadOnlyList<string> Log => Lines;
    internal static event Action Changed;

    internal static void Attach(Session session)
    {
        Detach();
        _session = session;
        session.Joined += m => System("* " + m.Name + " paddled out");
        session.Left += (m, why) => System("* " + m.Name + " went in (" + why + ")");
    }

    internal static void Detach()
    {
        _session = null;
        Lines.Clear();
        Changed?.Invoke();
    }

    internal static void Say(string text)
    {
        if (_session == null || _session.Role == Role.Offline) return;

        text = text?.Trim();
        if (string.IsNullOrEmpty(text)) return;

        // Shown locally straight away rather than waiting for it to come back:
        // a message that pauses before appearing reads as a dropped one.
        Add(_session.SelfName + ": " + text);

        var w = new PacketWriter(Out, Op.Chat);
        w.Byte(_session.SelfId);
        w.Str(text);

        if (_session.Role == Role.Host) _session.Broadcast(Out, w.Length);
        else _session.SendToHost(Out, w.Length);
    }

    internal static void Receive(Member from, PacketReader r)
    {
        var id = r.Byte();
        var text = r.Str();
        if (!r.Ok || string.IsNullOrEmpty(text)) return;

        // Attribute to the peer the packet actually arrived from, not to whoever
        // the packet claims — otherwise anyone can speak as anyone.
        Add(from.Name + ": " + text);

        if (_session is { Role: Role.Host })
        {
            var w = new PacketWriter(Out, Op.Chat);
            w.Byte(id);
            w.Str(text);
            _session.Broadcast(Out, w.Length, from.Id);
        }
    }

    private static void System(string line) => Add(line);

    private static void Add(string line)
    {
        Lines.Add(line);
        if (Lines.Count > Keep) Lines.RemoveAt(0);
        Changed?.Invoke();
    }
}
