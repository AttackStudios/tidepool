using System;
using System.Reflection;
using System.Text;
using UnityEngine;

namespace TidePool.SurfMP.Sync;

/// <summary>
/// Asks whether this ocean can be reproduced.
///
/// Identical waves for everyone needs every client running the same simulation
/// from the same inputs. Broadcasting the surface is not an alternative on its
/// own: SurfaceData's contours are render geometry derived from the fluid, so a
/// client fed those would see the host's wave while its physics still used its
/// own, and surfing a wave you cannot see is worse than drifting from it.
///
/// The test needs no second player. Load a beach, press F7 to lift the rider
/// out of the water entirely, let it run, then do it again and compare.
///
/// Two instruments have been wrong here already, and both were wrong in the
/// same direction — measuring something other than the question:
///
///  - Sampling while surfing measured the paddling, not the simulation.
///  - Hashing measured bit-equality on a half-second grid, so a run a fifth of
///    a second out of phase scored zero even if the ocean were identical.
///
/// So this logs heights. They compare with tolerance, at any alignment, and
/// answer the question that matters: the same ocean, or a different one? A
/// shape that matches once shifted is a timing problem, and timing has fixes.
/// </summary>
internal static class Determinism
{
    /// <summary>Sim-time between samples, so frame rate cannot shift the comparison.</summary>
    private const float Every = 0.5f;

    /// <summary>Inside the simulated span: LeftWallX is 0 and RightWallX 7.75.</summary>
    private const float FirstX = 0.5f;
    private const float StepX = 0.7f;
    private const int Columns = 10;

    private static object _surfaceData;
    private static MethodInfo _heightAt;
    private static bool _looked;
    private static bool _suppressed;

    private static float _next;
    private static int _sample;

    internal static void Tick(float now)
    {
        if (!_looked) { _looked = true; Locate(); }
        if (_heightAt == null || now < _next) return;
        _next = now + Every;

        var heights = Heights();
        if (heights == null) return;

        // The rider's position rides along so a run's cleanliness can be checked
        // rather than taken on trust. An earlier "I did not move" run turned out
        // to have drifted two and a half metres, because the board floats.
        var p = LocalSurfer.Found ? LocalSurfer.Position : Vector3.zero;

        // Sequence number, not timestamp: runs are compared step by step and
        // wall-clock start times will never match.
        Mod.Log.Msg($"[determinism] #{_sample++,-4} h= {heights} at=({p.x:F2},{p.y:F2},{p.z:F2})");
    }

    /// <summary>Start a fresh sequence.</summary>
    internal static void Restart()
    {
        _sample = 0;
        _next = 0f;
        Mod.Log.Msg("[determinism] --- run start ---");
    }

    /// <summary>
    /// Take the rider out of the water.
    ///
    /// A surfer cannot be held still: the board floats, so buoyancy presses on
    /// the water whether or not anyone paddles. Disabling the whole GameObject
    /// beats matching components by name, which failed twice — once to a lookup
    /// that silently returned nothing, once to every result describing itself as
    /// "Behaviour" because GetType() on an interop wrapper reports the wrapper.
    /// An inactive object runs nothing, and there is no name to get wrong.
    /// </summary>
    internal static void SuppressRider()
    {
        var rider = LocalSurfer.Template;
        if (rider == null) { Mod.Log.Warning("[determinism] no rider found"); return; }

        _suppressed = !_suppressed;

        try { rider.SetActive(!_suppressed); }
        catch (Exception e) { Mod.Log.Error($"[determinism] toggling rider: {e.Message}"); return; }

        Mod.Log.Msg(_suppressed
            ? "[determinism] STILL WATER — rider disabled, nothing is forcing the ocean"
            : "[determinism] rider back in the water");

        Restart();
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

            // oc(Vector3) -> Single is water height at a world position, which is
            // very likely what the character's own physics asks. That makes it
            // both the right thing to compare and, later, the right thing to
            // override so clients read the host's water instead of their own.
            var type = _surfaceData.GetType();
            _heightAt =
                type.GetMethod("oc", BindingFlags.Public | BindingFlags.Instance, null, new[] { typeof(Vector3) }, null) ??
                type.GetMethod("od", BindingFlags.Public | BindingFlags.Instance, null, new[] { typeof(Vector3) }, null);

            Mod.Log.Msg(_heightAt != null
                ? $"[determinism] reading water height via {_heightAt.Name}(Vector3)"
                : "[determinism] no height query found on SurfaceData");
        }
        catch (Exception e) { Mod.Log.Error($"[determinism] {e.GetType().Name}: {e.Message}"); }
    }

    private static string Heights()
    {
        var row = new StringBuilder();
        var read = 0;

        for (var i = 0; i < Columns; i++)
        {
            var x = FirstX + i * StepX;
            try
            {
                var v = _heightAt.Invoke(_surfaceData, new object[] { new Vector3(x, 0f, 0f) });
                if (v is not float h || float.IsNaN(h)) continue;
                row.Append(h.ToString("F4")).Append(' ');
                read++;
            }
            catch (Exception) { break; }
        }

        // A partial read is not evidence of anything.
        return read >= 8 ? row.ToString() : null;
    }
}
