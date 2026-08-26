using System;
using System.Reflection;
using System.Text;
using HarmonyLib;
using UnityEngine;
using TidePool.SurfMP.Net;

namespace TidePool.SurfMP.Sync;

/// <summary>
/// One ocean, everybody's.
///
/// The host simulates and clients do not. Two clients cannot disagree about a
/// wave neither of them computes, which is the only way to promise identical
/// waves — measurement settled that. Two runs on one machine from the same flat
/// start stayed bit-identical for twelve seconds and then drifted, so clients
/// each simulating will never stay together however carefully inputs are synced.
///
/// What crosses the wire is the surface: heights across the break, quantised to
/// 16 bits. About 320 bytes a frame, 6 KB/s at 20 Hz — against 124 KB a frame
/// for the fluid volume that made this look impossible earlier. The surface is
/// not the simulation.
///
/// On a client the height query is intercepted, so the water the physics reads
/// is the host's. Rendering has to follow the same data or a rider ends up
/// surfing a wave they cannot see, which is worse than drifting apart.
/// </summary>
internal static class WaveSync
{
    /// <summary>Columns across the break. 161 over ~10 units is about 6 cm apart.</summary>
    private const int Columns = 161;

    private const float MinX = 0f;
    private const float MaxX = 10f;

    /// <summary>Height range for quantising. 16 bits over 8 m is well under a millimetre.</summary>
    private const float MinH = -1f;
    private const float MaxH = 7f;

    private const float SendEvery = 1f / 20f;

    private static readonly float[] Surface = new float[Columns];
    private static readonly byte[] Out = new byte[Wire.MaxPacket];

    private static object _surfaceData;
    private static MethodInfo _heightAt;

    /// <summary>
    /// FluidSim's per-column water height: a get/set/count triple.
    ///
    /// Intercepting the height query alone moved the physics but not the
    /// picture — the renderer rasterises the fluid grid rather than asking
    /// SurfaceData, so a rider surfed the host's wave while seeing frozen
    /// water. Writing the surface into the grid is what makes both follow.
    /// </summary>
    private static object _fluidSim;
    private static MethodInfo _setColumn;   // nl(int, float)
    private static MethodInfo _getColumn;   // nn(int)
    private static MethodInfo _columnCount; // no()
    private static int _columns;
    private static bool _looked;
    private static float _nextSend;

    /// <summary>True on a client that has been given a surface and should use it.</summary>
    internal static bool Overriding { get; private set; }

    internal static void Install(HarmonyLib.Harmony harmony) => _harmony = harmony;

    private static HarmonyLib.Harmony _harmony;
    private static bool _patched;

    // ---- host ------------------------------------------------------------

    internal static void Tick(float now, Session session)
    {
        if (!_looked) { _looked = true; Locate(); }
        if (_heightAt == null || session == null) return;

        if (session.Role != Role.Host) return;
        if (now < _nextSend) return;
        _nextSend = now + SendEvery;

        var w = new PacketWriter(Out, Op.WaveFrame);
        for (var i = 0; i < Columns; i++)
        {
            // Sample the same array the client will be written into, so what is
            // sent and what is applied are the same quantity.
            var h = _columns > 0
                ? Column(i * (_columns - 1) / (Columns - 1))
                : HeightFromGame(MinX + (MaxX - MinX) * i / (Columns - 1f));
            w.Height(h, MinH, MaxH);
        }
        session.Broadcast(Out, w.Length);
    }

    // ---- client ----------------------------------------------------------

    internal static void Apply(PacketReader r)
    {
        var incoming = new float[Columns];
        for (var i = 0; i < Columns; i++) incoming[i] = r.Height(MinH, MaxH);

        // A short packet leaves the reader flagged; half a wave is worse than
        // the previous whole one.
        if (!r.Ok) return;

        Array.Copy(incoming, Surface, Columns);

        if (!Overriding)
        {
            Overriding = true;
            Patch();
            Pause();
            Mod.Log.Msg("[wave] following the host's ocean");
        }
    }

    internal static void Release()
    {
        Overriding = false;
    }

    /// <summary>
    /// Push the host's surface into the local grid.
    ///
    /// Every frame, not on each packet: the renderer reads the grid whenever it
    /// draws, and a surface written only twenty times a second would flicker
    /// between the host's water and whatever the paused simulation left behind.
    /// </summary>
    internal static void Paint()
    {
        if (!Overriding || _setColumn == null || _columns <= 0) return;

        var arg = new object[2];
        for (var i = 0; i < _columns; i++)
        {
            arg[0] = i;
            arg[1] = HeightFromNetwork(MinX + (MaxX - MinX) * i / (_columns - 1f));
            try { _setColumn.Invoke(_fluidSim, arg); }
            catch (Exception) { return; } // one failure means all of them
        }
    }

    private static float Column(int i)
    {
        try
        {
            var v = _getColumn.Invoke(_fluidSim, new object[] { i });
            return v is float h && !float.IsNaN(h) ? h : 0f;
        }
        catch (Exception) { return 0f; }
    }

