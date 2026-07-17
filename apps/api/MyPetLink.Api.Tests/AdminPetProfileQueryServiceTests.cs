using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests;

public sealed class AdminPetProfileQueryServiceTests
{
    [Fact]
    public async Task List_SearchFiltersSortsAndPagesOnServerQuery()
    {
        using var harness = await Harness.CreateAsync();
        var (items, total) = await harness.Service.ListAsync(new AdminPetProfileQuery
        {
            Search = "MPL-TOPU-ACTIVE",
            Lifecycle = "Active",
            LostMode = true,
            HasAllergies = true,
            TagState = "active",
            SortBy = "name",
            SortDir = "asc",
            PageSize = 1
        });

        Assert.Equal(1, total);
        var row = Assert.Single(items);
        Assert.Equal("Topu", row.Name);
        Assert.Equal("Aina Owner", row.OwnerName);
        Assert.Equal(1, row.ActiveSmartTagCount);
        Assert.Equal(2, row.TotalSmartTagCount);
    }

    [Fact]
    public async Task Counts_IgnoreOnlyShortcutViewAndKeepLostModeSeparateFromLifecycle()
    {
        using var harness = await Harness.CreateAsync();
        var counts = await harness.Service.CountByStatusAsync(new AdminPetProfileQuery
        {
            View = "memorial",
            PetType = "Cat"
        });

        Assert.Equal(4, counts.All);
        Assert.Equal(2, counts.Active);
        Assert.Equal(1, counts.LostMode);
        Assert.Equal(1, counts.Memorial);
        Assert.Equal(1, counts.Archived);
    }

    [Fact]
    public async Task List_CombinesOwnerRouteContactAgeTagAndDateFilters()
    {
        using var harness = await Harness.CreateAsync();
        var (items, total) = await harness.Service.ListAsync(new AdminPetProfileQuery
        {
            Owner = "aina@example.com",
            PetType = "Cat",
            AgeMode = "exact",
            PublicProfile = "accessible",
            QrSafety = "accessible",
            HasFinderContact = true,
            TagType = "QR_NFC",
            CreatedFrom = Harness.Now.AddYears(-1),
            CreatedTo = Harness.Now.AddYears(1),
            UpdatedFrom = Harness.Now.AddYears(-1),
            UpdatedTo = Harness.Now.AddYears(1),
            PageSize = 20
        });

        Assert.Equal(1, total);
        Assert.Equal(harness.LostPetId, Assert.Single(items).Id);
    }

    [Fact]
    public async Task List_PaginatesAfterDeterministicSorting()
    {
        using var harness = await Harness.CreateAsync();
        var expectedIds = await harness.Db.Pets.AsNoTracking()
            .Where(pet => pet.DeletedAt == null && pet.Species == "Cat")
            .OrderBy(pet => pet.CreatedAt)
            .ThenBy(pet => pet.Id)
            .Skip(2)
            .Take(2)
            .Select(pet => pet.Id)
            .ToArrayAsync();
        var (items, total) = await harness.Service.ListAsync(new AdminPetProfileQuery
        {
            PetType = "Cat",
            SortBy = "createdAt",
            SortDir = "asc",
            Page = 2,
            PageSize = 2
        });

        Assert.Equal(4, total);
        Assert.Equal(2, items.Count);
        Assert.Equal(expectedIds, items.Select(item => item.Id));
    }

    [Fact]
    public async Task RouteHealth_DistinguishesAccessibleUnavailableAndSetupIssues()
    {
        using var harness = await Harness.CreateAsync();
        var (issues, _) = await harness.Service.ListAsync(new AdminPetProfileQuery
        {
            PublicProfile = "setup-issue",
            PageSize = 20
        });
        Assert.Equal(2, issues.Count);
        Assert.All(issues, item => Assert.True(item.PublicProfileSetupIssue));
        Assert.All(issues, item => Assert.False(item.PublicProfileAccessible));

        var (qrAccessible, _) = await harness.Service.ListAsync(new AdminPetProfileQuery
        {
            QrSafety = "accessible",
            PageSize = 20
        });
        Assert.Equal(3, qrAccessible.Count);
        Assert.Contains(qrAccessible, item => item.Lifecycle == PetLifecycleStatus.Memorial);
    }

