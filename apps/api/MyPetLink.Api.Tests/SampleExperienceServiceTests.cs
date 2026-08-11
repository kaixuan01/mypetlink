using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.Controllers.Admin;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests;

public sealed class SampleExperienceServiceTests
{
    [Fact]
    public void RoutesExposeOnlyThePublicProjectionAnonymously()
    {
        var adminPolicy = Assert.Single(typeof(AdminSampleExperienceController)
            .GetCustomAttributes(typeof(AuthorizeAttribute), inherit: true)
            .Cast<AuthorizeAttribute>());
        Assert.Equal(AuthorizationPolicies.Admin, adminPolicy.Policy);
        Assert.NotNull(typeof(SampleExperienceController)
            .GetCustomAttributes(typeof(AllowAnonymousAttribute), inherit: true)
            .SingleOrDefault());
    }

    [Fact]
    public async Task AdminCanSelectEligiblePetAndPublicProjectionChangesWithConfiguration()
    {
        using var harness = await Harness.CreateAsync();
        var first = await harness.Admin.UpdateAsync(
            harness.AdminUserId,
            new UpdateSampleExperienceRequest(harness.TopuId, Convert.ToBase64String([1])));
        Assert.Equal(harness.TopuId, first.FeaturedSamplePetId);
        Assert.Equal("Ready", first.Status);

        var topu = await harness.Public.GetAsync();
        Assert.True(topu.Available);
        Assert.Equal("Topu", topu.Pet!.Name);
        Assert.Equal("topu", topu.Pet.PublicSlug);
        Assert.Equal("safe-topu", topu.Pet.SafetyCode);

        var settings = await harness.Db.PublicSiteSettings.SingleAsync();
        settings.FeaturedSamplePetId = harness.MiloId;
        await harness.Db.SaveChangesAsync();
        var milo = await harness.Public.GetAsync();
        Assert.Equal("Milo", milo.Pet!.Name);
        Assert.Equal("milo", milo.Pet.PublicSlug);
        Assert.Equal("safe-milo", milo.Pet.SafetyCode);

        var json = JsonSerializer.Serialize(milo, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.DoesNotContain(harness.MiloId.ToString(), json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(harness.OwnerId.ToString(), json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("owner-private@example.test", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task AdminRejectsNonEligibleArchivedAndDeletedPets()
    {
        using var harness = await Harness.CreateAsync();
        foreach (var petId in new[] { harness.CustomerPetId, harness.ArchivedPetId, harness.DeletedPetId })
        {
            var error = await Assert.ThrowsAsync<ApiException>(() => harness.Admin.UpdateAsync(
                harness.AdminUserId,
                new UpdateSampleExperienceRequest(petId, Convert.ToBase64String([1]))));
            Assert.Equal(400, error.StatusCode);
        }
        Assert.Null((await harness.Db.PublicSiteSettings.SingleAsync()).FeaturedSamplePetId);
    }

    [Fact]
    public async Task OwnerAndAnonymousCannotChangeAdminConfiguration()
    {
        using var harness = await Harness.CreateAsync();
        var anonymous = await Assert.ThrowsAsync<ApiException>(() => harness.Admin.UpdateAsync(
            null, new UpdateSampleExperienceRequest(harness.TopuId, Convert.ToBase64String([1]))));
        Assert.Equal(401, anonymous.StatusCode);

        var owner = await Assert.ThrowsAsync<ApiException>(() => harness.Admin.UpdateAsync(
            harness.OwnerId, new UpdateSampleExperienceRequest(harness.TopuId, Convert.ToBase64String([1]))));
        Assert.Equal(403, owner.StatusCode);
    }

    [Fact]
    public async Task InvalidConfiguredPetReturnsSafeUnavailableStateWithoutSelectingAnotherPet()
    {
        using var harness = await Harness.CreateAsync();
        var settings = await harness.Db.PublicSiteSettings.SingleAsync();
        settings.FeaturedSamplePetId = harness.TopuId;
        var topu = await harness.Db.Pets.SingleAsync(pet => pet.Id == harness.TopuId);
        topu.LifecycleStatus = PetLifecycleStatus.Archived;
        await harness.Db.SaveChangesAsync();

        var result = await harness.Public.GetAsync();
        Assert.False(result.Available);
        Assert.Null(result.Pet);
        var admin = await harness.Admin.GetAsync();
        Assert.Equal("NeedsReplacement", admin.Status);
        Assert.Equal(harness.TopuId, admin.FeaturedSamplePetId);
    }

    [Fact]
    public async Task SampleEligibilityIsAdminOnlyAndCannotBeRemovedWhilePetIsFeatured()
    {
        using var harness = await Harness.CreateAsync();
        var approved = await harness.PetAdmin.UpdateSampleEligibilityAsync(
            harness.AdminUserId,
            harness.CustomerPetId,
            new UpdateSamplePetEligibilityRequest(true, Convert.ToBase64String([1])));
        Assert.True(approved.IsSampleEligible);

        var ownerError = await Assert.ThrowsAsync<ApiException>(() => harness.PetAdmin.UpdateSampleEligibilityAsync(
            harness.OwnerId,
            harness.MiloId,
            new UpdateSamplePetEligibilityRequest(false, Convert.ToBase64String([1]))));
        Assert.Equal(403, ownerError.StatusCode);

        var settings = await harness.Db.PublicSiteSettings.SingleAsync();
        settings.FeaturedSamplePetId = harness.TopuId;
        await harness.Db.SaveChangesAsync();
        var conflict = await Assert.ThrowsAsync<ApiException>(() => harness.PetAdmin.UpdateSampleEligibilityAsync(
            harness.AdminUserId,
            harness.TopuId,
            new UpdateSamplePetEligibilityRequest(false, Convert.ToBase64String([1]))));
        Assert.Equal(409, conflict.StatusCode);
        Assert.Equal("featured_sample_pet_in_use", conflict.Code);
    }

    private sealed class Harness : IDisposable
    {
        public Guid AdminUserId { get; } = Guid.Parse("10000000-0000-0000-0000-000000000001");
        public Guid OwnerId { get; } = Guid.Parse("20000000-0000-0000-0000-000000000002");
        public Guid TopuId { get; } = Guid.Parse("30000000-0000-0000-0000-000000000003");
        public Guid MiloId { get; } = Guid.Parse("30000000-0000-0000-0000-000000000004");
        public Guid CustomerPetId { get; } = Guid.Parse("30000000-0000-0000-0000-000000000005");
        public Guid ArchivedPetId { get; } = Guid.Parse("30000000-0000-0000-0000-000000000006");
        public Guid DeletedPetId { get; } = Guid.Parse("30000000-0000-0000-0000-000000000007");
        public MyPetLinkDbContext Db { get; }
        public AdminSampleExperienceService Admin { get; }
        public PublicSampleExperienceService Public { get; }
        public AdminPetProfileQueryService PetAdmin { get; }

        private Harness(MyPetLinkDbContext db)
        {
            Db = db;
            var r2 = Options.Create(new CloudflareR2Options { PublicBaseUrl = "https://media.example.test" });
            Admin = new AdminSampleExperienceService(
                db,
                new AuditLogService(db, new HttpContextAccessor()),
                TimeProvider.System,
                r2);
            Public = new PublicSampleExperienceService(
                db,
                new PublicProfileService(db, r2),
                new QrSafetyService(db, r2));
            PetAdmin = new AdminPetProfileQueryService(
                db,
                new AuditLogService(db, new HttpContextAccessor()),
                r2);
        }

        public static async Task<Harness> CreateAsync()
        {
            var db = new MyPetLinkDbContext(new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N")).Options);
            var harness = new Harness(db);
            var adminUser = new User
            {
                Id = harness.AdminUserId,
                Email = "admin@example.test",
                NormalizedEmail = "ADMIN@EXAMPLE.TEST",
                DisplayName = "Sample Admin",
            };
            adminUser.AdminUser = new AdminUser { UserId = adminUser.Id, User = adminUser, IsActive = true };
            var owner = new User
            {
                Id = harness.OwnerId,
                Email = "owner-private@example.test",
                NormalizedEmail = "OWNER-PRIVATE@EXAMPLE.TEST",
                DisplayName = "Private Owner",
                Status = UserStatus.Active,
            };
            var topu = Pet(harness.TopuId, owner, "Topu", "topu", "PUBTOPU", "safe-topu", true, PetLifecycleStatus.Active);
            var milo = Pet(harness.MiloId, owner, "Milo", "milo", "PUBMILO", "safe-milo", true, PetLifecycleStatus.Active);
            var customer = Pet(harness.CustomerPetId, owner, "Customer Pet", "customer", "PUBCUSTOMER", "safe-customer", false, PetLifecycleStatus.Active);
            var archived = Pet(harness.ArchivedPetId, owner, "Archived Demo", "archived", "PUBARCHIVED", "safe-archived", true, PetLifecycleStatus.Archived);
            var deleted = Pet(harness.DeletedPetId, owner, "Deleted Demo", "deleted", "PUBDELETED", "safe-deleted", true, PetLifecycleStatus.Active);
            deleted.DeletedAt = DateTimeOffset.UtcNow;

            db.Users.AddRange(adminUser, owner);
            db.Pets.AddRange(topu, milo, customer, archived, deleted);
            db.PublicSiteSettings.Add(new PublicSiteSetting
            {
                Id = PublicSampleExperienceService.SettingsId,
                RowVersion = [1],
            });
            await db.SaveChangesAsync();
            return harness;
        }

        private static Pet Pet(Guid id, User owner, string name, string slug, string publicCode, string safetyCode, bool eligible, PetLifecycleStatus lifecycle)
        {
            var pet = new Pet
            {
                Id = id,
                OwnerUser = owner,
                OwnerUserId = owner.Id,
                Name = name,
                Slug = slug,
                Species = "Dog",
                Breed = "Mixed",
                LifecycleStatus = lifecycle,
                IsSampleEligible = eligible,
                RowVersion = [1],
            };
            pet.PublicProfile = new PetPublicProfile
            {
                Pet = pet,
                PetId = pet.Id,
                IsPublicProfileEnabled = true,
                PublicCode = publicCode,
                SlugSnapshot = slug,
                ShowOwnerName = false,
                ShowGeneralArea = false,
                ShowMoments = false,
                ShowTimeline = false,
            };
            pet.SafetySetting = new PetSafetySetting
            {
                Pet = pet,
                PetId = pet.Id,
                QrSafetyEnabled = true,
                SafetyCode = safetyCode,
                ShowPhone = false,
                ShowWhatsapp = false,
            };
            return pet;
        }

        public void Dispose() => Db.Dispose();
    }
}