    /// <summary>
    /// Intercept the height query so the physics reads the host's water.
    ///
    /// Patched once, on the first frame that arrives, rather than at startup:
    /// before that there is nothing to answer with, and a client that is not in
    /// a session must behave exactly like an unmodded game.
    /// </summary>
    private static void Patch()
    {
        if (_patched || _harmony == null || _heightAt == null) return;

        try
        {
            _harmony.Patch(_heightAt, prefix: new HarmonyMethod(
                typeof(WaveSync).GetMethod(nameof(HeightPrefix),
                    BindingFlags.NonPublic | BindingFlags.Static)));
            _patched = true;
            Mod.Log.Msg("[wave] height query intercepted");
        }
        catch (Exception e) { Mod.Log.Error($"[wave] intercepting height: {e.Message}"); }
    }

    /// <summary>Returning false skips the game's own answer.</summary>
    private static bool HeightPrefix(Vector3 __0, ref float __result)
    {
        if (!Overriding) return true;
        __result = HeightFromNetwork(__0.x);
        return false;
    }

    /// <summary>Stop the client's own fluid: nothing should fight the incoming surface.</summary>
    private static void Pause()
    {
        try
        {
            var fluid = GameHook.Manager?.GetType()
                .GetProperty("FluidSim", BindingFlags.Public | BindingFlags.Instance)
                ?.GetValue(GameHook.Manager);
            if (fluid == null) return;

            var paused = fluid.GetType().GetProperty("Paused", BindingFlags.Public | BindingFlags.Instance);
            if (paused == null || !paused.CanWrite) { Mod.Log.Warning("[wave] FluidSim.Paused not writable"); return; }

            paused.SetValue(fluid, true);
            Mod.Log.Msg("[wave] local fluid paused");
        }
        catch (Exception e) { Mod.Log.Error($"[wave] pausing fluid: {e.Message}"); }
    }

    // ---- reading ---------------------------------------------------------

    private static float HeightFromGame(float x)
    {
        try
        {
            var v = _heightAt.Invoke(_surfaceData, new object[] { new Vector3(x, 0f, 0f) });
            return v is float h && !float.IsNaN(h) ? h : 0f;
        }
        catch (Exception) { return 0f; }
    }

    /// <summary>Interpolated, because the wire carries columns and riders sit between them.</summary>
    private static float HeightFromNetwork(float x)
    {
        var t = (x - MinX) / (MaxX - MinX) * (Columns - 1);
        if (t <= 0f) return Surface[0];
        if (t >= Columns - 1) return Surface[Columns - 1];

        var i = (int)t;
        var f = t - i;
        return Surface[i] + (Surface[i + 1] - Surface[i]) * f;
    }

    private static void Locate()
    {
        if (!GameHook.Ready) { _looked = false; return; }

        try
        {
            var p = GameHook.Manager.GetType().GetProperty("SurfaceData",
                BindingFlags.Public | BindingFlags.Instance);
            _surfaceData = p?.GetValue(GameHook.Manager);
            if (_surfaceData == null) { _looked = false; return; }

            var type = _surfaceData.GetType();
            _heightAt = type.GetMethod("oc", BindingFlags.Public | BindingFlags.Instance,
                null, new[] { typeof(Vector3) }, null);

            if (_heightAt == null) Mod.Log.Error("[wave] SurfaceData.oc(Vector3) not found");

            LocateGrid();
        }
        catch (Exception e) { Mod.Log.Error($"[wave] {e.GetType().Name}: {e.Message}"); }
    }

    /// <summary>
    /// Find the per-column water height array on FluidSim.
    ///
    /// nl(int, float), nn(int) and no() are a get/set/count triple. If no()
    /// reports about 321 — the length of GroundHeights and the sim's width in
    /// cells — then this is indexed along the beach and is the surface itself.
    /// It is logged rather than assumed, because everything else about this
    /// class was obfuscated and one wrong guess costs a launch.
    /// </summary>
    private static void LocateGrid()
    {
        try
        {
            _fluidSim = GameHook.Manager.GetType()
                .GetProperty("FluidSim", BindingFlags.Public | BindingFlags.Instance)
                ?.GetValue(GameHook.Manager);
            if (_fluidSim == null) return;

            var t = _fluidSim.GetType();
            const BindingFlags Any = BindingFlags.Public | BindingFlags.Instance;

            _setColumn = t.GetMethod("nl", Any, null, new[] { typeof(int), typeof(float) }, null);
            _getColumn = t.GetMethod("nn", Any, null, new[] { typeof(int) }, null);
            _columnCount = t.GetMethod("no", Any, null, Type.EmptyTypes, null);

            if (_setColumn == null || _getColumn == null || _columnCount == null)
            {
                Mod.Log.Warning("[wave] FluidSim column accessors not found; physics only");
                return;
            }

            var n = _columnCount.Invoke(_fluidSim, null);
            _columns = n is int c ? c : 0;

            var sample = new StringBuilder();
            for (var i = 0; i < 6 && i < _columns; i++)
                sample.Append(Column(i * Math.Max(1, _columns / 6)).ToString("F3")).Append(' ');

            Mod.Log.Msg($"[wave] FluidSim columns: {_columns}  sample: {sample}");
        }
        catch (Exception e) { Mod.Log.Error($"[wave] grid: {e.GetType().Name}: {e.Message}"); }
    }
}