    [Fact]
    public async Task SmartTagProjection_TreatsNoPhysicalTagAsNeutralAndCountsStatuses()
    {
        using var harness = await Harness.CreateAsync();
        var (withoutTags, total) = await harness.Service.ListAsync(new AdminPetProfileQuery
        {
            TagState = "none",
            PageSize = 20
        });

        Assert.Equal(4, total);
        Assert.All(withoutTags, item => Assert.Equal(0, item.TotalSmartTagCount));

        var (inactiveOnly, _) = await harness.Service.ListAsync(new AdminPetProfileQuery
        {
            TagState = "inactive-only",
            PageSize = 20
        });
        Assert.Single(inactiveOnly);
        Assert.Equal("Milo", inactiveOnly.Single().Name);
    }

    [Fact]
    public async Task Detail_KeepsSameNamePetsDistinctAndReturnsSafeSupportProjection()
    {
        using var harness = await Harness.CreateAsync();
        var detail = await harness.Service.GetAsync(harness.LostPetId);

        Assert.Equal("Topu", detail.Pet.Name);
        Assert.Equal("Aina Owner", detail.Pet.OwnerName);
        Assert.Equal(new[] { "Chicken", "Penicillin" }, detail.Allergies);
        Assert.True(detail.Pet.QrSafetyAccessible);
        Assert.True(detail.Pet.PublicProfileAccessible);
        Assert.Contains(detail.SmartTags, tag => tag.TagCode == "MPL-TOPU-ACTIVE");
        Assert.Contains(detail.History, item => item.Action == "pet-profiles.support-note" && item.Detail == "Owner verified identity");

        var (sameName, _) = await harness.Service.ListAsync(new AdminPetProfileQuery { Search = "Topu", PageSize = 20 });
        Assert.Equal(2, sameName.Count);
        Assert.Equal(2, sameName.Select(item => item.OwnerUserId).Distinct().Count());
    }

    [Fact]
    public async Task Detail_InvalidAllergyJsonReturnsEmptyListWithoutRawJson()
    {
        using var harness = await Harness.CreateAsync();
        var detail = await harness.Service.GetAsync(harness.InvalidAllergyPetId);
        Assert.Empty(detail.Allergies);
        Assert.False(detail.Pet.HasAllergies);

        var (withAllergies, _) = await harness.Service.ListAsync(new AdminPetProfileQuery
        {
            HasAllergies = true,
            PageSize = 20
        });
        Assert.DoesNotContain(withAllergies, item => item.Id == harness.InvalidAllergyPetId);
    }

    [Fact]
    public async Task Export_AppliesFiltersAndExcludesSensitiveAndInternalFields()
    {
        using var harness = await Harness.CreateAsync();
        var export = await harness.Service.ExportAsync(
            Harness.AdminUserId,
            new AdminPetProfileQuery { LostMode = true },
            "csv",
            null);
        var csv = Encoding.UTF8.GetString(export.Content);

        Assert.Contains("Topu", csv);
        Assert.Contains("Public Profile Slug", csv);
        Assert.DoesNotContain(harness.LostPetId.ToString(), csv);
        Assert.DoesNotContain("safe-topu", csv);
        Assert.DoesNotContain("Please call me", csv);
        Assert.DoesNotContain("Chicken", csv);
        Assert.Contains(await harness.Db.AuditLogs.ToListAsync(), log => log.Action == "pet-profiles.export");
    }

    [Fact]
    public async Task Query_RejectsUnsafeSortInvalidViewAndInvertedDates()
    {
        using var harness = await Harness.CreateAsync();
        await Assert.ThrowsAsync<ApiException>(() => harness.Service.ListAsync(new AdminPetProfileQuery { SortBy = "Name; DROP TABLE Pets" }));
        await Assert.ThrowsAsync<ApiException>(() => harness.Service.ListAsync(new AdminPetProfileQuery { View = "deleted" }));
        await Assert.ThrowsAsync<ApiException>(() => harness.Service.ListAsync(new AdminPetProfileQuery
        {
            CreatedFrom = Harness.Now,
            CreatedTo = Harness.Now.AddDays(-1)
        }));
    }

