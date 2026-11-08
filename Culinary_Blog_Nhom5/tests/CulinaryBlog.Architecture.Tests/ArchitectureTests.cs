using System.Xml.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Xunit;

namespace CulinaryBlog.Architecture.Tests;

public sealed class ArchitectureTests
{
    private static readonly string Root = FindRoot();
    private static string FindRoot()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
            if (File.Exists(Path.Combine(directory.FullName, "CONTRIBUTING.md"))) return directory.FullName;
        throw new InvalidOperationException("Repository root not found.");
    }

    internal static bool AllowedReference(string layer, string target) => layer switch
    {
        "Domain" => false,
        "Application" => target == "Domain",
        "Infrastructure" => target is "Domain" or "Application",
        "API" => target is "Domain" or "Application" or "Infrastructure",
        _ => false
    };

    [Theory]
    [InlineData("Domain", "Application", false)]
    [InlineData("Application", "Infrastructure", false)]
    [InlineData("Application", "API", false)]
    [InlineData("Infrastructure", "API", false)]
    [InlineData("Application", "Domain", true)]
    public void Reference_detector_rejects_injected_wrong_edges(string layer, string target, bool expected) =>
        Assert.Equal(expected, AllowedReference(layer, target));

    [Fact]
    public void Project_graph_and_compiled_core_assemblies_obey_layer_direction()
    {
        foreach (var file in Directory.GetFiles(Path.Combine(Root, "Culinary_Blog_Nhom5/src"), "*.csproj", SearchOption.AllDirectories))
        {
            var layer = Path.GetFileNameWithoutExtension(file).Replace("CulinaryBlog.", "");
            foreach (var reference in XDocument.Load(file).Descendants("ProjectReference"))
            {
                var target = Path.GetFileNameWithoutExtension(reference.Attribute("Include")!.Value.Replace('\\', '/')).Replace("CulinaryBlog.", "");
                Assert.True(AllowedReference(layer, target), $"Forbidden edge {layer} -> {target}");
            }
        }
        foreach (var assembly in new[] { typeof(CulinaryBlog.Domain.Entities.Recipe).Assembly, typeof(CulinaryBlog.Application.DependencyInjection).Assembly })
            foreach (var reference in assembly.GetReferencedAssemblies().Where(x => x.Name!.StartsWith("CulinaryBlog.")))
                Assert.True(AllowedReference(assembly.GetName().Name!.Replace("CulinaryBlog.", ""), reference.Name!.Replace("CulinaryBlog.", "")));
    }

    [Fact]
    public void Domain_package_debt_is_explicit_and_no_new_package_can_enter()
    {
        var file = Path.Combine(Root, "Culinary_Blog_Nhom5/src/CulinaryBlog.Domain/CulinaryBlog.Domain.csproj");
        var packages = XDocument.Load(file).Descendants("PackageReference").Select(x => x.Attribute("Include")!.Value).Order().ToArray();
        // ADR-0001 records these existing violations; this does not mean strict SRS compliance.
        Assert.Equal(new[] { "Microsoft.Extensions.Identity.Stores", "Npgsql" }, packages);
    }

    internal static IReadOnlyList<string> QueryViolations(string source)
    {
        var root = CSharpSyntaxTree.ParseText(source).GetRoot();
        var errors = new List<string>();
        var forbidden = new HashSet<string> { "SaveChanges", "SaveChangesAsync", "CommitAsync", "AddAsync", "UpdateAsync", "DeleteAsync", "MutateAsync", "PublishAsync", "ExecuteUpdateAsync", "ExecuteDeleteAsync", "CreateAsync", "Remove", "Add", "Update" };
        foreach (var method in root.DescendantNodes().OfType<MethodDeclarationSyntax>())
        {
            if (method.Identifier.ValueText != "Handle" || !method.ParameterList.Parameters.Any(x => x.Type?.ToString().EndsWith("Query") == true)) continue;
            Inspect(method, new HashSet<string>());
            void Inspect(MethodDeclarationSyntax current, HashSet<string> visited)
            {
                if (!visited.Add(current.ToString())) return;
                foreach (var call in current.DescendantNodes().OfType<InvocationExpressionSyntax>())
                {
                    var name = call.Expression switch { MemberAccessExpressionSyntax member => member.Name.Identifier.ValueText, IdentifierNameSyntax id => id.Identifier.ValueText, _ => "" };
                    if (forbidden.Contains(name)) errors.Add($"Query {method.Identifier}: forbidden call {name}");
                    if (name is "Send" or "SendAsync" && call.ArgumentList.Arguments.Any(argument =>
                        argument.Expression is ObjectCreationExpressionSyntax created && created.Type.ToString().EndsWith("Command", StringComparison.Ordinal)))
                        errors.Add($"Query {method.Identifier}: dispatches a command");
                    if (call.Expression is IdentifierNameSyntax || call.Expression is MemberAccessExpressionSyntax { Expression: ThisExpressionSyntax })
                        foreach (var helper in current.Parent!.ChildNodes().OfType<MethodDeclarationSyntax>().Where(x => x.Identifier.ValueText == name)) Inspect(helper, visited);
                }
            }
        }
        return errors;
    }

    [Fact]
    public void Queries_do_not_call_persistence_mutations_or_local_mutating_helpers()
    {
        var files = Directory.GetFiles(Path.Combine(Root, "Culinary_Blog_Nhom5/src/CulinaryBlog.Application/Features"), "*.cs", SearchOption.AllDirectories);
        Assert.NotEmpty(files);
        foreach (var file in files) Assert.True(QueryViolations(File.ReadAllText(file)).Count == 0, file + ": " + string.Join(", ", QueryViolations(File.ReadAllText(file))));
    }

    [Theory]
    [InlineData("class H { Task Handle(MyQuery q) => db.SaveChangesAsync(); }")]
    [InlineData("class H { Task Handle(MyQuery q) => Mutate(); Task Mutate() => db.DeleteAsync(); }")]
    [InlineData("class H { Task Handle(MyQuery q) => sender.Send(new SaveCommand()); }")]
    public void Cqrs_detector_catches_direct_and_helper_mutation(string source) => Assert.NotEmpty(QueryViolations(source));
}
