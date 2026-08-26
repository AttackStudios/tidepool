using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Steamworks;

namespace TidePool.SurfMP.Net;

/// <summary>
/// Connections carried by Valve's relay network.
///
/// The requirement this exists for: nobody hands out an IP address and nobody
/// configures a router. Peers address each other by Steam ID and the packets
/// travel through Steam, so neither side ever learns the other's address.
///
/// Direct connections are switched off deliberately. Steam would normally try
/// hole-punching first and fall back to the relay, which is faster — but a
/// successful punch means both machines know each other's IP, and that is the
/// exact thing being avoided. Relay always, even when it costs a few
/// milliseconds.
/// </summary>
internal sealed class SteamTransport : ITransport
{
    private readonly Dictionary<uint, HSteamNetConnection> _peers = new();
    private readonly IntPtr[] _inbox = new IntPtr[32];

    private HSteamListenSocket _listen;
    private Callback<SteamNetConnectionStatusChangedCallback_t> _statusChanged;
    private bool _hosting;
    private bool _running;

    public event Action<Peer, byte[], int> Received;

    /// <summary>Meaningless here — Steam addresses peers by identity, not port.</summary>
    public int Port => 0;

    internal SteamTransport(bool host, CSteamID connectTo = default)
    {
        _hosting = host;
        _statusChanged = Callback<SteamNetConnectionStatusChangedCallback_t>.Create(OnStatusChanged);

        var options = RelayOnly();

        if (host)
        {
            _listen = SteamNetworkingSockets.CreateListenSocketP2P(0, options.Length, options);
            Mod.Log.Msg("[steam] listening for relayed connections");
        }
        else
        {
            var identity = new SteamNetworkingIdentity();
            identity.SetSteamID(connectTo);
            var conn = SteamNetworkingSockets.ConnectP2P(ref identity, 0, options.Length, options);
            _peers[conn.m_HSteamNetConnection] = conn;
            Mod.Log.Msg($"[steam] connecting to {connectTo} over the relay");
        }
    }

    /// <summary>
    /// Turn off ICE, which is what would attempt a direct connection.
    /// Without this, a successful hole-punch hands both players each other's IP.
    /// </summary>
    private static SteamNetworkingConfigValue_t[] RelayOnly()
    {
        // Set by field: this Steamworks.NET has no SetInt32 helper, only the
        // struct's own m_eValue / m_eDataType / m_val, which is what the native
        // side reads anyway.
        var option = new SteamNetworkingConfigValue_t
        {
            m_eValue = ESteamNetworkingConfigValue.k_ESteamNetworkingConfig_P2P_Transport_ICE_Enable,
            m_eDataType = ESteamNetworkingConfigDataType.k_ESteamNetworkingConfig_Int32,
            m_val = new SteamNetworkingConfigValue_t.OptionValue { m_int32 = 0 },
        };
        return new[] { option };
    }

    public void Start() => _running = true;

    private void OnStatusChanged(SteamNetConnectionStatusChangedCallback_t e)
    {
        var conn = e.m_hConn;
        switch (e.m_info.m_eState)
        {
            case ESteamNetworkingConnectionState.k_ESteamNetworkingConnectionState_Connecting:
                // Only a host accepts; a client's outgoing connection reaches this
                // state too and must not try to accept itself.
                if (!_hosting) break;
                SteamNetworkingSockets.AcceptConnection(conn);
                _peers[conn.m_HSteamNetConnection] = conn;
                Mod.Log.Msg($"[steam] accepted {e.m_info.m_identityRemote.GetSteamID()}");
                break;

            case ESteamNetworkingConnectionState.k_ESteamNetworkingConnectionState_Connected:
                _peers[conn.m_HSteamNetConnection] = conn;
                Mod.Log.Msg("[steam] connected over the relay");
                break;

            case ESteamNetworkingConnectionState.k_ESteamNetworkingConnectionState_ClosedByPeer:
            case ESteamNetworkingConnectionState.k_ESteamNetworkingConnectionState_ProblemDetectedLocally:
                Mod.Log.Msg($"[steam] connection closed: {e.m_info.m_szEndDebug}");
                SteamNetworkingSockets.CloseConnection(conn, 0, null, false);
                _peers.Remove(conn.m_HSteamNetConnection);
                break;
        }
    }

