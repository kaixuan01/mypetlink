using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Data;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;
using SkiaSharp;

namespace MyPetLink.Api.Tests;

/// <summary>
/// The portrait Share Card follows the pet's Public Profile theme through a
/// bounded palette, and only through that palette: one layout, allowlisted
/// colours, and nothing readable left to a theme's discretion.
/// </summary>
public sealed class ShareCardThemeTests
{
    [Fact]
    public void Palette_KnowsEveryPublicProfileTheme()
    {
        // Keep in step with apps/web/src/lib/petProfileThemes.ts.
        Assert.Equal(
            new[] { "default", "lavender", "mint", "peach", "sky" },
            ShareCardPalette.KnownThemes.OrderBy(key => key, StringComparer.Ordinal));
    }

    [Theory]
    [InlineData("mint")]
    [InlineData("peach")]
    [InlineData("sky")]
    [InlineData("lavender")]
    public void EachTheme_ProducesItsOwnPalette(string theme)
    {
        var palette = ShareCardPalette.Resolve(theme);

        Assert.NotEqual(ShareCardPalette.Default, palette);
        Assert.NotEqual(ShareCardPalette.Default.Background, palette.Background);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("retired-theme")]
    [InlineData("<script>")]
    public void UnknownTheme_FallsBackToTheSafeDefault(string? theme)
    {
        Assert.Equal(ShareCardPalette.Default, ShareCardPalette.Resolve(theme));
    }

    [Fact]
    public void ReadableElements_AreNeverThemeDriven()
    {
        // The brand text colour, the QR modules, and the primary text stay put
        // whatever the owner picked, so no theme can make a card unreadable.
        foreach (var theme in ShareCardPalette.KnownThemes)
        {
            var palette = ShareCardPalette.Resolve(theme);
            Assert.Equal(SKColor.Parse("#102247"), ShareCardPalette.PrimaryText);
            Assert.Equal(SKColor.Parse("#0D1B3D"), ShareCardPalette.QrModule);
            Assert.Equal(SKColors.White, palette.HeroFrame);
        }
    }

    [Fact]
    public void TaglineIsNoLongerASaturatedButtonFill()
    {
        // A static JPEG should not present a strong primary button that cannot
        // be pressed. The tagline uses the theme's soft tint with dark text.
        foreach (var theme in ShareCardPalette.KnownThemes)
        {
            var palette = ShareCardPalette.Resolve(theme);
            Assert.True(
                Luminance(palette.TaglineFill) > 0.7,
                $"{theme} tagline fill should be a soft tint.");
            Assert.True(
                Luminance(palette.TaglineText) < 0.45,
                $"{theme} tagline text should stay dark and readable.");
        }
    }

    [Fact]
    public void PublicProjection_CarriesOnlyABoundedThemeKey()
    {
        var response = CreateProfile("mint");

        Assert.Equal("mint", response.ProfileTheme);
        Assert.Contains(response.ProfileTheme, ShareCardPalette.KnownThemes);
    }

