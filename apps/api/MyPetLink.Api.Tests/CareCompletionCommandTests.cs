using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

/// <summary>
/// The one-step Log as done command's rules: what it writes, how a retried
/// request is recognised, what it refuses, and the Malaysia day. Concurrency
/// is proven against SQL Server in
/// <c>Relational/CareCompletionCommandRelationalTests</c>.
/// </summary>
public sealed class CareCompletionCommandTests
{
    private static readonly Guid OwnerId = Guid.Parse("71111111-1111-1111-1111-111111111111");
    private static readonly Guid OtherOwnerId = Guid.Parse("72222222-2222-2222-2222-222222222222");
    private static readonly Guid MiloId = Guid.Parse("73333333-3333-3333-3333-333333333331");
    private static readonly Guid OyenId = Guid.Parse("73333333-3333-3333-3333-333333333332");
    private static readonly Guid RexId = Guid.Parse("73333333-3333-3333-3333-333333333333");
    private static readonly DateTimeOffset Now = new(2026, 10, 20, 2, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly Today = new(2026, 10, 20);

    private static CompleteCareRecordRequest Done(
        Guid? key = null,
        DateOnly? on = null,
        DateOnly? next = null,
        string? notes = null,
        string? provider = null) =>
        new(key ?? Guid.NewGuid(), on ?? Today, next, provider, notes);

    [Fact]
    public async Task Completing_WritesAPrivateRecordCopyingTheItem_AndTheItemLeavesPendingCare()
    {
        using var harness = await Harness.CreateAsync();
        var target = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddYears(-1), Today.AddDays(-3), "Rabies booster", careName: "Nobivac Rabies", visibility: CareRecordPublicVisibility.PublicBadgeOnly);
        await harness.SaveAsync();

        var result = await harness.Service.CompleteAsync(OwnerId, target.Id, Done(notes: "  Went well  ", provider: "Klinik Haiwan"));

        Assert.Equal("created", result.Outcome);
        var done = result.Completion;
        Assert.Equal(target.Id, done.FulfillsCareRecordId);
        Assert.Equal(CareRecordType.Vaccine, done.Type);
        Assert.Equal("Rabies booster", done.Title);
        Assert.Equal("Nobivac Rabies", done.CareName);
        Assert.Equal(Today, done.Date);
        Assert.Null(done.DueDate);
        Assert.Equal("Went well", done.Notes);
        Assert.Equal("Klinik Haiwan", done.Provider);
        // A public older log is not consent to publishing this one.
        Assert.Equal(CareRecordPublicVisibility.Private, done.PublicVisibility);
        Assert.Empty(done.Documents);

        var (pending, total) = await harness.Service.ListUpcomingAsync(OwnerId, null, 1, 50);
        Assert.Equal(0, total);
        Assert.Empty(pending.Items);
        Assert.Equal("completed", (await harness.Service.GetCompletionStatusAsync(OwnerId, target.Id)).State);
    }

    [Fact]
    public async Task ANextDueDate_BecomesTheNextPendingItem()
    {
        using var harness = await Harness.CreateAsync();
        var target = harness.AddRecord(MiloId, CareRecordType.Deworming, Today.AddMonths(-3), Today.AddDays(-1), "Deworming");
        await harness.SaveAsync();

        var result = await harness.Service.CompleteAsync(OwnerId, target.Id, Done(next: Today.AddMonths(3)));

        var (pending, _) = await harness.Service.ListUpcomingAsync(OwnerId, null, 1, 50);
        var next = Assert.Single(pending.Items);
        Assert.Equal(result.Completion.Id, next.Id);
        Assert.Equal(Today.AddMonths(3), next.DueDate);
    }

    [Fact]
    public async Task TheSameKeyAndRequest_ReplaysTheRecord_EvenAfterItWasEdited()
    {
        using var harness = await Harness.CreateAsync();
        var target = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddYears(-1), Today.AddDays(-3));
        await harness.SaveAsync();
        var key = Guid.NewGuid();

