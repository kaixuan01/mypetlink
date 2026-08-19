using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;
using SkiaSharp;

namespace MyPetLink.Api.Tests;

/// <summary>
/// The tagline must never slide under the QR panel.
///
/// v4 shipped with exactly that defect in production: raising the QR footer for
/// bottom breathing room left the content above it flowing freely, and a short
/// name - which takes the largest type - pushed the tagline down behind the QR.
/// The earlier guard only inspected rows above the footer top, so text drawn
/// below it was invisible to the test. These tests inspect the collision zone
/// itself, on the real pixels.
/// </summary>
public sealed class ShareCardTaglineClearanceTests
{
    [Theory]
    // The production case: a four-letter name with a full metadata line.
    [InlineData("Topu", "Domestic Shorthair", "Under 1 year old")]
    [InlineData("Bo", "Domestic Shorthair", "Under 1 year old")]
    [InlineData("Linko", null, null)]
    [InlineData("VariantTestPet", "Domestic Shorthair", "4 years old")]
    [InlineData("Sir Reginald Fluffington The Third Of Bangsar", "Domestic Shorthair", "12 years old")]
    public async Task TaglineNeverTouchesTheQrPanel(string petName, string? breed, string? age)
    {
        using var memoryCache = new MemoryCache(new MemoryCacheOptions());
        var renderer = CreateRenderer(memoryCache);

        var jpeg = await renderer.RenderAsync(
            CreateProfile() with
            {
                Name = petName,
                Breed = breed,
                AgeDisplayLabel = age ?? "Age unknown",
                PublicProfileVersion = petName,
            },
            PublicProfileSocialCardVariant.ShareCard);

        using var bitmap = SKBitmap.Decode(jpeg);

        var haloTop = (int)(PublicProfileSocialCardRenderer.ShareCardQrFooterTop
            - PublicProfileSocialCardRenderer.ShareCardQrHaloInset);

        // Nothing but the halo and the panel may occupy the QR band. The panel
        // is a wide white run; the tagline is a tinted pill with dark glyphs,
        // so any dark ink in the band above the panel is a collision.
        var panelTop = FindQrPanelTop(bitmap, haloTop);
        Assert.NotNull(panelTop);

        for (var y = haloTop; y < panelTop!.Value; y++)
        {
            var darkPixels = 0;
            for (var x = 200; x < bitmap.Width - 200; x++)
            {
                var pixel = bitmap.GetPixel(x, y);
                var luminance = (pixel.Red + pixel.Green + pixel.Blue) / 3;
                if (luminance < 140) darkPixels++;
            }

            Assert.True(
                darkPixels < 12,
                $"'{petName}': {darkPixels} dark pixels at row {y}, inside the QR halo band "
                + $"({haloTop}-{panelTop}). The tagline is overlapping the QR panel.");
        }
    }

    [Theory]
    [InlineData("Topu", "Domestic Shorthair", "Under 1 year old")]
    [InlineData("Bo", "Domestic Shorthair", "Under 1 year old")]
    [InlineData("Linko", null, null)]
    [InlineData("VariantTestPet", "Domestic Shorthair", "4 years old")]
    [InlineData("Sir Reginald Fluffington The Third Of Bangsar", "Domestic Shorthair", "12 years old")]
    public void TaglineNeverLandsOnTheMetadataLine(string petName, string? breed, string? age)
    {
        // v5 fixed the QR overlap by clamping the tagline upward, which simply
        // moved the collision onto the metadata line above it. Both gaps have
        // to hold at once.
        var profile = CreateProfile() with
        {
            Name = petName,
            Breed = breed,
            AgeDisplayLabel = age ?? "Age unknown",
        };
        var summary = string.Join(
            "  -  ",
            PublicProfileSocialCardRenderer.BuildSummaryParts(profile));

        // Worst case: the brand lockup fills its whole band.
        var logoBottom = PublicProfileSocialCardRenderer.ShareCardLogoBottomBound;
        var layout = PublicProfileSocialCardRenderer.ResolveShareCardTextLayout(
            petName,
            summary,
            logoBottom);

        Assert.True(
            layout.TaglineBaseline <= PublicProfileSocialCardRenderer.ShareCardTaglineMaxBaseline,
            $"'{petName}': tagline baseline {layout.TaglineBaseline} runs into the QR halo.");

        if (layout.SummaryBaseline is { } summaryBaseline)
        {
            var taglineTop = layout.TaglineBaseline
                - PublicProfileSocialCardRenderer.ShareCardTaglineAboveBaseline;
            Assert.True(
                taglineTop > summaryBaseline,
                $"'{petName}': the tagline starts at {taglineTop} but the metadata "
                + $"line sits at {summaryBaseline}; they overlap.");
        }

        Assert.True(layout.NameBaseline > logoBottom, $"'{petName}': the name overlaps the logo.");
    }

    [Fact]
    public void TaglineBaselineIsClampedClearOfTheHalo()
    {
        var taglineBottom = PublicProfileSocialCardRenderer.ShareCardTaglineMaxBaseline
            + PublicProfileSocialCardRenderer.ShareCardTaglineBelowBaseline;
        var haloTop = PublicProfileSocialCardRenderer.ShareCardQrFooterTop
            - PublicProfileSocialCardRenderer.ShareCardQrHaloInset;

        Assert.True(
            taglineBottom <= haloTop - PublicProfileSocialCardRenderer.ShareCardTaglineToQrGap,
            $"The tagline may reach {taglineBottom} but the QR halo starts at {haloTop}.");
    }

    /// <summary>First row of the QR code's white panel.</summary>
    private static int? FindQrPanelTop(SKBitmap bitmap, int fromY)
    {
        var centre = bitmap.Width / 2;
        for (var y = fromY; y < bitmap.Height; y++)
        {
            var white = 0;
            for (var x = centre - 90; x <= centre + 90; x++)
            {
                var pixel = bitmap.GetPixel(x, y);
                if (pixel.Red > 250 && pixel.Green > 250 && pixel.Blue > 250) white++;
            }

            if (white > 150) return y;
        }

        return null;
    }

    private static PublicProfileSocialCardRenderer CreateRenderer(IMemoryCache memoryCache)
        => new(
            new StubHttpClientFactory(),
            memoryCache,
            new StubWebHostEnvironment(),
            Options.Create(new CloudflareR2Options
            {
                PublicBaseUrl = "https://media.mypetlink.com.my"
            }),
            Options.Create(new PublicSiteOptions
            {
                BaseUrl = "https://mypetlink.com.my"
            }));

    private static PublicProfileSocialResponse CreateProfile()
        => new(
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
            CoverPositionY: 50,
            ProfileTheme: "default");

    private sealed class StubHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(new NotFoundHandler(), disposeHandler: false);
    }

    private sealed class NotFoundHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
            => Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound));
    }

    private sealed class StubWebHostEnvironment : IWebHostEnvironment
    {
        public string ApplicationName { get; set; } = "MyPetLink.Api.Tests";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public string EnvironmentName { get; set; } = "Production";
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
        public string WebRootPath { get; set; } = AppContext.BaseDirectory;
    }
}
