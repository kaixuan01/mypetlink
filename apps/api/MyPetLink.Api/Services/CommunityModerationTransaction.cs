using System.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;

namespace MyPetLink.Api.Services;

/// <summary>
/// How every Community moderation action runs, whether it was started from a
/// report or directly: one transaction holding the SQL Server application
/// locks for what it changes, so two moderators — or a moderator, the owner and
/// the expiry worker — never both commit against the same state.
///
/// The lock names are shared by all of them on purpose. Lock order is always
/// content first (Comment or Moment), then household.
/// </summary>
internal static class CommunityModerationTransaction
{
    public static string CommentLock(Guid commentId) => $"mypetlink:community-moderation:comment:{commentId:N}";

    public static string MomentLock(Guid momentId) => $"mypetlink:community-moderation:moment:{momentId:N}";

    public static string HouseholdLock(Guid userId) => $"mypetlink:community-moderation:household:{userId:N}";

    public static Task<T> RunAsync<T>(
        MyPetLinkDbContext dbContext,
        IReadOnlyList<string> lockResources,
        Func<Task<T>> work,
        string conflictMessage,
        CancellationToken cancellationToken) =>
        RunAsync(dbContext, lockResources, _ => work(), conflictMessage, cancellationToken);

    /// <summary>
    /// Runs one moderation action in its own transaction, holding the
    /// application locks (SQL Server only) for its whole length. A concurrency
    /// failure rolls everything back and answers 409 with
    /// <paramref name="conflictMessage"/>.
    /// </summary>
    public static async Task<T> RunAsync<T>(
        MyPetLinkDbContext dbContext,
        IReadOnlyList<string> lockResources,
        Func<IDbContextTransaction?, Task<T>> work,
        string conflictMessage,
        CancellationToken cancellationToken)
    {
        var strategy = dbContext.Database.CreateExecutionStrategy();
        try
        {
            return await strategy.ExecuteAsync(async () =>
            {
                dbContext.ChangeTracker.Clear();
                await using IDbContextTransaction? transaction = dbContext.Database.IsRelational()
                    ? await dbContext.Database.BeginTransactionAsync(
                        dbContext.Database.IsSqlServer()
                            ? IsolationLevel.ReadCommitted
                            : IsolationLevel.Serializable,
                        cancellationToken)
                    : null;

                if (transaction is not null && dbContext.Database.IsSqlServer())
                {
                    foreach (var resource in lockResources)
                    {
                        await SqlApplicationLock.AcquireAsync(
                            dbContext,
                            transaction,
                            resource,
                            "moderation_temporarily_unavailable",
                            "This couldn't be completed right now. Please try again.",
                            cancellationToken);
                    }
                }

                var result = await work(transaction);
                if (transaction is not null)
                {
                    await transaction.CommitAsync(cancellationToken);
                }

                return result;
            });
        }
        catch (DbUpdateConcurrencyException)
        {
            dbContext.ChangeTracker.Clear();
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "concurrency_conflict",
                conflictMessage);
        }
    }
}
