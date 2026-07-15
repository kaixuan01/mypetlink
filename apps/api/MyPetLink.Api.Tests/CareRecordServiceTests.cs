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
            "Grooming date cannot be in the future. Use Next Grooming Date for future care or reminders.",
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
            "Visit date cannot be in the future. Use Next Follow-up Date for future care or reminders.",
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

    private static CreateCareRecordRequest CreateRequest(
        CareRecordType type,
        DateOnly date)
    {
        return new CreateCareRecordRequest(
            Type: type,
            Title: "Routine care",
            Date: date,
            DueDate: null,
            Provider: "Owner recorded",
            Notes: null,
            PublicVisibility: CareRecordPublicVisibility.Private,
            MediaFileIds: null);
    }

    private static DateOnly MalaysiaToday()
    {
        var malaysiaNow = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8));
        return DateOnly.FromDateTime(malaysiaNow.DateTime);
    }

    private sealed class CareRecordHarness : IDisposable
    {
        private CareRecordHarness(MyPetLinkDbContext db)
        {
            Db = db;
            Service = new CareRecordService(db);
        }

        public MyPetLinkDbContext Db { get; }

        public CareRecordService Service { get; }

        public static async Task<CareRecordHarness> CreateAsync(bool withRecord = false)
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
            return new CareRecordHarness(db);
        }

        public void Dispose()
        {
            Db.Dispose();
        }
    }
}
