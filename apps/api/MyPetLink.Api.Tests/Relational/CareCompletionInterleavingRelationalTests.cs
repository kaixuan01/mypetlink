using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// Log as done against real SQL Server interleavings.
///
/// A save is paused after the service has validated it and immediately
/// before it writes, while other connections change the due item or save
/// again. These pin what the completion-status read reports at each point —
/// which is everything the owner's screen can know about a save whose
/// response was lost — and what is finally in the database.
///
/// The web recovery never writes while a save's outcome is unknown; these
/// tests therefore perform no second write in those cases and assert that
/// the database ends with one completing record.
/// </summary>
public sealed class CareCompletionInterleavingRelationalTests
{
    private static readonly Guid Owner = Guid.Parse("c1111111-1111-1111-1111-111111111111");
    private static readonly Guid Milo = Guid.Parse("c2222222-2222-2222-2222-222222222221");

    [RelationalFact]
    public async Task R2_TargetArchivedWhileAValidatedSaveIsPaused_IsNeverReportedAsCompleted()
    {
        var pause = new PauseBeforeCareInsert();
        await using var scope = await RelationalDatabase.CreateAsync(pause, enableRetryOnFailure: true);
        var targetId = await SeedTargetAsync(scope);
        pause.Arm();

        // 1–2. The owner's save passes validation and pauses before writing.
        var original = CreateCompletionAsync(scope, targetId, "Booster went well");
        await pause.Reached.Task.WaitAsync(TimeSpan.FromSeconds(30));

        // 3. Another tab deletes the due item from the list.
        await using (var db = scope.NewContext())
        {
            await new CareRecordService(db).ArchiveAsync(Owner, targetId);
        }

        // 4. What a recovery check sees: the item changed. Nothing completed.
        var during = await StatusAsync(scope, targetId);
        Assert.Equal("archived", during.State);
        Assert.Null(during.Completion);

        // 5. The web recovery for an unknown outcome on a changed item writes
        //    nothing: Save stays locked and no unlinked copy is offered. So
        //    this test performs no second save.

        // 6. The original write finishes.
        pause.Release.SetResult();
        var landed = await original;

        // 7. One new record exists; the status shows the late record but never
        //    reports the deleted item as completed.
        Assert.Equal(1, await ActiveCompletingLogsAsync(scope, targetId));
        var after = await StatusAsync(scope, targetId);
        Assert.Equal("archived", after.State);
        Assert.Equal(landed.Id, after.Completion?.Id);
    }

    [RelationalFact]
    public async Task OriginalSaveFinishingAfterALostResponse_IsReportedFromItsRecord()
    {
        var pause = new PauseBeforeCareInsert();
        await using var scope = await RelationalDatabase.CreateAsync(pause, enableRetryOnFailure: true);
        var targetId = await SeedTargetAsync(scope);
        pause.Arm();

        var original = CreateCompletionAsync(scope, targetId, "Booster went well");
        await pause.Reached.Task.WaitAsync(TimeSpan.FromSeconds(30));

        var whileRunning = await StatusAsync(scope, targetId);
        Assert.Equal("pending", whileRunning.State);
        Assert.Null(whileRunning.Completion);

        pause.Release.SetResult();
        var landed = await original;

        var after = await StatusAsync(scope, targetId);
        Assert.Equal("completed", after.State);
        Assert.Equal(landed.Id, after.Completion!.Id);
        Assert.Equal("Booster went well", after.Completion.Notes);
    }

    [RelationalFact]
    public async Task ASaveStillRunningBeyondFiveSeconds_StillReadsPending_ThenCompletes()
    {
        // Elapsed time proves nothing: a check six seconds in still sees
        // "pending", and the save then completes.
        var pause = new PauseBeforeCareInsert();
        await using var scope = await RelationalDatabase.CreateAsync(pause, enableRetryOnFailure: true);
        var targetId = await SeedTargetAsync(scope);
        pause.Arm();

        var original = CreateCompletionAsync(scope, targetId, "Slow network");
        await pause.Reached.Task.WaitAsync(TimeSpan.FromSeconds(30));
        await Task.Delay(TimeSpan.FromSeconds(6));

        Assert.Equal("pending", (await StatusAsync(scope, targetId)).State);

        pause.Release.SetResult();
        var landed = await original;

        var after = await StatusAsync(scope, targetId);
        Assert.Equal("completed", after.State);
        Assert.Equal(landed.Id, after.Completion!.Id);
        Assert.Equal(1, await ActiveCompletingLogsAsync(scope, targetId));
    }

