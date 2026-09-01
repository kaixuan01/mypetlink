using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Safety Profile and Public Profile access rules: the two pages are switched
/// independently, new pets get an enabled Safety Profile without any physical
/// tag, and contact readiness is derived from visible contact methods only.
/// </summary>
public sealed class PetSafetyProfileAccessTests
{
    private static readonly Guid OwnerId = Guid.Parse("91111111-1111-1111-1111-111111111111");
    private static readonly Guid PetId = Guid.Parse("92222222-2222-2222-2222-222222222222");
    private static readonly TagScanContext ScanContext =
        new("127.0.0.1", "privacy-test", "https://example.test/");

    [Fact]
    public async Task UpdateAsync_DisablingSafetyProfileLeavesPublicProfileEnabled()
    {
        using var harness = await Harness.CreateAsync();

        var response = await harness.Pets.UpdateAsync(
            OwnerId, PetId, UpdateFlags(qrSafetyEnabled: false));

        Assert.False(response.QrSafetyEnabled);
        Assert.True(response.PublicProfileEnabled);
        var saved = await harness.Db.Pets
            .Include(pet => pet.SafetySetting)
            .Include(pet => pet.PublicProfile)
            .SingleAsync(pet => pet.Id == PetId);
        Assert.False(saved.SafetySetting!.QrSafetyEnabled);
        Assert.True(saved.PublicProfile!.IsPublicProfileEnabled);
    }

    [Fact]
    public async Task UpdateAsync_DisablingPublicProfileLeavesSafetyProfileEnabled()
    {
        using var harness = await Harness.CreateAsync();

        var response = await harness.Pets.UpdateAsync(
            OwnerId, PetId, UpdateFlags(publicProfileEnabled: false));

        Assert.True(response.QrSafetyEnabled);
        Assert.False(response.PublicProfileEnabled);
    }

    [Fact]
    public async Task UpdateAsync_OmittedFlagsLeaveBothSettingsUnchanged()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Pets.UpdateAsync(OwnerId, PetId, UpdateFlags(qrSafetyEnabled: false, publicProfileEnabled: false));

        var response = await harness.Pets.UpdateAsync(OwnerId, PetId, UpdateFlags());

