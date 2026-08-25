using System;
using System.Reflection;
using HarmonyLib;
using Il2CppSurf.Game;

namespace TidePool.SurfMP.Sync;

/// <summary>
/// The way into the game.
///
/// Surf.Game.Manager is the root object and holds a reference to everything
/// SurfMP touches: PlayerCharacter, FluidSim, Wave, SurfaceData, State and
/// Levels. Nine sessions went into reverse-engineering Surf.m's anonymous
/// buffers before a metadata dump showed this sitting beside it, fully named.
///
/// Awake is the hook because it always runs, and because Il2CppInterop strips
/// FindObjectOfType — both the generic and the non-generic overload — so there
/// is no way to ask the scene for this object after the fact.
/// </summary>
internal static class GameHook
{
    internal static Manager Manager { get; private set; }

    internal static bool Ready => Manager != null;

    internal static void Install(HarmonyLib.Harmony harmony)
    {
        try
        {
            var awake = AccessTools.Method(typeof(Manager), "Awake");
            if (awake == null) { Mod.Log.Error("[game] Manager.Awake not found"); return; }

            harmony.Patch(awake, postfix: new HarmonyMethod(typeof(GameHook).GetMethod(
                nameof(OnAwake), BindingFlags.NonPublic | BindingFlags.Static)));
            Mod.Log.Msg("[game] waiting for Surf.Game.Manager");
        }
        catch (Exception e) { Mod.Log.Error($"[game] hooking Manager: {e.Message}"); }
    }

    /// <summary>
    /// Must not throw. A postfix that does propagates into the game's own Awake,
    /// and an earlier build proved how that ends: silence, no error, no wave.
    /// </summary>
    private static void OnAwake(Manager __instance)
    {
        try { Manager = __instance; }
        catch (Exception) { }
    }
}
