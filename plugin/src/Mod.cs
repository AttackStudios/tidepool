using MelonLoader;

[assembly: MelonInfo(typeof(TidePool.SurfMod.Mod), "TidePool", "1.0.1", "AttackStudioYT")]
[assembly: MelonGame("nocanwin", "SurfSandbox")]

namespace TidePool.SurfMod;

/// <summary>
/// TidePool's companion mod for Surf Sandbox.
///
/// The break select is a map of Oahu whose markers are authored in the scene —
/// <c>Surf.UI.Map</c> holds a LocationButtonsRoot and a list of buttons, and
/// <c>Surf.UI.MapLocationButton</c> has no fields at all. So a custom .lvl in
/// the Levels folder is a file the game never looks for, and nothing outside
/// the process can change that: the current selection lives only in memory,
/// with no PlayerPrefs key and no config file.
///
/// MelonLoader rather than BepInEx because BepInEx 6 does not run on Unity 6.3.
/// It never finishes generating interop; MelonLoader does it in forty seconds.
/// </summary>
public class Mod : MelonMod
{
    /// <summary>Shared so Harmony patches, which are static, can log.</summary>
    internal static MelonLogger.Instance Log = null!;

    public override void OnInitializeMelon()
    {
        Log = LoggerInstance;
        // The line that proves the whole chain. Everything else is downstream
        // of seeing this in MelonLoader's log.
        LoggerInstance.Msg("TidePool mod loaded.");
        LevelScanner.Report(LoggerInstance);
    }


}
