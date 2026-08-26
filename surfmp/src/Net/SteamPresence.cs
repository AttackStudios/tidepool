using System;
using System.Collections.Generic;
using Steamworks;

namespace TidePool.SurfMP.Net;

/// <summary>
/// Finding someone to surf with, without anyone typing anything.
///
/// Pasting a Steam ID into a text file worked, but it is not something to ask
/// of a person who just wants to surf with a friend. Steam already solves this
/// with rich presence: a host advertises a "connect" string, and Steam then
/// shows "Join Game" beside their name in the friends list. Clicking it hands
/// that string straight back to the mod.
///
/// The same data answers the other half without any UI at all — the friends
/// list can be read directly, so the mod can find who is hosting and join them
/// on a keypress.
/// </summary>
internal static class SteamPresence
{
    /// <summary>Steam treats this key specially; setting it is what shows "Join Game".</summary>
    private const string ConnectKey = "connect";

    private static Callback<GameRichPresenceJoinRequested_t> _joinRequested;

    /// <summary>Raised when a friend clicks Join Game, carrying the host to connect to.</summary>
    internal static event Action<CSteamID> JoinRequested;

    internal static void Install()
    {
        if (!SteamRelay.Ready) return;
        try
        {
            _joinRequested = Callback<GameRichPresenceJoinRequested_t>.Create(e =>
            {
                if (!ulong.TryParse(e.m_rgchConnect, out var id)) return;
                NetLog.Info($"[steam] {SteamFriends.GetFriendPersonaName(e.m_steamIDFriend)} invited us in");
                JoinRequested?.Invoke(new CSteamID(id));
            });
        }
        catch (Exception e) { NetLog.Error($"[steam] join callback: {e.Message}"); }
    }

    /// <summary>Advertise that we are hosting, so friends get a Join Game button.</summary>
    internal static void Advertise(ulong selfId)
    {
        try
        {
            SteamFriends.SetRichPresence(ConnectKey, selfId.ToString());
            SteamFriends.SetRichPresence("steam_display", "#Status_Surfing");
            NetLog.Info("[steam] advertised — friends can now Join Game from Steam");
        }
        catch (Exception e) { NetLog.Warn($"[steam] advertising: {e.Message}"); }
    }

    /// <summary>Stop advertising, so the Join Game button disappears with the session.</summary>
    internal static void Withdraw()
    {
        try { SteamFriends.ClearRichPresence(); } catch (Exception) { }
    }

    internal readonly struct Host
    {
        internal readonly CSteamID Id;
        internal readonly string Name;
        internal Host(CSteamID id, string name) { Id = id; Name = name; }
    }

    /// <summary>
    /// Friends currently hosting a session.
    ///
    /// Read straight from their rich presence, so this needs no lobby, no server
    /// and no exchange of anything. A friend who is hosting simply has the key
    /// set, and anyone who is not does not appear.
    /// </summary>
    internal static List<Host> HostingFriends()
    {
        var found = new List<Host>();
        if (!SteamRelay.Ready) return found;

        try
        {
            var count = SteamFriends.GetFriendCount(EFriendFlags.k_EFriendFlagImmediate);
            for (var i = 0; i < count; i++)
            {
                var friend = SteamFriends.GetFriendByIndex(i, EFriendFlags.k_EFriendFlagImmediate);

                string connect;
                try { connect = SteamFriends.GetFriendRichPresence(friend, ConnectKey); }
                catch (Exception) { continue; }

                if (string.IsNullOrEmpty(connect)) continue;
                if (!ulong.TryParse(connect, out var id)) continue;

                found.Add(new Host(new CSteamID(id), SteamFriends.GetFriendPersonaName(friend)));
            }
        }
        catch (Exception e) { NetLog.Warn($"[steam] reading friends: {e.Message}"); }

        return found;
    }
}