        Assert.False(response.QrSafetyEnabled);
        Assert.False(response.PublicProfileEnabled);
    }

    [Fact]
    public async Task SafetyPageStaysAvailableWhenPublicProfileIsDisabled()
    {
        using var harness = await Harness.CreateAsync(ownerWhatsapp: "+60123456789");
        await harness.Pets.UpdateAsync(OwnerId, PetId, UpdateFlags(publicProfileEnabled: false));

        var safetyPage = await harness.QrSafety.GetBySafetyCodeAsync("safe-topu");

        Assert.Equal("safe-topu", safetyPage.SafetyCode);
        await Assert.ThrowsAsync<ApiException>(
            () => harness.PublicProfiles.GetByPublicSlugAsync("topu-pub123"));
    }

    [Fact]
    public async Task PublicProfileStaysAvailableWhenSafetyProfileIsDisabled()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Pets.UpdateAsync(OwnerId, PetId, UpdateFlags(qrSafetyEnabled: false));

        var publicProfile = await harness.PublicProfiles.GetByPublicSlugAsync("topu-pub123");

        Assert.Equal("pub123", publicProfile.PublicCode);
        await Assert.ThrowsAsync<ApiException>(
            () => harness.QrSafety.GetBySafetyCodeAsync("safe-topu"));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task OwnerNameVisibilityAppliesToAllFinderSurfacesWithoutChangingSafetyData(
        bool showOwnerName)
    {
        using var harness = await Harness.CreateAsync(
            showOwnerName: showOwnerName,
            includePrivacySurfaceData: true);
        harness.Db.ChangeTracker.Clear();

        var qrTagScan = await harness.TagScans.ResolveAsync(
            "MPL-PRIVACY-01", TagScanSource.Qr, ScanContext);
        var nfcTagScan = await harness.TagScans.ResolveAsync(
            "MPL-PRIVACY-01", TagScanSource.Nfc, ScanContext);
        var publicProfile = await harness.PublicProfiles.GetByPublicSlugAsync("topu-pub123");
        var safetyProfile = await harness.QrSafety.GetBySafetyCodeAsync("safe-topu");

        var expectedName = showOwnerName ? "Pet contact owner" : null;
        Assert.Equal(expectedName, publicProfile.OwnerDisplayName);
        Assert.Equal("active", qrTagScan.State);
        Assert.Equal("active", nfcTagScan.State);

        foreach (var profile in new[]
                 {
                     safetyProfile,
                     Assert.IsType<PublicSafetyPageResponse>(qrTagScan.Profile),
                     Assert.IsType<PublicSafetyPageResponse>(nfcTagScan.Profile)
                 })
        {
            Assert.Equal(expectedName, profile.Contact!.OwnerDisplayName);
            Assert.Equal("+60111111111", profile.Contact.PhoneE164);
            Assert.Equal("+60122222222", profile.Contact.WhatsappE164);
            Assert.Equal("+60133333333", profile.Contact.EmergencyContactE164);
            Assert.Equal("Subang Jaya", profile.GeneralArea);
            Assert.Equal("Approach slowly.", profile.SafetyNote);
            Assert.Equal("Needs daily medication.", profile.EmergencyNote);
            Assert.True(profile.ShowFoundLocationAction);
        }
    }

    [Fact]
    public async Task FinderSurfacesHideOwnerNameWhenPublicProfileIsMissing()
    {
        using var harness = await Harness.CreateAsync(
            showOwnerName: true,
            includePrivacySurfaceData: true,
            includePublicProfile: false);
        harness.Db.ChangeTracker.Clear();

        var qrTagScan = await harness.TagScans.ResolveAsync(
            "MPL-PRIVACY-01", TagScanSource.Qr, ScanContext);
        var nfcTagScan = await harness.TagScans.ResolveAsync(
            "MPL-PRIVACY-01", TagScanSource.Nfc, ScanContext);
        var safetyProfile = await harness.QrSafety.GetBySafetyCodeAsync("safe-topu");

        foreach (var profile in new[]
                 {
                     safetyProfile,
                     Assert.IsType<PublicSafetyPageResponse>(qrTagScan.Profile),
                     Assert.IsType<PublicSafetyPageResponse>(nfcTagScan.Profile)
                 })
        {
            Assert.Null(profile.Contact!.OwnerDisplayName);
            Assert.Equal("+60111111111", profile.Contact.PhoneE164);
            Assert.Equal("+60122222222", profile.Contact.WhatsappE164);
            Assert.Equal("+60133333333", profile.Contact.EmergencyContactE164);
        }
    }

    [Fact]
    public async Task CreateAsync_NewPetGetsEnabledSafetyProfileAndNoLinkedTag()
    {
        using var harness = await Harness.CreateAsync();

        var response = await harness.Pets.CreateAsync(
            OwnerId,
            new CreatePetRequest(
                "Luna", "Cat", null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null));

        Assert.True(response.QrSafetyEnabled);
        Assert.True(response.PublicProfileEnabled);
        Assert.False(response.HasUsableSafetyContact);
        var saved = await harness.Db.Pets
            .Include(pet => pet.SafetySetting)
            .SingleAsync(pet => pet.Id == response.Id);
        Assert.NotNull(saved.SafetySetting);
        Assert.False(string.IsNullOrWhiteSpace(saved.SafetySetting!.SafetyCode));
        Assert.Empty(harness.Db.SmartTags);
    }

    [Fact]
    public async Task HasUsableSafetyContact_TrueOnlyForVisibleUsableNumbers()
    {
        // Visible WhatsApp with a real owner number counts.
        using (var harness = await Harness.CreateAsync(ownerWhatsapp: "+60123456789"))
        {
            var detail = await harness.Pets.GetAsync(OwnerId, PetId);
            Assert.True(detail.HasUsableSafetyContact);
        }

        // A number without visibility does not count.
        using (var harness = await Harness.CreateAsync(
            ownerWhatsapp: "+60123456789", showWhatsapp: false, showPhone: false))
        {
            var detail = await harness.Pets.GetAsync(OwnerId, PetId);
            Assert.False(detail.HasUsableSafetyContact);
        }

        // Visibility without any number does not count either.
        using (var harness = await Harness.CreateAsync())
        {
            var detail = await harness.Pets.GetAsync(OwnerId, PetId);
            Assert.False(detail.HasUsableSafetyContact);
        }

        // Visible phone via owner defaults counts.
        using (var harness = await Harness.CreateAsync(ownerPhone: "+60129998888", showPhone: true))
        {
            var detail = await harness.Pets.GetAsync(OwnerId, PetId);
            Assert.True(detail.HasUsableSafetyContact);
        }
    }

    [Fact]
    public async Task ListAsync_ExposesSafetyFlagsPerPet()
    {
        using var harness = await Harness.CreateAsync(ownerWhatsapp: "+60123456789");
        await harness.Pets.UpdateAsync(OwnerId, PetId, UpdateFlags(qrSafetyEnabled: false));

        var (items, _) = await harness.Pets.ListAsync(OwnerId, 1, 50, null);
        var item = Assert.Single(items);

        Assert.False(item.QrSafetyEnabled);
        Assert.True(item.PublicProfileEnabled);
        Assert.True(item.HasUsableSafetyContact);
    }

    private static UpdatePetRequest UpdateFlags(
        bool? qrSafetyEnabled = null,
        bool? publicProfileEnabled = null)
    {
        return new UpdatePetRequest(
            null, null, null, null, null, null, null, null, null, null, null,
            null, null, null, null, null, null, null,
            QrSafetyEnabled: qrSafetyEnabled,
            PublicProfileEnabled: publicProfileEnabled);
    }

    private sealed class Harness : IDisposable
    {
        private Harness(MyPetLinkDbContext db)
        {
            Db = db;
            var r2 = Options.Create(new CloudflareR2Options());
            Pets = new PetService(db, r2);
            QrSafety = new QrSafetyService(db, r2);
            PublicProfiles = new PublicProfileService(db, r2);
            TagScans = new TagScanService(db, r2);
        }

        public MyPetLinkDbContext Db { get; }
        public PetService Pets { get; }
        public QrSafetyService QrSafety { get; }
        public PublicProfileService PublicProfiles { get; }
        public TagScanService TagScans { get; }

        public static async Task<Harness> CreateAsync(
            string? ownerWhatsapp = null,
            string? ownerPhone = null,
            bool showWhatsapp = true,
            bool showPhone = false,
            bool showOwnerName = false,
            bool includePrivacySurfaceData = false,
            bool includePublicProfile = true)
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
                WhatsappE164 = ownerWhatsapp,
                PhoneE164 = ownerPhone,
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
                SafetyNote = includePrivacySurfaceData ? "Approach slowly." : null,
                EmergencyNote = includePrivacySurfaceData ? "Needs daily medication." : null,
                Contact = includePrivacySurfaceData
                    ? new PetContact
                    {
                        UseOwnerDefaults = false,
                        OwnerDisplayName = "Pet contact owner",
                        PhoneE164 = "+60111111111",
                        WhatsappE164 = "+60122222222",
                        EmergencyContactE164 = "+60133333333",
                        GeneralAreaOverride = "Subang Jaya"
                    }
                    : null,
                PublicProfile = includePublicProfile
                    ? new PetPublicProfile
                    {
                        PublicCode = "pub123",
                        SlugSnapshot = "topu-pub123",
                        IsPublicProfileEnabled = true,
                        ShowOwnerName = showOwnerName
                    }
                    : null,
                SafetySetting = new PetSafetySetting
                {
                    SafetyCode = "safe-topu",
                    QrSafetyEnabled = true,
                    ShowWhatsapp = includePrivacySurfaceData || showWhatsapp,
                    ShowPhone = includePrivacySurfaceData || showPhone,
                    ShowEmergencyNote = true,
                    ShowFoundLocationAction = true
                }
            };

            db.Plans.Add(plan);
            db.Users.Add(owner);
            db.Pets.Add(pet);
            if (includePrivacySurfaceData)
            {
                db.SmartTags.Add(new SmartTag
                {
                    TagCode = "MPL-PRIVACY-01",
                    Status = SmartTagStatus.Active,
                    HasNfc = true,
                    Variant = "Standard",
                    OwnerUser = owner,
                    OwnerUserId = OwnerId,
                    Pet = pet,
                    PetId = PetId,
                    ActivatedAt = DateTimeOffset.UtcNow
                });
            }
            await db.SaveChangesAsync();
            return new Harness(db);
        }

        public void Dispose() => Db.Dispose();
    }
}
