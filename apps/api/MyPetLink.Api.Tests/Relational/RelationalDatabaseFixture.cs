using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Data;

namespace MyPetLink.Api.Tests.Relational;

// Relational (SQL Server LocalDB) test support for the concurrency guards that
// InMemory cannot exercise: native rowversion tokens, affected-row checks, and
// real unique constraints.
//
// How to run:
//   Locally: SQL Server LocalDB ships with Visual Studio / the SQL Server
//     Express LocalDB installer. `dotnet test` picks it up automatically; each
//     RelationalFact spins up and drops its own database.
//   Override the server with the MYPETLINK_TEST_SQLSERVER environment variable
//     (e.g. a container: "Server=localhost,1433;User Id=sa;Password=…;
//     TrustServerCertificate=True").
//   CI without any SQL Server: these tests SKIP (they do not fail), so the
//     InMemory suite still runs everywhere. Point MYPETLINK_TEST_SQLSERVER at a
//     SQL Server service to enable them in CI.
public static class RelationalDatabase
{
    private const string DefaultLocalDb =
        "Server=(localdb)\\MSSQLLocalDB;Trusted_Connection=True;TrustServerCertificate=True";

    private static readonly Lazy<bool> Availability = new(ProbeAvailability);

    public static bool IsAvailable => Availability.Value;

    private static string BaseConnectionString =>
        Environment.GetEnvironmentVariable("MYPETLINK_TEST_SQLSERVER") ?? DefaultLocalDb;

    // Creates a fresh, uniquely-named database and returns a factory for new
    // DbContexts plus a disposer that drops it.
    public static async Task<RelationalScope> CreateAsync()
    {
        var databaseName = $"MyPetLinkTest_{Guid.NewGuid():N}";
        var builder = new SqlConnectionStringBuilder(BaseConnectionString) { InitialCatalog = "master" };
        var masterConnectionString = builder.ConnectionString;

        await using (var connection = new SqlConnection(masterConnectionString))
        {
            await connection.OpenAsync();
            await using var command = connection.CreateCommand();
            command.CommandText = $"CREATE DATABASE [{databaseName}]";
            await command.ExecuteNonQueryAsync();
        }

        builder.InitialCatalog = databaseName;
        var connectionString = builder.ConnectionString;

        MyPetLinkDbContext CreateContext() => new(
            new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseSqlServer(connectionString)
                .Options);

        await using (var context = CreateContext())
        {
            await context.Database.EnsureCreatedAsync();
        }

        return new RelationalScope(CreateContext, masterConnectionString, databaseName);
    }

    private static bool ProbeAvailability()
    {
        try
        {
            var builder = new SqlConnectionStringBuilder(BaseConnectionString)
            {
                InitialCatalog = "master",
                ConnectTimeout = 5,
            };
            using var connection = new SqlConnection(builder.ConnectionString);
            connection.Open();
            return true;
        }
        catch
        {
            return false;
        }
    }
}

public sealed class RelationalScope : IAsyncDisposable
{
    private readonly Func<MyPetLinkDbContext> _contextFactory;
    private readonly string _masterConnectionString;
    private readonly string _databaseName;

    public RelationalScope(
        Func<MyPetLinkDbContext> contextFactory,
        string masterConnectionString,
        string databaseName)
    {
        _contextFactory = contextFactory;
        _masterConnectionString = masterConnectionString;
        _databaseName = databaseName;
    }

    public MyPetLinkDbContext NewContext() => _contextFactory();

    public async ValueTask DisposeAsync()
    {
        await using var connection = new SqlConnection(_masterConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        // Force-close open connections before dropping the throwaway database.
        command.CommandText =
            $"ALTER DATABASE [{_databaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{_databaseName}]";
        await command.ExecuteNonQueryAsync();
    }
}