    [Fact]
    public async Task Export_RequiresAnActiveAdmin()
    {
        using var harness = await Harness.CreateAsync();
        var error = await Assert.ThrowsAsync<ApiException>(() => harness.Service.ExportAsync(
            Guid.NewGuid(), new AdminPetProfileQuery(), "csv", null));
        Assert.Equal(StatusCodes.Status403Forbidden, error.StatusCode);
    }

    private sealed class Harness : IDisposable
    {
        public static readonly Guid AdminUserId = Guid.Parse("81111111-1111-1111-1111-111111111111");
        private static readonly Guid OtherOwnerId = Guid.Parse("82222222-2222-2222-2222-222222222222");
        private static readonly Guid OwnerId = Guid.Parse("83333333-3333-3333-3333-333333333333");
        public static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-07-17T08:00:00Z");

        public MyPetLinkDbContext Db { get; }
        public AdminPetProfileQueryService Service { get; }
        public Guid LostPetId { get; }
        public Guid InvalidAllergyPetId { get; }

        private Harness(MyPetLinkDbContext db, Guid lostPetId, Guid invalidAllergyPetId)
        {
            Db = db;
            LostPetId = lostPetId;
            InvalidAllergyPetId = invalidAllergyPetId;
            Service = new AdminPetProfileQueryService(
                db,
                new AuditLogService(db, new HttpContextAccessor()),
                Options.Create(new CloudflareR2Options { PublicBaseUrl = "https://media.mypetlink.com.my" }));
        }

