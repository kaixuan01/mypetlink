using System.Data;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Data;

namespace MyPetLink.Api.Common;

/// <summary>
/// One write that can change whether a pet's care can be written — a care
/// record created, edited, archived or completed, or the pet itself archived —
/// run as a single unit under that pet's care-write lock.
///
/// On SQL Server it holds a transaction-scoped application lock named
/// <c>care-write:{petId:N}</c> from before the first read to the commit, so
/// these writes validate and commit one at a time per pet, whatever the
/// database's read isolation. It is the only lock these writes take, so there
/// is no lock order to get wrong. The whole unit retries on a transient
/// failure, starting again from an empty change tracker. The in-memory
/// provider used by unit tests has no transactions, so it runs the write
/// directly.
/// </summary>
public static class PetCareWriteLock
{
    public static async Task<T> RunAsync<T>(
        MyPetLinkDbContext dbContext,
        Guid petId,
        Func<Task<T>> write,
        CancellationToken cancellationToken)
    {
        if (!dbContext.Database.IsRelational())
        {
            return await write();
        }

        var strategy = dbContext.Database.CreateExecutionStrategy();
        var attempt = 0;
        return await strategy.ExecuteAsync(async () =>
        {
            if (attempt++ > 0)
            {
                dbContext.ChangeTracker.Clear();
            }

            await using var transaction = await dbContext.Database.BeginTransactionAsync(
                IsolationLevel.ReadCommitted,
                cancellationToken);
            if (dbContext.Database.IsSqlServer())
            {
                await SqlApplicationLock.AcquireAsync(
                    dbContext,
                    transaction,
                    $"care-write:{petId:N}",
                    "care_write_busy",
                    "This pet's care records are being updated. Please try again in a moment.",
                    cancellationToken);
            }

            var result = await write();
            await transaction.CommitAsync(cancellationToken);
            return result;
        });
    }
}
