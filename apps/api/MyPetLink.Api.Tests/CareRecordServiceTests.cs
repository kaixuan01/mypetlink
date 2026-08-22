using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public sealed class CareRecordServiceTests
{
    private static readonly Guid OwnerId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid PetId = Guid.Parse("22222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task CreateAsync_Today_IsAcceptedAndPersisted()
    {
        using var harness = await CareRecordHarness.CreateAsync();
        var today = MalaysiaToday();

        var response = await harness.Service.CreateAsync(
            OwnerId,
            PetId,
            CreateRequest(CareRecordType.Grooming, today));

        Assert.Equal(today, response.Date);
        Assert.Equal(today, (await harness.Db.CareRecords.SingleAsync()).RecordDate);
    }

    [Theory]
    [InlineData(CareRecordPublicVisibility.Private, CareRecordPublicVisibility.Private)]
    [InlineData(CareRecordPublicVisibility.PublicBadgeOnly, CareRecordPublicVisibility.PublicBadgeOnly)]
    [InlineData(CareRecordPublicVisibility.PublicDetails, CareRecordPublicVisibility.PublicBadgeOnly)]
    [InlineData((CareRecordPublicVisibility)999, CareRecordPublicVisibility.Private)]
    public async Task CreateAsync_NormalizesVisibilityBeforePersistence(
        CareRecordPublicVisibility requested,
        CareRecordPublicVisibility expected)
    {
        using var harness = await CareRecordHarness.CreateAsync();

        var response = await harness.Service.CreateAsync(
            OwnerId,
            PetId,
            CreateRequest(CareRecordType.Grooming, MalaysiaToday(), requested));

        Assert.Equal(expected, response.PublicVisibility);
        Assert.Equal(expected, (await harness.Db.CareRecords.SingleAsync()).PublicVisibility);
    }

    [Theory]
    [InlineData(CareRecordPublicVisibility.Private, CareRecordPublicVisibility.Private)]
    [InlineData(CareRecordPublicVisibility.PublicBadgeOnly, CareRecordPublicVisibility.PublicBadgeOnly)]
    [InlineData(CareRecordPublicVisibility.PublicDetails, CareRecordPublicVisibility.PublicBadgeOnly)]
    [InlineData((CareRecordPublicVisibility)999, CareRecordPublicVisibility.Private)]
    public async Task UpdateAsync_NormalizesVisibilityBeforePersistence(
        CareRecordPublicVisibility requested,
        CareRecordPublicVisibility expected)
    {
        using var harness = await CareRecordHarness.CreateAsync(withRecord: true);
        var record = await harness.Db.CareRecords.SingleAsync();

        var response = await harness.Service.UpdateAsync(
            OwnerId,
            record.Id,
            new UpdateCareRecordRequest(
                Type: null,
                Title: null,
                Date: null,
                DueDate: null,
                Provider: null,
                Notes: null,
                PublicVisibility: requested,
                MediaFileIds: null));

        Assert.Equal(expected, response.PublicVisibility);
        Assert.Equal(expected, record.PublicVisibility);
    }

    [Fact]
    public async Task OwnerReads_NormalizeLegacyPublicDetailsWithoutChangingOtherFields()
    {
        using var harness = await CareRecordHarness.CreateAsync();
        var record = new CareRecord
        {
            PetId = PetId,
            Type = CareRecordType.VetVisit,
            Title = "Legacy public details",
            RecordDate = MalaysiaToday().AddDays(-14),
            Provider = "Private clinic",
            Notes = "Owner-only clinical note",
            PublicVisibility = CareRecordPublicVisibility.PublicDetails
        };
        harness.Db.CareRecords.Add(record);
        await harness.Db.SaveChangesAsync();

        var single = await harness.Service.GetAsync(OwnerId, record.Id);
        var listed = await harness.Service.ListForPetAsync(
            OwnerId,
            PetId,
            page: 1,
            pageSize: 20,
            type: null,
            fromDate: null,
            toDate: null,
            includeArchived: false);

        Assert.Equal(CareRecordPublicVisibility.PublicBadgeOnly, single.PublicVisibility);
        Assert.Equal(CareRecordPublicVisibility.PublicBadgeOnly, Assert.Single(listed.Items).PublicVisibility);
        Assert.Equal("Legacy public details", single.Title);
        Assert.Equal("Private clinic", single.Provider);
        Assert.Equal("Owner-only clinical note", single.Notes);
    }

    [Fact]
    public async Task CreateAsync_FutureGroomingDate_IsRejected()
    {
        using var harness = await CareRecordHarness.CreateAsync();

        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CreateAsync(
                OwnerId,
                PetId,
                CreateRequest(CareRecordType.Grooming, MalaysiaToday().AddDays(1))));

        Assert.Equal(StatusCodes.Status400BadRequest, exception.StatusCode);
        Assert.Equal(
            "Grooming date cannot be in the future. Use Next Grooming Date to track future care.",
            Assert.Single(exception.Details!["date"]));
        Assert.Empty(harness.Db.CareRecords);
    }

    [Fact]
    public async Task UpdateAsync_FutureVisitDate_IsRejectedWithoutChangingTheEntity()
    {
        using var harness = await CareRecordHarness.CreateAsync(withRecord: true);
        var record = await harness.Db.CareRecords.SingleAsync();
        var originalDate = record.RecordDate;

        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.UpdateAsync(
                OwnerId,
                record.Id,
                new UpdateCareRecordRequest(
                    Type: CareRecordType.VetVisit,
                    Title: null,
                    Date: MalaysiaToday().AddDays(1),
                    DueDate: null,
                    Provider: null,
                    Notes: null,
                    PublicVisibility: null,
                    MediaFileIds: null)));

        Assert.Equal(StatusCodes.Status400BadRequest, exception.StatusCode);
        Assert.Equal(
            "Visit date cannot be in the future. Use Next Follow-up Date to track future care.",
            Assert.Single(exception.Details!["date"]));
        Assert.Equal(originalDate, record.RecordDate);
    }

    [Fact]
    public async Task UpdateAsync_ExplicitClear_RemovesTheOptionalNextDate()
    {
        using var harness = await CareRecordHarness.CreateAsync(withRecord: true);
        var record = await harness.Db.CareRecords.SingleAsync();
        Assert.NotNull(record.DueDate);

        var response = await harness.Service.UpdateAsync(
            OwnerId,
            record.Id,
            new UpdateCareRecordRequest(
                Type: null,
                Title: null,
                Date: null,
                DueDate: null,
                Provider: null,
                Notes: null,
                PublicVisibility: null,
                MediaFileIds: null,
                ClearDueDate: true));

        Assert.Null(response.DueDate);
        Assert.Null(record.DueDate);
    }

    [Fact]
    public async Task LegacyAllergyRecord_RemainsReadableAndEditableWithoutTypeConversion()
    {
        using var harness = await CareRecordHarness.CreateAsync();
        var record = new CareRecord
        {
            PetId = PetId,
            Type = CareRecordType.Allergy,
            Title = "Legacy allergy note",
            RecordDate = MalaysiaToday().AddDays(-30),
            PublicVisibility = CareRecordPublicVisibility.Private
        };
        harness.Db.CareRecords.Add(record);
        await harness.Db.SaveChangesAsync();

        var listed = await harness.Service.ListForPetAsync(
            OwnerId,
            PetId,
            page: 1,
            pageSize: 20,
            type: null,
            fromDate: null,
            toDate: null,
            includeArchived: false);
        var response = await harness.Service.UpdateAsync(
            OwnerId,
            record.Id,
            new UpdateCareRecordRequest(
                Type: null,
                Title: "Updated legacy allergy note",
                Date: null,
                DueDate: null,
                Provider: null,
                Notes: null,
                PublicVisibility: null,
                MediaFileIds: null));

        Assert.Equal(CareRecordType.Allergy, Assert.Single(listed.Items).Type);
        Assert.Equal(CareRecordType.Allergy, response.Type);
        Assert.Equal("Updated legacy allergy note", response.Title);
    }

    [Fact]
    public async Task ListForPetAsync_DerivesStatusesAtEveryDueDateBoundary()
    {
        var utcNow = DateTimeOffset.Parse("2026-08-12T17:00:00Z");
        using var harness = await CareRecordHarness.CreateAsync(utcNow: utcNow);
        var today = new DateOnly(2026, 8, 13);

        AddRecord(harness.Db, "Long overdue", today.AddYears(-2), today.AddYears(-2));
        AddRecord(harness.Db, "Yesterday", today.AddDays(-30), today.AddDays(-1));
        AddRecord(harness.Db, "Today", today.AddDays(-30), today);
        AddRecord(harness.Db, "Tomorrow", today.AddDays(-30), today.AddDays(1));
        AddRecord(harness.Db, "Boundary", today.AddDays(-30), today.AddDays(30));
        AddRecord(harness.Db, "Beyond boundary", today.AddDays(-30), today.AddDays(31));
        AddRecord(harness.Db, "Completed history", today.AddDays(-30), null);
        await harness.Db.SaveChangesAsync();

        var result = await harness.Service.ListForPetAsync(
            OwnerId,
            PetId,
            page: 1,
            pageSize: 20,
            type: null,
            fromDate: null,
            toDate: null,
            includeArchived: false);
        var statuses = result.Items.ToDictionary(item => item.Title, item => item.DerivedStatus);

        Assert.Equal("overdue", statuses["Long overdue"]);
        Assert.Equal("overdue", statuses["Yesterday"]);
        Assert.Equal("due-soon", statuses["Today"]);
        Assert.Equal("due-soon", statuses["Tomorrow"]);
        Assert.Equal("due-soon", statuses["Boundary"]);
        Assert.Equal("upcoming", statuses["Beyond boundary"]);
        Assert.Equal("complete", statuses["Completed history"]);
    }

    [Fact]
    public async Task GetAsync_UsesMalaysiaCalendarDayAtUtcBoundary()
    {
        var dueDate = new DateOnly(2026, 8, 12);
        using var beforeMidnight = await CareRecordHarness.CreateAsync(
            utcNow: DateTimeOffset.Parse("2026-08-12T15:59:00Z"));
        AddRecord(beforeMidnight.Db, "Boundary care", dueDate.AddDays(-30), dueDate);
        await beforeMidnight.Db.SaveChangesAsync();
        var beforeRecord = await beforeMidnight.Db.CareRecords.SingleAsync();

        var before = await beforeMidnight.Service.GetAsync(OwnerId, beforeRecord.Id);

        using var afterMidnight = await CareRecordHarness.CreateAsync(
            utcNow: DateTimeOffset.Parse("2026-08-12T16:01:00Z"));
        AddRecord(afterMidnight.Db, "Boundary care", dueDate.AddDays(-30), dueDate);
        await afterMidnight.Db.SaveChangesAsync();
        var afterRecord = await afterMidnight.Db.CareRecords.SingleAsync();
        var after = await afterMidnight.Service.GetAsync(OwnerId, afterRecord.Id);

        Assert.Equal("due-soon", before.DerivedStatus);
        Assert.Equal("overdue", after.DerivedStatus);
    }

    private static CreateCareRecordRequest CreateRequest(
        CareRecordType type,
        DateOnly date,
        CareRecordPublicVisibility visibility = CareRecordPublicVisibility.Private)
    {
        return new CreateCareRecordRequest(
            Type: type,
            Title: "Routine care",
            Date: date,
            DueDate: null,
            Provider: "Owner recorded",
            Notes: null,
            PublicVisibility: visibility,
            MediaFileIds: null);
    }

    private static DateOnly MalaysiaToday()
    {
        var malaysiaNow = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8));
        return DateOnly.FromDateTime(malaysiaNow.DateTime);
    }

    private static void AddRecord(
        MyPetLinkDbContext db,
        string title,
        DateOnly recordDate,
        DateOnly? dueDate)
    {
        db.CareRecords.Add(new CareRecord
        {
            PetId = PetId,
            Type = CareRecordType.Other,
            Title = title,
            RecordDate = recordDate,
            DueDate = dueDate,
            PublicVisibility = CareRecordPublicVisibility.Private
        });
    }

    private sealed class CareRecordHarness : IDisposable
    {
        private CareRecordHarness(MyPetLinkDbContext db, TimeProvider? timeProvider = null)
        {
            Db = db;
            Service = new CareRecordService(db, timeProvider);
        }

        public MyPetLinkDbContext Db { get; }

        public CareRecordService Service { get; }

        public static async Task<CareRecordHarness> CreateAsync(
            bool withRecord = false,
            DateTimeOffset? utcNow = null)
        {
            var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
                .Options;
            var db = new MyPetLinkDbContext(options);
            var owner = new User
            {
                Id = OwnerId,
                Email = "owner@example.com",
                NormalizedEmail = "OWNER@EXAMPLE.COM",
                DisplayName = "Owner",
                Status = UserStatus.Active
            };
            var pet = new Pet
            {
                Id = PetId,
                OwnerUserId = OwnerId,
                OwnerUser = owner,
                Slug = "milo-p123",
                Name = "Milo",
                Species = "Dog"
            };

            db.Users.Add(owner);
            db.Pets.Add(pet);

            if (withRecord)
            {
                db.CareRecords.Add(new CareRecord
                {
                    Pet = pet,
                    PetId = PetId,
                    Type = CareRecordType.Vaccine,
                    Title = "Annual vaccination",
                    RecordDate = MalaysiaToday().AddDays(-7),
                    DueDate = MalaysiaToday().AddMonths(12),
                    PublicVisibility = CareRecordPublicVisibility.Private
                });
            }

            await db.SaveChangesAsync();
            return new CareRecordHarness(
                db,
                utcNow.HasValue ? new CareRecordTimeProvider(utcNow.Value) : null);
        }

        public void Dispose()
        {
            Db.Dispose();
        }
    }

    private sealed class CareRecordTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }
}
