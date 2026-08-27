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
        Assert.Null(response.CareName);
        Assert.Null(response.FulfillsCareRecordId);
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

    [Fact]
    public async Task GetAndList_ReturnOnlyActiveReadyCareDocumentsInTheirSavedOrder()
    {
        using var harness = await CareRecordHarness.CreateAsync(withRecord: true);
        var record = await harness.Db.CareRecords.SingleAsync();
        var first = AddDocument(harness.Db, "vaccination-card.pdf", MediaUploadCategory.VaccinationDocument);
        var second = AddDocument(harness.Db, "clinic-result.png", MediaUploadCategory.MedicalDocument);
        var pending = AddDocument(harness.Db, "pending.pdf", MediaUploadCategory.MedicalDocument, MediaUploadStatus.Pending);
        var deleted = AddDocument(harness.Db, "deleted.pdf", MediaUploadCategory.MedicalDocument);
        deleted.DeletedAt = DateTimeOffset.UtcNow;
        var petOnly = AddDocument(harness.Db, "pet-only.pdf", MediaUploadCategory.MedicalDocument);
        var otherRecord = new CareRecord
        {
            PetId = PetId,
            Type = CareRecordType.Other,
            Title = "Other record",
            RecordDate = MalaysiaToday()
        };
        harness.Db.CareRecords.Add(otherRecord);
        AddCareLink(harness.Db, record.Id, second.Id, 0);
        AddCareLink(harness.Db, record.Id, first.Id, 1);
        AddCareLink(harness.Db, record.Id, pending.Id, 2);
        AddCareLink(harness.Db, record.Id, deleted.Id, 3);
        AddCareLink(harness.Db, record.Id, AddDocument(harness.Db, "removed.pdf", MediaUploadCategory.MedicalDocument).Id, 3, DateTimeOffset.UtcNow);
        AddPetLink(harness.Db, petOnly.Id);
        AddCareLink(harness.Db, otherRecord.Id, AddDocument(harness.Db, "other-record.pdf", MediaUploadCategory.MedicalDocument).Id, 0);
        await harness.Db.SaveChangesAsync();

        var single = await harness.Service.GetAsync(OwnerId, record.Id);
        var listed = await harness.Service.ListForPetAsync(
            OwnerId, PetId, 1, 20, null, null, null, includeArchived: false);

        Assert.Equal(["clinic-result.png", "vaccination-card.pdf"], single.Documents.Select(document => document.OriginalFileName));
        Assert.Equal(single.Documents, listed.Items.Single(item => item.Id == record.Id).Documents);
        Assert.All(single.Documents, document => Assert.DoesNotContain(
            document.GetType().GetProperties(),
            property => property.Name.Contains("Storage", StringComparison.OrdinalIgnoreCase)
                || property.Name.Contains("ObjectKey", StringComparison.OrdinalIgnoreCase)));
    }

    [Fact]
    public async Task CreateAsync_PromotesStagedPetDocumentsToTheCareRecord()
    {
        using var harness = await CareRecordHarness.CreateAsync();
        var first = AddDocument(harness.Db, "certificate.pdf", MediaUploadCategory.VaccinationDocument);
        var second = AddDocument(harness.Db, "card.jpg", MediaUploadCategory.VaccinationDocument);
        AddPetLink(harness.Db, first.Id);
        AddPetLink(harness.Db, second.Id);
        await harness.Db.SaveChangesAsync();

        var response = await harness.Service.CreateAsync(
            OwnerId,
            PetId,
            CreateRequest(CareRecordType.Vaccine, MalaysiaToday()) with
            {
                MediaFileIds = [second.Id, first.Id]
            });

        Assert.Equal([second.Id, first.Id], response.Documents.Select(document => document.Id));
        var staged = await harness.Db.MediaFileLinks
            .Where(link => link.OwnerType == MediaOwnerType.Pet)
            .ToArrayAsync();
        Assert.All(staged, link => Assert.NotNull(link.ArchivedAt));
        var activeCareLinks = await harness.Db.MediaFileLinks
            .Where(link => link.OwnerType == MediaOwnerType.CareRecord && link.ArchivedAt == null)
            .OrderBy(link => link.SortOrder)
            .ToArrayAsync();
        Assert.Equal([second.Id, first.Id], activeCareLinks.Select(link => link.MediaFileId));
    }

    [Fact]
    public async Task UpdateAsync_ReplacesDocumentLinksWithoutDeletingMedia()
    {
        using var harness = await CareRecordHarness.CreateAsync(withRecord: true);
        var record = await harness.Db.CareRecords.SingleAsync();
        var target = new CareRecord
        {
            PetId = PetId,
            Type = CareRecordType.Vaccine,
            Title = "Previous vaccination",
            RecordDate = MalaysiaToday().AddYears(-1),
            DueDate = MalaysiaToday().AddDays(-1),
            CreatedAt = DateTimeOffset.Parse("2020-01-01T00:00:00Z")
        };
        record.CreatedAt = DateTimeOffset.Parse("2021-01-01T00:00:00Z");
        record.CareName = "DHPP";
        record.FulfillsCareRecordId = target.Id;
        harness.Db.CareRecords.Add(target);
        var first = AddDocument(harness.Db, "a.pdf", MediaUploadCategory.VaccinationDocument);
        var removed = AddDocument(harness.Db, "b.pdf", MediaUploadCategory.VaccinationDocument);
        var added = AddDocument(harness.Db, "c.png", MediaUploadCategory.MedicalDocument);
        AddCareLink(harness.Db, record.Id, first.Id, 0);
        AddCareLink(harness.Db, record.Id, removed.Id, 1);
        AddPetLink(harness.Db, added.Id);
        await harness.Db.SaveChangesAsync();
        target.CreatedAt = record.CreatedAt.AddDays(-1);
        await harness.Db.SaveChangesAsync();

        var response = await harness.Service.UpdateAsync(
            OwnerId,
            record.Id,
            new UpdateCareRecordRequest(null, null, null, null, null, null, null, [first.Id, added.Id]));

        Assert.Equal([first.Id, added.Id], response.Documents.Select(document => document.Id));
        Assert.Equal("DHPP", response.CareName);
        Assert.Equal(target.Id, response.FulfillsCareRecordId);
        Assert.NotNull((await harness.Db.MediaFileLinks.SingleAsync(link =>
            link.OwnerType == MediaOwnerType.CareRecord && link.MediaFileId == removed.Id)).ArchivedAt);
        Assert.Null((await harness.Db.MediaFiles.SingleAsync(media => media.Id == removed.Id)).DeletedAt);

        var cleared = await harness.Service.UpdateAsync(
            OwnerId,
            record.Id,
            new UpdateCareRecordRequest(
                null, null, null, null, null, null, null, null,
                ClearFulfillsCareRecordId: true));
        Assert.Null(cleared.FulfillsCareRecordId);
        Assert.Equal([first.Id, added.Id], cleared.Documents.Select(document => document.Id));
    }

    [Fact]
    public async Task CreateAsync_RejectsAnotherOwnersDocumentWithoutPersistingARecord()
    {
        using var harness = await CareRecordHarness.CreateAsync();
        var foreignDocument = AddDocument(
            harness.Db,
            "private.pdf",
            MediaUploadCategory.MedicalDocument,
            ownerId: Guid.Parse("33333333-3333-3333-3333-333333333333"));
        await harness.Db.SaveChangesAsync();

        var exception = await Assert.ThrowsAsync<ApiException>(() => harness.Service.CreateAsync(
            OwnerId,
            PetId,
            CreateRequest(CareRecordType.VetVisit, MalaysiaToday()) with
            {
                MediaFileIds = [foreignDocument.Id]
            }));

        Assert.Equal(StatusCodes.Status400BadRequest, exception.StatusCode);
        Assert.Empty(await harness.Db.CareRecords.AsNoTracking().ToArrayAsync());
        Assert.DoesNotContain(harness.Db.ChangeTracker.Entries<CareRecord>(), entry => entry.State == EntityState.Added);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task UpdateAsync_RejectsAnotherOwnersOrAnotherPetsDocument(bool anotherOwner)
    {
        using var harness = await CareRecordHarness.CreateAsync(withRecord: true);
        var record = await harness.Db.CareRecords.SingleAsync();
        var unavailable = AddDocument(
            harness.Db,
            "unavailable.pdf",
            MediaUploadCategory.MedicalDocument,
            ownerId: anotherOwner ? Guid.Parse("33333333-3333-3333-3333-333333333333") : OwnerId,
            petId: anotherOwner ? PetId : Guid.Parse("44444444-4444-4444-4444-444444444444"));
        await harness.Db.SaveChangesAsync();

        var exception = await Assert.ThrowsAsync<ApiException>(() => harness.Service.UpdateAsync(
            OwnerId,
            record.Id,
            new UpdateCareRecordRequest(null, null, null, null, null, null, null, [unavailable.Id])));

        Assert.Equal(StatusCodes.Status400BadRequest, exception.StatusCode);
        Assert.Empty(await harness.Db.MediaFileLinks.AsNoTracking()
            .Where(link => link.OwnerType == MediaOwnerType.CareRecord)
            .ToArrayAsync());
    }

    [Theory]
    [InlineData(CareRecordType.Vaccine, MediaUploadCategory.VaccinationDocument)]
    [InlineData(CareRecordType.Vaccine, MediaUploadCategory.MedicalDocument)]
    [InlineData(CareRecordType.VetVisit, MediaUploadCategory.MedicalDocument)]
    public async Task CreateAsync_AcceptsExistingCareDocumentCategories(
        CareRecordType recordType,
        MediaUploadCategory category)
    {
        using var harness = await CareRecordHarness.CreateAsync();
        var document = AddDocument(harness.Db, "supported.pdf", category);
        await harness.Db.SaveChangesAsync();

        var response = await harness.Service.CreateAsync(
            OwnerId,
            PetId,
            CreateRequest(recordType, MalaysiaToday()) with { MediaFileIds = [document.Id] });

        Assert.Equal(category, Assert.Single(response.Documents).Category);
    }

    [Fact]
    public async Task ArchiveAsync_ArchivesEveryActiveDocumentLink()
    {
        using var harness = await CareRecordHarness.CreateAsync(withRecord: true);
        var record = await harness.Db.CareRecords.SingleAsync();
        var document = AddDocument(harness.Db, "certificate.pdf", MediaUploadCategory.VaccinationDocument);
        AddCareLink(harness.Db, record.Id, document.Id, 0);
        await harness.Db.SaveChangesAsync();

        await harness.Service.ArchiveAsync(OwnerId, record.Id);

        Assert.NotNull((await harness.Db.MediaFileLinks.SingleAsync()).ArchivedAt);
        Assert.Empty((await harness.Service.GetAsync(OwnerId, record.Id)).Documents);
    }

    [Fact]
    public async Task GetAsync_DoesNotAllowAnotherOwnerToReadDocumentMetadata()
    {
        using var harness = await CareRecordHarness.CreateAsync(withRecord: true);
        var record = await harness.Db.CareRecords.SingleAsync();
        var document = AddDocument(harness.Db, "certificate.pdf", MediaUploadCategory.VaccinationDocument);
        AddCareLink(harness.Db, record.Id, document.Id, 0);
        await harness.Db.SaveChangesAsync();

        var exception = await Assert.ThrowsAsync<ApiException>(() => harness.Service.GetAsync(
            Guid.Parse("33333333-3333-3333-3333-333333333333"),
            record.Id));

        Assert.Equal(StatusCodes.Status404NotFound, exception.StatusCode);
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

    private static MediaFile AddDocument(
        MyPetLinkDbContext db,
        string fileName,
        MediaUploadCategory category,
        MediaUploadStatus status = MediaUploadStatus.Ready,
        Guid? ownerId = null,
        Guid? petId = null)
    {
        var media = new MediaFile
        {
            OwnerUserId = ownerId ?? OwnerId,
            PetId = petId ?? PetId,
            OriginalFileName = fileName,
            StorageFileName = fileName,
            ContentType = fileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase)
                ? "application/pdf"
                : "image/png",
            FileSize = 1024,
            StoragePath = $"private/{Guid.NewGuid():N}",
            BucketName = "private-media",
            ObjectKey = $"private/{Guid.NewGuid():N}",
            MediaType = MediaFileType.Document,
            Category = category,
            UploadStatus = status,
            IsPublic = false
        };
        db.MediaFiles.Add(media);
        return media;
    }

    private static void AddPetLink(MyPetLinkDbContext db, Guid mediaId)
    {
        db.MediaFileLinks.Add(new MediaFileLink
        {
            MediaFileId = mediaId,
            OwnerType = MediaOwnerType.Pet,
            OwnerId = PetId
        });
    }

    private static void AddCareLink(
        MyPetLinkDbContext db,
        Guid recordId,
        Guid mediaId,
        int sortOrder,
        DateTimeOffset? archivedAt = null)
    {
        db.MediaFileLinks.Add(new MediaFileLink
        {
            MediaFileId = mediaId,
            OwnerType = MediaOwnerType.CareRecord,
            OwnerId = recordId,
            SortOrder = sortOrder,
            ArchivedAt = archivedAt
        });
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
