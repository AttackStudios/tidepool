using BepInEx;
using BepInEx.Unity.IL2CPP;
using BepInEx.Logging;

namespace TidePool.SurfPlugin;

/// <summary>
/// TidePool's companion plugin for Surf Sandbox.
///
/// The game's break select is a map of Oahu with markers authored in the scene,
/// not a list generated from the Levels folder — so a custom .lvl file sits on
/// disk unreachable. Nothing outside the process can fix that: the current
/// selection lives only in memory, there are no PlayerPrefs and no config file.
///
/// This plugin exists to give custom levels a way in, and doubles as the place
/// to answer the question SurfMP is blocked on: which of Surf.m's 22
/// NativeArray&lt;float&gt; buffers is the wave heightfield.
/// </summary>
[BepInPlugin(Guid, "TidePool", Version)]
public class Plugin : BasePlugin
{
    public const string Guid = "io.github.attackstudios.tidepool";
    public const string Version = "0.1.0";

    internal static ManualLogSource Logger = null!;

    public override void Load()
    {
        Logger = Log;

        // The line that proves the whole chain: Doorstop injected, interop
        // generated, the loader ran, and this assembly was found. Everything
        // else is downstream of seeing this in LogOutput.log.
        Log.LogInfo($"TidePool plugin {Version} loaded.");

        LevelScanner.ReportFolder(Log);
    }
}
