using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using MelonLoader;

namespace ExternalBeachSupport;

/// <summary>
/// Reads the game's Levels folder and reports what is there.
///
/// Deliberately the first thing built: it needs no game types, so it works
/// before any interop assembly exists, and it confirms the plugin can see the
/// same files TidePool writes. Adding map markers comes after.
/// </summary>
internal static class LevelScanner
{
    /// <summary>
    /// The sixteen breaks the game ships, which already have markers.
    ///
    /// Everything else in the folder is external, and external is what this
    /// mod exists to show — including the player's own saves, which the game
    /// writes here beside the shipped ones and then never offers again.
    /// </summary>
    private static readonly string[] Shipped =
    {
        "Bellows", "Kawaikui", "KeIki", "Kewalo", "Kokololio", "Makaha", "Makapuu",
        "Mokuleia", "Pipeline", "Portlock", "Sandys", "Sunset", "Tracks", "Waikiki",
        "WhitePlains", "Yokahama",
    };

    /// <summary>
    /// The folder the game reads levels from.
    ///
    /// Two layouts, because the Mac build is shaped differently: Windows and
    /// Linux keep `&lt;game&gt;/&lt;Name&gt;_Data`, while a macOS app bundle keeps
    /// `&lt;game&gt;.app/Contents/Resources/Data`. Looking only for `*_Data` found
    /// nothing on macOS, and the mod loaded and then quietly did nothing.
    /// </summary>
    internal static string LevelsDir()
    {
        var exeDir = Path.GetDirectoryName(Environment.ProcessPath);
        if (exeDir is null) return null;

        foreach (var data in DataDirCandidates(exeDir))
        {
            var levels = Path.Combine(data, "StreamingAssets", "Levels");
            if (Directory.Exists(levels)) return levels;
        }

        return null;
    }

    /// <summary>Where a Unity data folder might be, relative to the executable.</summary>
    private static IEnumerable<string> DataDirCandidates(string exeDir)
    {
        // macOS: the executable sits in <app>/Contents/MacOS, and Data is a
        // sibling of that folder under Contents/Resources.
        var contents = Path.GetDirectoryName(exeDir);
        if (contents is not null)
            yield return Path.Combine(contents, "Resources", "Data");

        // Windows and Linux: <Name>_Data beside the executable.
        IEnumerable<string> siblings;
        try
        {
            siblings = Directory.EnumerateDirectories(exeDir, "*_Data");
        }
        catch (Exception)
        {
            yield break;
        }

        foreach (var d in siblings) yield return d;
    }

    internal static void Report(MelonLogger.Instance log)
    {
        var dir = LevelsDir();
        if (dir is null)
        {
            log.Warning("Could not find the Levels folder.");
            return;
        }

        var external = ExternalLevels();
        log.Msg($"Levels folder: {dir}");
        log.Msg($"  {Directory.GetFiles(dir, "*.lvl").Length} level(s), {external.Length} external");
        foreach (var c in external) log.Msg($"  external: {c}");
    }

    /// <summary>
    /// Every level in the folder that is not one of the shipped sixteen.
    ///
    /// Player saves are included. The game writes them here and gives them no
    /// marker, so without this they are as unreachable as an installed pack.
    /// </summary>
    internal static string[] ExternalLevels()
    {
        var dir = LevelsDir();
        if (dir is null) return Array.Empty<string>();

        return Directory.GetFiles(dir, "*.lvl")
            .Select(Path.GetFileNameWithoutExtension)
            .Where(f => !string.IsNullOrEmpty(f) && !Shipped.Contains(f))
            .OrderBy(f => f, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }
}
