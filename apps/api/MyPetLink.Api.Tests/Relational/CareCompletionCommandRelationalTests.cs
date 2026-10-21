using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// The one-step completion command against real SQL Server: concurrent and
/// retried requests, competing writes on the same item, and paging the
/// planner over hundreds of pending items. Each test owns a disposable
/// database created and dropped by <see cref="RelationalDatabase"/>.
/// </summary>
public sealed class CareCompletionCommandRelationalTests
{
    private static readonly Guid Owner = Guid.Parse("d1111111-1111-1111-1111-111111111111");
    private static readonly Guid OtherOwner = Guid.Parse("d1111111-1111-1111-1111-111111111112");
    private static readonly Guid Milo = Guid.Parse("d2222222-2222-2222-2222-222222222221");
    private static readonly Guid Oyen = Guid.Parse("d2222222-2222-2222-2222-222222222222");
    private static readonly Guid Rex = Guid.Parse("d2222222-2222-2222-2222-222222222223");

    private static DateOnly Today => DateOnly.FromDateTime(DateTime.UtcNow.AddHours(8));

    [RelationalFact]
    public async Task ConcurrentRequestsWithTheSameKey_WriteOneRecord_AndEveryOneReturnsIt()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var targetId = (await SeedAsync(scope, 1))[0];
        var key = Guid.NewGuid();