        var first = await harness.Service.CompleteAsync(OwnerId, target.Id, Done(key, notes: "Went well"));
        var second = await harness.Service.CompleteAsync(OwnerId, target.Id, Done(key, notes: "Went well"));
        await harness.Service.UpdateAsync(OwnerId, first.Completion.Id, new UpdateCareRecordRequest(
            null, null, null, null, null, "Edited afterwards", null, null));
        var third = await harness.Service.CompleteAsync(OwnerId, target.Id, Done(key, notes: "Went well"));

        Assert.Equal("replayed", second.Outcome);
        Assert.Equal("replayed", third.Outcome);
        Assert.Equal(first.Completion.Id, second.Completion.Id);
        Assert.Equal(first.Completion.Id, third.Completion.Id);
        // The replay shows the record as it is now.
        Assert.Equal("Edited afterwards", third.Completion.Notes);
        Assert.Equal(1, await harness.CompletingRecordsAsync(target.Id));
    }

    [Theory]
    [InlineData("notes")]
    [InlineData("date")]
    [InlineData("next")]
    [InlineData("target")]
    public async Task TheSameKeyForADifferentRequest_IsRefused(string difference)
    {
        using var harness = await Harness.CreateAsync();
        var target = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddYears(-1), Today.AddDays(-3));
        var other = harness.AddRecord(MiloId, CareRecordType.Grooming, Today.AddMonths(-1), Today.AddDays(-2));
        await harness.SaveAsync();
        var key = Guid.NewGuid();
        await harness.Service.CompleteAsync(OwnerId, target.Id, Done(key, notes: "Went well"));

        var exception = await Assert.ThrowsAsync<ApiException>(() => difference switch
        {
            "notes" => harness.Service.CompleteAsync(OwnerId, target.Id, Done(key, notes: "Other notes")),
            "date" => harness.Service.CompleteAsync(OwnerId, target.Id, Done(key, on: Today.AddDays(-1), notes: "Went well")),
            "next" => harness.Service.CompleteAsync(OwnerId, target.Id, Done(key, next: Today.AddYears(1), notes: "Went well")),
            _ => harness.Service.CompleteAsync(OwnerId, other.Id, Done(key, notes: "Went well"))
        });

        Assert.Equal(StatusCodes.Status409Conflict, exception.StatusCode);
        Assert.Equal("idempotency_key_conflict", exception.Code);
        Assert.Equal(1, await harness.CompletingRecordsAsync(target.Id));
        Assert.Equal(0, await harness.CompletingRecordsAsync(other.Id));
    }

    // ---- F3: the request fingerprint must encode fields unambiguously ----------

    [Theory]
    // The review's exact collision: a newline moved across the field boundary.
    [InlineData("Clinic\nRoom", "Note", "Clinic", "Room\nNote")]
    [InlineData("a", "b\nc", "a\nb", "c")]
    // Different embedded newlines, and different Unicode text.
    [InlineData("Clinic", "Line one\nLine two", "Clinic", "Line one\r\nLine two")]
    [InlineData("Klinik Haiwan", "Dos pertama 💉", "Klinik Haiwan", "Dos kedua 💉")]
    // An empty provider is not the notes' first line.
    [InlineData(null, "Clinic\nNote", "Clinic", "Note")]
    public async Task DifferentDetailsUnderOneKey_AreAConflict_HoweverTheTextIsSplit(
        string? firstProvider, string? firstNotes, string? secondProvider, string? secondNotes)
    {
        using var harness = await Harness.CreateAsync();
        var target = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddYears(-1), Today.AddDays(-3));
        await harness.SaveAsync();
        var key = Guid.NewGuid();
        var first = await harness.Service.CompleteAsync(OwnerId, target.Id, Done(key, provider: firstProvider, notes: firstNotes));

        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CompleteAsync(OwnerId, target.Id, Done(key, provider: secondProvider, notes: secondNotes)));

        Assert.Equal("created", first.Outcome);
        Assert.Equal(StatusCodes.Status409Conflict, exception.StatusCode);
        Assert.Equal("idempotency_key_conflict", exception.Code);
        Assert.Equal(1, await harness.CompletingRecordsAsync(target.Id));
    }

    [Theory]
    // What the service stores is the same, so it is the same request.
    [InlineData(null, null, "", "   ")]
    [InlineData("  Klinik Haiwan  ", "\tWent well\n", "Klinik Haiwan", "Went well")]
    [InlineData("Klinik Haiwan", "Dos pertama 💉\nbaik", "Klinik Haiwan", "Dos pertama 💉\nbaik")]
    public async Task TheSameNormalizedDetailsUnderOneKey_Replay(
        string? firstProvider, string? firstNotes, string? secondProvider, string? secondNotes)
    {
        using var harness = await Harness.CreateAsync();
        var target = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddYears(-1), Today.AddDays(-3));
        await harness.SaveAsync();
        var key = Guid.NewGuid();
        var first = await harness.Service.CompleteAsync(OwnerId, target.Id, Done(key, provider: firstProvider, notes: firstNotes));

        var second = await harness.Service.CompleteAsync(OwnerId, target.Id, Done(key, provider: secondProvider, notes: secondNotes));

        Assert.Equal("replayed", second.Outcome);
        Assert.Equal(first.Completion.Id, second.Completion.Id);
        Assert.Equal(1, await harness.CompletingRecordsAsync(target.Id));
    }

    [Fact]
    public async Task AKeyAlreadyUsedByAnotherOwner_IsRefusedWithoutRevealingAnything()
    {
        using var harness = await Harness.CreateAsync();
        var theirs = harness.AddRecord(RexId, CareRecordType.Vaccine, Today.AddYears(-1), Today.AddDays(-3));
        var mine = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddYears(-1), Today.AddDays(-3));
        await harness.SaveAsync();
        var key = Guid.NewGuid();
        await harness.Service.CompleteAsync(OtherOwnerId, theirs.Id, Done(key));

        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CompleteAsync(OwnerId, mine.Id, Done(key)));

        Assert.Equal("idempotency_key_conflict", exception.Code);
        Assert.Null(exception.Details);
        Assert.Equal(0, await harness.CompletingRecordsAsync(mine.Id));
    }

    [Fact]
    public async Task ARetryAfterTheCompletionWasDeleted_IsRefused_AndNeverRecreated()
    {
        using var harness = await Harness.CreateAsync();
        var target = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddYears(-1), Today.AddDays(-3));
        await harness.SaveAsync();
        var key = Guid.NewGuid();
        var first = await harness.Service.CompleteAsync(OwnerId, target.Id, Done(key));
        await harness.Service.ArchiveAsync(OwnerId, first.Completion.Id);

        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CompleteAsync(OwnerId, target.Id, Done(key)));

        Assert.Equal(StatusCodes.Status409Conflict, exception.StatusCode);
        Assert.Equal("completion_removed", exception.Code);
        Assert.Equal(0, await harness.CompletingRecordsAsync(target.Id));
        Assert.Equal("pending", (await harness.Service.GetCompletionStatusAsync(OwnerId, target.Id)).State);
    }

    [Fact]
    public async Task AnItemAlreadyCompletedByAnotherRequest_IsRefused()
    {
        using var harness = await Harness.CreateAsync();
        var target = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddYears(-1), Today.AddDays(-3));
        await harness.SaveAsync();
        await harness.Service.CompleteAsync(OwnerId, target.Id, Done(notes: "Phone"));

        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CompleteAsync(OwnerId, target.Id, Done(notes: "Laptop")));

        Assert.Equal(StatusCodes.Status409Conflict, exception.StatusCode);
        Assert.Equal("care_item_completed", exception.Code);
        Assert.Equal(1, await harness.CompletingRecordsAsync(target.Id));
    }

    [Fact]
    public async Task ACompletionLoggedThroughTheFullForm_AlsoCountsAsCompleted()
    {
        using var harness = await Harness.CreateAsync();
        var target = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddYears(-1), Today.AddDays(-3), "Rabies booster");
        await harness.SaveAsync();
        await harness.Service.CreateAsync(OwnerId, MiloId, new CreateCareRecordRequest(
            CareRecordType.Vaccine, "Rabies booster", Today, null, null, "Full form", CareRecordPublicVisibility.Private, null,
            FulfillsCareRecordId: target.Id));

        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CompleteAsync(OwnerId, target.Id, Done()));

        Assert.Equal("care_item_completed", exception.Code);
    }

    [Theory]
    [InlineData("archived", "care_item_archived")]
    [InlineData("pet-archived", "care_item_pet_archived")]
    [InlineData("no-due-date", "care_item_no_due_date")]
    public async Task AChangedItem_IsRefusedWithItsState(string change, string code)
    {
        using var harness = await Harness.CreateAsync();
        var target = harness.AddRecord(
            change == "pet-archived" ? OyenId : MiloId,
            CareRecordType.Vaccine,
            Today.AddYears(-1),
            change == "no-due-date" ? null : Today.AddDays(-3));
        await harness.SaveAsync();
        if (change == "archived")
        {
            await harness.Service.ArchiveAsync(OwnerId, target.Id);
        }
        else if (change == "pet-archived")
        {
            var oyen = await harness.Db.Pets.SingleAsync(pet => pet.Id == OyenId);
            oyen.LifecycleStatus = PetLifecycleStatus.Archived;
            oyen.ArchivedAt = Now;
            await harness.Db.SaveChangesAsync();
        }

        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CompleteAsync(OwnerId, target.Id, Done()));

        Assert.Equal(StatusCodes.Status409Conflict, exception.StatusCode);
        Assert.Equal(code, exception.Code);
        Assert.Equal(0, await harness.CompletingRecordsAsync(target.Id));
    }

    [Fact]
    public async Task AnotherOwnersOrADeletedItem_IsNotFound()
    {
        using var harness = await Harness.CreateAsync();
        var theirs = harness.AddRecord(RexId, CareRecordType.Vaccine, Today.AddYears(-1), Today.AddDays(-3));
        var deleted = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddYears(-1), Today.AddDays(-3));
        deleted.DeletedAt = Now;
        await harness.SaveAsync();

        var foreign = await Assert.ThrowsAsync<ApiException>(() => harness.Service.CompleteAsync(OwnerId, theirs.Id, Done()));
        var gone = await Assert.ThrowsAsync<ApiException>(() => harness.Service.CompleteAsync(OwnerId, deleted.Id, Done()));
        var anonymous = await Assert.ThrowsAsync<ApiException>(() => harness.Service.CompleteAsync(null, theirs.Id, Done()));

        Assert.Equal(StatusCodes.Status404NotFound, foreign.StatusCode);
        Assert.Equal(StatusCodes.Status404NotFound, gone.StatusCode);
        Assert.Equal(StatusCodes.Status401Unauthorized, anonymous.StatusCode);
        Assert.Equal(0, await harness.CompletingRecordsAsync(theirs.Id));
    }

    [Theory]
    // 15:59:59 UTC is 23:59:59 in Malaysia on the 20th; 16:00 UTC is the 21st.
    [InlineData("2026-10-20T15:59:59Z", "2026-10-20", true)]
    [InlineData("2026-10-20T15:59:59Z", "2026-10-21", false)]
    [InlineData("2026-10-20T16:00:00Z", "2026-10-21", true)]
    public async Task TheDoneDay_FollowsTheMalaysiaCalendar(string utcNow, string completedOn, bool accepted)
    {
        using var harness = await Harness.CreateAsync(DateTimeOffset.Parse(utcNow, System.Globalization.CultureInfo.InvariantCulture));
        var target = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddYears(-1), Today.AddDays(-3));
        await harness.SaveAsync();

        var attempt = () => harness.Service.CompleteAsync(OwnerId, target.Id, Done(on: DateOnly.Parse(completedOn, System.Globalization.CultureInfo.InvariantCulture)));

        if (accepted)
        {
            Assert.Equal("created", (await attempt()).Outcome);
        }
        else
        {
            var exception = await Assert.ThrowsAsync<ApiException>(attempt);
            Assert.Equal(StatusCodes.Status400BadRequest, exception.StatusCode);
            Assert.True(exception.Details!.ContainsKey("completedOn"));
        }
    }

    [Fact]
    public async Task InvalidFields_AreNamed()
    {
        using var harness = await Harness.CreateAsync();
        var target = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddYears(-1), Today.AddDays(-3));
        await harness.SaveAsync();

        var noKey = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CompleteAsync(OwnerId, target.Id, new CompleteCareRecordRequest(null, Today)));
        var noDay = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CompleteAsync(OwnerId, target.Id, new CompleteCareRecordRequest(Guid.NewGuid(), null)));
        var nextBefore = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CompleteAsync(OwnerId, target.Id, Done(on: Today, next: Today.AddDays(-1))));

        Assert.True(noKey.Details!.ContainsKey("idempotencyKey"));
        Assert.True(noDay.Details!.ContainsKey("completedOn"));
        Assert.True(nextBefore.Details!.ContainsKey("nextDueDate"));
        Assert.Equal(0, await harness.CompletingRecordsAsync(target.Id));
    }

    private sealed class Harness : IDisposable
    {
        private readonly Dictionary<CareRecord, DateTimeOffset> _createdAt = new(ReferenceEqualityComparer.Instance);
        private DateTimeOffset _nextCreatedAt = Now.AddDays(-400);

        private Harness(MyPetLinkDbContext db, TimeProvider timeProvider)
        {
            Db = db;
            Service = new CareRecordService(db, timeProvider);
        }

        public MyPetLinkDbContext Db { get; }

        public CareRecordService Service { get; }

        public static async Task<Harness> CreateAsync(DateTimeOffset? utcNow = null)
        {
            var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
                .Options;
            var db = new MyPetLinkDbContext(options);
            db.Users.Add(NewUser(OwnerId, "owner@example.com"));
            db.Users.Add(NewUser(OtherOwnerId, "other@example.com"));
            db.Pets.Add(NewPet(MiloId, OwnerId, "Milo"));
            db.Pets.Add(NewPet(OyenId, OwnerId, "Oyen"));
            db.Pets.Add(NewPet(RexId, OtherOwnerId, "Rex"));
            await db.SaveChangesAsync();
            return new Harness(db, new FixedTimeProvider(utcNow ?? Now));
        }

        public CareRecord AddRecord(
            Guid petId,
            CareRecordType type,
            DateOnly recordDate,
            DateOnly? dueDate,
            string? title = null,
            string? careName = null,
            CareRecordPublicVisibility visibility = CareRecordPublicVisibility.Private)
        {
            _nextCreatedAt = _nextCreatedAt.AddSeconds(1);
            var record = new CareRecord
            {
                PetId = petId,
                Type = type,
                Title = title ?? $"{type} record",
                CareName = careName,
                RecordDate = recordDate,
                DueDate = dueDate,
                Notes = "Earlier visit",
                PublicVisibility = visibility
            };
            Db.CareRecords.Add(record);
            _createdAt[record] = _nextCreatedAt;
            return record;
        }

        public async Task SaveAsync()
        {
            await Db.SaveChangesAsync();
            foreach (var (record, createdAt) in _createdAt)
            {
                record.CreatedAt = createdAt;
            }

            _createdAt.Clear();
            await Db.SaveChangesAsync();
        }

        /// <summary>Active records written as this item's completion.</summary>
        public Task<int> CompletingRecordsAsync(Guid targetId) =>
            Db.CareRecords.AsNoTracking().CountAsync(record =>
                record.FulfillsCareRecordId == targetId
                && record.ArchivedAt == null
                && record.DeletedAt == null);

        public void Dispose() => Db.Dispose();

        private static User NewUser(Guid id, string email) => new()
        {
            Id = id,
            Email = email,
            NormalizedEmail = email.ToUpperInvariant(),
            DisplayName = "Owner",
            Status = UserStatus.Active
        };

        private static Pet NewPet(Guid id, Guid ownerId, string name) => new()
        {
            Id = id,
            OwnerUserId = ownerId,
            Slug = $"{name.ToLowerInvariant()}-{id.ToString("N")[..4]}",
            Name = name,
            Species = "Dog"
        };
    }

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }
}
