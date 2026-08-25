using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;

/// <summary>
/// Dumps types, fields and methods from an Il2Cpp interop assembly.
///
/// The names are obfuscated, so this is not about reading them — it is about
/// shape. A surfer controller is a type with a Transform and a handful of
/// float3s; a wave simulation is the one holding twenty NativeArrays. Shape is
/// visible in metadata, and metadata does not require anyone to go surfing.
/// </summary>
internal static class Program
{
    private static int Main(string[] argv)
    {
        if (argv.Length < 1)
        {
            Console.Error.WriteLine("usage: TypeDump <assembly.dll> [namespace-filter]");
            return 2;
        }

        var path = argv[0];
        var filter = argv.Length > 1 ? argv[1] : null;

        using var stream = File.OpenRead(path);
        using var pe = new PEReader(stream);
        var md = pe.GetMetadataReader();

        var types = 0;

        foreach (var handle in md.TypeDefinitions)
        {
            var type = md.GetTypeDefinition(handle);
            var ns = md.GetString(type.Namespace);
            var name = md.GetString(type.Name);

            if (filter != null && !ns.Contains(filter, StringComparison.OrdinalIgnoreCase)) continue;
            // Compiler-generated closures and interop plumbing are noise here.
            if (name.StartsWith("<") || name.Contains("__")) continue;

            types++;

            var fields = new List<string>();
            foreach (var fh in type.GetFields())
            {
                var f = md.GetFieldDefinition(fh);
                var fname = md.GetString(f.Name);
                if (fname.StartsWith("<") || fname.StartsWith("NativeMethodInfoPtr")
                    || fname.StartsWith("NativeFieldInfoPtr")) continue;
                fields.Add(fname);
            }

            var methods = new List<string>();
            foreach (var mh in type.GetMethods())
            {
                var m = md.GetMethodDefinition(mh);
                var mname = md.GetString(m.Name);
                if (mname.StartsWith("<") || mname.StartsWith(".")) continue;
                methods.Add(mname);
            }

            Console.WriteLine($"{(ns.Length > 0 ? ns + "." : "")}{name}");
            if (fields.Count > 0) Console.WriteLine($"    fields  {string.Join(" ", fields)}");
            if (methods.Count > 0) Console.WriteLine($"    methods {string.Join(" ", methods)}");
        }

        Console.Error.WriteLine($"{types} type(s)");
        return 0;
    }
}
