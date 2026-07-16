using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests;

public sealed class PetLostModeTests
{
    private static readonly Guid OwnerId = Guid.Parse("91111111-1111-1111-1111-111111111111");
    private static readonly Guid OtherOwnerId = Guid.Parse("91111111-1111-1111-1111-111111111112");
    private static readonly Guid PetId = Guid.Parse("92222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task LostModeEndpoint_EnablesAndReturnsThePersistedState()
    {
        using var harness = await PetHarness.CreateAsync();
        var controller = new PetsController(
            harness.Service,
            new TestCurrentUserService(OwnerId))
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext()
            }
        };
        var lastSeen = new DateTimeOffset(2026, 7, 16, 9, 30, 0, TimeSpan.FromHours(8));

        var result = await controller.LostMode(
            PetId,
            Request(true, lastSeen),
            CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result);
        var envelope = Assert.IsType<ApiResponse<PetDetailResponse>>(ok.Value);
        var saved = await harness.Db.Pets.SingleAsync(item => item.Id == PetId);

        Assert.True(envelope.Data.LostModeEnabled);
        Assert.True(saved.LostModeEnabled);
        Assert.Equal("Petaling Jaya", envelope.Data.LostLastSeenArea);
        Assert.Equal(lastSeen, saved.LostLastSeenDateTime);
        Assert.Equal("Please call the owner.", saved.LostMessage);
        Assert.Equal("default", saved.ProfileTheme);
        Assert.Equal("A friendly cat.", saved.Bio);
    }

    [Fact]
    public async Task UpdateLostModeAsync_DisablesAndReloadsAsOff()
    {
        using var harness = await PetHarness.CreateAsync();
        await harness.Service.UpdateLostModeAsync(
            OwnerId,
            PetId,
            Request(true),
            CancellationToken.None);

        var response = await harness.Service.UpdateLostModeAsync(
            OwnerId,
            PetId,
            Request(false),
            CancellationToken.None);
        var reloaded = await harness.Service.GetAsync(OwnerId, PetId);

        Assert.False(response.LostModeEnabled);
        Assert.False(reloaded.LostModeEnabled);
        Assert.False((await harness.Db.Pets.SingleAsync()).LostModeEnabled);
    }

    [Fact]
    public async Task UpdateLostModeAsync_UsesPrivacyPreservingNotFoundForAnotherOwner()
    {
        using var harness = await PetHarness.CreateAsync();

        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.UpdateLostModeAsync(
                OtherOwnerId,
                PetId,
                Request(true),
                CancellationToken.None));

        Assert.Equal(StatusCodes.Status404NotFound, exception.StatusCode);
        Assert.Equal("not_found", exception.Code);
        Assert.False((await harness.Db.Pets.SingleAsync()).LostModeEnabled);
    }

    [Fact]
    public async Task PublicAndQrProfiles_UseTheSameSavedLostModeState()
    {
        using var harness = await PetHarness.CreateAsync();
        var publicService = new PublicProfileService(
            harness.Db,
            Options.Create(new CloudflareR2Options()));
        var safetyService = new QrSafetyService(
            harness.Db,
            Options.Create(new CloudflareR2Options()));

        await harness.Service.UpdateLostModeAsync(
            OwnerId,
            PetId,
            Request(true),
            CancellationToken.None);

        var lostPublic = await publicService.GetByPublicSlugAsync("topu-pub123");
        Assert.True(lostPublic.LostModeEnabled);
        Assert.Equal("Please call the owner.", lostPublic.LostMessage);
        Assert.True((await safetyService.GetBySafetyCodeAsync("safe-topu")).LostModeEnabled);

        await harness.Service.UpdateLostModeAsync(
            OwnerId,
            PetId,
            Request(false),
            CancellationToken.None);

        var foundPublic = await publicService.GetByPublicSlugAsync("topu-pub123");
        Assert.False(foundPublic.LostModeEnabled);
        Assert.Null(foundPublic.LostMessage);
        Assert.False((await safetyService.GetBySafetyCodeAsync("safe-topu")).LostModeEnabled);
    }

    private static UpdateLostModeRequest Request(
        bool enabled,
        DateTimeOffset? lastSeen = null) =>
        new(
            enabled,
            "  Petaling Jaya  ",
            lastSeen,
            "  Please call the owner.  ",
            "  Reward offered  ",
            "  WhatsApp first  ");

    private sealed class TestCurrentUserService : ICurrentUserService
    {
        public TestCurrentUserService(Guid userId)
        {
            Current = new CurrentUser(userId, "owner@example.com", ["Owner"]);
        }

        public CurrentUser Current { get; }
    }

    private sealed class PetHarness : IDisposable
    {
        private PetHarness(MyPetLinkDbContext db)
        {
            Db = db;
            Service = new PetService(
                db,
                Options.Create(new CloudflareR2Options
                {
                    PublicBaseUrl = "https://media.mypetlink.test"
                }));
        }

        public MyPetLinkDbContext Db { get; }
        public PetService Service { get; }

        public static async Task<PetHarness> CreateAsync()
        {
            var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
                .Options;
            var db = new MyPetLinkDbContext(options);
            var planId = Guid.Parse("93333333-3333-3333-3333-333333333333");
            var plan = new Plan
            {
                Id = planId,
                Code = "Free",
                Name = "Free Plan",
                PriceLabel = "RM0",
                Limit = new PlanLimit { PlanId = planId, MaxPets = 3 }
            };
            var owner = new User
            {
                Id = OwnerId,
                Email = "owner@example.com",
                NormalizedEmail = "OWNER@EXAMPLE.COM",
                DisplayName = "Owner",
                Status = UserStatus.Active
            };
            owner.OwnerProfile = new OwnerProfile
            {
                UserId = OwnerId,
                PlanId = planId,
                OwnerDisplayName = "Owner",
                User = owner,
                Plan = plan
            };
            var pet = new Pet
            {
                Id = PetId,
                OwnerUserId = OwnerId,
                OwnerUser = owner,
                Slug = "topu-pub123",
                Name = "Topu",
                Species = "Cat",
                Bio = "A friendly cat.",
                ProfileTheme = "default",
                LifecycleStatus = PetLifecycleStatus.Active,
                PublicProfile = new PetPublicProfile
                {
                    PublicCode = "pub123",
                    SlugSnapshot = "topu-pub123",
                    IsPublicProfileEnabled = true
                },
                SafetySetting = new PetSafetySetting
                {
                    SafetyCode = "safe-topu",
                    QrSafetyEnabled = true
                }
            };

            db.Plans.Add(plan);
            db.Users.Add(owner);
            db.Pets.Add(pet);
            await db.SaveChangesAsync();
            return new PetHarness(db);
        }

        public void Dispose() => Db.Dispose();
    }
}