        // A double click, a retry after a timeout and a second tab, all at once.
        var results = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => CompleteAsync(scope, targetId, key)));

        Assert.Single(results, result => result.Outcome == "created");
        Assert.Equal(7, results.Count(result => result.Outcome == "replayed"));
        Assert.Single(results.Select(result => result.Completion.Id).Distinct());
        Assert.Equal(1, await CompletingRecordsAsync(scope, targetId));
    }

    [RelationalFact]
    public async Task ConcurrentRequestsWithDifferentKeys_OneCompletes_TheRestAreRefused()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var targetId = (await SeedAsync(scope, 1))[0];

        var attempts = Enumerable.Range(0, 6).Select(_ => Attempt(() => CompleteAsync(scope, targetId, Guid.NewGuid()))).ToArray();
        var outcomes = await Task.WhenAll(attempts);

        Assert.Single(outcomes, outcome => outcome == "created");
        Assert.Equal(5, outcomes.Count(outcome => outcome == "care_item_completed"));
        Assert.Equal(1, await CompletingRecordsAsync(scope, targetId));
    }

    [RelationalFact]
    public async Task ARetryArrivingWhileTheOriginalIsStillWriting_WaitsAndReturnsTheOriginalsRecord()
    {
        // The response timed out while the original was still running; the
        // retry reaches the server before the original commits.
        var pause = new PauseBeforeCareInsert();
        await using var scope = await RelationalDatabase.CreateAsync(pause, enableRetryOnFailure: true);
        var targetId = (await SeedAsync(scope, 1))[0];
        var key = Guid.NewGuid();
        pause.Arm();

        var original = CompleteAsync(scope, targetId, key);
        await pause.Reached.Task.WaitAsync(TimeSpan.FromSeconds(30));
        var retry = CompleteAsync(scope, targetId, key);
        await Task.Delay(TimeSpan.FromMilliseconds(750));
        Assert.False(retry.IsCompleted);

        pause.Release.SetResult();
        var created = await original;
        var replayed = await retry;

        Assert.Equal("created", created.Outcome);
        Assert.Equal("replayed", replayed.Outcome);
        Assert.Equal(created.Completion.Id, replayed.Completion.Id);
        Assert.Equal(1, await CompletingRecordsAsync(scope, targetId));
    }

    [RelationalFact]
    public async Task ARetryAfterTheCommit_ReturnsTheSameRecord_AndAConflictingReuseIsRefused()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var targetId = (await SeedAsync(scope, 1))[0];
        var key = Guid.NewGuid();

        var created = await CompleteAsync(scope, targetId, key, notes: "Clinic");
        // The response was lost after the commit; the client retries.
        var replayed = await CompleteAsync(scope, targetId, key, notes: "Clinic");
        var conflict = await Attempt(() => CompleteAsync(scope, targetId, key, notes: "Something else"));

        Assert.Equal(created.Completion.Id, replayed.Completion.Id);
        Assert.Equal("replayed", replayed.Outcome);
        Assert.Equal("idempotency_key_conflict", conflict);
        Assert.Equal(1, await CompletingRecordsAsync(scope, targetId));
    }

    [RelationalFact]
    public async Task OneKeyUsedForTwoOwnersItemsAtOnce_WritesOnlyOne()
    {
        // Different pets take different locks; the unique key index is the
        // backstop, and the loser is refused without learning anything.
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var mine = (await SeedAsync(scope, 1))[0];
        var theirs = await SeedForAsync(scope, OtherOwner, Rex, "Rabies booster");
        var key = Guid.NewGuid();

        var outcomes = await Task.WhenAll(
            Attempt(() => CompleteAsync(scope, mine, key)),
            Attempt(() => CompleteAsync(scope, theirs, key, owner: OtherOwner)));

        Assert.Single(outcomes, outcome => outcome == "created");
        Assert.Single(outcomes, outcome => outcome == "idempotency_key_conflict");
        Assert.Equal(1, await CompletingRecordsAsync(scope, mine) + await CompletingRecordsAsync(scope, theirs));
    }

    [RelationalFact]
    public async Task ArchivingWhileACompletionIsWriting_WaitsForIt_ThenUnlinksIt()
    {
        var pause = new PauseBeforeCareInsert();
        await using var scope = await RelationalDatabase.CreateAsync(pause, enableRetryOnFailure: true);
        var targetId = (await SeedAsync(scope, 1))[0];
        pause.Arm();

        var completing = CompleteAsync(scope, targetId, Guid.NewGuid());
        await pause.Reached.Task.WaitAsync(TimeSpan.FromSeconds(30));
        var archiving = WithService(scope, service => service.ArchiveAsync(Owner, targetId));
        await Task.Delay(TimeSpan.FromMilliseconds(750));
        Assert.False(archiving.IsCompleted);

        pause.Release.SetResult();
        var created = await completing;
        await archiving;

        var status = await WithService(scope, service => service.GetCompletionStatusAsync(Owner, targetId));
        Assert.Equal("archived", status.State);
        Assert.Null(status.Completion);
        // The care that was done stays in the history.
        Assert.True(await WithDb(scope, db => db.CareRecords.AnyAsync(record => record.Id == created.Completion.Id && record.ArchivedAt == null)));
    }

    [RelationalTheory]
    [InlineData("move")]
    [InlineData("clear")]
    public async Task ChangingTheDueDateWhileACompletionIsWriting_WaitsForIt(string change)
    {
        var pause = new PauseBeforeCareInsert();
        await using var scope = await RelationalDatabase.CreateAsync(pause, enableRetryOnFailure: true);
        var targetId = (await SeedAsync(scope, 1))[0];
        pause.Arm();

        var completing = CompleteAsync(scope, targetId, Guid.NewGuid());
        await pause.Reached.Task.WaitAsync(TimeSpan.FromSeconds(30));
        var editing = WithService(scope, service => service.UpdateAsync(Owner, targetId, change == "move"
            ? new UpdateCareRecordRequest(null, null, null, Today.AddDays(10), null, null, null, null)
            : new UpdateCareRecordRequest(null, null, null, null, null, null, null, null, ClearDueDate: true)));
        await Task.Delay(TimeSpan.FromMilliseconds(750));
        Assert.False(editing.IsCompleted);

        pause.Release.SetResult();
        var created = await completing;

        if (change == "move")
        {
            // Moving a completed item's date is allowed, after the completion.
            await editing;
        }
        else
        {
            // Removing it is refused once the item is completed.
            var refusal = await Assert.ThrowsAsync<ApiException>(() => editing);
            Assert.Equal(StatusCodes.Status400BadRequest, refusal.StatusCode);
        }

        var status = await WithService(scope, service => service.GetCompletionStatusAsync(Owner, targetId));
        Assert.Equal("completed", status.State);
        Assert.Equal(created.Completion.Id, status.Completion?.Id);
    }

    /// <summary>
    /// F6, as the review ran it: a completion passes validation and pauses
    /// holding the pet's care-write lock; archiving the pet from another
    /// connection must wait for it rather than commit first. They then run in
    /// that order: the completion is kept, and the item reads pet-archived.
    /// </summary>
    [RelationalFact]
    public async Task ArchivingThePetWhileACompletionIsWriting_WaitsForIt()
    {
        var pause = new PauseBeforeCareInsert();
        await using var scope = await RelationalDatabase.CreateAsync(pause, enableRetryOnFailure: true);
        var targetId = (await SeedAsync(scope, 1))[0];
        pause.Arm();

        var completing = CompleteAsync(scope, targetId, Guid.NewGuid());
        await pause.Reached.Task.WaitAsync(TimeSpan.FromSeconds(30));
        var archiving = ArchivePetAsync(scope, Milo);
        await Task.Delay(TimeSpan.FromMilliseconds(750));
        Assert.False(archiving.IsCompleted);
        Assert.Equal(PetLifecycleStatus.Active, await WithDb(scope, db => db.Pets.Where(pet => pet.Id == Milo).Select(pet => pet.LifecycleStatus).SingleAsync()));

        pause.Release.SetResult();
        var created = await completing;
        var archived = await archiving;

        Assert.Equal("created", created.Outcome);
        Assert.Equal("Archived", archived.LifecycleStatus.ToString());
        var status = await WithService(scope, service => service.GetCompletionStatusAsync(Owner, targetId));
        Assert.Equal("pet-archived", status.State);
        Assert.Equal(created.Completion.Id, status.Completion?.Id);
        Assert.Equal(1, await CompletingRecordsAsync(scope, targetId));
    }

    [RelationalFact]
    public async Task ACompletionAfterThePetWasArchived_IsRefused()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var targetId = (await SeedAsync(scope, 1))[0];

        await ArchivePetAsync(scope, Milo);

        Assert.Equal("care_item_pet_archived", await Attempt(() => CompleteAsync(scope, targetId, Guid.NewGuid())));
        Assert.Equal(0, await CompletingRecordsAsync(scope, targetId));
    }

    [RelationalFact]
    public async Task ArchivingThePetWhileItsCareLockIsHeldTooLong_FailsSafelyAndChangesNothing()
    {
        var pause = new PauseBeforeCareInsert();
        await using var scope = await RelationalDatabase.CreateAsync(pause, enableRetryOnFailure: true);
        var targetId = (await SeedAsync(scope, 1))[0];
        pause.Arm();

        var completing = CompleteAsync(scope, targetId, Guid.NewGuid());
        await pause.Reached.Task.WaitAsync(TimeSpan.FromSeconds(30));
        // The lock wait gives up after ten seconds; nothing is half-written.
        var busy = await Assert.ThrowsAsync<ApiException>(() => ArchivePetAsync(scope, Milo));
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, busy.StatusCode);
        Assert.Equal(PetLifecycleStatus.Active, await WithDb(scope, db => db.Pets.Where(pet => pet.Id == Milo).Select(pet => pet.LifecycleStatus).SingleAsync()));

        pause.Release.SetResult();
        Assert.Equal("created", (await completing).Outcome);
        // Once the lock is free, archiving works.
        Assert.Equal("Archived", (await ArchivePetAsync(scope, Milo)).LifecycleStatus.ToString());
    }

    [RelationalFact]
    public async Task TheFullFormAndTheOneStepCommandRacing_LeaveOneCompletion()
    {
        var pause = new PauseBeforeCareInsert();
        await using var scope = await RelationalDatabase.CreateAsync(pause, enableRetryOnFailure: true);
        var targetId = (await SeedAsync(scope, 1))[0];
        pause.Arm();

        var fullForm = WithService(scope, service => service.CreateAsync(Owner, Milo, new CreateCareRecordRequest(
            CareRecordType.Vaccine, "Rabies booster", Today, null, null, "Full form", CareRecordPublicVisibility.Private, null,
            FulfillsCareRecordId: targetId)));
        await pause.Reached.Task.WaitAsync(TimeSpan.FromSeconds(30));
        var oneStep = Attempt(() => CompleteAsync(scope, targetId, Guid.NewGuid()));
        await Task.Delay(TimeSpan.FromMilliseconds(750));
        Assert.False(oneStep.IsCompleted);

        pause.Release.SetResult();
        var formRecord = await fullForm;

        Assert.Equal("care_item_completed", await oneStep);
        var status = await WithService(scope, service => service.GetCompletionStatusAsync(Owner, targetId));
        Assert.Equal(formRecord.Id, status.Completion?.Id);
        Assert.Equal(1, await CompletingRecordsAsync(scope, targetId));
    }

    [RelationalFact]
    public async Task ThePlannerPagesOverMoreThanFiveHundredItems_AndCountsStayExactWhileItemsAreCompleted()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var targets = await SeedAsync(scope, 520);

        var firstPass = await ReadAllPagesAsync(scope);
        Assert.Equal(520, firstPass.Total);
        Assert.Equal(520, firstPass.Ids.Count);
        Assert.Equal(520, firstPass.Ids.Distinct().Count());
        Assert.Equal(6, firstPass.Pages);

        // Twelve items completed at once, from different tabs.
        var completed = targets.Where((_, index) => index % 40 == 0).ToArray();
        await Task.WhenAll(completed.Select(id => CompleteAsync(scope, id, Guid.NewGuid())));

        var secondPass = await ReadAllPagesAsync(scope);
        Assert.Equal(520 - completed.Length, secondPass.Total);
        Assert.Equal(secondPass.Total, secondPass.Ids.Count);
        Assert.Equal(secondPass.Ids.Count, secondPass.Ids.Distinct().Count());
        Assert.Empty(secondPass.Ids.Intersect(completed));
        var summary = await WithService(scope, service => service.GetUpcomingSummaryAsync(Owner));
        Assert.Equal(secondPass.Total, summary.Scopes.Single(item => item.PetId == null).PendingCount);
    }

    [RelationalFact]
    public async Task ReadingPagesWhileItemsAreCompleted_KeepsEachPageOrderedAndTheTotalCurrent()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var targets = await SeedAsync(scope, 150);

        var page1 = await WithService(scope, service => service.ListUpcomingAsync(Owner, null, 1, 100));
        // Items on page one are completed before page two is read.
        await Task.WhenAll(page1.Response.Items.Take(5).Select(item => CompleteAsync(scope, item.Id, Guid.NewGuid())));
        var page2 = await WithService(scope, service => service.ListUpcomingAsync(Owner, null, 2, 100));

        Assert.Equal(150, page1.Total);
        Assert.Equal(145, page2.Total);
        // Offset paging can shift after a change: the client refreshes what it
        // has loaded after every completion rather than trusting old offsets.
        Assert.Equal(45, page2.Response.Items.Count);
        Assert.True(page2.Response.Items.Select(item => (item.DueDate, item.Id)).SequenceEqual(
            page2.Response.Items.Select(item => (item.DueDate, item.Id)).OrderBy(item => item.DueDate)));
    }

    // ---- helpers ------------------------------------------------------------

    private static async Task<Guid[]> SeedAsync(RelationalScope scope, int pending)
    {
        await using var db = scope.NewContext();
        db.Users.Add(NewUser(Owner, "owner@example.com"));
        db.Users.Add(NewUser(OtherOwner, "other@example.com"));
        db.Pets.Add(NewPet(Milo, Owner, "Milo"));
        db.Pets.Add(NewPet(Oyen, Owner, "Oyen"));
        db.Pets.Add(NewPet(Rex, OtherOwner, "Rex"));
        var records = Enumerable.Range(0, pending).Select(index => new CareRecord
        {
            PetId = index % 2 == 0 ? Milo : Oyen,
            Type = CareRecordType.Vaccine,
            Title = $"Rabies booster {index:D3}",
            RecordDate = Today.AddYears(-1),
            DueDate = Today.AddDays(index % 90 - 30),
            PublicVisibility = CareRecordPublicVisibility.Private
        }).ToList();
        db.CareRecords.AddRange(records);
        await db.SaveChangesAsync();
        // Created strictly before any completing record, as validation requires.
        foreach (var record in records)
        {
            record.CreatedAt = DateTimeOffset.UtcNow.AddDays(-1);
        }

        await db.SaveChangesAsync();
        return records.Select(record => record.Id).ToArray();
    }

    private static async Task<Guid> SeedForAsync(RelationalScope scope, Guid owner, Guid petId, string title)
    {
        await using var db = scope.NewContext();
        var record = new CareRecord
        {
            PetId = petId,
            Type = CareRecordType.Vaccine,
            Title = title,
            RecordDate = Today.AddYears(-1),
            DueDate = Today.AddDays(-2),
            PublicVisibility = CareRecordPublicVisibility.Private
        };
        db.CareRecords.Add(record);
        await db.SaveChangesAsync();
        record.CreatedAt = DateTimeOffset.UtcNow.AddDays(-1);
        await db.SaveChangesAsync();
        return record.Id;
    }

    private static async Task<CareCompletionResultResponse> CompleteAsync(
        RelationalScope scope,
        Guid targetId,
        Guid key,
        string? notes = null,
        Guid? owner = null)
    {
        await using var db = scope.NewContext();
        return await new CareRecordService(db).CompleteAsync(
            owner ?? Owner,
            targetId,
            new CompleteCareRecordRequest(key, Today, null, null, notes));
    }

    /// <summary>Runs a completion and reports its outcome or refusal code.</summary>
    private static async Task<string> Attempt(Func<Task<CareCompletionResultResponse>> completion)
    {
        try
        {
            return (await completion()).Outcome;
        }
        catch (ApiException exception)
        {
            return exception.Code;
        }
    }

    private static async Task<T> WithService<T>(RelationalScope scope, Func<CareRecordService, Task<T>> action)
    {
        await using var db = scope.NewContext();
        return await action(new CareRecordService(db));
    }

    private static async Task WithService(RelationalScope scope, Func<CareRecordService, Task> action)
    {
        await using var db = scope.NewContext();
        await action(new CareRecordService(db));
    }

    private static async Task<T> WithDb<T>(RelationalScope scope, Func<MyPetLink.Api.Data.MyPetLinkDbContext, Task<T>> action)
    {
        await using var db = scope.NewContext();
        return await action(db);
    }

    private static async Task<PetDetailResponse> ArchivePetAsync(RelationalScope scope, Guid petId)
    {
        await using var db = scope.NewContext();
        return await new PetService(db, Options.Create(new CloudflareR2Options())).ArchiveAsync(Owner, petId);
    }

    private static Task<int> CompletingRecordsAsync(RelationalScope scope, Guid targetId) =>
        WithDb(scope, db => db.CareRecords.CountAsync(record =>
            record.FulfillsCareRecordId == targetId && record.ArchivedAt == null && record.DeletedAt == null));

    private static async Task<(int Total, int Pages, List<Guid> Ids)> ReadAllPagesAsync(RelationalScope scope)
    {
        var ids = new List<Guid>();
        var page = 1;
        int total;
        while (true)
        {
            var (response, pageTotal) = await WithService(scope, service => service.ListUpcomingAsync(Owner, null, page, 100));
            total = pageTotal;
            ids.AddRange(response.Items.Select(item => item.Id));
            if (response.Items.Count < 100)
            {
                break;
            }

            page++;
        }

        return (total, page, ids);
    }

    private static User NewUser(Guid id, string email) => new()
    {
        Id = id,
        Email = email,
        NormalizedEmail = email.ToUpperInvariant(),
        DisplayName = "Owner",
        Status = UserStatus.Active
    };

    private static Pet NewPet(Guid id, Guid owner, string name) => new()
    {
        Id = id,
        OwnerUserId = owner,
        Slug = $"{name.ToLowerInvariant()}-{id.ToString("N")[..6]}",
        Name = name,
        Species = "Cat"
    };

    /// <summary>
    /// Once armed, holds the next save that inserts a care record — after the
    /// service's validation, immediately before SQL Server sees the write —
    /// until released, failing rather than hanging if it never is.
    /// </summary>
    private sealed class PauseBeforeCareInsert : SaveChangesInterceptor
    {
        private int _armed;

        public TaskCompletionSource Reached { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public void Arm() => Interlocked.Exchange(ref _armed, 1);

        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData,
            InterceptionResult<int> result,
            CancellationToken cancellationToken = default)
        {
            var insertsCare = eventData.Context?.ChangeTracker
                .Entries<CareRecord>()
                .Any(entry => entry.State == EntityState.Added) == true;
            if (insertsCare && Interlocked.Exchange(ref _armed, 0) == 1)
            {
                Reached.SetResult();
                await Release.Task.WaitAsync(TimeSpan.FromSeconds(60), cancellationToken);
            }

            return result;
        }
    }
}
