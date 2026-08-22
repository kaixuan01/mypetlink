using System.Text.Json;
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
    public async Task CreateAsync_WithoutVisibilityUsesBackendProductDefaults()
    {
        using var harness = await Harness.CreateAsync(includePet: false);

        var created = await harness.Pets.CreateAsync(OwnerId, CreateRequest());

        Assert.Equal(ProductDefaultVisibility(), created.Visibility);
    }

    [Fact]
    public async Task CreateAsync_StoredOwnerPrivacyDefaultsDoNotAffectNewPet()
    {
        const string storedOwnerDefaults =
            "{\"showOwnerName\":true,\"showGeneralArea\":false,\"showPhone\":true," +
            "\"showWhatsapp\":false,\"showEmergencyNote\":false,\"showCareBadges\":false," +
            "\"showMoments\":false,\"showTimeline\":false,\"showBirthdayOnTimeline\":true," +
            "\"showAdoptionDayOnTimeline\":true,\"showHealthSummary\":true," +
            "\"showAllergiesOnPublicProfile\":true}";
        using var harness = await Harness.CreateAsync(
            includePet: false,
            privacyDefaultsJson: storedOwnerDefaults);

        var created = await harness.Pets.CreateAsync(OwnerId, CreateRequest());

        Assert.Equal(ProductDefaultVisibility(), created.Visibility);
        Assert.Equal(
            storedOwnerDefaults,
            (await harness.Db.OwnerProfiles.SingleAsync()).PrivacyDefaultsJson);
    }

    [Fact]
    public async Task CreateAsync_ExplicitVisibilityRemainsAuthoritative()
    {
        using var harness = await Harness.CreateAsync(includePet: false);
        var explicitVisibility = new PetVisibilityRequest(
            ShowOwnerName: true,
            ShowGeneralArea: false,
            ShowPhone: true,
            ShowWhatsapp: false,
            ShowEmergencyNote: false,
            ShowCareBadges: false,
            ShowMoments: false,
            ShowTimeline: false,
            ShowBirthdayOnTimeline: true,
            ShowAdoptionDayOnTimeline: true,
            ShowHealthSummary: true,
            ShowAllergiesOnPublicProfile: true);

        var created = await harness.Pets.CreateAsync(
            OwnerId,
            CreateRequest(explicitVisibility));

        Assert.Equal(
            new PetVisibilityResponse(
                true,
                false,
                true,
                false,
                false,
                false,
                false,
                false,
                true,
                true,
                true,
                true),
            created.Visibility);
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
    public async Task UpdateAsync_PartialNameAndSpeciesUpdatePreservesOptionalFields()
    {
        using var harness = await Harness.CreateAsync();

        await harness.Pets.UpdateAsync(
            OwnerId,
            PetId,
            PartialUpdate());

        var saved = await harness.Db.Pets.SingleAsync(item => item.Id == PetId);
        Assert.Equal("Canine", saved.CustomSpecies);
        Assert.Equal("Mixed breed", saved.Breed);
        Assert.Equal("Male", saved.Gender);
        Assert.Equal("Brown", saved.Color);
        Assert.Equal(new DateOnly(2024, 1, 2), saved.AdoptionDay);
        Assert.Equal("Petaling Jaya", saved.GeneralArea);
        Assert.Equal("Saved bio", saved.Bio);
        Assert.Equal("Saved safety note", saved.SafetyNote);
        Assert.Equal("Saved emergency note", saved.EmergencyNote);
    }

    [Fact]
    public async Task UpdateAsync_FullProfileRoundTripPreservesAdoptionDay()
    {
        using var harness = await Harness.CreateAsync();
        var adoptionDay = new DateOnly(2020, 9, 2);

        await harness.Pets.UpdateAsync(
            OwnerId,
            PetId,
            FullUpdate() with { AdoptionDay = adoptionDay });

        var saved = await harness.Db.Pets.SingleAsync(item => item.Id == PetId);
        Assert.Equal(adoptionDay, saved.AdoptionDay);
    }

    [Fact]
    public async Task UpdateAsync_LegacyPartialCallerKeepsExistingProfileData()
    {
        using var harness = await Harness.CreateAsync();

        await harness.Pets.UpdateAsync(
            OwnerId,
            PetId,
            PartialUpdate() with
            {
                Name = null,
                Species = null,
                QrSafetyEnabled = false,
                CompleteProfile = false
            });

        var saved = await harness.Db.Pets.SingleAsync(item => item.Id == PetId);
        Assert.Equal("Saved bio", saved.Bio);
        Assert.Equal(new DateOnly(2024, 1, 2), saved.AdoptionDay);
        Assert.False(saved.SafetySetting!.QrSafetyEnabled);
    }

    [Fact]
    public void PublicCareSummaryResponse_ContainsOnlyTypeAndRecordDate()
    {
        Assert.Equal(
            ["RecordDate", "Type"],
            typeof(PublicCareSummaryResponse)
                .GetProperties()
                .Select(property => property.Name)
                .OrderBy(name => name)
                .ToArray());
    }

    [Fact]
    public async Task PublicProfile_ShowHealthSummaryNeverChangesCareJsonShape()
    {
        using var harness = await Harness.CreateAsync(showHealthSummary: false);

        var disabled = Assert.Single(
            (await harness.PublicProfiles.GetByPublicSlugAsync("milo-pub123")).CareRecords);
        var disabledJson = Serialize(disabled);

        Assert.Equal("VetVisit", disabled.Type);
        Assert.Equal(new DateOnly(2026, 8, 1), disabled.RecordDate);
        Assert.Equal(["recordDate", "type"], JsonPropertyNames(disabled));
        AssertPublicCareJsonOmitsPrivateFields(disabledJson);

        var profile = await harness.Db.PetPublicProfiles.SingleAsync();
        profile.ShowHealthSummary = true;
        await harness.Db.SaveChangesAsync();

        var enabled = Assert.Single(
            (await harness.PublicProfiles.GetByPublicSlugAsync("milo-pub123")).CareRecords);
        var enabledJson = Serialize(enabled);

        Assert.Equal(["recordDate", "type"], JsonPropertyNames(enabled));
        AssertPublicCareJsonOmitsPrivateFields(enabledJson);
        Assert.Equal(disabledJson, enabledJson);
    }

    [Fact]
    public async Task PublicProfile_ShowCareBadgesIsTheMasterGateForEffectivePublicCare()
    {
        using var harness = await Harness.CreateAsync();
        harness.Db.CareRecords.AddRange(
            new CareRecord
            {
                PetId = PetId,
                Type = CareRecordType.Vaccine,
                Title = "Private vaccine",
                RecordDate = new DateOnly(2026, 7, 1),
                Notes = "Must remain private",
                PublicVisibility = CareRecordPublicVisibility.Private
            },
            new CareRecord
            {
                PetId = PetId,
                Type = CareRecordType.Grooming,
                Title = "Public grooming badge",
                RecordDate = new DateOnly(2026, 7, 2),
                Notes = "Must not be projected",
                PublicVisibility = CareRecordPublicVisibility.PublicBadgeOnly
            },
            new CareRecord
            {
                PetId = PetId,
                Type = CareRecordType.Deworming,
                Title = "Archived public badge",
                RecordDate = new DateOnly(2026, 7, 3),
                PublicVisibility = CareRecordPublicVisibility.PublicBadgeOnly,
                ArchivedAt = DateTimeOffset.UtcNow
            },
            new CareRecord
            {
                PetId = PetId,
                Type = CareRecordType.Medication,
                Title = "Deleted legacy details",
                RecordDate = new DateOnly(2026, 7, 4),
                PublicVisibility = CareRecordPublicVisibility.PublicDetails,
                DeletedAt = DateTimeOffset.UtcNow
            });
        await harness.Db.SaveChangesAsync();

        var enabled = await harness.PublicProfiles.GetByPublicSlugAsync("milo-pub123");
        var visible = enabled.CareRecords
            .OrderBy(record => record.RecordDate)
            .ToArray();

        Assert.True(enabled.ShowCareBadges);
        Assert.Equal(2, visible.Length);
        Assert.Equal(
            [new DateOnly(2026, 7, 2), new DateOnly(2026, 8, 1)],
            visible.Select(record => record.RecordDate).ToArray());
        Assert.All(visible, record => Assert.Equal(["recordDate", "type"], JsonPropertyNames(record)));

        var profile = await harness.Db.PetPublicProfiles.SingleAsync();
        profile.ShowCareBadges = false;
        await harness.Db.SaveChangesAsync();

        var disabled = await harness.PublicProfiles.GetByPublicSlugAsync("milo-pub123");
        Assert.False(disabled.ShowCareBadges);
        Assert.Empty(disabled.CareRecords);
    }

    [Fact]
    public async Task PublicProfile_ShowCareBadgesTrueWithNoEligibleRecordsKeepsFlagTrue()
    {
        using var harness = await Harness.CreateAsync();
        var record = await harness.Db.CareRecords.SingleAsync();
        record.PublicVisibility = CareRecordPublicVisibility.Private;
        await harness.Db.SaveChangesAsync();

        var response = await harness.PublicProfiles.GetByPublicSlugAsync("milo-pub123");

        Assert.True(response.ShowCareBadges);
        Assert.Empty(response.CareRecords);
        var json = JsonSerializer.Serialize(
            response,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.Contains("\"showCareBadges\":true", json, StringComparison.Ordinal);
    }

    [Fact]
    public async Task PublicProfile_ExposesSavedTimelineVisibilityWithoutInferringFromBirthday()
    {
        using var harness = await Harness.CreateAsync();
        var pet = await harness.Db.Pets.SingleAsync();
        var profile = await harness.Db.PetPublicProfiles.SingleAsync();
        pet.Birthday = new DateOnly(2021, 9, 15);
        profile.ShowTimeline = true;
        profile.ShowBirthdayOnTimeline = false;
        await harness.Db.SaveChangesAsync();

        var birthdayHidden = await harness.PublicProfiles.GetByPublicSlugAsync("milo-pub123");
        Assert.Equal(new DateOnly(2021, 9, 15), birthdayHidden.Birthday);
        Assert.True(birthdayHidden.ShowTimeline);
        Assert.False(birthdayHidden.ShowBirthdayOnTimeline);

        profile.ShowTimeline = false;
        profile.ShowBirthdayOnTimeline = true;
        await harness.Db.SaveChangesAsync();

        var timelineHidden = await harness.PublicProfiles.GetByPublicSlugAsync("milo-pub123");
        Assert.False(timelineHidden.ShowTimeline);
        Assert.True(timelineHidden.ShowBirthdayOnTimeline);

        var json = JsonSerializer.Serialize(
            timelineHidden,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.Contains("\"showTimeline\":false", json);
        Assert.Contains("\"showBirthdayOnTimeline\":true", json);
    }

    private static string Serialize(PublicCareSummaryResponse response)
    {
        return JsonSerializer.Serialize(
            response,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
    }

    private static string[] JsonPropertyNames(PublicCareSummaryResponse response)
    {
        using var document = JsonDocument.Parse(Serialize(response));
        return document.RootElement
            .EnumerateObject()
            .Select(property => property.Name)
            .OrderBy(name => name)
            .ToArray();
    }

    private static void AssertPublicCareJsonOmitsPrivateFields(string json)
    {
        Assert.DoesNotContain("title", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("notes", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("provider", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("dueDate", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("publicVisibility", json, StringComparison.OrdinalIgnoreCase);
    }

    private static CreatePetRequest CreateRequest(
        PetVisibilityRequest? visibility = null) => new(
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
        Visibility: visibility,
        SafetyNote: null,
        EmergencyNote: null);

    private static PetVisibilityResponse ProductDefaultVisibility() => new(
        ShowOwnerName: false,
        ShowGeneralArea: true,
        ShowPhone: false,
        ShowWhatsapp: true,
        ShowEmergencyNote: true,
        ShowCareBadges: true,
        ShowMoments: true,
        ShowTimeline: true,
        ShowBirthdayOnTimeline: false,
        ShowAdoptionDayOnTimeline: false,
        ShowHealthSummary: false,
        ShowAllergiesOnPublicProfile: false);

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
        Allergies: [],
        CompleteProfile: true);

    private static UpdatePetRequest PartialUpdate() => FullUpdate() with
    {
        PersonalityTags = null,
        ProfileTheme = null,
        Contact = null,
        FavoriteFoods = null,
        FavoriteToys = null,
        Allergies = null,
        CompleteProfile = false
    };

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
            bool showHealthSummary = false,
            string privacyDefaultsJson = "{}")
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
                    PrivacyDefaultsJson = privacyDefaultsJson,
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
