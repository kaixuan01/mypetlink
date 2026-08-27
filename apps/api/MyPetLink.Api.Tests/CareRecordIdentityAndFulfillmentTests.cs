using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public sealed class CareRecordIdentityAndFulfillmentTests
{
    private static readonly Guid OwnerId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid OtherOwnerId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid PetId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid OtherPetId = Guid.Parse("33333333-3333-3333-3333-333333333333");
    private static readonly Guid ForeignPetId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    [Fact]
    public async Task CareName_IsTrimmedRoundTripsAndCanBeExplicitlyCleared()
    {
        using var harness = await Harness.CreateAsync();

        var created = await harness.Service.CreateAsync(
            OwnerId,
            PetId,
            CreateRequest(careName: "  Annual booster  "));
        var changed = await harness.Service.UpdateAsync(
            OwnerId,
            created.Id,
            UpdateRequest(careName: "  Rabies booster  "));
        var preserved = await harness.Service.UpdateAsync(
            OwnerId,
            created.Id,
            UpdateRequest(title: "Renamed title"));
        var cleared = await harness.Service.UpdateAsync(
            OwnerId,
            created.Id,
            UpdateRequest(clearCareName: true));

        Assert.Equal("Annual booster", created.CareName);
        Assert.Equal("Rabies booster", changed.CareName);
        Assert.Equal("Rabies booster", preserved.CareName);
        Assert.Null(cleared.CareName);
        Assert.Null((await harness.Db.CareRecords.SingleAsync()).CareName);
    }

    [Fact]
    public async Task CareName_BlankBecomesNullAndOverLimitIsRejected()
    {
        using var harness = await Harness.CreateAsync();

        var blank = await harness.Service.CreateAsync(
            OwnerId,
            PetId,
            CreateRequest(careName: "   "));
        var maximum = await harness.Service.CreateAsync(
            OwnerId,
            PetId,
            CreateRequest(careName: new string('x', 120)));
        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.UpdateAsync(
                OwnerId,
                blank.Id,
                UpdateRequest(careName: new string('x', 121))));

        Assert.Null(blank.CareName);
        Assert.Equal(120, maximum.CareName!.Length);
        AssertValidation(exception, "careName");
    }

    [Fact]
    public async Task CreateAsync_ValidEarlyFulfillment_RoundTripsWithoutChangingStatusRules()
    {
        using var harness = await Harness.CreateAsync();
        var target = await harness.AddRecordAsync(
            PetId,
            CareRecordType.Vaccine,
            dueDate: harness.Today.AddDays(20));
        harness.Clock.Advance(TimeSpan.FromHours(1));

        var response = await harness.Service.CreateAsync(
            OwnerId,
            PetId,
            CreateRequest(
                type: CareRecordType.Vaccine,
                date: harness.Today,
                fulfillsCareRecordId: target.Id));

        Assert.Equal(target.Id, response.FulfillsCareRecordId);
        Assert.Equal("complete", response.DerivedStatus);
        Assert.Equal(target.Id, (await harness.Db.CareRecords.SingleAsync(r => r.Id == response.Id)).FulfillsCareRecordId);
    }

    [Fact]
    public async Task CreateAsync_RejectsCrossPetAndCrossOwnerTargets()
    {
        using var harness = await Harness.CreateAsync();
        var otherPetTarget = await harness.AddRecordAsync(
            OtherPetId,
            CareRecordType.Vaccine,
            harness.Today.AddDays(30));
        var foreignTarget = await harness.AddRecordAsync(
            ForeignPetId,
            CareRecordType.Vaccine,
            harness.Today.AddDays(30));
        harness.Clock.Advance(TimeSpan.FromHours(1));

        var crossPet = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CreateAsync(
                OwnerId,
                PetId,
                CreateRequest(fulfillsCareRecordId: otherPetTarget.Id)));
        var crossOwner = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CreateAsync(
                OwnerId,
                PetId,
                CreateRequest(fulfillsCareRecordId: foreignTarget.Id)));

        AssertValidation(crossPet, "fulfillsCareRecordId");
        AssertValidation(crossOwner, "fulfillsCareRecordId");
    }

    [Fact]
    public async Task CreateAsync_RejectsTypeMismatchMissingDueDateAndInactiveTargets()
    {
        using var harness = await Harness.CreateAsync();
        var wrongType = await harness.AddRecordAsync(
            PetId,
            CareRecordType.Grooming,
            harness.Today.AddDays(30));
        var noDueDate = await harness.AddRecordAsync(PetId, CareRecordType.Vaccine, null);
        var archived = await harness.AddRecordAsync(
            PetId,
            CareRecordType.Vaccine,
            harness.Today.AddDays(30),
            archived: true);
        var deleted = await harness.AddRecordAsync(
            PetId,
            CareRecordType.Vaccine,
            harness.Today.AddDays(30),
            deleted: true);
        harness.Clock.Advance(TimeSpan.FromHours(1));

        foreach (var targetId in new[] { wrongType.Id, noDueDate.Id, archived.Id, deleted.Id })
        {
            var exception = await Assert.ThrowsAsync<ApiException>(() =>
                harness.Service.CreateAsync(
                    OwnerId,
                    PetId,
                    CreateRequest(fulfillsCareRecordId: targetId)));
            AssertValidation(exception, "fulfillsCareRecordId");
        }
    }

    [Fact]
    public async Task UpdateAsync_RejectsSelfReferenceAndNewerTargetWithoutMutation()
    {
        using var harness = await Harness.CreateAsync();
        var older = await harness.AddRecordAsync(
            PetId,
            CareRecordType.Vaccine,
            harness.Today.AddDays(30));
        harness.Clock.Advance(TimeSpan.FromHours(1));
        var newer = await harness.AddRecordAsync(
            PetId,
            CareRecordType.Vaccine,
            harness.Today.AddDays(60));

        var self = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.UpdateAsync(
                OwnerId,
                older.Id,
                UpdateRequest(fulfillsCareRecordId: older.Id)));
        var future = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.UpdateAsync(
                OwnerId,
                older.Id,
                UpdateRequest(fulfillsCareRecordId: newer.Id)));

        AssertValidation(self, "fulfillsCareRecordId");
        AssertValidation(future, "fulfillsCareRecordId");
        Assert.Null(older.FulfillsCareRecordId);
    }

    [Fact]
    public async Task UpdateAsync_RejectsCycleAndDuplicateFulfillmentClaim()
    {
        using var harness = await Harness.CreateAsync();
        var oldest = await harness.AddRecordAsync(
            PetId,
            CareRecordType.Vaccine,
            harness.Today.AddDays(30));
        harness.Clock.Advance(TimeSpan.FromHours(1));
        var firstFulfiller = await harness.AddRecordAsync(
            PetId,
            CareRecordType.Vaccine,
            harness.Today.AddDays(60),
            fulfillsCareRecordId: oldest.Id);
        harness.Clock.Advance(TimeSpan.FromHours(1));
        var secondFulfiller = await harness.AddRecordAsync(
            PetId,
            CareRecordType.Vaccine,
            harness.Today.AddDays(90));

        var duplicate = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.UpdateAsync(
                OwnerId,
                secondFulfiller.Id,
                UpdateRequest(fulfillsCareRecordId: oldest.Id)));
        var cycle = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.UpdateAsync(
                OwnerId,
                oldest.Id,
                UpdateRequest(fulfillsCareRecordId: firstFulfiller.Id)));

        AssertValidation(duplicate, "fulfillsCareRecordId");
        AssertValidation(cycle, "fulfillsCareRecordId");
        Assert.Contains("cycle", cycle.Details!["fulfillsCareRecordId"][0]);
    }

    [Fact]
    public async Task UpdateAsync_ExplicitlyClearsFulfillmentAndPreservesItWhenOmitted()
    {
        using var harness = await Harness.CreateAsync();
        var target = await harness.AddRecordAsync(
            PetId,
            CareRecordType.Vaccine,
            harness.Today.AddDays(30));
        harness.Clock.Advance(TimeSpan.FromHours(1));
        var fulfiller = await harness.AddRecordAsync(
            PetId,
            CareRecordType.Vaccine,
            harness.Today.AddDays(60),
            fulfillsCareRecordId: target.Id);

        var preserved = await harness.Service.UpdateAsync(
            OwnerId,
            fulfiller.Id,
            UpdateRequest(title: "Updated"));
        var cleared = await harness.Service.UpdateAsync(
            OwnerId,
            fulfiller.Id,
            UpdateRequest(clearFulfillsCareRecordId: true));

        Assert.Equal(target.Id, preserved.FulfillsCareRecordId);
        Assert.Null(cleared.FulfillsCareRecordId);
    }

    [Fact]
    public async Task UpdateAsync_CannotInvalidateAnActiveIncomingFulfillment()
    {
        using var harness = await Harness.CreateAsync();
        var target = await harness.AddRecordAsync(
            PetId,
            CareRecordType.Vaccine,
            harness.Today.AddDays(30));
        harness.Clock.Advance(TimeSpan.FromHours(1));
        await harness.AddRecordAsync(
            PetId,
            CareRecordType.Vaccine,
            harness.Today.AddDays(60),
            fulfillsCareRecordId: target.Id);

        var clearDueDate = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.UpdateAsync(
                OwnerId,
                target.Id,
                UpdateRequest(clearDueDate: true)));
        var changeType = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.UpdateAsync(
                OwnerId,
                target.Id,
                UpdateRequest(type: CareRecordType.Medication)));

        AssertValidation(clearDueDate, "dueDate");
        AssertValidation(changeType, "type");
        Assert.Equal(CareRecordType.Vaccine, target.Type);
        Assert.NotNull(target.DueDate);
    }

    [Fact]
    public async Task ArchiveAsync_FulfillerReopensTargetAndReleasesUniqueClaim()
    {
        using var harness = await Harness.CreateAsync();
        var target = await harness.AddRecordAsync(
            PetId,
            CareRecordType.Vaccine,
            harness.Today.AddDays(30));
        harness.Clock.Advance(TimeSpan.FromHours(1));
        var fulfiller = await harness.AddRecordAsync(
            PetId,
            CareRecordType.Vaccine,
            harness.Today.AddDays(60),
            fulfillsCareRecordId: target.Id);

        await harness.Service.ArchiveAsync(OwnerId, fulfiller.Id);
        harness.Clock.Advance(TimeSpan.FromHours(1));
        var replacement = await harness.Service.CreateAsync(
            OwnerId,
            PetId,
            CreateRequest(fulfillsCareRecordId: target.Id));

        Assert.NotNull(fulfiller.ArchivedAt);
        Assert.Null(fulfiller.FulfillsCareRecordId);
        Assert.Equal(target.Id, replacement.FulfillsCareRecordId);
    }

    [Fact]
    public async Task ArchiveAsync_TargetClearsTheActiveIncomingRelationship()
    {
        using var harness = await Harness.CreateAsync();
        var target = await harness.AddRecordAsync(
            PetId,
            CareRecordType.Vaccine,
            harness.Today.AddDays(30));
        harness.Clock.Advance(TimeSpan.FromHours(1));
        var fulfiller = await harness.AddRecordAsync(
            PetId,
            CareRecordType.Vaccine,
            harness.Today.AddDays(60),
            fulfillsCareRecordId: target.Id);

        await harness.Service.ArchiveAsync(OwnerId, target.Id);

        Assert.NotNull(target.ArchivedAt);
        Assert.Null(fulfiller.FulfillsCareRecordId);
    }

    [Fact]
    public void PublicCareContract_RemainsTypeAndRecordDateOnly()
    {
        var properties = typeof(PublicCareSummaryResponse)
            .GetProperties()
            .Select(property => property.Name)
            .OrderBy(name => name)
            .ToArray();

        Assert.Equal(new[] { "RecordDate", "Type" }, properties);
    }

    [Fact]
    public async Task EfModel_HasFilteredUniqueIndexAndNoActionSelfForeignKey()
    {
        using var harness = await Harness.CreateAsync();
        var entity = harness.Db.Model.FindEntityType(typeof(CareRecord))!;
        var index = Assert.Single(
            entity.GetIndexes(),
            item => item.Properties.Count == 1
                && item.Properties[0].Name == nameof(CareRecord.FulfillsCareRecordId));
        var foreignKey = Assert.Single(
            entity.GetForeignKeys(),
            item => item.Properties.Count == 1
                && item.Properties[0].Name == nameof(CareRecord.FulfillsCareRecordId));

        Assert.True(index.IsUnique);
        Assert.Equal("[FulfillsCareRecordId] IS NOT NULL", index.GetFilter());
        Assert.Equal(DeleteBehavior.NoAction, foreignKey.DeleteBehavior);
    }

    private static CreateCareRecordRequest CreateRequest(
        CareRecordType type = CareRecordType.Vaccine,
        DateOnly? date = null,
        string? careName = null,
        Guid? fulfillsCareRecordId = null)
    {
        return new CreateCareRecordRequest(
            Type: type,
            Title: "Routine care",
            Date: date ?? new DateOnly(2026, 8, 20),
            DueDate: null,
            Provider: null,
            Notes: null,
            PublicVisibility: CareRecordPublicVisibility.Private,
            MediaFileIds: null,
            CareName: careName,
            FulfillsCareRecordId: fulfillsCareRecordId);
    }

    private static UpdateCareRecordRequest UpdateRequest(
        CareRecordType? type = null,
        string? title = null,
        string? careName = null,
        Guid? fulfillsCareRecordId = null,
        DateOnly? dueDate = null,
        bool? clearDueDate = null,
        bool? clearCareName = null,
        bool? clearFulfillsCareRecordId = null)
    {
        return new UpdateCareRecordRequest(
            Type: type,
            Title: title,
            Date: null,
            DueDate: dueDate,
            Provider: null,
            Notes: null,
            PublicVisibility: null,
            MediaFileIds: null,
            ClearDueDate: clearDueDate,
            CareName: careName,
            FulfillsCareRecordId: fulfillsCareRecordId,
            ClearCareName: clearCareName,
            ClearFulfillsCareRecordId: clearFulfillsCareRecordId);
    }

    private static void AssertValidation(ApiException exception, string field)
    {
        Assert.Equal(StatusCodes.Status400BadRequest, exception.StatusCode);
        Assert.Equal("validation_failed", exception.Code);
        Assert.True(exception.Details!.ContainsKey(field));
    }

    private sealed class Harness : IDisposable
    {
        private Harness(MyPetLinkDbContext db, MutableTimeProvider clock)
        {
            Db = db;
            Clock = clock;
            Service = new CareRecordService(db, clock);
        }

        public MyPetLinkDbContext Db { get; }
        public MutableTimeProvider Clock { get; }
        public CareRecordService Service { get; }
        public DateOnly Today => new(2026, 8, 20);

        public static async Task<Harness> CreateAsync()
        {
            var clock = new MutableTimeProvider(
                DateTimeOffset.Parse("2026-08-20T00:00:00Z"));
            var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
                .Options;
            var db = new MyPetLinkDbContext(options, clock);
            var owner = User(OwnerId, "owner@example.com");
            var otherOwner = User(OtherOwnerId, "other@example.com");

            db.Users.AddRange(owner, otherOwner);
            db.Pets.AddRange(
                Pet(PetId, owner, "milo-p123"),
                Pet(OtherPetId, owner, "luna-p456"),
                Pet(ForeignPetId, otherOwner, "max-p789"));
            await db.SaveChangesAsync();
            clock.Advance(TimeSpan.FromDays(1));

            return new Harness(db, clock);
        }

        public async Task<CareRecord> AddRecordAsync(
            Guid petId,
            CareRecordType type,
            DateOnly? dueDate,
            bool archived = false,
            bool deleted = false,
            Guid? fulfillsCareRecordId = null)
        {
            var record = new CareRecord
            {
                PetId = petId,
                Type = type,
                Title = "Existing care",
                RecordDate = Today.AddDays(-30),
                DueDate = dueDate,
                PublicVisibility = CareRecordPublicVisibility.Private,
                ArchivedAt = archived ? Clock.GetUtcNow() : null,
                DeletedAt = deleted ? Clock.GetUtcNow() : null,
                FulfillsCareRecordId = fulfillsCareRecordId
            };
            Db.CareRecords.Add(record);
            await Db.SaveChangesAsync();
            return record;
        }

        public void Dispose() => Db.Dispose();

        private static User User(Guid id, string email) => new()
        {
            Id = id,
            Email = email,
            NormalizedEmail = email.ToUpperInvariant(),
            DisplayName = "Owner",
            Status = UserStatus.Active
        };

        private static Pet Pet(Guid id, User owner, string slug) => new()
        {
            Id = id,
            OwnerUserId = owner.Id,
            OwnerUser = owner,
            Slug = slug,
            Name = "Pet",
            Species = "Dog"
        };
    }

    private sealed class MutableTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        private DateTimeOffset _utcNow = utcNow;

        public override DateTimeOffset GetUtcNow() => _utcNow;

        public void Advance(TimeSpan duration) => _utcNow = _utcNow.Add(duration);
    }
}
