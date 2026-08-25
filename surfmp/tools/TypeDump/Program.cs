using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;

/// <summary>
/// Inspects the game's assembly without running it.
///
/// Every fact about this game used to cost a launch: build, install, ask Jack
/// to go surfing, read the log. That is the wrong instrument for questions the
/// metadata already answers. MetadataLoadContext reads types, and crucially
/// member types, with no Unity and no running game.
/// </summary>
internal static class Program
{
    private static int Main(string[] argv)
    {
        if (argv.Length < 1)
        {
            Console.Error.WriteLine("usage: TypeDump <assembly.dll> [type-filter]");
            return 2;
        }

        var path = argv[0];
        var filter = argv.Length > 1 ? argv[1] : null;

        var dir = Path.GetDirectoryName(Path.GetFullPath(path));
        var assemblies = new List<string>(Directory.GetFiles(dir, "*.dll"));

        // The interop wrappers inherit from Il2CppInterop.Runtime types, which
        // live beside MelonLoader rather than with the game assemblies. Without
        // them every base type fails to resolve and no members come out.
        var loader = Path.GetDirectoryName(dir);
        foreach (var sub in new[] { "net6", "Dependencies", "net472" })
        {
            var extra = Path.Combine(loader ?? dir, sub);
            if (Directory.Exists(extra))
                assemblies.AddRange(Directory.GetFiles(extra, "*.dll", SearchOption.AllDirectories));
        }

        // The runtime's own assemblies must be resolvable too.
        assemblies.AddRange(Directory.GetFiles(Path.GetDirectoryName(typeof(object).Assembly.Location), "*.dll"));

        // First path wins in PathAssemblyResolver, and duplicates throw.
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        assemblies = assemblies.Where(f => seen.Add(Path.GetFileNameWithoutExtension(f))).ToList();

        using var mlc = new MetadataLoadContext(new PathAssemblyResolver(assemblies));
        var assembly = mlc.LoadFromAssemblyPath(Path.GetFullPath(path));

        var shown = 0;

        foreach (var type in assembly.GetTypes())
        {
            var full = type.FullName ?? type.Name;
            if (filter != null && !full.Contains(filter, StringComparison.OrdinalIgnoreCase)) continue;
            if (type.Name.StartsWith("<") || type.Name.Contains("__")) continue;

            shown++;
            Console.WriteLine(full);

            try
            {
            foreach (var p in type.GetProperties(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance))
            {
                if (p.Name.StartsWith("<")) continue;
                Console.WriteLine($"    prop  {Pretty(p.PropertyType),-46} {p.Name}");
            }

            foreach (var f in type.GetFields(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance))
            {
                if (f.Name.StartsWith("<") || f.Name.StartsWith("NativeMethodInfoPtr")
                    || f.Name.StartsWith("NativeFieldInfoPtr")) continue;
                Console.WriteLine($"    field {Pretty(f.FieldType),-46} {f.Name}");
            }

            foreach (var m in type.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.DeclaredOnly))
            {
                if (m.Name.StartsWith("<") || m.Name.StartsWith("get_") || m.Name.StartsWith("set_")) continue;
                var ps = string.Join(", ", m.GetParameters().Select(x => $"{Pretty(x.ParameterType)} {x.Name}"));
                Console.WriteLine($"    call  {Pretty(m.ReturnType),-46} {m.Name}({ps})");
            }
            }
            catch (Exception e) { Console.WriteLine($"    (unreadable: {e.GetType().Name})"); }
        }

        Console.Error.WriteLine($"{shown} type(s)");
        return 0;
    }

    /// <summary>Il2Cpp prefixes and generic mangling make raw names unreadable.</summary>
    private static string Pretty(Type t)
    {
        if (t == null) return "?";
        var name = t.Name;
        if (t.IsGenericType)
        {
            var stem = name.Split('`')[0];
            var args = string.Join(", ", t.GetGenericArguments().Select(Pretty));
            name = $"{stem}<{args}>";
        }
        return name.StartsWith("Il2Cpp", StringComparison.Ordinal) ? name.Substring(6) : name;
    }
}