    [RelationalFact]
    public async Task ALinkedRetryWhileTheOriginalIsPaused_LeavesOneCompletingRecord()
    {
        // The limited protection that exists: while the due item is unchanged,
        // one item accepts one active completing record, so the late original
        // is refused. This is not request de-duplication.
        var pause = new PauseBeforeCareInsert();
        await using var scope = await RelationalDatabase.CreateAsync(pause, enableRetryOnFailure: true);
        var targetId = await SeedTargetAsync(scope);
        pause.Arm();

        var original = CreateCompletionAsync(scope, targetId, "First try");
        await pause.Reached.Task.WaitAsync(TimeSpan.FromSeconds(30));
        var retry = await CreateCompletionAsync(scope, targetId, "Second try");

        pause.Release.SetResult();
        var refused = await Assert.ThrowsAsync<ApiException>(() => original);
        Assert.Equal(StatusCodes.Status400BadRequest, refused.StatusCode);

        Assert.Equal(1, await ActiveCompletingLogsAsync(scope, targetId));
        Assert.Equal(retry.Id, (await StatusAsync(scope, targetId)).Completion!.Id);
    }

    [RelationalFact]
    public async Task TwoTabsWithDifferentDetails_TheSecondIsRefusedAndTheFirstStands()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var targetId = await SeedTargetAsync(scope);

        var first = await CreateCompletionAsync(scope, targetId, "From my phone");
        var second = await Assert.ThrowsAsync<ApiException>(() =>
            CreateCompletionAsync(scope, targetId, "From my laptop"));

