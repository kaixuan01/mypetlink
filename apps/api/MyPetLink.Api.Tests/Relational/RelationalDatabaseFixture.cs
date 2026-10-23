using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
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
//
// How many run at once:
//   xUnit's MaxParallelThreads limits threads, not tests in flight: every test
//   that awaits hands its thread to another collection, so a "4-thread" run
//   was measured holding 47 test databases on one LocalDB (Express) instance
//   at once. Under that burst single commands queued past SqlClient's 30-second
//   timeout on slower machines. So each database is held from CreateAsync until
//   its scope is disposed under a process-wide limit (default 4; override with
//   MYPETLINK_TEST_SQL_CONCURRENCY). Waiting for a turn is not a SQL command
//   and spends no command timeout. A test that holds a second database while
//   every turn is taken waits at most ScopeTurnWait and then proceeds, so the
//   limit can slow a run but never deadlock it.
public static class RelationalDatabase
{
    private const string DefaultLocalDb =
        "Server=(localdb)\\MSSQLLocalDB;Trusted_Connection=True;TrustServerCertificate=True";

    private static readonly Lazy<bool> Availability = new(ProbeAvailability);

    private static readonly TimeSpan ScopeTurnWait = TimeSpan.FromMinutes(3);

    private static readonly SemaphoreSlim ScopeTurns = new(ScopeConcurrency());

    public static int ScopeConcurrency() =>
        int.TryParse(Environment.GetEnvironmentVariable("MYPETLINK_TEST_SQL_CONCURRENCY"), out var limit) && limit > 0
            ? limit
            : 4;

    private static async Task<Action> TakeTurnAsync(string databaseName)
    {
        if (await ScopeTurns.WaitAsync(ScopeTurnWait))
        {
            var released = 0;
            return () =>
            {
                if (Interlocked.Exchange(ref released, 1) == 0) ScopeTurns.Release();
            };
        }

        Console.WriteLine(
            $"Relational test database {databaseName} started without a turn after waiting {ScopeTurnWait.TotalMinutes:0} minutes.");
        return () => { };
    }

    public static bool IsAvailable => Availability.Value;

    private static string BaseConnectionString =>
        Environment.GetEnvironmentVariable("MYPETLINK_TEST_SQLSERVER") ?? DefaultLocalDb;

    // Creates a fresh, uniquely-named database and returns a factory for new
    // DbContexts plus a disposer that drops it.
    // <param name="enableRetryOnFailure">
    // Mirrors the production DbContext registration in Program.cs, which calls
    // EnableRetryOnFailure. A retrying execution strategy refuses to run while
    // a user-initiated transaction is open, so code paths that call
    // BeginTransaction must be exercised with this on or the failure only ever
    // appears in a deployed environment.
    // </param>
    public static async Task<RelationalScope> CreateAsync(
        IInterceptor? interceptor = null,
        bool enableRetryOnFailure = false,
        bool createSchema = true)
    {
        var databaseName = $"MyPetLinkTest_{Guid.NewGuid():N}";
        var builder = new SqlConnectionStringBuilder(BaseConnectionString) { InitialCatalog = "master" };
        var masterConnectionString = builder.ConnectionString;
        var endTurn = await TakeTurnAsync(databaseName);
        var created = false;

        try
        {
            await using (var connection = new SqlConnection(masterConnectionString))
            {
                await connection.OpenAsync();
                await using var command = connection.CreateCommand();
                command.CommandText = $"CREATE DATABASE [{databaseName}]";
                await command.ExecuteNonQueryAsync();
            }

            created = true;
            return await OpenAsync(databaseName, builder, masterConnectionString, interceptor, enableRetryOnFailure, createSchema, endTurn);
        }
        catch
        {
            // A database that never reached its test still gives its turn back,
            // and is dropped if it was created.
            if (created)
            {
                try
                {
                    await new RelationalScope(() => throw new InvalidOperationException(), masterConnectionString, databaseName, endTurn)
                        .DisposeAsync();
                }
                catch
                {
                    // The original failure is the one worth reporting.
                }
            }
            else
            {
                endTurn();
            }

            throw;
        }
    }

    private static async Task<RelationalScope> OpenAsync(
        string databaseName,
        SqlConnectionStringBuilder builder,
        string masterConnectionString,
        IInterceptor? interceptor,
        bool enableRetryOnFailure,
        bool createSchema,
        Action endTurn)
    {
        builder.InitialCatalog = databaseName;
        var connectionString = builder.ConnectionString;

        MyPetLinkDbContext CreateContext()
        {
            var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseSqlServer(connectionString, sqlOptions =>
                {
                    if (enableRetryOnFailure)
                    {
                        sqlOptions.EnableRetryOnFailure(
                            maxRetryCount: 6,
                            maxRetryDelay: TimeSpan.FromSeconds(1),
                            errorNumbersToAdd: null);
                    }
                });
            if (interceptor is not null)
            {
                options.AddInterceptors(interceptor);
            }

            return new MyPetLinkDbContext(options.Options);
        }

        await using (var context = CreateContext())
        {
            if (createSchema) await context.Database.EnsureCreatedAsync();
        }

        return new RelationalScope(CreateContext, masterConnectionString, databaseName, endTurn);
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
    private readonly Action _endTurn;

    public RelationalScope(
        Func<MyPetLinkDbContext> contextFactory,
        string masterConnectionString,
        string databaseName,
        Action? endTurn = null)
    {
        _contextFactory = contextFactory;
        _masterConnectionString = masterConnectionString;
        _databaseName = databaseName;
        _endTurn = endTurn ?? (() => { });
    }

    public MyPetLinkDbContext NewContext() => _contextFactory();

    public async ValueTask DisposeAsync()
    {
        try
        {
            await using var connection = new SqlConnection(_masterConnectionString);
            await connection.OpenAsync();
            await using var command = connection.CreateCommand();
            // Force-close open connections before dropping the throwaway database.
            command.CommandText =
                $"ALTER DATABASE [{_databaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{_databaseName}]";
            await command.ExecuteNonQueryAsync();
        }
        finally
        {
            _endTurn();
        }
    }
}
