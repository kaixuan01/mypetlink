using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public sealed class AdminOwnerQueryServiceTests
{
    [Theory]
    [InlineData("Aina Owner")]
    [InlineData("AINA@EXAMPLE.COM")]
    [InlineData("011-222-3333")]
    [InlineData("Topu")]
    [InlineData("MPL-ORDER-AINA")]
    [InlineData("MPL-AINA-TAG")]
    public async Task Search_UsesAuthorizedOwnerAndRelatedIdentifiers(string search)
    {
        using var harness = await Harness.CreateAsync();
        var (items, total) = await harness.Service.ListAsync(new AdminOwnerQuery
        {
            Search = search,
            PageSize = 20
        });

        if (search == "Aina Owner")
        {
            Assert.Equal(2, total);
            Assert.Contains(items, item => item.OwnerUserId == Harness.OwnerId);
        }
        else
        {
            Assert.Equal(1, total);
            Assert.Equal(Harness.OwnerId, Assert.Single(items).OwnerUserId);
        }
    }

    [Fact]
    public async Task List_CombinesServerFiltersSortsAndPaginationDeterministically()
    {
        using var harness = await Harness.CreateAsync();
        var (items, total) = await harness.Service.ListAsync(new AdminOwnerQuery
        {
            Status = "Active",
            ContactReady = true,
            ProfileComplete = true,
            AuthProvider = "Google",
            HasPets = true,
            PetCountMin = 2,
            HasActivePet = true,
            HasLostModePet = true,
            HasOrders = true,
            HasPendingPayment = true,
            HasPendingProof = true,
            TagState = "active",
            Plan = "Free",
            PetUsageNearLimit = true,
            MemoryUsageNearLimit = true,
            JoinedFrom = Harness.Now.AddYears(-1),
            JoinedTo = Harness.Now.AddYears(1),
            SortBy = "name",
            SortDir = "asc",
            Page = 1,
            PageSize = 1
        });

        Assert.Equal(1, total);
        var owner = Assert.Single(items);
        Assert.Equal(Harness.OwnerId, owner.OwnerUserId);
        Assert.Equal(2, owner.PetCount);
        Assert.Equal(1, owner.PendingProofCount);
        Assert.Equal(1, owner.ActiveSmartTagCount);
        Assert.True(owner.PetUsageNearLimit);
        Assert.True(owner.MemoryUsageNearLimit);
        Assert.DoesNotContain("+60112223333", owner.ContactSummary);
        Assert.Contains("3333", owner.ContactSummary);
    }

    [Fact]
    public async Task Counts_KeepNonStatusFiltersAndUseSharedContactValidation()
    {
        using var harness = await Harness.CreateAsync();
        var counts = await harness.Service.CountAsync(new AdminOwnerQuery { HasPets = false });

        Assert.Equal(2, counts.All);
        Assert.Equal(1, counts.Active);
        Assert.Equal(1, counts.Suspended);
        Assert.Equal(2, counts.MissingContact);
        Assert.Equal(2, counts.NoPets);
    }

    [Fact]
    public async Task Detail_ReturnsSupportProjectionWithoutAuthenticationSecrets()
    {
        using var harness = await Harness.CreateAsync();
        var detail = await harness.Service.GetAsync(Harness.AdminUserId, Harness.OwnerId);
        var json = JsonSerializer.Serialize(detail);

        Assert.Equal("+60112223333", detail.PhoneE164);
        Assert.Equal(1, detail.Owner.FinderReadyPetCount);
        Assert.Equal(1, detail.Owner.FinderContactIssuePetCount);
        Assert.Equal(2, detail.Pets.Count);
        Assert.Single(detail.RecentOrders);
        Assert.Single(detail.RecentPaymentProofs);
        Assert.Single(detail.SmartTags);
        Assert.Contains("Google", detail.AuthenticationProviders);
        Assert.True(detail.MemoryUsageNearLimit);
        Assert.DoesNotContain("google-subject-secret", json);
        Assert.DoesNotContain("ProviderSubjectId", json);
        Assert.DoesNotContain("PrivacyDefaultsJson", json);
        Assert.DoesNotContain("NotificationPreferencesJson", json);
        Assert.Contains(await harness.Db.AuditLogs.ToListAsync(), log => log.Action == "owners.detail-view");
    }

    [Fact]
    public async Task SameNameOwnersRemainDistinctAndSortUsesDisplayFallback()
    {
        using var harness = await Harness.CreateAsync();
        var (items, total) = await harness.Service.ListAsync(new AdminOwnerQuery
        {
            Search = "Aina Owner",
            SortBy = "email",
            SortDir = "asc",
            PageSize = 20
        });

        Assert.Equal(2, total);
        Assert.Equal(2, items.Select(item => item.OwnerUserId).Distinct().Count());
        Assert.Equal(new[] { "aina.two@example.com", "aina@example.com" }, items.Select(item => item.Email));
    }

    [Fact]
    public async Task Export_AppliesFiltersProtectsFormulaCellsAndAuditsAccess()
    {
        using var harness = await Harness.CreateAsync();
        var csvExport = await harness.Service.ExportAsync(
            Harness.AdminUserId,
            new AdminOwnerQuery { Status = "Suspended" },
            "csv",
            null);
        var csv = Encoding.UTF8.GetString(csvExport.Content);

        Assert.Contains("'=Formula Owner", csv);
        Assert.DoesNotContain(Harness.SuspendedOwnerId.ToString(), csv);
        Assert.DoesNotContain("Secret address", csv);
        Assert.DoesNotContain("google-subject-secret", csv);
        Assert.DoesNotContain("Privacy", csv);
        Assert.Contains(await harness.Db.AuditLogs.ToListAsync(), log => log.Action == "owners.export");

        var xlsx = await harness.Service.ExportAsync(
            Harness.AdminUserId,
            new AdminOwnerQuery(),
            "xlsx",
            new[] { Harness.OwnerId });
        Assert.Equal("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsx.ContentType);
        Assert.Equal((byte)'P', xlsx.Content[0]);
        Assert.Equal((byte)'K', xlsx.Content[1]);
    }

    [Fact]
    public async Task Query_RejectsUnsafeSortInvalidFiltersAndInvertedRanges()
    {
        using var harness = await Harness.CreateAsync();
        await Assert.ThrowsAsync<ApiException>(() => harness.Service.ListAsync(new AdminOwnerQuery { SortBy = "email; DROP TABLE Users" }));
        await Assert.ThrowsAsync<ApiException>(() => harness.Service.ListAsync(new AdminOwnerQuery { TagState = "invented" }));
        await Assert.ThrowsAsync<ApiException>(() => harness.Service.ListAsync(new AdminOwnerQuery { Status = "Paused" }));
        await Assert.ThrowsAsync<ApiException>(() => harness.Service.ListAsync(new AdminOwnerQuery { PetCountMin = 2, PetCountMax = 1 }));
        await Assert.ThrowsAsync<ApiException>(() => harness.Service.ListAsync(new AdminOwnerQuery
        {
            JoinedFrom = Harness.Now,
            JoinedTo = Harness.Now.AddDays(-1)
        }));
    }

    [Fact]
    public async Task Export_RequiresActiveAdmin()
    {
        using var harness = await Harness.CreateAsync();
        var error = await Assert.ThrowsAsync<ApiException>(() => harness.Service.ExportAsync(
            Guid.NewGuid(), new AdminOwnerQuery(), "csv", null));
        Assert.Equal(StatusCodes.Status403Forbidden, error.StatusCode);
        await Assert.ThrowsAsync<ApiException>(() => harness.Service.GetAsync(Guid.NewGuid(), Harness.OwnerId));
    }

    private sealed class Harness : IDisposable
    {
        public static readonly Guid AdminUserId = Guid.Parse("91111111-1111-1111-1111-111111111111");
        public static readonly Guid OwnerId = Guid.Parse("92222222-2222-2222-2222-222222222222");
        public static readonly Guid SuspendedOwnerId = Guid.Parse("93333333-3333-3333-3333-333333333333");
        private static readonly Guid SameNameOwnerId = Guid.Parse("94444444-4444-4444-8444-444444444444");
        public static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-07-17T08:00:00Z");

        public MyPetLinkDbContext Db { get; }
        public AdminOwnerQueryService Service { get; }

        private Harness(MyPetLinkDbContext db)
        {
            Db = db;
            Service = new AdminOwnerQueryService(db, new AuditLogService(db, new HttpContextAccessor()));
        }

        public static async Task<Harness> CreateAsync()
        {
            var db = new MyPetLinkDbContext(new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N")).Options);
            var plan = new Plan
            {
                Code = "Free",
                Name = "Free Plan",
                Limit = new PlanLimit { MaxPets = 2, MaxMemoriesPerPet = 2 }
            };
            var admin = new User
            {
                Id = AdminUserId,
                Email = "admin@example.com",
                NormalizedEmail = "ADMIN@EXAMPLE.COM",
                DisplayName = "Support Admin",
                AdminUser = new AdminUser { UserId = AdminUserId, Role = AdminRole.Admin, IsActive = true }
            };
            var owner = Owner(OwnerId, "Aina Owner", "aina@example.com", UserStatus.Active, "+60112223333", plan, "Ampang");
            owner.ExternalLogins.Add(new ExternalLogin
            {
                UserId = OwnerId,
                Provider = "Google",
                ProviderSubjectId = "google-subject-secret",
                ProviderEmail = owner.Email,
                User = owner
            });
            var suspended = Owner(SuspendedOwnerId, "=Formula Owner", "formula@example.com", UserStatus.Suspended, "012-not-e164", plan, null);
            var sameName = Owner(SameNameOwnerId, "Aina Owner", "aina.two@example.com", UserStatus.Active, null, plan, null);

            var topu = Pet(owner, "Topu", true, showPhone: true, Now.AddDays(-10));
            topu.LostModeEnabled = true;
            var noFinderContact = Pet(owner, "Milo", true, showPhone: false, Now.AddDays(-8));
            topu.Memories.Add(new PetMemory { Pet = topu, PetId = topu.Id, Title = "First", ArchivedAt = null });
            topu.Memories.Add(new PetMemory { Pet = topu, PetId = topu.Id, Title = "Second", ArchivedAt = null });

            var order = new TagOrder
            {
                OwnerUser = owner,
                OwnerUserId = owner.Id,
                Pet = topu,
                PetId = topu.Id,
                OrderNumber = "MPL-ORDER-AINA",
                Status = OrderStatus.PendingPayment,
                PaymentStatus = PaymentStatus.Pending,
                Amount = 39m,
                Currency = "MYR",
                RecipientName = owner.DisplayName,
                DeliveryPhoneE164 = owner.PhoneE164!,
                AddressLine1 = "Secret address",
                Postcode = "50000",
                City = "Kuala Lumpur",
                State = "Kuala Lumpur"
            };
            var media = new MediaFile
            {
                OwnerUser = owner,
                OwnerUserId = owner.Id,
                Pet = topu,
                PetId = topu.Id,
                OriginalFileName = "proof.jpg",
                StorageFileName = "opaque.jpg",
                ContentType = "image/jpeg",
                StoragePath = "private/opaque.jpg",
                BucketName = "private",
                ObjectKey = "private/opaque.jpg",
                MediaType = MediaFileType.Image
            };
            var proof = new PaymentProof
            {
                Order = order,
                OrderId = order.Id,
                MediaFile = media,
                MediaFileId = media.Id,
                OriginalFileName = "proof.jpg",
                StorageFileName = "opaque.jpg",
                ContentType = "image/jpeg",
                StoragePath = "private/opaque.jpg",
                Sha256 = "hash",
                UploadedAt = Now,
                Status = PaymentProofStatus.PendingReview
            };
            order.PaymentProofs.Add(proof);
            var tag = new SmartTag
            {
                OwnerUser = owner,
                OwnerUserId = owner.Id,
                Pet = topu,
                PetId = topu.Id,
                TagCode = "MPL-AINA-TAG",
                Status = SmartTagStatus.Active,
                ActivatedAt = Now
            };

            db.Plans.Add(plan);
            db.Users.AddRange(admin, owner, suspended, sameName);
            db.Pets.AddRange(topu, noFinderContact);
            db.TagOrders.Add(order);
            db.PaymentProofs.Add(proof);
            db.SmartTags.Add(tag);
            await db.SaveChangesAsync();
            return new Harness(db);
        }

        private static User Owner(Guid id, string name, string email, UserStatus status, string? phone, Plan plan, string? area)
        {
            var user = new User
            {
                Id = id,
                DisplayName = name,
                Email = email,
                NormalizedEmail = email.ToUpperInvariant(),
                PhoneE164 = phone,
                WhatsappE164 = phone,
                Status = status,
                CreatedAt = Now.AddDays(-30),
                UpdatedAt = Now.AddDays(-2)
            };
            user.OwnerProfile = new OwnerProfile
            {
                User = user,
                UserId = id,
                Plan = plan,
                PlanId = plan.Id,
                OwnerDisplayName = name,
                DefaultGeneralArea = area,
                PrivacyDefaultsJson = "{\"showPhone\":true,\"showWhatsapp\":true}",
                NotificationPreferencesJson = "{\"email\":true}",
                CreatedAt = user.CreatedAt,
                UpdatedAt = user.UpdatedAt
            };
            return user;
        }

        private static Pet Pet(User owner, string name, bool qrEnabled, bool showPhone, DateTimeOffset created)
        {
            var pet = new Pet
            {
                OwnerUser = owner,
                OwnerUserId = owner.Id,
                Name = name,
                Slug = name.ToLowerInvariant(),
                Species = "Cat",
                LifecycleStatus = PetLifecycleStatus.Active,
                CreatedAt = created,
                UpdatedAt = created.AddDays(1)
            };
            pet.SafetySetting = new PetSafetySetting
            {
                Pet = pet,
                PetId = pet.Id,
                SafetyCode = $"safe-{name.ToLowerInvariant()}",
                QrSafetyEnabled = qrEnabled,
                ShowPhone = showPhone,
                ShowWhatsapp = false
            };
            pet.Contact = new PetContact { Pet = pet, PetId = pet.Id, UseOwnerDefaults = true };
            return pet;
        }

        public void Dispose() => Db.Dispose();
    }
}
