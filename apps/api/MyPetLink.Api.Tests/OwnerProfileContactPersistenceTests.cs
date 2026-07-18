using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests;

public sealed class OwnerProfileContactPersistenceTests
{
    private static readonly Guid OwnerId = Guid.Parse("a1111111-1111-1111-1111-111111111111");
    private static readonly Guid PetId = Guid.Parse("a2222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task UpdateAsync_ClearsWhatsappAndKeepsPhone()
    {
        using var harness = await Harness.CreateAsync();

        var response = await harness.OwnerProfiles.UpdateAsync(
            OwnerId,
            Request(phone: "+60123334444", whatsapp: null));

        Assert.Equal("+60123334444", response.PhoneE164);
        Assert.Null(response.WhatsappE164);
        var saved = await harness.Db.Users.AsNoTracking().SingleAsync(user => user.Id == OwnerId);
        Assert.Equal("+60123334444", saved.PhoneE164);
        Assert.Null(saved.WhatsappE164);
    }

    [Fact]
    public async Task UpdateAsync_ClearsPhoneAndKeepsWhatsapp()
    {
        using var harness = await Harness.CreateAsync();

        var response = await harness.OwnerProfiles.UpdateAsync(
            OwnerId,
            Request(phone: null, whatsapp: "+60128889999"));

        Assert.Null(response.PhoneE164);
        Assert.Equal("+60128889999", response.WhatsappE164);
        var saved = await harness.Db.Users.AsNoTracking().SingleAsync(user => user.Id == OwnerId);
        Assert.Null(saved.PhoneE164);
        Assert.Equal("+60128889999", saved.WhatsappE164);
    }

    [Fact]
    public async Task UpdateAsync_WhitespaceClearsBothNumbersWithoutChangingOtherFields()
    {
        using var harness = await Harness.CreateAsync();

        var response = await harness.OwnerProfiles.UpdateAsync(
            OwnerId,
            Request(phone: "   ", whatsapp: "\t"));

        Assert.Null(response.PhoneE164);
        Assert.Null(response.WhatsappE164);
        Assert.Equal("Owner", response.DisplayName);
        Assert.Equal("Petaling Jaya", response.DefaultGeneralArea);

        var reloaded = await harness.OwnerProfiles.GetAsync(OwnerId);
        Assert.Null(reloaded.PhoneE164);
        Assert.Null(reloaded.WhatsappE164);
        Assert.Equal("Owner", reloaded.DisplayName);
        Assert.Equal("Petaling Jaya", reloaded.DefaultGeneralArea);
    }

    [Fact]
    public async Task SafetyProfile_UsesCurrentOwnerNumbersInsteadOfHistoricalPetCopies()
    {
        using var harness = await Harness.CreateAsync(withPet: true);

        await harness.OwnerProfiles.UpdateAsync(
            OwnerId,
            Request(phone: "+60123334444", whatsapp: null));

        var safety = await harness.SafetyProfiles.GetBySafetyCodeAsync("safe-owner-contact");

        Assert.NotNull(safety.Contact);
        Assert.Equal("+60123334444", safety.Contact!.PhoneE164);
        Assert.Null(safety.Contact.WhatsappE164);
    }

    [Fact]
    public async Task SafetyProfile_HidesContactActionsAfterBothOwnerNumbersAreCleared()
    {
        using var harness = await Harness.CreateAsync(withPet: true);

        await harness.OwnerProfiles.UpdateAsync(
            OwnerId,
            Request(phone: null, whatsapp: null));

        var detail = await harness.Pets.GetAsync(OwnerId, PetId);
        var safety = await harness.SafetyProfiles.GetBySafetyCodeAsync("safe-owner-contact");

        Assert.False(detail.HasUsableSafetyContact);
        Assert.Null(detail.Contact.PhoneE164);
        Assert.Null(detail.Contact.WhatsappE164);
        Assert.Null(safety.Contact);
    }

    [Fact]
    public async Task CreatePet_WithOwnerDefaultsDoesNotPersistContactSnapshots()
    {
        using var harness = await Harness.CreateAsync();

        var created = await harness.Pets.CreateAsync(
            OwnerId,
            new CreatePetRequest(
                Name: "Luna",
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
                Contact: new PetContactRequest(true, null, null, null, null, null),
                Visibility: null,
                SafetyNote: null,
                EmergencyNote: null));

        var savedContact = await harness.Db.PetContacts
            .AsNoTracking()
            .SingleAsync(contact => contact.PetId == created.Id);

        Assert.True(savedContact.UseOwnerDefaults);
        Assert.Null(savedContact.PhoneE164);
        Assert.Null(savedContact.WhatsappE164);
        Assert.Equal("+60123334444", created.Contact.PhoneE164);
        Assert.Equal("+60128889999", created.Contact.WhatsappE164);
    }

    private static UpdateOwnerProfileRequest Request(string? phone, string? whatsapp)
        => new(
            DisplayName: "Owner",
            PhoneE164: phone,
            WhatsappE164: whatsapp,
            DefaultGeneralArea: "Petaling Jaya",
            PrivacyDefaults: null,
            NotificationPreferences: null);

    private sealed class Harness : IDisposable
    {
        private Harness(MyPetLinkDbContext db)
        {
            Db = db;
            var r2 = Options.Create(new CloudflareR2Options());
            OwnerProfiles = new OwnerProfileService(db);
            Pets = new PetService(db, r2);
            SafetyProfiles = new QrSafetyService(db, r2);
        }

        public MyPetLinkDbContext Db { get; }
        public OwnerProfileService OwnerProfiles { get; }
        public PetService Pets { get; }
        public QrSafetyService SafetyProfiles { get; }

        public static async Task<Harness> CreateAsync(bool withPet = false)
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
                    MaxPets = 3,
                    MaxMemoriesPerPet = 10,
                    MaxMediaPerMemory = 4,
                    MaxFamilyMembers = 1,
                    MaxCareRecords = 100
                }
            };
            var owner = new User
            {
                Id = OwnerId,
                Email = "owner@example.com",
                NormalizedEmail = "OWNER@EXAMPLE.COM",
                DisplayName = "Owner",
                Status = UserStatus.Active,
                PhoneE164 = "+60123334444",
                WhatsappE164 = "+60128889999",
                OwnerProfile = new OwnerProfile
                {
                    UserId = OwnerId,
                    OwnerDisplayName = "Owner",
                    DefaultGeneralArea = "Petaling Jaya",
                    PrivacyDefaultsJson = "{}",
                    NotificationPreferencesJson = "{}",
                    Plan = plan
                }
            };

            db.Plans.Add(plan);
            db.Users.Add(owner);

            if (withPet)
            {
                db.Pets.Add(new Pet
                {
                    Id = PetId,
                    OwnerUserId = OwnerId,
                    OwnerUser = owner,
                    Slug = "topu-owner-contact",
                    Name = "Topu",
                    Species = "Cat",
                    Contact = new PetContact
                    {
                        UseOwnerDefaults = true,
                        PhoneE164 = "+60120000001",
                        WhatsappE164 = "+60120000002",
                        EmergencyContactE164 = "+60120000003"
                    },
                    PublicProfile = new PetPublicProfile
                    {
                        PublicCode = "ownr",
                        SlugSnapshot = "topu-owner-contact",
                        IsPublicProfileEnabled = true
                    },
                    SafetySetting = new PetSafetySetting
                    {
                        SafetyCode = "safe-owner-contact",
                        QrSafetyEnabled = true,
                        ShowPhone = true,
                        ShowWhatsapp = true
                    }
                });
            }

            await db.SaveChangesAsync();
            return new Harness(db);
        }

        public void Dispose() => Db.Dispose();
    }
}
