using System;
using System.IO;
using System.Linq;
using MelonLoader;

namespace TidePool.SurfMod;

/// <summary>
/// Reads the game's Levels folder and reports what is there.
///
/// Deliberately the first thing built: it needs no game types, so it works
/// before any interop assembly exists, and it confirms the plugin can see the
/// same files TidePool writes. Adding map markers comes after.
/// </summary>
internal static class LevelScanner
{
    /// <summary>Levels that ship with the game, as of 25 Aug 2026.</summary>
    private static readonly string[] Shipped =
    {
        "Bellows", "Kawaikui", "KeIki", "Kewalo", "Kokololio", "Makaha", "Makapuu",
        "Mokuleia", "Pipeline", "Portlock", "Sandys", "Sunset", "Tracks", "Waikiki",
        "WhitePlains", "Yokahama",
    };

    /// <summary>`<game>/<Name>_Data/StreamingAssets/Levels`, found from the running process.</summary>
    internal static string? LevelsDir()
    {
        var root = Path.GetDirectoryName(Environment.ProcessPath);
        if (root is null) return null;

        var data = Directory.EnumerateDirectories(root, "*_Data").FirstOrDefault();
        if (data is null) return null;

        var levels = Path.Combine(data, "StreamingAssets", "Levels");
        return Directory.Exists(levels) ? levels : null;
    }

    internal static void Report(MelonLogger.Instance log)
    {
        var dir = LevelsDir();
        if (dir is null)
        {
            log.Warning("Could not find the Levels folder.");
            return;
        }

        var files = Directory.GetFiles(dir, "*.lvl").Select(Path.GetFileNameWithoutExtension).ToArray();
        var custom = files.Where(f => f is not null
                                      && !Shipped.Contains(f)
                                      && !f.EndsWith("_User", StringComparison.Ordinal)).ToArray();

        log.Msg($"Levels folder: {dir}");
        log.Msg($"  {files.Length} level(s), {custom.Length} of them custom");
        foreach (var c in custom) log.Msg($"  custom: {c}");
    }
}
