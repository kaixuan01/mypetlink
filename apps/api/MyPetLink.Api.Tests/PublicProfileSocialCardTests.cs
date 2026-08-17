using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Options;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;
using SkiaSharp;
using ZXing;
using ZXing.Common;

namespace MyPetLink.Api.Tests;

public sealed class PublicProfileSocialCardTests
{
    [Fact]
    public async Task SocialProjection_UsesOnlyCardFieldsAndRejectsAnArchivedProfile()
    {
        var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;
        await using var db = new MyPetLinkDbContext(options);
        var owner = new User
        {
            Email = "private-owner@example.com",
            NormalizedEmail = "PRIVATE-OWNER@EXAMPLE.COM",
            DisplayName = "Private Owner",
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
            Birthday = new DateOnly(2025, 8, 17),
            AdoptionDay = new DateOnly(2022, 8, 17),
            LifecycleStatus = PetLifecycleStatus.Active,
            Contact = new PetContact
            {
                PhoneE164 = "+60123456789",
                WhatsappE164 = "+60123456789"
            },
            PublicProfile = new PetPublicProfile
            {
                PublicCode = "futurepet1234",
                SlugSnapshot = "nori-futurepet1234",
                IsPublicProfileEnabled = true
            }
        };
        db.Pets.Add(pet);
        await db.SaveChangesAsync();
        var service = new PublicProfileService(
            db,
            Options.Create(new CloudflareR2Options
            {
                PublicBaseUrl = "https://media.mypetlink.com.my"
            }),
            new FixedTimeProvider(DateTimeOffset.Parse("2026-08-16T16:00:00Z")));

        var response = await service.GetSocialByPublicSlugAsync("nori-futurepet1234");
        var propertyNames = typeof(PublicProfileSocialResponse)
            .GetProperties()
            .Select(property => property.Name)
            .ToArray();

        Assert.Equal("Nori", response.Name);
        Assert.Equal("futurepet1234", response.PublicCode);
        Assert.Matches("^[a-f0-9]{16}$", response.PublicProfileVersion);
        Assert.DoesNotContain("OwnerDisplayName", propertyNames);
        Assert.DoesNotContain("PhoneE164", propertyNames);
        Assert.DoesNotContain("WhatsappE164", propertyNames);
        Assert.DoesNotContain("GeneralArea", propertyNames);
        Assert.DoesNotContain("Memories", propertyNames);
        Assert.DoesNotContain("CareRecords", propertyNames);
        var occasions = await service.GetSocialCardOccasionsAsync("nori-futurepet1234");
        Assert.Equal(1, occasions.BirthdayAge);
        Assert.Equal(4, occasions.AdoptionYears);

        pet.PublicProfile.IsPublicProfileEnabled = false;
        pet.PublicProfile.UpdatedAt = DateTimeOffset.UtcNow.AddMinutes(1);
        await db.SaveChangesAsync();

        var privateException = await Assert.ThrowsAsync<ApiException>(() =>
            service.GetSocialByPublicSlugAsync("nori-futurepet1234"));
        Assert.Equal(404, privateException.StatusCode);

        pet.PublicProfile.IsPublicProfileEnabled = true;
        pet.LifecycleStatus = PetLifecycleStatus.Memorial;
        pet.ShowMemorialOnPublicProfile = true;
        pet.UpdatedAt = DateTimeOffset.UtcNow.AddMinutes(1);
        await db.SaveChangesAsync();

        var memorialException = await Assert.ThrowsAsync<ApiException>(() =>
            service.GetSocialCardOccasionsAsync("nori-futurepet1234"));
        Assert.Equal(404, memorialException.StatusCode);

        pet.LifecycleStatus = PetLifecycleStatus.Archived;
        pet.UpdatedAt = DateTimeOffset.UtcNow.AddMinutes(1);
        await db.SaveChangesAsync();

        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            service.GetSocialByPublicSlugAsync("nori-futurepet1234"));
        Assert.Equal(404, exception.StatusCode);