    public void Send(Peer to, byte[] data, int length)
    {
        if (!_running || !_peers.TryGetValue(to.Connection, out var conn)) return;

        var buffer = Marshal.AllocHGlobal(length);
        try
        {
            Marshal.Copy(data, 0, buffer, length);
            // Unreliable and unordered, matching the UDP transport: the wave and
            // surfer snapshots supersede each other, so a late packet is worse
            // than a lost one.
            SteamNetworkingSockets.SendMessageToConnection(
                conn, buffer, (uint)length,
                Constants.k_nSteamNetworkingSend_Unreliable, out _);
        }
        catch (Exception e) { Mod.Log.Warning($"[steam] send: {e.Message}"); }
        finally { Marshal.FreeHGlobal(buffer); }
    }

    /// <summary>
    /// Drain every connection. Called from the main thread, unlike the UDP
    /// transport's socket thread — Steam's callbacks are pumped there anyway, so
    /// there is nothing to marshal and nothing to race.
    /// </summary>
    internal void Poll()
    {
        if (!_running) return;

        // Copied because a closing connection mutates the dictionary from the
        // status callback while this is iterating.
        List<uint> handles = null;
        foreach (var key in _peers.Keys) (handles ??= new List<uint>()).Add(key);
        if (handles == null) return;

        foreach (var handle in handles)
        {
            if (!_peers.TryGetValue(handle, out var conn)) continue;

            int count;
            try { count = SteamNetworkingSockets.ReceiveMessagesOnConnection(conn, _inbox, _inbox.Length); }
            catch (Exception) { continue; }

            for (var i = 0; i < count; i++)
            {
                try
                {
                    var message = Marshal.PtrToStructure<SteamNetworkingMessage_t>(_inbox[i]);
                    var bytes = new byte[message.m_cbSize];
                    Marshal.Copy(message.m_pData, bytes, 0, message.m_cbSize);
                    Received?.Invoke(new Peer(handle), bytes, bytes.Length);
                }
                catch (Exception e) { Mod.Log.Warning($"[steam] receive: {e.Message}"); }
                finally { SteamNetworkingMessage_t.Release(_inbox[i]); }
            }
        }
    }

    /// <summary>
    /// The first live connection, once one exists.
    ///
    /// A client asks to connect and gets a handle immediately, but cannot send
    /// until the relay has actually joined the two ends — so the opening Hello
    /// has to wait for this rather than vanish into a half-open socket.
    /// </summary>
    internal bool FirstPeer(out Peer peer)
    {
        foreach (var handle in _peers.Keys)
        {
            var info = default(SteamNetConnectionInfo_t);
            try
            {
                if (!SteamNetworkingSockets.GetConnectionInfo(_peers[handle], out info)) continue;
            }
            catch (Exception) { continue; }

            if (info.m_eState != ESteamNetworkingConnectionState.k_ESteamNetworkingConnectionState_Connected)
                continue;

            peer = new Peer(handle);
            return true;
        }

        peer = default;
        return false;
    }

    public void Dispose()
    {
        _running = false;

        foreach (var conn in _peers.Values)
        {
            try { SteamNetworkingSockets.CloseConnection(conn, 0, "leaving", false); }
            catch (Exception) { }
        }
        _peers.Clear();

        if (_hosting)
        {
            try { SteamNetworkingSockets.CloseListenSocket(_listen); } catch (Exception) { }
        }

        _statusChanged?.Dispose();
        _statusChanged = null;
    }
}