        public static async Task<Harness> CreateAsync()
        {
            var db = new MyPetLinkDbContext(new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N")).Options);
            var adminUser = new User
            {
                Id = AdminUserId,
                Email = "admin@example.com",
                NormalizedEmail = "ADMIN@EXAMPLE.COM",
                DisplayName = "Support Admin",
                AdminUser = new AdminUser { UserId = AdminUserId, Role = AdminRole.Admin, IsActive = true }
            };
            var owner = Owner(OwnerId, "aina@example.com", "Aina Owner", "+60110000001");
            var otherOwner = Owner(OtherOwnerId, "bala@example.com", "Bala Owner", "+60110000002");

            var lost = Pet(owner, "Topu", "Cat", "Domestic Shorthair", PetLifecycleStatus.Active, Now.AddDays(-20));
            lost.LostModeEnabled = true;
            lost.Birthday = new DateOnly(2022, 1, 19);
            lost.LostLastSeenArea = "Ampang";
            lost.LostLastSeenDateTime = Now.AddDays(-1);
            lost.LostMessage = "Please help Topu get home.";
            lost.LostExtraContactInstruction = "Please call me";
            lost.AllergiesJson = "[\"Chicken\",\"Penicillin\"]";
            lost.ProfileMediaFile = PublicPhoto(owner.Id, lost.Id, "pets/topu.jpg");
            lost.ProfileMediaFileId = lost.ProfileMediaFile.Id;
            ConfigureRoutes(lost, "topu", "public-topu", "safe-topu", publicEnabled: true, qrEnabled: true);
            lost.SafetySetting!.ShowPhone = true;
            lost.Contact = new PetContact { PetId = lost.Id, UseOwnerDefaults = true };

            var sameName = Pet(otherOwner, "Topu", "Cat", "Persian", PetLifecycleStatus.Active, Now.AddDays(-18));
            sameName.AllergiesJson = "{not-json";
            ConfigureRoutes(sameName, "topu-bala", "public-bala", "safe-bala", publicEnabled: false, qrEnabled: true);

            var memorial = Pet(owner, "Bubu", "Cat", "Mixed", PetLifecycleStatus.Memorial, Now.AddDays(-15));
            memorial.ShowMemorialOnPublicProfile = false;
            ConfigureRoutes(memorial, "bubu", "public-bubu", "safe-bubu", publicEnabled: true, qrEnabled: true);

            var archived = Pet(owner, "Nori", "Cat", "Mixed", PetLifecycleStatus.Archived, Now.AddDays(-10));
            archived.ArchivedAt = Now.AddDays(-2);
            ConfigureRoutes(archived, "nori", "public-nori", "safe-nori", publicEnabled: true, qrEnabled: true);

            var broken = Pet(owner, "Coco", "Dog", "Poodle", PetLifecycleStatus.Active, Now.AddDays(-8));
            ConfigureRoutes(broken, "", "", "", publicEnabled: true, qrEnabled: true);

            var inactiveTagPet = Pet(owner, "Milo", "Dog", "Beagle", PetLifecycleStatus.Active, Now.AddDays(-5));
            ConfigureRoutes(inactiveTagPet, "milo", "public-milo", "safe-milo", publicEnabled: true, qrEnabled: false);

            var activeTag = Tag(lost, owner, "MPL-TOPU-ACTIVE", SmartTagStatus.Active, hasNfc: true);
            var disabledTag = Tag(lost, owner, "MPL-TOPU-DISABLED", SmartTagStatus.Disabled, hasNfc: false);
            var inactiveTag = Tag(inactiveTagPet, owner, "MPL-MILO-DISABLED", SmartTagStatus.Disabled, hasNfc: false);
            var order = new TagOrder
            {
                OwnerUser = owner,
                OwnerUserId = owner.Id,
                Pet = lost,
                PetId = lost.Id,
                OrderNumber = "MPL-ORDER-TOPU",
                RecipientName = owner.DisplayName,
                DeliveryPhoneE164 = owner.PhoneE164!,
                AddressLine1 = "Test",
                Postcode = "50000",
                City = "Kuala Lumpur",
                State = "Kuala Lumpur"
            };

            db.Users.AddRange(adminUser, owner, otherOwner);
            db.Pets.AddRange(lost, sameName, memorial, archived, broken, inactiveTagPet);
            db.SmartTags.AddRange(activeTag, disabledTag, inactiveTag);
            db.TagOrders.Add(order);
            db.AuditLogs.Add(new AuditLog
            {
                ActorId = adminUser.AdminUser!.Id,
                ActorType = ActorType.Admin,
                Entity = "Pet",
                EntityId = lost.Id,
                Action = "pet-profiles.support-note",
                NewValue = "{\"reason\":\"Owner verified identity\"}",
                CreatedAt = Now
            });
            await db.SaveChangesAsync();
            return new Harness(db, lost.Id, sameName.Id);
        }

        private static User Owner(Guid id, string email, string name, string phone) => new()
        {
            Id = id,
            Email = email,
            NormalizedEmail = email.ToUpperInvariant(),
            DisplayName = name,
            PhoneE164 = phone,
            WhatsappE164 = phone,
            Status = UserStatus.Active
        };

        private static Pet Pet(User owner, string name, string species, string breed, PetLifecycleStatus lifecycle, DateTimeOffset created) => new()
        {
            OwnerUser = owner,
            OwnerUserId = owner.Id,
            Name = name,
            Slug = name.ToLowerInvariant(),
            Species = species,
            Breed = breed,
            LifecycleStatus = lifecycle,
            CreatedAt = created,
            UpdatedAt = created.AddDays(1),
            AllergiesJson = "[]"
        };

        private static void ConfigureRoutes(Pet pet, string slug, string publicCode, string safetyCode, bool publicEnabled, bool qrEnabled)
        {
            pet.Slug = slug;
            pet.PublicProfile = new PetPublicProfile
            {
                PetId = pet.Id,
                PublicCode = publicCode,
                SlugSnapshot = slug,
                IsPublicProfileEnabled = publicEnabled,
                ShowAllergiesOnPublicProfile = false
            };
            pet.SafetySetting = new PetSafetySetting
            {
                PetId = pet.Id,
                SafetyCode = safetyCode,
                QrSafetyEnabled = qrEnabled,
                ShowWhatsapp = true
            };
        }

        private static SmartTag Tag(Pet pet, User owner, string code, SmartTagStatus status, bool hasNfc) => new()
        {
            Pet = pet,
            PetId = pet.Id,
            OwnerUser = owner,
            OwnerUserId = owner.Id,
            TagCode = code,
            Status = status,
            HasNfc = hasNfc,
            Variant = hasNfc ? "Lightweight" : "Standard",
            CreatedAt = Now,
            UpdatedAt = Now
        };

        private static MediaFile PublicPhoto(Guid ownerId, Guid petId, string objectKey) => new()
        {
            OwnerUserId = ownerId,
            PetId = petId,
            IsPublic = true,
            UploadStatus = MediaUploadStatus.Ready,
            MediaType = MediaFileType.Image,
            ObjectKey = objectKey,
            BucketName = "public"
        };

        public void Dispose() => Db.Dispose();
    }
}
