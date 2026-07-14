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

public sealed class PetProfileThemeTests
{
    private static readonly Guid UserId = Guid.Parse("81111111-1111-1111-1111-111111111111");
    private static readonly Guid OtherUserId = Guid.Parse("81111111-1111-1111-1111-111111111112");
    private static readonly Guid PetId = Guid.Parse("82222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task CreateAsync_PersistsAndReturnsTheSelectedTheme()
    {
        using var harness = await PetHarness.CreateAsync();

        var response = await harness.Pets.CreateAsync(
            UserId,
            CreateRequest("Lavender pet", "lavender"));
        var saved = await harness.Db.Pets.SingleAsync(pet => pet.Id == response.Id);

        Assert.Equal("lavender", response.ProfileTheme);
        Assert.Equal("lavender", saved.ProfileTheme);
    }

    [Fact]
    public async Task UpdateAsync_PersistsAndReturnsTheThemeOnReload()
    {
        using var harness = await PetHarness.CreateAsync(profileTheme: "mint");

        var updated = await harness.Pets.UpdateAsync(
            UserId,
            PetId,
            UpdateRequest("peach"));
        var reloaded = await harness.Pets.GetAsync(UserId, PetId);
        var saved = await harness.Db.Pets.SingleAsync(pet => pet.Id == PetId);

        Assert.Equal("peach", updated.ProfileTheme);
        Assert.Equal("peach", reloaded.ProfileTheme);
        Assert.Equal("peach", saved.ProfileTheme);
    }

    [Fact]
    public async Task UpdateAsync_NullThemeLeavesTheSavedThemeUnchanged()
    {
        using var harness = await PetHarness.CreateAsync(profileTheme: "sky");

        var response = await harness.Pets.UpdateAsync(
            UserId,
            PetId,
            UpdateRequest(null));

        Assert.Equal("sky", response.ProfileTheme);
        Assert.Equal("sky", (await harness.Db.Pets.SingleAsync(pet => pet.Id == PetId)).ProfileTheme);
    }

    [Fact]
    public async Task PublicAndQrSafetyDtos_ReturnTheSameSavedTheme()
    {
        using var harness = await PetHarness.CreateAsync(profileTheme: "lavender");

        var publicProfile = await harness.PublicProfiles.GetByPublicSlugAsync("topu-pub123");
        var safetyProfile = await harness.QrSafety.GetBySafetyCodeAsync("safe-topu");

        Assert.Equal("lavender", publicProfile.ProfileTheme);
        Assert.Equal(publicProfile.ProfileTheme, safetyProfile.ProfileTheme);
    }

    [Fact]
    public async Task UpdateAsync_UsesPrivacyPreservingNotFoundForAnotherOwner()
    {
        using var harness = await PetHarness.CreateAsync(profileTheme: "mint");

        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Pets.UpdateAsync(
                OtherUserId,
                PetId,
                UpdateRequest("peach")));

        Assert.Equal(StatusCodes.Status404NotFound, exception.StatusCode);
        Assert.Equal("not_found", exception.Code);
        Assert.Equal("mint", (await harness.Db.Pets.SingleAsync(pet => pet.Id == PetId)).ProfileTheme);
    }

    private static CreatePetRequest CreateRequest(string name, string? profileTheme)
    {
        return new CreatePetRequest(
            Name: name,
            Species: "Cat",
            CustomSpecies: null,
            Breed: null,
            Gender: null,
            Color: null,
            AgeInformationMode: null,
            Birthday: null,
            EstimatedBirthYear: null,
            AdoptionDay: null,
            GeneralArea: null,
            Bio: null,
            PersonalityTags: null,
            ProfileTheme: profileTheme,
            Contact: null,
            Visibility: null,
            SafetyNote: null,
            EmergencyNote: null);
    }

    private static UpdatePetRequest UpdateRequest(string? profileTheme)
    {
        return new UpdatePetRequest(
            Name: null,
            Species: null,
            CustomSpecies: null,
            Breed: null,
            Gender: null,
            Color: null,
            AgeInformationMode: null,
            Birthday: null,
            EstimatedBirthYear: null,
            AdoptionDay: null,
            GeneralArea: null,
            Bio: null,
            PersonalityTags: null,
            ProfileTheme: profileTheme,
            Contact: null,
            Visibility: null,
            SafetyNote: null,
            EmergencyNote: null);
    }

    private sealed class PetHarness : IDisposable
    {
        private PetHarness(MyPetLinkDbContext db)
        {
            Db = db;
            var r2 = Options.Create(new CloudflareR2Options
            {
                PublicBaseUrl = "https://media.mypetlink.test"
            });
            Pets = new PetService(db, r2);
            PublicProfiles = new PublicProfileService(db, r2);
            QrSafety = new QrSafetyService(db, r2);
        }

        public MyPetLinkDbContext Db { get; }

        public PetService Pets { get; }

        public PublicProfileService PublicProfiles { get; }

        public QrSafetyService QrSafety { get; }

        public static async Task<PetHarness> CreateAsync(string profileTheme = "default")
        {
            var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
                .Options;
            var db = new MyPetLinkDbContext(options);
            var owner = new User
            {
                Id = UserId,
                Email = "owner@example.com",
                NormalizedEmail = "OWNER@EXAMPLE.COM",
                DisplayName = "Owner",
                Status = UserStatus.Active,
                OwnerProfile = new OwnerProfile
                {
                    UserId = UserId,
                    OwnerDisplayName = "Owner",
                    DefaultGeneralArea = "Petaling Jaya",
                    Plan = new Plan
                    {
                        Code = "free",
                        Name = "Free",
                        PriceLabel = "RM0",
                        Limit = new PlanLimit
                        {
                            MaxPets = 3,
                            MaxMemoriesPerPet = 10,
                            MaxMediaPerMemory = 4,
                            MaxFamilyMembers = 1,
                            MaxCareRecords = 100,
                            ScanHistoryDays = 0
                        }
                    }
                }
            };
            var pet = new Pet
            {
                Id = PetId,
                OwnerUserId = UserId,
                OwnerUser = owner,
                Slug = "topu-pub123",
                Name = "Topu",
                Species = "Cat",
                ProfileTheme = profileTheme,
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

            db.Users.Add(owner);
            db.Pets.Add(pet);
            await db.SaveChangesAsync();

            return new PetHarness(db);
        }

        public void Dispose()
        {
            Db.Dispose();
        }
    }
}
