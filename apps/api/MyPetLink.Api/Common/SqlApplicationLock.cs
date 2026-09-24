using System.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using MyPetLink.Api.Data;

namespace MyPetLink.Api.Common;

/// <summary>
/// A transaction-scoped SQL Server application lock (<c>sp_getapplock</c>).
///
/// Held by the database, not the process, so every API instance serializes on
/// the same resource. Owned by the transaction: commit, rollback and a dropped
/// connection all release it, so a request can never leave one hanging. Callers
/// take it inside a retrying execution-strategy unit, as the first statement of
/// their transaction, and only on SQL Server — the in-memory provider used by
/// unit tests has no transactions to scope it to.
/// </summary>
public static class SqlApplicationLock
{
    public static async Task AcquireAsync(
        MyPetLinkDbContext dbContext,
        IDbContextTransaction transaction,
        string resource,
        string unavailableCode,
        string unavailableMessage,
        CancellationToken cancellationToken)
    {
        var connection = dbContext.Database.GetDbConnection();
        if (connection.State != ConnectionState.Open)
        {
            await connection.OpenAsync(cancellationToken);
        }

        await using var command = connection.CreateCommand();
        command.Transaction = transaction.GetDbTransaction();
        command.CommandText = """
            DECLARE @result int;
            EXEC @result = sys.sp_getapplock
                @Resource = @resource,
                @LockMode = N'Exclusive',
                @LockOwner = N'Transaction',
                @LockTimeout = 10000;
            SELECT @result;
            """;

        var parameter = command.CreateParameter();
        parameter.ParameterName = "@resource";
        parameter.DbType = DbType.String;
        parameter.Size = 255;
        parameter.Value = resource;
        command.Parameters.Add(parameter);

        var result = Convert.ToInt32(
            await command.ExecuteScalarAsync(cancellationToken),
            System.Globalization.CultureInfo.InvariantCulture);

        // Negative: timeout, cancellation, deadlock victim or error. None is
        // retried here; the caller's request fails safely and can be repeated.
        if (result < 0)
        {
            throw new ApiException(
                StatusCodes.Status503ServiceUnavailable,
                unavailableCode,
                unavailableMessage);
        }
    }
}
