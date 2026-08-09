using System.Text.RegularExpressions;

namespace MyPetLink.Api.Tests;

/// <summary>
/// The root <c>migration.sql</c> is what actually creates and upgrades a
/// database on deployment, and it is maintained by appending each new
/// migration rather than regenerating the file, so a bad append is easy to
/// miss and expensive to discover in production.
///
/// These are static checks against the shipped script. They run in
/// milliseconds and would have caught both defects this file exists because
/// of: an orphan COMMIT left behind by the appender, and a data migration
/// that referenced a column later migrations drop.
/// </summary>
public sealed class DeploymentScriptTests
{
    private static string ScriptPath()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "migration.sql")))
        {
            directory = directory.Parent;
        }

        Assert.NotNull(directory);
        return Path.Combine(directory!.FullName, "migration.sql");
    }

    private static string[] ScriptLines() => File.ReadAllLines(ScriptPath());

    [Fact]
    public void EveryTransactionIsClosedExactlyOnce()
    {
        var depth = 0;
        var orphans = new List<int>();

        var lines = ScriptLines();
        for (var index = 0; index < lines.Length; index += 1)
        {
            var statement = lines[index].Trim();
            if (statement == "BEGIN TRANSACTION;")
            {
                depth += 1;
            }
            else if (statement == "COMMIT;")
            {
                depth -= 1;
                if (depth < 0)
                {
                    // A COMMIT with no open transaction: SQL Server raises
                    // Msg 3902 and the deployment log stops being trustworthy.
                    orphans.Add(index + 1);
                    depth = 0;
                }
            }
        }

        Assert.True(orphans.Count == 0, $"COMMIT without BEGIN at line(s): {string.Join(", ", orphans)}");
        Assert.True(depth == 0, $"{depth} transaction(s) left open at the end of the script.");
    }

    [Fact]
    public void ColumnsRemovedByLaterMigrationsAreOnlyReferencedThroughDeferredSql()
    {
        var script = File.ReadAllText(ScriptPath());

        // Every column the script itself drops. A guarded block that names one
        // of these directly still fails to compile on a re-run, because SQL
        // Server compiles the whole batch before the guard can skip it.
        var dropped = Regex.Matches(script, @"DROP COLUMN \[(?<column>[A-Za-z0-9_]+)\]")
            .Select(match => match.Groups["column"].Value)
            .Distinct()
            .ToArray();

        Assert.NotEmpty(dropped);

        var offenders = new List<string>();
        foreach (var column in dropped)
        {
            // Only statements that read or write the column matter; the ALTER
            // TABLE ... DROP COLUMN and its lookup in sys.columns are fine.
            var references = Regex.Matches(
                script,
                $@"^\s*(?:UPDATE|SET|WHERE|SELECT|INSERT)\b[^\r\n]*\b{Regex.Escape(column)}\b",
                RegexOptions.Multiline);

            foreach (Match reference in references)
            {
                var line = reference.Value;
                if (line.Contains("EXEC(", StringComparison.OrdinalIgnoreCase)
                    || line.Contains("sp_executesql", StringComparison.OrdinalIgnoreCase)
                    || line.Contains("sys.columns", StringComparison.OrdinalIgnoreCase)
                    || line.Contains("[c].[name]", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                offenders.Add($"[{column}]: {line.Trim()}");
            }
        }

        Assert.True(
            offenders.Count == 0,
            "These statements name a column the script later drops, so a second run fails to "
            + "compile them. Wrap them in EXEC(N'...') so they compile only when they run:"
            + Environment.NewLine
            + string.Join(Environment.NewLine, offenders));
    }

    [Fact]
    public void EveryMigrationIsRecordedExactlyOnce()
    {
        var script = File.ReadAllText(ScriptPath());
        var inserted = Regex.Matches(
                script,
                @"VALUES \(N'(?<id>\d{14}_[A-Za-z0-9]+)'")
            .Select(match => match.Groups["id"].Value)
            .ToArray();

        var duplicates = inserted
            .GroupBy(id => id)
            .Where(group => group.Count() > 1)
            .Select(group => group.Key)
            .ToArray();

        Assert.True(
            duplicates.Length == 0,
            $"Migration history inserted more than once for: {string.Join(", ", duplicates)}");
    }

    [Fact]
    public void TheScriptCoversEveryMigrationOnDisk()
    {
        var scriptPath = ScriptPath();
        var root = Path.GetDirectoryName(scriptPath)!;
        var migrationsDirectory = Path.Combine(root, "apps", "api", "MyPetLink.Api", "Migrations");
        Assert.True(Directory.Exists(migrationsDirectory), migrationsDirectory);

        var onDisk = Directory.GetFiles(migrationsDirectory, "*.cs")
            .Select(Path.GetFileNameWithoutExtension)
            .Where(name => name is not null
                && !name.EndsWith(".Designer", StringComparison.Ordinal)
                && Regex.IsMatch(name, @"^\d{14}_"))
            .Select(name => name!)
            .OrderBy(name => name)
            .ToArray();

        var script = File.ReadAllText(scriptPath);
        var missing = onDisk
            .Where(id => !script.Contains($"N'{id}'", StringComparison.Ordinal))
            .ToArray();

        Assert.True(
            missing.Length == 0,
            $"The deployment script is missing migration(s): {string.Join(", ", missing)}");
    }
}