    [Fact]
    public async Task PublicProjection_NormalisesAnUnknownThemeAndLeaksNothingElse()
    {
        var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;
        await using var db = new MyPetLinkDbContext(options);

        var owner = new User
        {
            Email = "theme-owner@example.com",
            NormalizedEmail = "THEME-OWNER@EXAMPLE.COM",
            DisplayName = "Theme Owner",
            PhoneE164 = "+60123456789",
            WhatsappE164 = "+60123456789",
        };
        var pet = new Pet
        {
            OwnerUserId = owner.Id,
            Name = "Linko",
            Species = "Cat",
            Breed = "Domestic Shorthair",
            Slug = "linko",
            LifecycleStatus = PetLifecycleStatus.Active,
            ProfileTheme = "retired-theme",
            GeneralArea = "Ampang, Kuala Lumpur",
            SafetyNote = "Very shy around strangers.",
        };
        var publicProfile = new PetPublicProfile
        {
            PetId = pet.Id,
            Pet = pet,
            PublicCode = "themecode",
            IsPublicProfileEnabled = true,
        };
        db.Users.Add(owner);
        db.Pets.Add(pet);
        db.PetPublicProfiles.Add(publicProfile);
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var social = await service.GetSocialByPublicSlugAsync("linko-themecode", CancellationToken.None);

        Assert.NotNull(social);
        Assert.Equal("default", social!.ProfileTheme);

        // The projection stays a presentation surface: no owner, contact,
        // safety, or internal identifiers ride along with the theme.
        var serialized = System.Text.Json.JsonSerializer.Serialize(social);
        foreach (var secret in new[]
                 {
                     "+60123456789",
                     "theme-owner@example.com",
                     "Theme Owner",
                     "Ampang",
                     "Very shy",
                     pet.Id.ToString(),
                     owner.Id.ToString(),
                 })
        {
            Assert.DoesNotContain(secret, serialized, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public void PetMetadataLine_DropsTheSpeciesWhenABreedAlreadySaysIt()
    {
        Assert.Equal(
            new[] { "Domestic Shorthair", "4 years old" },
            PublicProfileSocialCardRenderer.BuildSummaryParts(
                CreateProfile(breed: "Domestic Shorthair", age: "4 years old")));

        Assert.Equal(
            new[] { "Domestic Shorthair" },
            PublicProfileSocialCardRenderer.BuildSummaryParts(
                CreateProfile(breed: "Domestic Shorthair", age: "Age unknown")));

        Assert.Equal(
            new[] { "Cat", "4 years old" },
            PublicProfileSocialCardRenderer.BuildSummaryParts(
                CreateProfile(breed: null, age: "4 years old")));

        Assert.Equal(
            new[] { "Cat" },
            PublicProfileSocialCardRenderer.BuildSummaryParts(
                CreateProfile(breed: null, age: null)));
    }

    [Fact]
    public void PetMetadataLine_KeepsACustomSpeciesWhenThereIsNoBreed()
    {
        Assert.Equal(
            new[] { "Sugar Glider", "2 years old" },
            PublicProfileSocialCardRenderer.BuildSummaryParts(
                CreateProfile(
                    species: "Other",
                    customSpecies: "Sugar Glider",
                    breed: null,
                    age: "2 years old")));
    }

    [Theory]
    // Production stays strict whatever the environment allows locally.
    [InlineData("https://mypetlink.com.my", false, true)]
    [InlineData("http://localhost:3000", false, false)]
    [InlineData("https://mypetlink.com.my:8443", false, false)]
    [InlineData("http://mypetlink.com.my", false, false)]
    // Development additionally tolerates a loopback development port.
    [InlineData("http://localhost:3000", true, true)]
    [InlineData("http://127.0.0.1:4173", true, true)]
    [InlineData("https://mypetlink.com.my", true, true)]
    // Even in Development the relaxation is loopback-only.
    [InlineData("http://staging.mypetlink.com.my:3000", true, false)]
    [InlineData("http://192.168.1.20:3000", true, false)]
    [InlineData("http://localhost:3000/app", true, false)]
    [InlineData("http://user:pass@localhost:3000", true, false)]
    public void PublicSiteOrigin_IsStrictInProductionAndLoopbackFriendlyInDevelopment(
        string value,
        bool development,
        bool expected)
    {
        var resolved = PublicProfileSocialCardRenderer.ResolvePublicSiteBaseUri(value, development);

        Assert.Equal(expected, resolved is not null);
    }

    private static double Luminance(SKColor color) =>
        (0.2126 * color.Red + 0.7152 * color.Green + 0.0722 * color.Blue) / 255.0;

    private static PublicProfileSocialResponse CreateProfile(
        string theme = "default",
        string species = "Cat",
        string? customSpecies = null,
        string? breed = "Domestic Shorthair",
        string? age = "4 years old")
        => new(
            PublicCode: "public-code",
            PublicSlug: "linko-public-code",
            PublicProfileVersion: "0123456789abcdef",
            Name: "Linko",
            Species: species,
            CustomSpecies: customSpecies,
            Breed: breed,
            AgeDisplayLabel: age ?? "Age unknown",
            LifecycleStatus: PetLifecycleStatus.Active,
            LostModeEnabled: false,
            ProfilePhotoUrl: null,
            CoverPhotoUrl: null,
            CoverPositionX: 50,
            CoverPositionY: 50,
            ProfileTheme: theme);

    private static PublicProfileService CreateService(MyPetLinkDbContext db)
        => new(
            db,
            Options.Create(new CloudflareR2Options
            {
                PublicBaseUrl = "https://media.mypetlink.com.my"
            }));
}
