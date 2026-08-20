using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests;

public sealed class PetTruthAndPublicCareTests
{
    private static readonly Guid OwnerId = Guid.Parse("92111111-1111-1111-1111-111111111111");
    private static readonly Guid PetId = Guid.Parse("92222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task CreateAsync_BlankOptionalFieldsPersistAsNull()
    {
        using var harness = await Harness.CreateAsync(includePet: false);

        var created = await harness.Pets.CreateAsync(
            OwnerId,
            new CreatePetRequest(
                Name: "Milo",
                Species: "Dog",
                CustomSpecies: " ",
                Breed: " ",
                Gender: "",
                Color: "  ",
                AgeInformationMode: PetAgeMode.Unknown,
                Birthday: null,
                EstimatedBirthYear: null,
                AdoptionDay: null,
                GeneralArea: " ",
                Bio: "",
                PersonalityTags: [],
                ProfileTheme: "default",
                Contact: new PetContactRequest(true, null, null, null, null, null),
                Visibility: null,
                SafetyNote: " ",
                EmergencyNote: ""));

        var saved = await harness.Db.Pets.SingleAsync(item => item.Id == created.Id);
        Assert.Null(saved.CustomSpecies);
        Assert.Null(saved.Breed);
        Assert.Null(saved.Gender);
        Assert.Null(saved.Color);
        Assert.Null(saved.GeneralArea);
        Assert.Null(saved.Bio);
        Assert.Null(saved.SafetyNote);
        Assert.Null(saved.EmergencyNote);
    }

    [Fact]
    public async Task UpdateAsync_FullProfileSaveCanClearOptionalFieldsWithNull()
    {
        using var harness = await Harness.CreateAsync();

        await harness.Pets.UpdateAsync(OwnerId, PetId, FullUpdate());

        var saved = await harness.Db.Pets.SingleAsync(item => item.Id == PetId);
        Assert.Null(saved.CustomSpecies);
        Assert.Null(saved.Breed);
        Assert.Null(saved.Gender);
        Assert.Null(saved.Color);
        Assert.Null(saved.AdoptionDay);
        Assert.Null(saved.GeneralArea);
        Assert.Null(saved.Bio);
        Assert.Null(saved.SafetyNote);
        Assert.Null(saved.EmergencyNote);
    }

    [Fact]
    public async Task PublicProfile_RemovesProviderAndRequiresBothVisibilityLevelsForDetails()
    {
        using var harness = await Harness.CreateAsync(showHealthSummary: false);

        var restricted = await harness.PublicProfiles.GetByPublicSlugAsync("milo-pub123");
        var restrictedRecord = Assert.Single(restricted.CareRecords);
        var restrictedJson = Serialize(restrictedRecord);

        Assert.Null(restrictedRecord.Title);
        Assert.Null(restrictedRecord.Notes);
        Assert.DoesNotContain("provider", restrictedJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("notes", restrictedJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("title", restrictedJson, StringComparison.OrdinalIgnoreCase);

        var profile = await harness.Db.PetPublicProfiles.SingleAsync();
        profile.ShowHealthSummary = true;
        await harness.Db.SaveChangesAsync();

        var allowed = await harness.PublicProfiles.GetByPublicSlugAsync("milo-pub123");
        var allowedRecord = Assert.Single(allowed.CareRecords);
        var allowedJson = Serialize(allowedRecord);

        Assert.Equal("Annual check-up", allowedRecord.Title);
        Assert.Equal("Sensitive clinical note", allowedRecord.Notes);
        Assert.DoesNotContain("provider", allowedJson, StringComparison.OrdinalIgnoreCase);

        var record = await harness.Db.CareRecords.SingleAsync();
        record.PublicVisibility = CareRecordPublicVisibility.PublicBadgeOnly;
        await harness.Db.SaveChangesAsync();

        var badgeOnly = Assert.Single(
            (await harness.PublicProfiles.GetByPublicSlugAsync("milo-pub123")).CareRecords);
        Assert.Null(badgeOnly.Title);
        Assert.Null(badgeOnly.Notes);
    }

    private static string Serialize(PublicCareSummaryResponse response)
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new JsonStringEnumConverter());
        return JsonSerializer.Serialize(response, options);
    }

    private static UpdatePetRequest FullUpdate() => new(
        Name: "Milo",
        Species: "Dog",
        CustomSpecies: null,
        Breed: null,
        Gender: null,
        Color: null,
        AgeInformationMode: PetAgeMode.Unknown,
        Birthday: null,
        EstimatedBirthYear: null,
        AdoptionDay: null,
        GeneralArea: null,
        Bio: null,
        PersonalityTags: [],
        ProfileTheme: "default",
        Contact: new PetContactRequest(true, null, null, null, null, null),
        Visibility: null,
        SafetyNote: null,
        EmergencyNote: null,
        FavoriteFoods: [],
        FavoriteToys: [],
        Allergies: []);

    private sealed class Harness : IDisposable
    {
        private Harness(MyPetLinkDbContext db)
        {
            Db = db;
            Pets = new PetService(db, Options.Create(new CloudflareR2Options()));
            PublicProfiles = new PublicProfileService(db, Options.Create(new CloudflareR2Options()));
        }

        public MyPetLinkDbContext Db { get; }
        public PetService Pets { get; }
        public PublicProfileService PublicProfiles { get; }

        public static async Task<Harness> CreateAsync(
            bool includePet = true,
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

            db.Plans.Add(plan);
            db.Users.Add(owner);

            if (includePet)
            {
                var pet = new Pet
                {
                    Id = PetId,
                    OwnerUserId = OwnerId,
                    OwnerUser = owner,
                    Slug = "milo-pub123",
                    Name = "Milo",
                    Species = "Dog",
                    CustomSpecies = "Canine",
                    Breed = "Mixed breed",
                    Gender = "Male",
                    Color = "Brown",
                    AdoptionDay = new DateOnly(2024, 1, 2),
                    GeneralArea = "Petaling Jaya",
                    Bio = "Saved bio",
                    SafetyNote = "Saved safety note",
                    EmergencyNote = "Saved emergency note",
                    Contact = new PetContact
                    {
                        UseOwnerDefaults = true
                    },
                    PublicProfile = new PetPublicProfile
                    {
                        PublicCode = "pub123",
                        SlugSnapshot = "milo-pub123",
                        IsPublicProfileEnabled = true,
                        ShowCareBadges = true,
                        ShowHealthSummary = showHealthSummary
                    },
                    SafetySetting = new PetSafetySetting
                    {
                        SafetyCode = "safe-milo",
                        QrSafetyEnabled = true
                    }
                };
                pet.CareRecords.Add(new CareRecord
                {
                    Type = CareRecordType.VetVisit,
                    Title = "Annual check-up",
                    RecordDate = new DateOnly(2026, 8, 1),
                    Provider = "Private Veterinary Clinic",
                    Notes = "Sensitive clinical note",
                    PublicVisibility = CareRecordPublicVisibility.PublicDetails
                });
                db.Pets.Add(pet);
            }

            await db.SaveChangesAsync();
            return new Harness(db);
        }

        public void Dispose() => Db.Dispose();
    }
}
