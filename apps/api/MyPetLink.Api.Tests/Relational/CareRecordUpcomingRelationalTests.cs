using System.Data.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// The pending-care read on real SQL Server. InMemory evaluates the
/// "no active fulfiller" rule in process; this proves SQL Server receives it
/// as part of the paged statement, so filtering always happens before
/// OFFSET/FETCH and the total counts exactly what the pages contain.
/// </summary>
public sealed class CareRecordUpcomingRelationalTests
{
    private static readonly Guid Owner = Guid.Parse("f1111111-1111-1111-1111-111111111111");
    private static readonly Guid Milo = Guid.Parse("f2222222-2222-2222-2222-222222222221");
    private static readonly Guid Luna = Guid.Parse("f2222222-2222-2222-2222-222222222222");
    private static readonly Guid Memorial = Guid.Parse("f2222222-2222-2222-2222-222222222223");

    [RelationalFact]
    public async Task FiltersHistoryFulfilmentAndLifecycleBeforePaging()
    {
        var capture = new CaptureSql();
        await using var scope = await RelationalDatabase.CreateAsync(capture);
        var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(8));
        Guid pendingOld, pendingLuna, targetDone, chainHead;

        await using (var db = scope.NewContext())
        {
            db.Users.Add(new User
            {
                Id = Owner,
                Email = "owner@example.com",
                NormalizedEmail = "OWNER@EXAMPLE.COM",
                DisplayName = "Owner",
                Status = UserStatus.Active
            });
            db.Pets.Add(Pet(Milo, "Milo", PetLifecycleStatus.Active));
            db.Pets.Add(Pet(Luna, "Luna", PetLifecycleStatus.Active));
            db.Pets.Add(Pet(Memorial, "Bobo", PetLifecycleStatus.Memorial));
            await db.SaveChangesAsync();

            // A pending item older than 110 rows of unrelated history.
            var old = Record(Milo, "Rabies booster", today.AddYears(-1), today.AddDays(3));
            db.CareRecords.Add(old);
            for (var index = 0; index < 110; index++)
            {
                db.CareRecords.Add(Record(Milo, $"Walk {index}", today.AddDays(-(index % 20)), null));
            }

            // A completed target whose completer is backdated far behind it.
            var target = Record(Milo, "DHPP", today.AddDays(-2), today.AddDays(-1));
            db.CareRecords.Add(target);
            await db.SaveChangesAsync();
            var completer = Record(Milo, "DHPP done", today.AddYears(-3), null);
            completer.FulfillsCareRecordId = target.Id;
            db.CareRecords.Add(completer);

            // A chain whose head is still due, and a pet in Memorial Mode.
            var chainStart = Record(Luna, "Deworm", today.AddMonths(-3), today.AddMonths(-1));
            db.CareRecords.Add(chainStart);
            await db.SaveChangesAsync();
            var head = Record(Luna, "Deworm again", today.AddMonths(-1), today.AddMonths(2));
            head.FulfillsCareRecordId = chainStart.Id;
            db.CareRecords.Add(head);
            db.CareRecords.Add(Record(Memorial, "Old booster", today.AddYears(-1), today.AddDays(1)));
            await db.SaveChangesAsync();

            pendingOld = old.Id;
            pendingLuna = head.Id;
            targetDone = target.Id;
            chainHead = chainStart.Id;
        }

        capture.Queries.Clear();
        await using (var db = scope.NewContext())
        {
            var service = new CareRecordService(db);
            var (first, total) = await service.ListUpcomingAsync(Owner, null, 1, 1);
            var (second, secondTotal) = await service.ListUpcomingAsync(Owner, null, 2, 1);
            var (third, _) = await service.ListUpcomingAsync(Owner, null, 3, 1);

            Assert.Equal(2, total);
            Assert.Equal(2, secondTotal);
            Assert.Equal(pendingOld, Assert.Single(first.Items).Id);
            Assert.Equal(pendingLuna, Assert.Single(second.Items).Id);
            Assert.Empty(third.Items);
            Assert.DoesNotContain(targetDone, first.Items.Concat(second.Items).Select(item => item.Id));
            Assert.DoesNotContain(chainHead, first.Items.Concat(second.Items).Select(item => item.Id));
            Assert.Equal(
                new[] { Milo, Luna }.OrderBy(id => id),
                first.PetIdsWithCareRecords.OrderBy(id => id));
        }

        // The page query carries the fulfilment rule and the paging together.
        var paged = capture.Queries.First(sql =>
            sql.Contains("OFFSET", StringComparison.OrdinalIgnoreCase));
        Assert.Contains("NOT EXISTS", paged, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("[FulfillsCareRecordId]", paged, StringComparison.Ordinal);
        Assert.Contains("[LifecycleStatus]", paged, StringComparison.Ordinal);
    }

