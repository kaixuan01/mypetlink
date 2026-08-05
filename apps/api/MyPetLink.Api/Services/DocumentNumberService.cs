using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using MyPetLink.Api.Data;

namespace MyPetLink.Api.Services;

/// <summary>
/// Counted document numbers for Merchant Sales.
///
/// Retail orders use <c>BusinessReferenceGenerator</c>, whose numbers carry a
/// timestamp and a random suffix. That is fine for a receipt nobody counts, but
/// merchants expect a sequence they can follow, so these are counted instead.
///
/// The increment is a single UPDATE with an update lock and OUTPUT, so the read
/// and the write cannot be split by another connection. It runs inside the
/// caller's transaction: if the caller rolls back, the number is released with
/// it, and a request that never commits does not burn a number.
/// </summary>
public interface IDocumentNumberService
{
    Task<string> NextMerchantCodeAsync(CancellationToken cancellationToken);
    Task<string> NextSalespersonCodeAsync(CancellationToken cancellationToken);
    Task<string> NextQuotationNumberAsync(DateTimeOffset issuedAtUtc, CancellationToken cancellationToken);
    Task<string> NextMerchantOrderNumberAsync(DateTimeOffset issuedAtUtc, CancellationToken cancellationToken);
}

public sealed class DocumentNumberService : IDocumentNumberService
{
    private static readonly TimeSpan MalaysiaOffset = TimeSpan.FromHours(8);

    private readonly MyPetLinkDbContext _dbContext;

    public DocumentNumberService(MyPetLinkDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<string> NextMerchantCodeAsync(CancellationToken cancellationToken)
    {
        var value = await NextAsync("merchant", cancellationToken);
        return $"MPL-MER-{value:00000}";
    }

    public async Task<string> NextSalespersonCodeAsync(CancellationToken cancellationToken)
    {
        var value = await NextAsync("salesperson", cancellationToken);
        return $"MPL-SALES-{value:000}";
    }

    public async Task<string> NextQuotationNumberAsync(
        DateTimeOffset issuedAtUtc,
        CancellationToken cancellationToken)
    {
        var day = DayKey(issuedAtUtc);
        var value = await NextAsync($"quotation:{day}", cancellationToken);
        return $"MPL-QT-{day}-{value:0000}";
    }

    public async Task<string> NextMerchantOrderNumberAsync(
        DateTimeOffset issuedAtUtc,
        CancellationToken cancellationToken)
    {
        var day = DayKey(issuedAtUtc);
        var value = await NextAsync($"merchant-order:{day}", cancellationToken);
        return $"MPL-B2B-ORD-{day}-{value:0000}";
    }

    /// <summary>
    /// Numbers are grouped by Malaysian calendar day, so a document issued at
    /// 9am local does not land in the previous day's series.
    /// </summary>
    private static string DayKey(DateTimeOffset issuedAtUtc) =>
        issuedAtUtc.ToOffset(MalaysiaOffset).ToString("yyMMdd");

    private async Task<long> NextAsync(string counterKey, CancellationToken cancellationToken)
    {
        // Relational path: one statement does the read, the increment and the
        // return, holding an update lock for the row's lifetime in the
        // transaction. UPDLOCK on the seed SELECT stops two connections both
        // deciding the row is missing.
        if (_dbContext.Database.IsSqlServer())
        {
            var seeded = await _dbContext.Database.ExecuteSqlRawAsync(
                """
                IF NOT EXISTS (
                    SELECT 1 FROM [DocumentNumberCounters] WITH (UPDLOCK, HOLDLOCK)
                    WHERE [CounterKey] = {0}
                )
                INSERT INTO [DocumentNumberCounters] ([CounterKey], [NextValue], [UpdatedAt])
                VALUES ({0}, 0, SYSDATETIMEOFFSET());
                """,
                [counterKey],
                cancellationToken);

            _ = seeded;

            var results = new List<long>();
            var connection = _dbContext.Database.GetDbConnection();
            await using var command = connection.CreateCommand();
            command.CommandText =
                """
                UPDATE [DocumentNumberCounters]
                SET [NextValue] = [NextValue] + 1, [UpdatedAt] = SYSDATETIMEOFFSET()
                OUTPUT inserted.[NextValue]
                WHERE [CounterKey] = @counterKey;
                """;

            var parameter = command.CreateParameter();
            parameter.ParameterName = "@counterKey";
            parameter.Value = counterKey;
            command.Parameters.Add(parameter);

            var transaction = _dbContext.Database.CurrentTransaction;
            if (transaction is not null)
            {
                command.Transaction = transaction.GetDbTransaction();
            }

            if (connection.State != System.Data.ConnectionState.Open)
            {
                await connection.OpenAsync(cancellationToken);
            }

            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                results.Add(reader.GetInt64(0));
            }

            if (results.Count != 1)
            {
                throw new InvalidOperationException(
                    "Allocating a document number did not return exactly one value.");
            }

            return results[0];
        }

        // In-memory provider (unit tests): no locking available, so this path is
        // only ever single-threaded. Concurrency is covered by relational tests.
        var counter = await _dbContext.DocumentNumberCounters
            .SingleOrDefaultAsync(entry => entry.CounterKey == counterKey, cancellationToken);

        if (counter is null)
        {
            counter = new Entities.DocumentNumberCounter { CounterKey = counterKey, NextValue = 0 };
            _dbContext.DocumentNumberCounters.Add(counter);
        }

        counter.NextValue += 1;
        counter.UpdatedAt = DateTimeOffset.UtcNow;
        await _dbContext.SaveChangesAsync(cancellationToken);
        return counter.NextValue;
    }
}
