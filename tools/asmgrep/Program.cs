// Search dumped IL2CPP assemblies for types and fields.
//
// Built because the point of M0 is not decompilation, it is finding: which
// class holds the wave state, what type is it, what updates it. A decompiler
// gives you everything and therefore nothing. This gives you names and types.
//
//   asmgrep <dir> <regex>              types whose name matches
//   asmgrep <dir> <regex> --fields     ...and every field, with its type
//   asmgrep <dir> --fieldtype <regex>  any type owning a field of this type
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Text.RegularExpressions;

class Sig : ISignatureTypeProvider<string, object>
{
    public string GetPrimitiveType(PrimitiveTypeCode c) => c switch
    {
        PrimitiveTypeCode.Single => "float", PrimitiveTypeCode.Double => "double",
        PrimitiveTypeCode.Int32 => "int", PrimitiveTypeCode.Int64 => "long",
        PrimitiveTypeCode.Boolean => "bool", PrimitiveTypeCode.Byte => "byte",
        PrimitiveTypeCode.String => "string", PrimitiveTypeCode.Void => "void",
        _ => c.ToString().ToLowerInvariant()
    };
    public string GetSZArrayType(string t) => t + "[]";
    public string GetArrayType(string t, ArrayShape s) => t + "[" + new string(',', s.Rank - 1) + "]";
    public string GetPointerType(string t) => t + "*";
    public string GetByReferenceType(string t) => "ref " + t;
    public string GetGenericInstantiation(string t, System.Collections.Immutable.ImmutableArray<string> a)
        => t + "<" + string.Join(",", a) + ">";
    public string GetTypeFromDefinition(MetadataReader r, TypeDefinitionHandle h, byte rawKind)
        => r.GetString(r.GetTypeDefinition(h).Name);
    public string GetTypeFromReference(MetadataReader r, TypeReferenceHandle h, byte rawKind)
        => r.GetString(r.GetTypeReference(h).Name);
    public string GetTypeFromSpecification(MetadataReader r, object g, TypeSpecificationHandle h, byte k)
        => r.GetTypeSpecification(h).DecodeSignature(this, g);
    public string GetFunctionPointerType(MethodSignature<string> s) => "fnptr";
    public string GetGenericMethodParameter(object g, int i) => "!!" + i;
    public string GetGenericTypeParameter(object g, int i) => "!" + i;
    public string GetModifiedType(string mod, string un, bool req) => un;
    public string GetPinnedType(string t) => t;
}

static class Program
{
    static int Main(string[] args)
    {
        if (args.Length < 2) { Console.Error.WriteLine("asmgrep <dir> <regex> [--fields] | <dir> --fieldtype <regex>"); return 2; }
        var dir = args[0];
        bool byField = args[1] == "--fieldtype";
        var pattern = byField ? args[2] : args[1];
        bool showFields = args.Contains("--fields") || byField;
        var rx = new Regex(pattern, RegexOptions.IgnoreCase);
        var sig = new Sig();
        int hits = 0;

        foreach (var file in Directory.GetFiles(dir, "*.dll").OrderBy(f => f))
        {
            using var fs = File.OpenRead(file);
            using var pe = new PEReader(fs);
            if (!pe.HasMetadata) continue;
            var r = pe.GetMetadataReader();
            foreach (var th in r.TypeDefinitions)
            {
                var td = r.GetTypeDefinition(th);
                var ns = r.GetString(td.Namespace);
                var name = r.GetString(td.Name);
                var full = string.IsNullOrEmpty(ns) ? name : ns + "." + name;

                var fields = new List<(string n, string t)>();
                foreach (var fh in td.GetFields())
                {
                    var fd = r.GetFieldDefinition(fh);
                    string ft;
                    try { ft = fd.DecodeSignature(sig, null); } catch { ft = "?"; }
                    fields.Add((r.GetString(fd.Name), ft));
                }

                bool match = byField ? fields.Any(f => rx.IsMatch(f.t)) : rx.IsMatch(full);
                if (!match) continue;
                hits++;
                Console.WriteLine($"{Path.GetFileName(file)}  {full}");
                if (showFields)
                    foreach (var f in fields)
                    {
                        var mark = byField && rx.IsMatch(f.t) ? "  <<" : "";
                        Console.WriteLine($"    {f.t,-34} {f.n}{mark}");
                    }
            }
        }
        Console.WriteLine($"-- {hits} type(s)");
        return 0;
    }
}
