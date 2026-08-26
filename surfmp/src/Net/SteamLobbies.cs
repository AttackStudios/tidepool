using System;
using System.Collections.Generic;
using Steamworks;

namespace TidePool.SurfMP.Net;

/// <summary>
/// Public sessions anyone can find and join.
///
/// Rich presence only reaches friends, which is no use to someone who wants to
/// surf with people they have not met. A Steam lobby is public: hosts advertise
/// one, and anybody running SurfMP can list them and join, with no friendship,
/// no invite and no ID exchanged.
///
/// The lobby carries only what a browser needs — who is hosting, which beach,
/// how many are in the water. The actual connection is still the relay, so
/// listing a session never exposes an address.
/// </summary>
internal static class SteamLobbies
{
    /// <summary>Marks a lobby as ours, so the list is not full of other games' rooms.</summary>
    private const string Tag = "surfmp";
    private const string KeyTag = "surfmp_version";
    private const string KeyHost = "surfmp_host";
    private const string KeyName = "surfmp_name";
    private const string KeyBeach = "surfmp_beach";

    private static CallResult<LobbyCreated_t> _created;
    private static CallResult<LobbyMatchList_t> _listed;
    private static CSteamID _current;

    internal readonly struct Server
    {
        internal readonly CSteamID Host;
        internal readonly string Name;
        internal readonly string Beach;
        internal readonly int Players;

        internal Server(CSteamID host, string name, string beach, int players)
        {
            Host = host; Name = name; Beach = beach; Players = players;
        }
    }

    /// <summary>The most recent browse. Replaced wholesale when a new one arrives.</summary>
    internal static List<Server> Servers { get; private set; } = new();

    internal static bool Browsing { get; private set; }
    internal static event Action Updated;

    // ---- hosting ---------------------------------------------------------

    internal static void Advertise(string hostName, string beach, int maxPlayers = 8)
    {
        if (!SteamRelay.Ready) return;

        try
        {
            _created ??= CallResult<LobbyCreated_t>.Create(OnCreated);
            var call = SteamMatchmaking.CreateLobby(ELobbyType.k_ELobbyTypePublic, maxPlayers);
            _created.Set(call);
            _pendingName = hostName;
            _pendingBeach = beach;
            NetLog.Info("[lobby] advertising a public session");
        }
        catch (Exception e) { NetLog.Error($"[lobby] advertising: {e.Message}"); }
    }

    private static string _pendingName, _pendingBeach;

    private static void OnCreated(LobbyCreated_t result, bool failed)
    {
        if (failed || result.m_eResult != EResult.k_EResultOK)
        {
            NetLog.Warn($"[lobby] could not create a public session: {result.m_eResult}");
            return;
        }

        _current = new CSteamID(result.m_ulSteamIDLobby);

        try
        {
            // The tag is what makes this findable as a SurfMP session rather than
            // one of the many lobbies Steam is carrying for this app.
            SteamMatchmaking.SetLobbyData(_current, KeyTag, Tag);
            SteamMatchmaking.SetLobbyData(_current, KeyHost, SteamRelay.SelfId.ToString());
            SteamMatchmaking.SetLobbyData(_current, KeyName, _pendingName ?? "Surfer");
            SteamMatchmaking.SetLobbyData(_current, KeyBeach, _pendingBeach ?? "");
            NetLog.Info($"[lobby] listed publicly as \"{_pendingName}\" on {_pendingBeach}");
        }
        catch (Exception e) { NetLog.Error($"[lobby] describing the session: {e.Message}"); }
    }

    /// <summary>Keep the listing honest as people come and go.</summary>
    internal static void Update(string beach, int players)
    {
        if (_current == CSteamID.Nil) return;
        try
        {
            SteamMatchmaking.SetLobbyData(_current, KeyBeach, beach ?? "");
            SteamMatchmaking.SetLobbyData(_current, "surfmp_players", players.ToString());
        }
        catch (Exception) { }
    }

    internal static void Withdraw()
    {
        if (_current == CSteamID.Nil) return;
        try { SteamMatchmaking.LeaveLobby(_current); } catch (Exception) { }
        _current = CSteamID.Nil;
    }

    // ---- browsing --------------------------------------------------------

    internal static void Browse()
    {
        if (!SteamRelay.Ready || Browsing) return;

        try
        {
            _listed ??= CallResult<LobbyMatchList_t>.Create(OnListed);
            // Filter server-side so the reply only contains SurfMP sessions.
            SteamMatchmaking.AddRequestLobbyListStringFilter(
                KeyTag, Tag, ELobbyComparison.k_ELobbyComparisonEqual);
            SteamMatchmaking.AddRequestLobbyListResultCountFilter(50);

            Browsing = true;
            _listed.Set(SteamMatchmaking.RequestLobbyList());
        }
        catch (Exception e)
        {
            Browsing = false;
            NetLog.Error($"[lobby] browsing: {e.Message}");
        }
    }

    private static void OnListed(LobbyMatchList_t result, bool failed)
    {
        Browsing = false;

        var found = new List<Server>();
        if (failed) { NetLog.Warn("[lobby] browse failed"); Servers = found; Updated?.Invoke(); return; }

        for (var i = 0; i < result.m_nLobbiesMatching; i++)
        {
            try
            {
                var lobby = SteamMatchmaking.GetLobbyByIndex(i);
                var host = SteamMatchmaking.GetLobbyData(lobby, KeyHost);
                if (!ulong.TryParse(host, out var id) || id == 0) continue;

                // Our own session is in the list too, and joining yourself does
                // not work.
                if (id == SteamRelay.SelfId) continue;

                found.Add(new Server(
                    new CSteamID(id),
                    SteamMatchmaking.GetLobbyData(lobby, KeyName),
                    SteamMatchmaking.GetLobbyData(lobby, KeyBeach),
                    SteamMatchmaking.GetNumLobbyMembers(lobby)));
            }
            catch (Exception) { }
        }

        Servers = found;
        NetLog.Info($"[lobby] {found.Count} session(s) listed");
        Updated?.Invoke();
    }
}
