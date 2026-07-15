using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using System.Text.Json;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests;

public sealed class PetAllergyFieldsTests
{
    private static readonly Guid OwnerId = Guid.Parse("81111111-1111-1111-1111-111111111111");
    private static readonly Guid OtherOwnerId = Guid.Parse("81111111-1111-1111-1111-111111111112");
    private static readonly Guid PetId = Guid.Parse("82222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task UpdateAsync_NormalizesPersistsAndReturnsAllergies()
    {
        using var harness = await PetHarness.CreateAsync();
        var longValue = new string('x', 100);

        var response = await harness.Service.UpdateAsync(
            OwnerId,
            PetId,
            UpdateRequest([" Chicken ", "chicken", "Penicillin 💊", "花粉", longValue]));
        var saved = await harness.Db.Pets.SingleAsync(item => item.Id == PetId);
        var reloaded = await harness.Service.GetAsync(OwnerId, PetId);

        Assert.Equal(["Chicken", "Penicillin 💊", "花粉", new string('x', 80)], response.Allergies);
        Assert.Equal(response.Allergies, JsonSerializer.Deserialize<string[]>(saved.AllergiesJson));
        Assert.Equal(response.Allergies, reloaded.Allergies);
    }

    [Fact]
    public async Task UpdateAsync_EmptyClearsAndNullLeavesSavedAllergiesUnchanged()
    {
        using var harness = await PetHarness.CreateAsync("""["Chicken"]""");

        var unchanged = await harness.Service.UpdateAsync(OwnerId, PetId, UpdateRequest(null));
        Assert.Equal(["Chicken"], unchanged.Allergies);

        var cleared = await harness.Service.UpdateAsync(OwnerId, PetId, UpdateRequest([]));
        Assert.Empty(cleared.Allergies);
        Assert.Equal("[]", (await harness.Db.Pets.SingleAsync()).AllergiesJson);
    }

    [Fact]
    public async Task Detail_InvalidAllergyJsonSafelyReturnsAnEmptyList()
    {
        using var harness = await PetHarness.CreateAsync("not-json");

        var response = await harness.Service.GetAsync(OwnerId, PetId);

        Assert.Empty(response.Allergies);
    }

    [Fact]
    public async Task CreateAsync_SavesNormalizedAllergies()
    {
        using var harness = await PetHarness.CreateAsync();

        var response = await harness.Service.CreateAsync(
            OwnerId,
            CreateRequest([" Beef ", "beef", "Dairy"]));

        Assert.Equal(["Beef", "Dairy"], response.Allergies);
        Assert.Equal(
            ["Beef", "Dairy"],
            JsonSerializer.Deserialize<string[]>((await harness.Db.Pets.SingleAsync(item => item.Id == response.Id)).AllergiesJson));
    }

    [Fact]
    public async Task UpdateAsync_AnotherOwnerGetsPrivacyPreservingNotFound()
    {
        using var harness = await PetHarness.CreateAsync();

        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.UpdateAsync(OtherOwnerId, PetId, UpdateRequest(["Chicken"])));

        Assert.Equal(StatusCodes.Status404NotFound, exception.StatusCode);
        Assert.Equal("not_found", exception.Code);
    }

    [Fact]
    public async Task PublicProfile_UsesHealthVisibilityWhileQrSafetyAlwaysReturnsAllergies()
    {
        using var hiddenHarness = await PetHarness.CreateAsync(
            """["Chicken","Penicillin"]""",
            showHealthSummary: false);
        var publicService = new PublicProfileService(
            hiddenHarness.Db,
            Options.Create(new CloudflareR2Options()));
        var safetyService = new QrSafetyService(
            hiddenHarness.Db,
            Options.Create(new CloudflareR2Options()));

        var hiddenPublic = await publicService.GetByPublicSlugAsync("topu-pub123");
        var safety = await safetyService.GetBySafetyCodeAsync("safe-topu");

        Assert.Empty(hiddenPublic.Allergies);
        Assert.Equal(["Chicken", "Penicillin"], safety.Allergies);

        var profile = await hiddenHarness.Db.PetPublicProfiles.SingleAsync();
        profile.ShowHealthSummary = true;
        await hiddenHarness.Db.SaveChangesAsync();

        var visiblePublic = await publicService.GetByPublicSlugAsync("topu-pub123");
        Assert.Equal(["Chicken", "Penicillin"], visiblePublic.Allergies);
    }

    private static CreatePetRequest CreateRequest(IReadOnlyList<string>? allergies)
    {
        return new CreatePetRequest(
            Name: "Topu Junior",
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
            ProfileTheme: null,
            Contact: null,
            Visibility: null,
            SafetyNote: null,
            EmergencyNote: null,
            Allergies: allergies);
    }

    private static UpdatePetRequest UpdateRequest(IReadOnlyList<string>? allergies)
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
            ProfileTheme: null,
            Contact: null,
            Visibility: null,
            SafetyNote: null,
            EmergencyNote: null,
            Allergies: allergies);
    }

    private sealed class PetHarness : IDisposable
    {
        private PetHarness(MyPetLinkDbContext db)
        {
            Db = db;
            Service = new PetService(db, Options.Create(new CloudflareR2Options()));
        }

        public MyPetLinkDbContext Db { get; }
        public PetService Service { get; }

        public static async Task<PetHarness> CreateAsync(
            string allergiesJson = "[]",
            bool showHealthSummary = false)
        {
            var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
                .Options;
            var db = new MyPetLinkDbContext(options);
            var plan = new Plan
            {
                Code = "Free",
                Name = "Free",
                PriceLabel = "RM0",
                Limit = new PlanLimit
                {
                    MaxPets = 10,
                    MaxMemoriesPerPet = 10,
                    MaxMediaPerMemory = 4,
                    MaxFamilyMembers = 1,
                    MaxCareRecords = 100,
                    ScanHistoryDays = 0
                }
            };
            var owner = new User
            {
                Id = OwnerId,
                Email = "owner@example.com",
                NormalizedEmail = "OWNER@EXAMPLE.COM",
                DisplayName = "Owner",
                Status = UserStatus.Active,
                OwnerProfile = new OwnerProfile
                {
                    UserId = OwnerId,
                    OwnerDisplayName = "Owner",
                    DefaultGeneralArea = "Petaling Jaya",
                    Plan = plan
                }
            };
            var pet = new Pet
            {
                Id = PetId,
                OwnerUserId = OwnerId,
                OwnerUser = owner,
                Slug = "topu-pub123",
                Name = "Topu",
                Species = "Cat",
                AllergiesJson = allergiesJson,
                PublicProfile = new PetPublicProfile
                {
                    PublicCode = "pub123",
                    SlugSnapshot = "topu-pub123",
                    IsPublicProfileEnabled = true,
                    ShowHealthSummary = showHealthSummary
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