    /// <summary>
    /// While another connection keeps archiving, restoring and rescheduling
    /// due items, every summary must still describe one state: its rows, its
    /// grouped counts and its per-pet scopes come from separate statements,
    /// and only a consistent read makes them agree. The summary marks itself
    /// incomplete when they disagree, so "always complete" here is the check.
    /// Runs with the retrying execution strategy production uses.
    /// </summary>
    [RelationalFact]
    public async Task Summary_StaysInternallyConsistentWhileRecordsChange()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(8));
        var churnIds = new List<Guid>();

        await using (var db = scope.NewContext())
        {
            db.Users.Add(new User
            {
                Id = Owner,
                Email = "owner@example.com",
                NormalizedEmail = "OWNER@EXAMPLE.COM",
                DisplayName = "Owner",
                Status = UserStatus.Active
            });
            db.Pets.Add(Pet(Milo, "Milo", PetLifecycleStatus.Active));
            db.Pets.Add(Pet(Luna, "Luna", PetLifecycleStatus.Active));
            await db.SaveChangesAsync();

            for (var index = 0; index < 60; index++)
            {
                var record = Record(index % 2 == 0 ? Milo : Luna, $"Due {index}", today.AddDays(-10), today.AddDays(index - 20));
                db.CareRecords.Add(record);
                if (index % 3 == 0) churnIds.Add(record.Id);
            }
            for (var index = 0; index < 80; index++)
            {
                db.CareRecords.Add(Record(index % 2 == 0 ? Milo : Luna, $"History {index}", today.AddDays(-index), null));
            }
            await db.SaveChangesAsync();
        }

        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(4));
        var writes = 0;
        var writer = Task.Run(async () =>
        {
            var random = new Random(7);
            while (!stop.IsCancellationRequested)
            {
                await using var db = scope.NewContext();
                var picked = churnIds.OrderBy(_ => random.Next()).Take(4).ToArray();
                var rows = await db.CareRecords.Where(record => picked.Contains(record.Id)).ToListAsync();
                foreach (var row in rows)
                {
                    if (random.Next(2) == 0)
                    {
                        row.ArchivedAt = row.ArchivedAt is null ? DateTimeOffset.UtcNow : null;
                    }
                    else
                    {
                        row.DueDate = today.AddDays(random.Next(-25, 45));
                    }
                }
                await db.SaveChangesAsync();
                Interlocked.Increment(ref writes);
            }
        });

        var reads = 0;
        while (!stop.IsCancellationRequested)
        {
            await using var db = scope.NewContext();
            var summary = await new CareRecordService(db).GetUpcomingSummaryAsync(Owner);
            reads++;

            Assert.True(summary.Complete, "A summary mixed two database states.");
            var all = summary.Scopes.Single(item => item.PetId is null);
            var pets = summary.Scopes.Where(item => item.PetId is not null).ToArray();
            Assert.Equal(all.PendingCount, pets.Sum(item => item.PendingCount));
            Assert.InRange(all.OverdueCount, 0, all.DueWithinHorizonCount);
            Assert.InRange(all.DueWithinHorizonCount, 0, all.PendingCount);
            foreach (var group in all.Items.GroupBy(item => item.PetId))
            {
                Assert.True(pets.Single(item => item.PetId == group.Key).PendingCount >= group.Count());
            }
        }

        await writer;
        Assert.True(reads > 5, $"Only {reads} summaries were read.");
        Assert.True(writes > 5, $"Only {writes} changes were written.");
    }

    [RelationalFact]
    public async Task CompletionStatus_ReadsTheTargetAndItsActiveFulfillerInOneStatement()
    {
        var capture = new CaptureSql();
        await using var scope = await RelationalDatabase.CreateAsync(capture);
        var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(8));
        Guid targetId, fulfillerId;

        await using (var db = scope.NewContext())
        {
            db.Users.Add(new User
            {
                Id = Owner,
                Email = "owner@example.com",
                NormalizedEmail = "OWNER@EXAMPLE.COM",
                DisplayName = "Owner",
                Status = UserStatus.Active
            });
            db.Pets.Add(Pet(Milo, "Milo", PetLifecycleStatus.Active));
            var target = Record(Milo, "Rabies booster", today.AddDays(-30), today.AddDays(-1));
            db.CareRecords.Add(target);
            await db.SaveChangesAsync();
            var archived = Record(Milo, "Withdrawn log", today.AddDays(-2), null);
            archived.FulfillsCareRecordId = null;
            archived.ArchivedAt = DateTimeOffset.UtcNow;
            db.CareRecords.Add(archived);
            var fulfiller = Record(Milo, "Rabies booster", today, today.AddYears(1));
            fulfiller.FulfillsCareRecordId = target.Id;
            db.CareRecords.Add(fulfiller);
            await db.SaveChangesAsync();
            targetId = target.Id;
            fulfillerId = fulfiller.Id;
        }

        capture.Queries.Clear();
        await using (var db = scope.NewContext())
        {
            var status = await new CareRecordService(db).GetCompletionStatusAsync(Owner, targetId);

            Assert.Equal("completed", status.State);
            Assert.Equal(fulfillerId, status.Completion!.Id);
        }

        var statusQuery = capture.Queries.First();
        Assert.Contains("[FulfillsCareRecordId]", statusQuery, StringComparison.Ordinal);
        Assert.Contains("[OwnerUserId]", statusQuery, StringComparison.Ordinal);
    }

    private static Pet Pet(Guid id, string name, PetLifecycleStatus lifecycle) => new()
    {
        Id = id,
        OwnerUserId = Owner,
        Slug = $"{name.ToLowerInvariant()}-{id.ToString("N")[..4]}",
        Name = name,
        Species = "Dog",
        LifecycleStatus = lifecycle
    };

    private static CareRecord Record(Guid petId, string title, DateOnly recordDate, DateOnly? dueDate) => new()
    {
        PetId = petId,
        Type = CareRecordType.Vaccine,
        Title = title,
        RecordDate = recordDate,
        DueDate = dueDate,
        PublicVisibility = CareRecordPublicVisibility.Private
    };

    private sealed class CaptureSql : DbCommandInterceptor
    {
        public List<string> Queries { get; } = [];

        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<DbDataReader> result,
            CancellationToken cancellationToken = default)
        {
            Queries.Add(command.CommandText);
            return ValueTask.FromResult(result);
        }
    }
}