        Assert.Equal(StatusCodes.Status400BadRequest, second.StatusCode);
        Assert.NotNull(second.Details?["fulfillsCareRecordId"]);
        var status = await StatusAsync(scope, targetId);
        Assert.Equal(first.Id, status.Completion!.Id);
        Assert.Equal("From my phone", status.Completion.Notes);
        Assert.Equal(1, await ActiveCompletingLogsAsync(scope, targetId));
    }

    [RelationalFact]
    public async Task DueDateRemovedWhileASaveIsPaused_ReadsNoDueDate_ThenTheLandedRecordIsReported()
    {
        var pause = new PauseBeforeCareInsert();
        await using var scope = await RelationalDatabase.CreateAsync(pause, enableRetryOnFailure: true);
        var targetId = await SeedTargetAsync(scope);
        pause.Arm();

        var original = CreateCompletionAsync(scope, targetId, "Booster went well");
        await pause.Reached.Task.WaitAsync(TimeSpan.FromSeconds(30));
        await using (var db = scope.NewContext())
        {
            await new CareRecordService(db).UpdateAsync(Owner, targetId, new UpdateCareRecordRequest(
                Type: null, Title: null, Date: null, DueDate: null, Provider: null, Notes: null,
                PublicVisibility: null, MediaFileIds: null, ClearDueDate: true));
        }

        var during = await StatusAsync(scope, targetId);
        Assert.Equal("no-due-date", during.State);
        Assert.Null(during.Completion);

        pause.Release.SetResult();
        var landed = await original;

        // The undated item is never reported as an ordinary completion; the
        // late record stays visible for the owner to inspect.
        var after = await StatusAsync(scope, targetId);
        Assert.Equal("no-due-date", after.State);
        Assert.Null(after.Target.DueDate);
        Assert.Equal(landed.Id, after.Completion?.Id);
        Assert.Equal(1, await ActiveCompletingLogsAsync(scope, targetId));
    }

    /// <summary>
    /// G2, as the review ran it: request A passes validation and pauses; the
    /// item changes; the page that sent A is reloaded, so A's state is gone;
    /// a new page's linked request B is refused. B's refusal says nothing
    /// about A, which then lands. The recovery flow offers no unlinked save,
    /// so none is made here, and the database ends with A's record only.
    /// </summary>
    [RelationalTheory]
    [InlineData("archive")]
    [InlineData("clear-due-date")]
    public async Task G2_ANewPagesRefusedSave_DoesNotSettleAnEarlierSaveStillRunning(string change)
    {
        var pause = new PauseBeforeCareInsert();
        await using var scope = await RelationalDatabase.CreateAsync(pause, enableRetryOnFailure: true);
        var targetId = await SeedTargetAsync(scope);
        pause.Arm();

        // 1–2. A validates and pauses before persistence.
        var requestA = CreateCompletionAsync(scope, targetId, "Booster went well");
        await pause.Reached.Task.WaitAsync(TimeSpan.FromSeconds(30));

        // 3. Another connection changes the due item.
        await using (var db = scope.NewContext())
        {
            var service = new CareRecordService(db);
            if (change == "archive")
            {
                await service.ArchiveAsync(Owner, targetId);
            }
            else
            {
                await service.UpdateAsync(Owner, targetId, new UpdateCareRecordRequest(
                    Type: null, Title: null, Date: null, DueDate: null, Provider: null, Notes: null,
                    PublicVisibility: null, MediaFileIds: null, ClearDueDate: true));
            }
        }

        // 4–6. A reloaded page knows nothing of A. Its linked request B gets
        //      the service's real fulfilment refusal.
        var refusal = await Assert.ThrowsAsync<ApiException>(() =>
            CreateCompletionAsync(scope, targetId, "Booster went well"));
        Assert.Equal(StatusCodes.Status400BadRequest, refusal.StatusCode);
        Assert.NotNull(refusal.Details?["fulfillsCareRecordId"]);

        var expected = change == "archive" ? "archived" : "no-due-date";
        var whileRunning = await StatusAsync(scope, targetId);
        Assert.Equal(expected, whileRunning.State);
        Assert.Null(whileRunning.Completion);

        // 7. No unlinked recovery save exists in the flow, so none is made.
        // 8. A finishes after B's refusal.
        pause.Release.SetResult();
        var landed = await requestA;

        // 9. One record: A's, linked to the changed item and reported as
        //    changed, never as an ordinary completion.
        Assert.Equal(1, await ActiveCompletingLogsAsync(scope, targetId));
        await using (var db = scope.NewContext())
        {
            var linked = await db.CareRecords
                .Where(record => record.FulfillsCareRecordId == targetId)
                .Select(record => record.Id)
                .ToListAsync();
            Assert.Equal([landed.Id], linked);
        }
        var final = await StatusAsync(scope, targetId);
        Assert.Equal(expected, final.State);
        Assert.Equal(landed.Id, final.Completion?.Id);
    }

    [RelationalFact]
    public async Task ArchivingTheCompletingRecord_ReturnsTheItemToPending()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var targetId = await SeedTargetAsync(scope);
        var completion = await CreateCompletionAsync(scope, targetId, "Logged");
        Assert.Equal("completed", (await StatusAsync(scope, targetId)).State);

        await using (var db = scope.NewContext())
        {
            await new CareRecordService(db).ArchiveAsync(Owner, completion.Id);
        }

        var after = await StatusAsync(scope, targetId);
        Assert.Equal("pending", after.State);
        Assert.Null(after.Completion);
    }

    [RelationalFact]
    public async Task SameTextWithDifferentDocuments_TheStatusCarriesTheCompletingRecordsOwnMediaIds()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var targetId = await SeedTargetAsync(scope);
        Guid certificateA, certificateB;
        await using (var db = scope.NewContext())
        {
            certificateA = AddCertificate(db, "a.pdf");
            certificateB = AddCertificate(db, "b.pdf");
            await db.SaveChangesAsync();
        }

        // Another tab logs it first with certificate A only.
        var winner = await CreateCompletionAsync(scope, targetId, "Same notes", [certificateA]);
        // This tab's identical text with certificate B is refused.
        await Assert.ThrowsAsync<ApiException>(() =>
            CreateCompletionAsync(scope, targetId, "Same notes", [certificateB]));

        var status = await StatusAsync(scope, targetId);
        Assert.Equal(winner.Id, status.Completion!.Id);
        Assert.Equal("Same notes", status.Completion.Notes);
        Assert.Equal([certificateA], status.Completion.Documents.Select(document => document.Id).ToArray());
    }

    // ---- helpers ------------------------------------------------------------

    private static async Task<Guid> SeedTargetAsync(RelationalScope scope)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(8));
        await using var db = scope.NewContext();
        db.Users.Add(new User
        {
            Id = Owner,
            Email = "owner@example.com",
            NormalizedEmail = "OWNER@EXAMPLE.COM",
            DisplayName = "Owner",
            Status = UserStatus.Active
        });
        db.Pets.Add(new Pet
        {
            Id = Milo,
            OwnerUserId = Owner,
            Slug = "milo-c222",
            Name = "Milo",
            Species = "Dog"
        });
        var target = new CareRecord
        {
            PetId = Milo,
            Type = CareRecordType.Vaccine,
            Title = "Rabies booster",
            RecordDate = today.AddYears(-1),
            DueDate = today.AddDays(-3),
            PublicVisibility = CareRecordPublicVisibility.Private
        };
        db.CareRecords.Add(target);
        await db.SaveChangesAsync();
        // Created strictly before any completing record, as validation requires.
        target.CreatedAt = DateTimeOffset.UtcNow.AddDays(-1);
        await db.SaveChangesAsync();
        return target.Id;
    }

    private static Guid AddCertificate(MyPetLinkDbContext db, string name)
    {
        var media = new MediaFile
        {
            OwnerUserId = Owner,
            PetId = Milo,
            OriginalFileName = name,
            StorageFileName = name,
            ContentType = "application/pdf",
            FileSize = 1000,
            StorageProvider = "Test",
            StoragePath = $"test/{name}",
            BucketName = "test-private",
            ObjectKey = $"test/{name}",
            MediaType = MediaFileType.Document,
            Category = MediaUploadCategory.VaccinationDocument,
            UploadStatus = MediaUploadStatus.Ready
        };
        db.MediaFiles.Add(media);
        return media.Id;
    }

    private static async Task<CareRecordResponse> CreateCompletionAsync(
        RelationalScope scope,
        Guid targetId,
        string notes,
        IReadOnlyCollection<Guid>? mediaFileIds = null)
    {
        await using var db = scope.NewContext();
        var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(8));
        return await new CareRecordService(db).CreateAsync(Owner, Milo, new CreateCareRecordRequest(
            CareRecordType.Vaccine,
            "Rabies booster",
            today,
            null,
            null,
            notes,
            CareRecordPublicVisibility.Private,
            mediaFileIds,
            FulfillsCareRecordId: targetId));
    }

    private static async Task<CareRecordCompletionStatusResponse> StatusAsync(RelationalScope scope, Guid targetId)
    {
        await using var db = scope.NewContext();
        return await new CareRecordService(db).GetCompletionStatusAsync(Owner, targetId);
    }

    private static async Task<int> ActiveCompletingLogsAsync(RelationalScope scope, Guid targetId)
    {
        await using var db = scope.NewContext();
        // Every active record written as this item's completion, linked or not.
        return await db.CareRecords.CountAsync(record =>
            record.Id != targetId
            && record.PetId == Milo
            && record.Title == "Rabies booster"
            && record.ArchivedAt == null
            && record.DeletedAt == null);
    }

    /// <summary>
    /// Once armed, holds the next save that inserts a care record — after the
    /// service's validation, immediately before SQL Server sees the write —
    /// until released. Unarmed while the test seeds its data. A hold that is
    /// never released fails the test instead of hanging it.
    /// </summary>
    private sealed class PauseBeforeCareInsert : SaveChangesInterceptor
    {
        private int _armed;

        public void Arm() => Interlocked.Exchange(ref _armed, 1);

        public TaskCompletionSource Reached { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

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
