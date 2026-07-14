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
            }));

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

        pet.PublicProfile.IsPublicProfileEnabled = false;
        pet.PublicProfile.UpdatedAt = DateTimeOffset.UtcNow.AddMinutes(1);
        await db.SaveChangesAsync();

        var privateException = await Assert.ThrowsAsync<ApiException>(() =>
            service.GetSocialByPublicSlugAsync("nori-futurepet1234"));
        Assert.Equal(404, privateException.StatusCode);

        pet.PublicProfile.IsPublicProfileEnabled = true;
        pet.LifecycleStatus = PetLifecycleStatus.Archived;
        pet.UpdatedAt = DateTimeOffset.UtcNow.AddMinutes(1);
        await db.SaveChangesAsync();

        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            service.GetSocialByPublicSlugAsync("nori-futurepet1234"));
        Assert.Equal(404, exception.StatusCode);
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
            7,
            new[]
            {
                original,
                renamed,
                newTheme,
                newProfilePhoto,
                newCoverPhoto,
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

    private static PublicProfileSocialCardRenderer CreateRenderer(
        IMemoryCache memoryCache,
        HttpMessageHandler handler)
    {
        return new PublicProfileSocialCardRenderer(
            new TestHttpClientFactory(handler),
            memoryCache,
            new TestWebHostEnvironment(),
            Options.Create(new CloudflareR2Options
            {
                PublicBaseUrl = "https://media.mypetlink.com.my"
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