        var malformedException = await Assert.ThrowsAsync<ApiException>(() =>
            service.GetSocialByPublicSlugAsync(" "));
        Assert.Equal(404, malformedException.StatusCode);
    }

    [Fact]
    public void PublicVersion_ChangesForEveryCardRelevantPublicChange()
    {
        var pet = new Pet
        {
            Name = "Topu",
            Species = "Cat",
            Breed = "Domestic Shorthair",
            CoverPositionX = 50,
            CoverPositionY = 50,
            UpdatedAt = DateTimeOffset.Parse("2026-07-13T00:00:00Z")
        };
        var publicProfile = new PetPublicProfile
        {
            PublicCode = "public-code",
            IsPublicProfileEnabled = true,
            UpdatedAt = DateTimeOffset.Parse("2026-07-13T00:00:00Z")
        };
        var original = PublicProfileVersion.Create(
            publicProfile,
            pet,
            "Under 1 year old",
            "https://media.mypetlink.com.my/profile/one.jpg",
            "https://media.mypetlink.com.my/cover/one.jpg");

        pet.Name = "Topu Updated";
        var renamed = PublicProfileVersion.Create(
            publicProfile,
            pet,
            "Under 1 year old",
            "https://media.mypetlink.com.my/profile/one.jpg",
            "https://media.mypetlink.com.my/cover/one.jpg");
        pet.Name = "Topu";
        pet.ProfileTheme = "mint";
        var newTheme = PublicProfileVersion.Create(
            publicProfile,
            pet,
            "Under 1 year old",
            "https://media.mypetlink.com.my/profile/one.jpg",
            "https://media.mypetlink.com.my/cover/one.jpg");
        pet.ProfileTheme = "default";
        var newProfilePhoto = PublicProfileVersion.Create(
            publicProfile,
            pet,
            "Under 1 year old",
            "https://media.mypetlink.com.my/profile/two.jpg",
            "https://media.mypetlink.com.my/cover/one.jpg");
        var newCoverPhoto = PublicProfileVersion.Create(
            publicProfile,
            pet,
            "Under 1 year old",
            "https://media.mypetlink.com.my/profile/one.jpg",
            "https://media.mypetlink.com.my/cover/two.jpg");
        pet.CoverPositionX = 0;
        pet.CoverPositionY = 100;
        var newCoverPosition = PublicProfileVersion.Create(
            publicProfile,
            pet,
            "Under 1 year old",
            "https://media.mypetlink.com.my/profile/one.jpg",
            "https://media.mypetlink.com.my/cover/one.jpg");
        pet.CoverPositionX = 50;
        pet.CoverPositionY = 50;
        pet.LostModeEnabled = true;
        var lost = PublicProfileVersion.Create(
            publicProfile,
            pet,
            "Under 1 year old",
            "https://media.mypetlink.com.my/profile/one.jpg",
            "https://media.mypetlink.com.my/cover/one.jpg");
        publicProfile.IsPublicProfileEnabled = false;
        var privateVersion = PublicProfileVersion.Create(
            publicProfile,
            pet,
            "Under 1 year old",
            "https://media.mypetlink.com.my/profile/one.jpg",
            "https://media.mypetlink.com.my/cover/one.jpg");

        Assert.Equal(16, original.Length);
        Assert.Equal(
            8,
            new[]
            {
                original,
                renamed,
                newTheme,
                newProfilePhoto,
                newCoverPhoto,
                newCoverPosition,
                lost,
                privateVersion
            }.Distinct().Count());
    }

    [Fact]
    public async Task OwnerPetResponses_UseTheAuthoritativePublicProfileVersion()
    {
        var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;
        await using var db = new MyPetLinkDbContext(options);
        var owner = new User
        {
            Email = "owner@example.com",
            NormalizedEmail = "OWNER@EXAMPLE.COM",
            DisplayName = "Owner",
            Status = UserStatus.Active
        };
        var pet = new Pet
        {
            OwnerUser = owner,
            OwnerUserId = owner.Id,
            Name = "Nori",
            Species = "Cat",
            Slug = "nori-futurepet1234",
            UpdatedAt = DateTimeOffset.Parse("2026-07-13T00:00:00Z"),
            PublicProfile = new PetPublicProfile
            {
                PublicCode = "futurepet1234",
                SlugSnapshot = "nori-futurepet1234",
                IsPublicProfileEnabled = true,
                UpdatedAt = DateTimeOffset.Parse("2026-07-13T00:00:00Z")
            },
            SafetySetting = new PetSafetySetting { SafetyCode = "safety1234" }
        };
        db.Pets.Add(pet);
        await db.SaveChangesAsync();
        var service = new PetService(
            db,
            Options.Create(new CloudflareR2Options
            {
                PublicBaseUrl = "https://media.mypetlink.com.my"
            }));

        var detail = await service.GetAsync(owner.Id, pet.Id);
        var (items, _) = await service.ListAsync(owner.Id, 1, 20, "All");
        var listItem = Assert.Single(items);

        Assert.Matches("^[a-f0-9]{16}$", detail.PublicProfileVersion);
        Assert.Equal(detail.PublicProfileVersion, listItem.PublicProfileVersion);
    }

    [Fact]
    public async Task Renderer_ReturnsCachedJpegWithRequiredDimensions()
    {
        using var memoryCache = new MemoryCache(new MemoryCacheOptions());
        var renderer = CreateRenderer(memoryCache, new CountingHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.NotFound)));
        var profile = CreateProfile();

        var first = await renderer.RenderAsync(profile);
        var second = await renderer.RenderAsync(profile);

        Assert.Same(first, second);
        Assert.True(first.Length > 4);
        Assert.Equal(0xFF, first[0]);
        Assert.Equal(0xD8, first[1]);
        using var bitmap = SKBitmap.Decode(first);
        Assert.NotNull(bitmap);
        Assert.Equal(PublicProfileSocialCardRenderer.Width, bitmap.Width);
        Assert.Equal(PublicProfileSocialCardRenderer.Height, bitmap.Height);
    }

    [Fact]
    public async Task Renderer_DefaultAndExplicitOpenGraphVariantsAreByteIdentical()
    {
        using var defaultCache = new MemoryCache(new MemoryCacheOptions());
        using var explicitCache = new MemoryCache(new MemoryCacheOptions());
        var defaultRenderer = CreateRenderer(defaultCache, new CountingHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.NotFound)));
        var explicitRenderer = CreateRenderer(explicitCache, new CountingHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.NotFound)));
        var profile = CreateProfile();

        var defaultJpeg = await defaultRenderer.RenderAsync(profile);
        var explicitJpeg = await explicitRenderer.RenderAsync(
            profile,
            PublicProfileSocialCardVariant.OpenGraph);

        Assert.Equal(defaultJpeg, explicitJpeg);
        using var bitmap = SKBitmap.Decode(defaultJpeg);
        Assert.Equal(PublicProfileSocialCardRenderer.Width, bitmap.Width);
        Assert.Equal(PublicProfileSocialCardRenderer.Height, bitmap.Height);
    }

    [Fact]
    public async Task Renderer_ShareCardHasPortraitDimensionsAndAnIsolatedCacheEntry()
    {
        using var memoryCache = new MemoryCache(new MemoryCacheOptions());
        var renderer = CreateRenderer(memoryCache, new CountingHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.NotFound)));
        var profile = CreateProfile();

        var openGraph = await renderer.RenderAsync(profile);
        var shareCard = await renderer.RenderAsync(profile, PublicProfileSocialCardVariant.ShareCard);
        var cachedOpenGraph = await renderer.RenderAsync(profile);
        var cachedShareCard = await renderer.RenderAsync(profile, PublicProfileSocialCardVariant.ShareCard);

        Assert.Same(openGraph, cachedOpenGraph);
        Assert.Same(shareCard, cachedShareCard);
        Assert.False(openGraph.SequenceEqual(shareCard));
        using var openGraphBitmap = SKBitmap.Decode(openGraph);
        using var shareCardBitmap = SKBitmap.Decode(shareCard);
        Assert.Equal((PublicProfileSocialCardRenderer.Width, PublicProfileSocialCardRenderer.Height),
            (openGraphBitmap.Width, openGraphBitmap.Height));
        Assert.Equal((PublicProfileSocialCardRenderer.ShareCardWidth, PublicProfileSocialCardRenderer.ShareCardHeight),
            (shareCardBitmap.Width, shareCardBitmap.Height));
    }

    [Theory]
    [InlineData(PublicProfileSocialCardVariant.OpenGraph)]
    [InlineData(PublicProfileSocialCardVariant.ShareCard)]
    [InlineData(PublicProfileSocialCardVariant.Birthday)]
    [InlineData(PublicProfileSocialCardVariant.Adoption)]
    public async Task Renderer_NoPhotoFallbackIsAnOpaqueDesignedGradient(
        PublicProfileSocialCardVariant variant)
    {
        using var memoryCache = new MemoryCache(new MemoryCacheOptions());
        var renderer = CreateRenderer(memoryCache, new CountingHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.NotFound)));

        var jpeg = await renderer.RenderAsync(CreateProfile(), variant, 4, "20260817");

        using var bitmap = SKBitmap.Decode(jpeg);
        var first = bitmap.GetPixel(110, 115);
        var second = variant == PublicProfileSocialCardVariant.OpenGraph
            ? bitmap.GetPixel(480, 430)
            : bitmap.GetPixel(860, 500);
        Assert.Equal(byte.MaxValue, first.Alpha);
        Assert.Equal(byte.MaxValue, second.Alpha);
        Assert.NotEqual(first, second);
    }

    [Theory]
    [InlineData(PublicProfileSocialCardVariant.OpenGraph)]
    [InlineData(PublicProfileSocialCardVariant.ShareCard)]
    [InlineData(PublicProfileSocialCardVariant.Birthday)]
    [InlineData(PublicProfileSocialCardVariant.Adoption)]
    public async Task Renderer_AllVariantsPreserveAllowedPhotoFetchAndCropPath(
        PublicProfileSocialCardVariant variant)
    {
        var fixture = CreatePhotoFixture();
        var handler = new CountingHandler(_ => ImageResponse(fixture));
        using var memoryCache = new MemoryCache(new MemoryCacheOptions());
        var renderer = CreateRenderer(memoryCache, handler);
        var profile = CreateProfile() with
        {
            ProfilePhotoUrl = "https://media.mypetlink.com.my/profile/test-fixture.jpg",
            CoverPhotoUrl = "https://media.mypetlink.com.my/cover/test-fixture.jpg",
            CoverPositionX = 78,
            CoverPositionY = 22
        };

        var jpeg = await renderer.RenderAsync(profile, variant, 4, "20260817");

        Assert.Equal(2, handler.RequestCount);
        using var bitmap = SKBitmap.Decode(jpeg);
        var expected = variant == PublicProfileSocialCardVariant.OpenGraph
            ? (PublicProfileSocialCardRenderer.Width, PublicProfileSocialCardRenderer.Height)
            : (PublicProfileSocialCardRenderer.ShareCardWidth, PublicProfileSocialCardRenderer.ShareCardHeight);
        Assert.Equal(expected, (bitmap.Width, bitmap.Height));
    }

    [Fact]
    public void Renderer_BrandLogoIsPackagedAsADecodableEmbeddedAsset()
    {
        var assembly = typeof(PublicProfileSocialCardRenderer).Assembly;
        const string resourceName = "MyPetLink.Api.Assets.Brand.mypetlink-logo-horizontal.png";

        Assert.Contains(resourceName, assembly.GetManifestResourceNames());
        using var stream = assembly.GetManifestResourceStream(resourceName);
        Assert.NotNull(stream);
        using var bitmap = SKBitmap.Decode(stream);
        Assert.NotNull(bitmap);
        Assert.True(bitmap.Width > bitmap.Height);
    }

    [Theory]
    [InlineData(PublicProfileSocialCardVariant.ShareCard)]
    [InlineData(PublicProfileSocialCardVariant.Birthday)]
    [InlineData(PublicProfileSocialCardVariant.Adoption)]
    public async Task Renderer_PortraitQrDecodesToExactCanonicalPublicProfile(
        PublicProfileSocialCardVariant variant)
    {
        using var memoryCache = new MemoryCache(new MemoryCacheOptions());
        var renderer = CreateRenderer(memoryCache, new CountingHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.NotFound)));

        var jpeg = await renderer.RenderAsync(CreateProfile(), variant, 4, "20260817");

        Assert.Equal("https://mypetlink.com.my/p/topu-public-code", DecodeQr(jpeg));
    }

    [Fact]
    public async Task Renderer_ProfileQrSurvivesHalfSizeAndMessagingQualityJpegCompression()
    {
        using var memoryCache = new MemoryCache(new MemoryCacheOptions());
        var renderer = CreateRenderer(memoryCache, new CountingHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.NotFound)));
        var jpeg = await renderer.RenderAsync(
            CreateProfile(),
            PublicProfileSocialCardVariant.ShareCard);

        using var original = SKBitmap.Decode(jpeg);
        using var surface = SKSurface.Create(new SKImageInfo(540, 675));
        surface.Canvas.Clear(SKColors.White);
        surface.Canvas.DrawBitmap(original, new SKRect(0, 0, 540, 675));
        using var resized = surface.Snapshot();
        using var compressed = resized.Encode(SKEncodedImageFormat.Jpeg, 68);

        Assert.Equal(
            "https://mypetlink.com.my/p/topu-public-code",
            DecodeQr(compressed.ToArray()));
    }

    [Fact]
    public async Task Renderer_MissingPublicSiteOnlyFailsClosedForPortraitCards()
    {
        using var memoryCache = new MemoryCache(new MemoryCacheOptions());
        var renderer = CreateRenderer(
            memoryCache,
            new CountingHandler(_ => new HttpResponseMessage(HttpStatusCode.NotFound)),
            publicSiteBaseUrl: "");

        var openGraph = await renderer.RenderAsync(CreateProfile());
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            renderer.RenderAsync(CreateProfile(), PublicProfileSocialCardVariant.ShareCard));

        Assert.NotEmpty(openGraph);
        Assert.Contains("PublicSite:BaseUrl", error.Message, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("open-graph")]
    [InlineData("unknown")]
    public void CardVariantParser_DefaultsUnknownAndMissingValuesToOpenGraph(string? value)
    {
        Assert.Equal(
            PublicProfileSocialCardVariant.OpenGraph,
            PublicProfileSocialCardVariants.Parse(value));
    }

    [Fact]
    public void CardVariantParser_AcceptsShareCardCaseInsensitively()
    {
        Assert.Equal(
            PublicProfileSocialCardVariant.ShareCard,
            PublicProfileSocialCardVariants.Parse("SHARE-CARD"));
    }

    [Theory]
    [InlineData("birthday", PublicProfileSocialCardVariant.Birthday)]
    [InlineData("ADOPTION", PublicProfileSocialCardVariant.Adoption)]
    public void CardVariantParser_AcceptsOccasionVariants(
        string value,
        PublicProfileSocialCardVariant expected)
    {
        Assert.Equal(expected, PublicProfileSocialCardVariants.Parse(value));
    }

    [Fact]
    public void OccasionCalculator_UsesMalaysiaMidnightAndKeepsLeapDayExact()
    {
        var beforeMidnight = PetOccasionCalculator.MalaysiaToday(
            DateTimeOffset.Parse("2028-02-28T15:59:59Z"));
        var midnight = PetOccasionCalculator.MalaysiaToday(
            DateTimeOffset.Parse("2028-02-28T16:00:00Z"));
        var leapBirthday = new DateOnly(2024, 2, 29);

        Assert.Equal(new DateOnly(2028, 2, 28), beforeMidnight);
        Assert.Equal(new DateOnly(2028, 2, 29), midnight);
        Assert.Null(PetOccasionCalculator.Calculate(leapBirthday, null, beforeMidnight).BirthdayAge);
        Assert.Equal(4, PetOccasionCalculator.Calculate(leapBirthday, null, midnight).BirthdayAge);
        Assert.Null(PetOccasionCalculator.Calculate(
            leapBirthday,
            null,
            new DateOnly(2027, 2, 28)).BirthdayAge);
    }

    [Fact]
    public void OccasionCalculator_SupportsFirstAndSharedAnniversaries()
    {
        var today = new DateOnly(2026, 8, 17);
        var occasions = PetOccasionCalculator.Calculate(
            new DateOnly(2025, 8, 17),
            new DateOnly(2022, 8, 17),
            today);

        Assert.Equal(1, occasions.BirthdayAge);
        Assert.Equal(4, occasions.AdoptionYears);
        Assert.Equal("20260817", occasions.CacheIdentity);
        Assert.Null(PetOccasionCalculator.Calculate(null, null, today).BirthdayAge);
    }

    [Fact]
    public async Task Renderer_OccasionCardsUsePortraitDimensionsAndIsolatedCaches()
    {
        using var memoryCache = new MemoryCache(new MemoryCacheOptions());
        var renderer = CreateRenderer(memoryCache, new CountingHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.NotFound)));
        var profile = CreateProfile();

        var birthday = await renderer.RenderAsync(
            profile,
            PublicProfileSocialCardVariant.Birthday,
            1,
            "20260817");
        var adoption = await renderer.RenderAsync(
            profile,
            PublicProfileSocialCardVariant.Adoption,
            4,
            "20260817");
        var nextBirthday = await renderer.RenderAsync(
            profile,
            PublicProfileSocialCardVariant.Birthday,
            2,
            "20270817");

        Assert.False(birthday.SequenceEqual(adoption));
        Assert.False(birthday.SequenceEqual(nextBirthday));
        using var bitmap = SKBitmap.Decode(birthday);
        Assert.Equal((PublicProfileSocialCardRenderer.ShareCardWidth, PublicProfileSocialCardRenderer.ShareCardHeight),
            (bitmap.Width, bitmap.Height));
    }

    [Theory]
    [InlineData(PublicProfileSocialCardVariant.Birthday, 1)]
    [InlineData(PublicProfileSocialCardVariant.Adoption, 4)]
    public async Task Renderer_OccasionCardsHandleLongNamesAndMissingOptionalMedia(
        PublicProfileSocialCardVariant variant,
        int count)
    {
        using var memoryCache = new MemoryCache(new MemoryCacheOptions());
        var renderer = CreateRenderer(memoryCache, new CountingHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.NotFound)));
        var profile = CreateProfile() with
        {
            Name = "A Very Long Pet Name That Must Stay Inside The Celebration Card Layout",
            Breed = null,
            ProfilePhotoUrl = null,
            CoverPhotoUrl = null
        };

        var jpeg = await renderer.RenderAsync(profile, variant, count, "20260817");

        Assert.True(jpeg.Length > 4);
        Assert.Equal(0xFF, jpeg[0]);
        Assert.Equal(0xD8, jpeg[1]);
        using var bitmap = SKBitmap.Decode(jpeg);
        Assert.Equal((PublicProfileSocialCardRenderer.ShareCardWidth, PublicProfileSocialCardRenderer.ShareCardHeight),
            (bitmap.Width, bitmap.Height));
    }

    [Fact]
    public async Task Renderer_RejectsExternalMediaWithoutFetchingIt()
    {
        var handler = new CountingHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.OK));
        using var memoryCache = new MemoryCache(new MemoryCacheOptions());
        var renderer = CreateRenderer(memoryCache, handler);
        var profile = CreateProfile() with
        {
            ProfilePhotoUrl = "https://attacker.example/private.jpg",
            CoverPhotoUrl = "http://media.mypetlink.com.my/insecure.jpg"
        };

        var jpeg = await renderer.RenderAsync(profile);

        Assert.NotEmpty(jpeg);
        Assert.Equal(0, handler.RequestCount);
    }

    [Fact]
    public async Task Renderer_UsesFallbackWhenAllowedMediaFetchFailsAndHandlesLongNames()
    {
        var handler = new CountingHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.BadGateway));
        using var memoryCache = new MemoryCache(new MemoryCacheOptions());
        var renderer = CreateRenderer(memoryCache, handler);
        var profile = CreateProfile() with
        {
            Name = "A Very Long Pet Name With Emoji 🐾 And 中文 Malay Sayang",
            ProfilePhotoUrl = "https://media.mypetlink.com.my/profile/missing.jpg",
            CoverPhotoUrl = "https://media.mypetlink.com.my/cover/missing.jpg",
            LostModeEnabled = true
        };

        var jpeg = await renderer.RenderAsync(profile);

        using var bitmap = SKBitmap.Decode(jpeg);
        Assert.NotNull(bitmap);
        Assert.Equal(PublicProfileSocialCardRenderer.Width, bitmap.Width);
        Assert.Equal(PublicProfileSocialCardRenderer.Height, bitmap.Height);
        Assert.Equal(2, handler.RequestCount);
    }

    [Fact]
    public async Task Renderer_ShareCardUsesFallbacksForMissingMediaAndOptionalSummaryFields()
    {
        using var memoryCache = new MemoryCache(new MemoryCacheOptions());
        var renderer = CreateRenderer(memoryCache, new CountingHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.NotFound)));
        var profile = CreateProfile() with
        {
            Name = "A Very Long Pet Name That Must Be Bounded Without Breaking The Portrait Layout",
            Breed = null,
            AgeDisplayLabel = "Age unknown",
            ProfilePhotoUrl = null,
            CoverPhotoUrl = null
        };

        var jpeg = await renderer.RenderAsync(profile, PublicProfileSocialCardVariant.ShareCard);

        using var bitmap = SKBitmap.Decode(jpeg);
        Assert.NotNull(bitmap);
        Assert.Equal(PublicProfileSocialCardRenderer.ShareCardWidth, bitmap.Width);
        Assert.Equal(PublicProfileSocialCardRenderer.ShareCardHeight, bitmap.Height);
    }

    [Fact]
    public async Task Renderer_InvalidAllowedHostPayloadFallsBackWithoutRenderFailure()
    {
        var handler = new CountingHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new ByteArrayContent("not an image"u8.ToArray())
                {
                    Headers = { ContentType = new("image/jpeg") }
                }
            });
        using var memoryCache = new MemoryCache(new MemoryCacheOptions());
        var renderer = CreateRenderer(memoryCache, handler);
        var profile = CreateProfile() with
        {
            ProfilePhotoUrl = "https://media.mypetlink.com.my/profile/invalid.jpg",
            CoverPhotoUrl = "https://media.mypetlink.com.my/cover/invalid.jpg"
        };

        var jpeg = await renderer.RenderAsync(profile, PublicProfileSocialCardVariant.ShareCard);

        Assert.Equal(2, handler.RequestCount);
        using var bitmap = SKBitmap.Decode(jpeg);
        Assert.Equal(PublicProfileSocialCardRenderer.ShareCardWidth, bitmap.Width);
        Assert.Equal(PublicProfileSocialCardRenderer.ShareCardHeight, bitmap.Height);
    }

    [Fact]
    public async Task Renderer_RejectsDeclaredOversizedMediaBeforeReadingIt()
    {
        var handler = new CountingHandler(_ =>
        {
            var response = new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new ByteArrayContent([0xff, 0xd8, 0xff, 0xd9])
            };
            response.Content.Headers.ContentType = new("image/jpeg");
            response.Content.Headers.ContentLength = 8 * 1024 * 1024 + 1;
            return response;
        });
        using var memoryCache = new MemoryCache(new MemoryCacheOptions());
        var renderer = CreateRenderer(memoryCache, handler);
        var profile = CreateProfile() with
        {
            ProfilePhotoUrl = "https://media.mypetlink.com.my/profile/large.jpg",
            CoverPhotoUrl = "https://media.mypetlink.com.my/cover/large.jpg"
        };

        var jpeg = await renderer.RenderAsync(profile, PublicProfileSocialCardVariant.ShareCard);

        Assert.Equal(2, handler.RequestCount);
        Assert.NotEmpty(jpeg);
    }

    [Fact]
    public async Task Renderer_MediaTimeoutFallsBackWithoutRenderFailure()
    {
        var handler = new AsyncCountingHandler(_ =>
            Task.FromException<HttpResponseMessage>(new OperationCanceledException("Timed out.")));
        using var memoryCache = new MemoryCache(new MemoryCacheOptions());
        var renderer = CreateRenderer(memoryCache, handler);
        var profile = CreateProfile() with
        {
            ProfilePhotoUrl = "https://media.mypetlink.com.my/profile/slow.jpg",
            CoverPhotoUrl = "https://media.mypetlink.com.my/cover/slow.jpg"
        };

        var jpeg = await renderer.RenderAsync(profile, PublicProfileSocialCardVariant.ShareCard);

        Assert.Equal(2, handler.RequestCount);
        Assert.NotEmpty(jpeg);
    }

    [Fact]
    public async Task Renderer_ConcurrentShareCardRequestsUseOneInflightGeneration()
    {
        var handler = new AsyncCountingHandler(async cancellationToken =>
        {
            await Task.Delay(100, cancellationToken);
            return new HttpResponseMessage(HttpStatusCode.NotFound);
        });
        using var memoryCache = new MemoryCache(new MemoryCacheOptions());
        var renderer = CreateRenderer(memoryCache, handler);
        var profile = CreateProfile() with
        {
            ProfilePhotoUrl = "https://media.mypetlink.com.my/profile/missing.jpg",
            CoverPhotoUrl = "https://media.mypetlink.com.my/cover/missing.jpg"
        };

        var first = renderer.RenderAsync(profile, PublicProfileSocialCardVariant.ShareCard);
        var second = renderer.RenderAsync(profile, PublicProfileSocialCardVariant.ShareCard);
        var results = await Task.WhenAll(first, second);

        Assert.Same(results[0], results[1]);
        Assert.Equal(2, handler.RequestCount);
    }

    [Fact]
    public async Task Renderer_LostModeVariantDiffersFromTheNormalCard()
    {
        using var memoryCache = new MemoryCache(new MemoryCacheOptions());
        var renderer = CreateRenderer(memoryCache, new CountingHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.NotFound)));
        var normal = CreateProfile();
        var lost = normal with
        {
            PublicProfileVersion = "fedcba9876543210",
            LostModeEnabled = true
        };

        var normalJpeg = await renderer.RenderAsync(normal);
        var lostJpeg = await renderer.RenderAsync(lost);

        Assert.False(normalJpeg.SequenceEqual(lostJpeg));
        using var normalBitmap = SKBitmap.Decode(normalJpeg);
        using var lostBitmap = SKBitmap.Decode(lostJpeg);
        Assert.Equal((PublicProfileSocialCardRenderer.Width, PublicProfileSocialCardRenderer.Height),
            (normalBitmap.Width, normalBitmap.Height));
        Assert.Equal((PublicProfileSocialCardRenderer.Width, PublicProfileSocialCardRenderer.Height),
            (lostBitmap.Width, lostBitmap.Height));
    }

    [Fact]
    public async Task Renderer_ShareCardPreservesLostModeTreatment()
    {
        using var memoryCache = new MemoryCache(new MemoryCacheOptions());
        var renderer = CreateRenderer(memoryCache, new CountingHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.NotFound)));
        var normal = CreateProfile();
        var lost = normal with
        {
            PublicProfileVersion = "fedcba9876543210",
            LostModeEnabled = true
        };

        var normalJpeg = await renderer.RenderAsync(normal, PublicProfileSocialCardVariant.ShareCard);
        var lostJpeg = await renderer.RenderAsync(lost, PublicProfileSocialCardVariant.ShareCard);

        Assert.False(normalJpeg.SequenceEqual(lostJpeg));
        using var lostBitmap = SKBitmap.Decode(lostJpeg);
        Assert.Equal((PublicProfileSocialCardRenderer.ShareCardWidth, PublicProfileSocialCardRenderer.ShareCardHeight),
            (lostBitmap.Width, lostBitmap.Height));
    }

    private static string? DecodeQr(byte[] jpeg)
    {
        using var bitmap = SKBitmap.Decode(jpeg);
        var rgb = new byte[bitmap.Width * bitmap.Height * 3];
        var pixels = bitmap.Pixels;
        for (var index = 0; index < pixels.Length; index += 1)
        {
            var offset = index * 3;
            rgb[offset] = pixels[index].Red;
            rgb[offset + 1] = pixels[index].Green;
            rgb[offset + 2] = pixels[index].Blue;
        }

        var source = new RGBLuminanceSource(
            rgb,
            bitmap.Width,
            bitmap.Height,
            RGBLuminanceSource.BitmapFormat.RGB24);
        var reader = new BarcodeReaderGeneric
        {
            Options = new DecodingOptions
            {
                PossibleFormats = [BarcodeFormat.QR_CODE],
                TryHarder = true
            }
        };
        return reader.Decode(source)?.Text;
    }

    private static byte[] CreatePhotoFixture()
    {
        using var surface = SKSurface.Create(new SKImageInfo(960, 720));
        var canvas = surface.Canvas;
        canvas.Clear(SKColor.Parse("#1E5C8A"));
        using var mint = new SKPaint { Color = SKColor.Parse("#72D5B0"), IsAntialias = true };
        using var coral = new SKPaint { Color = SKColor.Parse("#FF8F79"), IsAntialias = true };
        using var cream = new SKPaint { Color = SKColor.Parse("#FFF2D8"), IsAntialias = true };
        canvas.DrawCircle(210, 350, 230, mint);
        canvas.DrawCircle(720, 245, 180, coral);
        canvas.DrawRect(510, 440, 390, 220, cream);
        using var image = surface.Snapshot();
        using var data = image.Encode(SKEncodedImageFormat.Jpeg, 90);
        return data.ToArray();
    }

    private static HttpResponseMessage ImageResponse(byte[] fixture)
    {
        return new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new ByteArrayContent(fixture)
            {
                Headers = { ContentType = new("image/jpeg") }
            }
        };
    }

    [Theory]
    [InlineData("Bo")]
    [InlineData("Topu")]
    [InlineData("Milo")]
    [InlineData("Luna")]
    [InlineData("Maximilian Pup")]
    [InlineData("Sir Reginald Fluffington")]
    [InlineData("Sir Reginald Fluffington The Third Of Bangsar")]
    public async Task ShareCard_KeepsTheBrandLockupClearOfThePetName(string petName)
    {
        using var memoryCache = new MemoryCache(new MemoryCacheOptions());
        var renderer = CreateRenderer(memoryCache, new CountingHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.NotFound)));

        var jpeg = await renderer.RenderAsync(
            CreateProfile() with { Name = petName },
            PublicProfileSocialCardVariant.ShareCard);

        using var bitmap = SKBitmap.Decode(jpeg);
        Assert.Equal(PublicProfileSocialCardRenderer.ShareCardWidth, bitmap.Width);
        Assert.Equal(PublicProfileSocialCardRenderer.ShareCardHeight, bitmap.Height);

        var bands = FindInkBands(bitmap, 770, 1060);

        // The brand lockup and the name must be separate blocks of ink with at
        // least one clear row between them. A collision merges them into one.
        Assert.True(
            bands.Count >= 2,
            $"Expected the logo and the name to render as separate blocks for '{petName}', found {bands.Count}.");

        var logoBand = bands[0];
        var nameBand = bands[1];
        var separation = nameBand.Top - logoBand.Bottom;
        Assert.True(
            separation >= 6,
            $"Logo and name are only {separation}px apart for '{petName}'; they must not touch.");
    }

    [Theory]
    [InlineData("Bo")]
    [InlineData("Topu")]
    [InlineData("Sir Reginald Fluffington The Third Of Bangsar")]
    public async Task ShareCard_KeepsTextContentClearOfTheQrFooter(string petName)
    {
        using var memoryCache = new MemoryCache(new MemoryCacheOptions());
        var renderer = CreateRenderer(memoryCache, new CountingHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.NotFound)));

        var jpeg = await renderer.RenderAsync(
            CreateProfile() with { Name = petName },
            PublicProfileSocialCardVariant.ShareCard);

        using var bitmap = SKBitmap.Decode(jpeg);
        var bands = FindInkBands(bitmap, 770, (int)PublicProfileSocialCardRenderer.ShareCardQrFooterTop - 2);

        Assert.NotEmpty(bands);
        Assert.True(
            bands[^1].Bottom < PublicProfileSocialCardRenderer.ShareCardQrFooterTop,
            $"Share Card text runs into the QR footer for '{petName}'.");
    }

    [Fact]
    public async Task ShareCard_KeepsTheNameClearOfTheLogoWithARealPetPhoto()
    {
        using var memoryCache = new MemoryCache(new MemoryCacheOptions());
        var renderer = CreateRenderer(memoryCache, new CountingHandler(_ =>
            ImageResponse(SolidJpeg(600, 600, new SKColor(90, 140, 200)))));

        var jpeg = await renderer.RenderAsync(
            CreateProfile() with
            {
                Name = "Topu",
                ProfilePhotoUrl = "https://media.mypetlink.com.my/pets/topu/profile.jpg",
                CoverPhotoUrl = "https://media.mypetlink.com.my/pets/topu/cover.jpg"
            },
            PublicProfileSocialCardVariant.ShareCard);

        using var bitmap = SKBitmap.Decode(jpeg);
        var bands = FindInkBands(bitmap, 770, 1060);

        Assert.True(bands.Count >= 2, "Expected separate logo and name blocks with a photo present.");
        Assert.True(bands[1].Top - bands[0].Bottom >= 6, "Logo and name must not touch when a photo is present.");
    }

    [Theory]
    [InlineData(PublicProfileSocialCardVariant.Birthday)]
    [InlineData(PublicProfileSocialCardVariant.Adoption)]
    public async Task OccasionCard_KeepsTheBrandLockupClearOfTheQrFooter(
        PublicProfileSocialCardVariant variant)
    {
        using var memoryCache = new MemoryCache(new MemoryCacheOptions());
        var renderer = CreateRenderer(memoryCache, new CountingHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.NotFound)));

        var jpeg = await renderer.RenderAsync(
            CreateProfile() with { Name = "Bo" },
            variant,
            3,
            "20260817");

        using var bitmap = SKBitmap.Decode(jpeg);
        Assert.Equal(PublicProfileSocialCardRenderer.ShareCardWidth, bitmap.Width);
        Assert.Equal(PublicProfileSocialCardRenderer.ShareCardHeight, bitmap.Height);

        // The brand lockup and the QR panel must be separate: they used to be laid
        // out from fixed offsets and collided once the real logo, which carries a
        // tagline, replaced the shorter text fallback. The QR panel is a filled
        // white card, so the check is against the panel rather than its modules.
        var bands = FindInkBands(bitmap, 940, bitmap.Height - 1);
        Assert.NotEmpty(bands);
        var panelTop = FindQrPanelTop(bitmap, 940);
        Assert.NotNull(panelTop);

        var logoBand = bands.First(band => band.Bottom < panelTop!.Value);
        Assert.True(
            panelTop!.Value - logoBand.Bottom >= 12,
            $"The brand lockup ends at {logoBand.Bottom} but the QR panel starts at {panelTop}; they must stay clearly apart.");
        Assert.True(
            bands[^1].Bottom < bitmap.Height,
            "Occasion card content must stay inside the card.");
    }

    /// <summary>
    /// First row of the QR code's white panel, found as a wide run of pure white
    /// against the card's tinted background.
    /// </summary>
    private static int? FindQrPanelTop(SKBitmap bitmap, int fromY)
    {
        var centre = bitmap.Width / 2;
        for (var y = fromY; y < bitmap.Height; y++)
        {
            var white = 0;
            for (var x = centre - 90; x <= centre + 90; x++)
            {
                var pixel = bitmap.GetPixel(x, y);
                if (pixel.Red > 250 && pixel.Green > 250 && pixel.Blue > 250)
                {
                    white++;
                }
            }

            if (white > 150)
            {
                return y;
            }
        }

        return null;
    }

    private readonly record struct InkBand(int Top, int Bottom);

    /// <summary>
    /// Contiguous runs of rows containing drawn content in the centre column of
    /// the card, used to assert that separate elements stay separate without
    /// hard-coding their exact positions.
    /// </summary>
    private static List<InkBand> FindInkBands(SKBitmap bitmap, int fromY, int toY)
    {
        const int inspectHalfWidth = 380;
        var centre = bitmap.Width / 2;
        var left = Math.Max(0, centre - inspectHalfWidth);
        var right = Math.Min(bitmap.Width - 1, centre + inspectHalfWidth);
        var bands = new List<InkBand>();
        var bandTop = -1;

        for (var y = Math.Max(0, fromY); y <= Math.Min(bitmap.Height - 1, toY); y++)
        {
            var hasInk = false;
            for (var x = left; x <= right; x++)
            {
                if (IsInk(bitmap.GetPixel(x, y)))
                {
                    hasInk = true;
                    break;
                }
            }

            if (hasInk && bandTop < 0)
            {
                bandTop = y;
            }
            else if (!hasInk && bandTop >= 0)
            {
                bands.Add(new InkBand(bandTop, y - 1));
                bandTop = -1;
            }
        }

        if (bandTop >= 0)
        {
            bands.Add(new InkBand(bandTop, Math.Min(bitmap.Height - 1, toY)));
        }

        return bands;
    }

    /// <summary>
    /// True when a pixel is clearly drawn content rather than the card's cream
    /// background or its very soft decorative tints.
    /// </summary>
    private static bool IsInk(SKColor pixel)
    {
        var brightness = (pixel.Red * 0.299) + (pixel.Green * 0.587) + (pixel.Blue * 0.114);
        return brightness < 200;
    }

    private static byte[] SolidJpeg(int width, int height, SKColor color)
    {
        using var surface = SKSurface.Create(new SKImageInfo(width, height));
        surface.Canvas.Clear(color);
        using var image = surface.Snapshot();
        using var data = image.Encode(SKEncodedImageFormat.Jpeg, 90);
        return data.ToArray();
    }

    private static PublicProfileSocialCardRenderer CreateRenderer(
        IMemoryCache memoryCache,
        HttpMessageHandler handler,
        string publicSiteBaseUrl = "https://mypetlink.com.my")
    {
        return new PublicProfileSocialCardRenderer(
            new TestHttpClientFactory(handler),
            memoryCache,
            new TestWebHostEnvironment(),
            Options.Create(new CloudflareR2Options
            {
                PublicBaseUrl = "https://media.mypetlink.com.my"
            }),
            Options.Create(new PublicSiteOptions
            {
                BaseUrl = publicSiteBaseUrl
            }));
    }

    private static PublicProfileSocialResponse CreateProfile()
    {
        return new PublicProfileSocialResponse(
            PublicCode: "public-code",
            PublicSlug: "topu-public-code",
            PublicProfileVersion: "0123456789abcdef",
            Name: "Topu",
            Species: "Cat",
            CustomSpecies: null,
            Breed: "Domestic Shorthair",
            AgeDisplayLabel: "Under 1 year old",
            LifecycleStatus: PetLifecycleStatus.Active,
            LostModeEnabled: false,
            ProfilePhotoUrl: null,
            CoverPhotoUrl: null,
            CoverPositionX: 50,
            CoverPositionY: 50);
    }

    private sealed class TestHttpClientFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private sealed class CountingHandler(
        Func<HttpRequestMessage, HttpResponseMessage> responseFactory) : HttpMessageHandler
    {
        public int RequestCount { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            RequestCount += 1;
            return Task.FromResult(responseFactory(request));
        }
    }

    private sealed class AsyncCountingHandler(
        Func<CancellationToken, Task<HttpResponseMessage>> responseFactory) : HttpMessageHandler
    {
        private int _requestCount;
        public int RequestCount => _requestCount;

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            Interlocked.Increment(ref _requestCount);
            return responseFactory(cancellationToken);
        }
    }

    private sealed class TestWebHostEnvironment : IWebHostEnvironment
    {
        public string ApplicationName { get; set; } = "MyPetLink.Api.Tests";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public string EnvironmentName { get; set; } = "Development";
        public string WebRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
    }
}
