using MelonLoader;

[assembly: MelonInfo(typeof(ExternalBeachSupport.Mod), "External Beach Support", "1.1.0", "AttackStudioYT")]
[assembly: MelonGame("nocanwin", "SurfSandbox")]

namespace ExternalBeachSupport;

/// <summary>
/// Makes every beach outside the shipped sixteen reachable.
///
/// The break select is a map of Oahu whose markers are authored in the scene —
/// <c>Surf.UI.Map</c> holds a LocationButtonsRoot and a list of buttons, and
/// <c>Surf.UI.MapLocationButton</c> has no fields at all. So a .lvl in the
/// Levels folder that the game did not ship is a file it never looks for, and
/// nothing outside the process can change that: the current selection lives
/// only in memory, with no PlayerPrefs key and no config file.
///
/// That covers installed packs and the player's own saves alike — the game
/// writes those into the same folder and then never offers them again.
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
        LoggerInstance.Msg("External Beach Support loaded.");
        LevelScanner.Report(LoggerInstance);
    }
}
