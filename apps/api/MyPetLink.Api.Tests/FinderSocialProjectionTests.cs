using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests;

/// <summary>
/// The finder preview projection feeds public link-preview metadata, so these
/// tests exist mainly to prove what it does NOT contain.
/// </summary>
public sealed class FinderSocialProjectionTests
{
    [Fact]
    public async Task SafetyPreview_DescribesThePetWithoutAnyContactDetail()
    {
        await using var db = CreateDb();
        var pet = AddPet(db, publicProfileEnabled: true);
        await db.SaveChangesAsync();

        var preview = await CreateSafetyService(db)
            .GetSocialBySafetyCodeAsync(pet.SafetySetting!.SafetyCode);

        Assert.Equal("active", preview.State);
        Assert.Equal("Nori", preview.Name);
        Assert.NotNull(preview.PublicSlug);
        Assert.NotNull(preview.PublicProfileVersion);

        var serialised = System.Text.Json.JsonSerializer.Serialize(preview);
        foreach (var secret in new[]
                 {
                     "+60123456789", "owner@example.com", "Owner Name",
                     "Bangsar", "Emergency", "safety-note"
                 })
        {
            Assert.DoesNotContain(secret, serialised, StringComparison.OrdinalIgnoreCase);
        }

        // No identifiers or codes of any kind.
        Assert.DoesNotContain(pet.Id.ToString(), serialised);
        Assert.DoesNotContain(pet.OwnerUserId.ToString(), serialised);
        Assert.DoesNotContain(pet.SafetySetting.SafetyCode, serialised);
    }

    [Fact]
    public async Task SafetyPreview_ReportsLostModeSoThePreviewCanBeUrgent()
    {
        await using var db = CreateDb();
        var pet = AddPet(db, publicProfileEnabled: true);
        pet.LostModeEnabled = true;
        await db.SaveChangesAsync();

        var preview = await CreateSafetyService(db)
            .GetSocialBySafetyCodeAsync(pet.SafetySetting!.SafetyCode);

        Assert.Equal("lostMode", preview.State);
    }

    [Fact]
    public async Task SafetyPreview_WithholdsThePublicSlugWhenTheShareProfileIsOff()
    {
        await using var db = CreateDb();
        var pet = AddPet(db, publicProfileEnabled: false);
        await db.SaveChangesAsync();

        var preview = await CreateSafetyService(db)
            .GetSocialBySafetyCodeAsync(pet.SafetySetting!.SafetyCode);

        // The owner turned the Public Share Profile off, so its card must not be
        // reused for the preview image.
        Assert.Null(preview.PublicSlug);
        Assert.Null(preview.PublicProfileVersion);
        Assert.Equal("Nori", preview.Name);
    }

    [Fact]
    public async Task SafetyPreview_TreatsAMemorialPetRespectfullyAndDropsTheShareCard()
    {
        await using var db = CreateDb();
        var pet = AddPet(db, publicProfileEnabled: true);
        pet.LifecycleStatus = PetLifecycleStatus.Memorial;
        await db.SaveChangesAsync();

        var preview = await CreateSafetyService(db)
            .GetSocialBySafetyCodeAsync(pet.SafetySetting!.SafetyCode);

        Assert.Equal("memorial", preview.State);
        Assert.Null(preview.PublicSlug);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task SafetyPreview_IsUnavailableWhenTheSafetyProfileIsOffOrArchived(bool archived)
    {
        await using var db = CreateDb();
        var pet = AddPet(db, publicProfileEnabled: true);
        if (archived)
        {
            pet.LifecycleStatus = PetLifecycleStatus.Archived;
        }
        else
        {
            pet.SafetySetting!.QrSafetyEnabled = false;
        }

        await db.SaveChangesAsync();
        var service = CreateSafetyService(db);

        await Assert.ThrowsAsync<ApiException>(
            () => service.GetSocialBySafetyCodeAsync(pet.SafetySetting!.SafetyCode));
    }

    [Fact]
    public async Task SafetyPreview_IsUnavailableForAnUnknownCode()
    {
        await using var db = CreateDb();
        var service = CreateSafetyService(db);

        await Assert.ThrowsAsync<ApiException>(
            () => service.GetSocialBySafetyCodeAsync("no-such-code"));
        await Assert.ThrowsAsync<ApiException>(
            () => service.GetSocialBySafetyCodeAsync("   "));
    }

    [Fact]
    public async Task TagPreview_DescribesTheLinkedPetAndRecordsNoScan()
    {
        await using var db = CreateDb();
        var pet = AddPet(db, publicProfileEnabled: true);
        var tag = AddTag(db, pet, SmartTagStatus.Active);
        await db.SaveChangesAsync();

        var preview = await CreateTagService(db).GetSocialByTagCodeAsync(tag.TagCode);

        Assert.Equal("active", preview.State);
        Assert.Equal("Nori", preview.Name);
        // A crawler fetching a preview must never appear in scan history.
        Assert.Empty(db.TagScans);
    }

    [Theory]
    [InlineData(SmartTagStatus.Unclaimed)]
    [InlineData(SmartTagStatus.Disabled)]
    [InlineData(SmartTagStatus.Replaced)]
    [InlineData(SmartTagStatus.Lost)]
    [InlineData(SmartTagStatus.Archived)]
    public async Task TagPreview_IsUnavailableForATagWithNoShareablePet(SmartTagStatus status)
    {
        await using var db = CreateDb();
        var pet = AddPet(db, publicProfileEnabled: true);
        var tag = AddTag(db, pet, status);
        if (status == SmartTagStatus.Unclaimed)
        {
            tag.PetId = null;
            tag.Pet = null;
        }

        await db.SaveChangesAsync();
        var service = CreateTagService(db);

        await Assert.ThrowsAsync<ApiException>(
            () => service.GetSocialByTagCodeAsync(tag.TagCode));
        Assert.Empty(db.TagScans);
    }

    [Fact]
    public async Task TagPreview_IsUnavailableWhenTheLinkedSafetyProfileIsOff()
    {
        await using var db = CreateDb();
        var pet = AddPet(db, publicProfileEnabled: true);
        pet.SafetySetting!.QrSafetyEnabled = false;
        var tag = AddTag(db, pet, SmartTagStatus.Active);
        await db.SaveChangesAsync();

        await Assert.ThrowsAsync<ApiException>(
            () => CreateTagService(db).GetSocialByTagCodeAsync(tag.TagCode));
    }

    [Fact]
    public async Task TagPreview_IsUnavailableForAnUnknownTag()
    {
        await using var db = CreateDb();

        await Assert.ThrowsAsync<ApiException>(
            () => CreateTagService(db).GetSocialByTagCodeAsync("MPL-0000-0000"));
    }

    private static MyPetLinkDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;
        return new MyPetLinkDbContext(options);
    }

    private static QrSafetyService CreateSafetyService(MyPetLinkDbContext db) =>
        new(db, Options.Create(new CloudflareR2Options
        {
            PublicBaseUrl = "https://media.mypetlink.com.my"
        }));

    private static TagScanService CreateTagService(MyPetLinkDbContext db) =>
        new(db, Options.Create(new CloudflareR2Options
        {
            PublicBaseUrl = "https://media.mypetlink.com.my"
        }));

    private static Pet AddPet(MyPetLinkDbContext db, bool publicProfileEnabled)
    {
        var owner = new User
        {
            Email = "owner@example.com",
            NormalizedEmail = "OWNER@EXAMPLE.COM",
            DisplayName = "Owner Name",
            PhoneE164 = "+60123456789",
            WhatsappE164 = "+60123456789",
            Status = UserStatus.Active
        };
        var pet = new Pet
        {
            OwnerUser = owner,
            OwnerUserId = owner.Id,
            Slug = "nori",
            Name = "Nori",
            Species = "Cat",
            Breed = "Domestic Shorthair",
            GeneralArea = "Bangsar, Kuala Lumpur",
            SafetyNote = "safety-note",
            EmergencyNote = "Emergency vet details",
            LifecycleStatus = PetLifecycleStatus.Active,
            Contact = new PetContact
            {
                PhoneE164 = "+60123456789",
                WhatsappE164 = "+60123456789"
            },
            SafetySetting = new PetSafetySetting
            {
                SafetyCode = "safetycode123456789a",
                QrSafetyEnabled = true,
                ShowPhone = true,
                ShowWhatsapp = true
            },
            PublicProfile = new PetPublicProfile
            {
                PublicCode = "futurepet1234",
                SlugSnapshot = "nori-futurepet1234",
                IsPublicProfileEnabled = publicProfileEnabled
            }
        };
        db.Pets.Add(pet);
        return pet;
    }

    private static SmartTag AddTag(MyPetLinkDbContext db, Pet pet, SmartTagStatus status)
    {
        var tag = new SmartTag
        {
            TagCode = "MPL-9F3K-H7Q2",
            Status = status,
            Pet = pet,
            PetId = pet.Id,
            ArchivedAt = status == SmartTagStatus.Archived ? DateTimeOffset.UtcNow : null
        };
        db.SmartTags.Add(tag);
        return tag;
    }
}
