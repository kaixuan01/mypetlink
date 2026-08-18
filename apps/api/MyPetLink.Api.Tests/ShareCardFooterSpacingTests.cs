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
/// The closing "mypetlink.com.my" line used to sit hard against the bottom edge
/// of the 1080x1350 card. These tests pin the breathing room so it cannot creep
/// back, without freezing the exact layout numbers.
/// </summary>
public sealed class ShareCardFooterSpacingTests
{
    [Fact]
    public void DomainBaseline_LeavesRoomBelowItsOwnDescenders()
    {
        var remaining = PublicProfileSocialCardRenderer.ShareCardHeight
            - PublicProfileSocialCardRenderer.ShareCardDomainBaseline;

        Assert.True(
            remaining >= PublicProfileSocialCardRenderer.ShareCardFooterBottomPadding,
            $"Only {remaining}px sit below the domain baseline; at least "
            + $"{PublicProfileSocialCardRenderer.ShareCardFooterBottomPadding}px are required.");
    }

    [Theory]
    [InlineData(PublicProfileSocialCardVariant.ShareCard)]
    [InlineData(PublicProfileSocialCardVariant.Birthday)]
    [InlineData(PublicProfileSocialCardVariant.Adoption)]
    public async Task RenderedCard_KeepsClearSpaceUnderTheDomainLine(
        PublicProfileSocialCardVariant variant)
    {
        using var memoryCache = new MemoryCache(new MemoryCacheOptions());
        var renderer = CreateRenderer(memoryCache);

        var jpeg = await renderer.RenderAsync(
            CreateProfile(),
            variant,
            variant == PublicProfileSocialCardVariant.OpenGraph ? null : 3);

        using var bitmap = SKBitmap.Decode(jpeg);
        Assert.Equal(1080, bitmap.Width);
        Assert.Equal(1350, bitmap.Height);

        var lastInkRow = FindLastInkRow(bitmap);
        Assert.NotNull(lastInkRow);

        var clearance = bitmap.Height - 1 - lastInkRow!.Value;
        Assert.True(
            clearance >= 30,
            $"{variant}: only {clearance}px of clear space below the last drawn row; "
            + "the domain line looks cramped against the edge.");

        // Nothing may be clipped either: the last ink must be comfortably above
        // the final row.
        Assert.True(lastInkRow.Value < bitmap.Height - 1, $"{variant}: content reaches the card edge.");
    }

    [Fact]
    public async Task ShareCardFooter_HasMoreBottomRoomThanTheV3Layout()
    {
        // v3 drew the domain at 1068 + 218 + 56 = 1342 on a 1350px card, which
        // is what the owner review called out.
        const float previousDomainBaseline = 1342f;
        var gained = previousDomainBaseline - PublicProfileSocialCardRenderer.ShareCardDomainBaseline;

        Assert.True(
            gained >= 25,
            $"The domain line only moved up {gained}px; the review asked for noticeably more room.");

        using var memoryCache = new MemoryCache(new MemoryCacheOptions());
        var renderer = CreateRenderer(memoryCache);
        var jpeg = await renderer.RenderAsync(CreateProfile(), PublicProfileSocialCardVariant.ShareCard);

        using var bitmap = SKBitmap.Decode(jpeg);
        var lastInkRow = FindLastInkRow(bitmap);
        Assert.NotNull(lastInkRow);
        Assert.True(
            bitmap.Height - 1 - lastInkRow!.Value >= 30,
            "The rendered Share Card still crowds its bottom edge.");
    }

    [Fact]
    public async Task ShareCardQr_StaysDarkOnWhiteWhateverTheTheme()
    {
        using var memoryCache = new MemoryCache(new MemoryCacheOptions());
        var renderer = CreateRenderer(memoryCache);

        foreach (var theme in ShareCardPalette.KnownThemes)
        {
            var jpeg = await renderer.RenderAsync(
                CreateProfile() with { ProfileTheme = theme, PublicProfileVersion = theme },
                PublicProfileSocialCardVariant.ShareCard);

            using var bitmap = SKBitmap.Decode(jpeg);
            var qrTop = (int)PublicProfileSocialCardRenderer.ShareCardQrFooterTop;
            var centre = bitmap.Width / 2;

            var darkest = 255;
            var lightest = 0;
            for (var y = qrTop + 8; y < qrTop + PublicProfileSocialCardRenderer.ShareCardQrSize - 8; y++)
            {
                for (var x = centre - 80; x <= centre + 80; x++)
                {
                    var pixel = bitmap.GetPixel(x, y);
                    var luminance = (pixel.Red + pixel.Green + pixel.Blue) / 3;
                    darkest = Math.Min(darkest, luminance);
                    lightest = Math.Max(lightest, luminance);
                }
            }

            Assert.True(darkest < 70, $"{theme}: QR modules are not dark enough ({darkest}).");
            Assert.True(lightest > 220, $"{theme}: QR quiet space is not light enough ({lightest}).");
        }
    }

    /// <summary>
    /// Last row of drawn content in the centre column, where the footer text
    /// lives. The corner decorations deliberately bleed to the card edge, so
    /// they are outside the inspected band.
    /// </summary>
    private static int? FindLastInkRow(SKBitmap bitmap)
    {
        var background = bitmap.GetPixel(bitmap.Width / 2, bitmap.Height - 3);
        var centre = bitmap.Width / 2;
        for (var y = bitmap.Height - 1; y >= 0; y--)
        {
            for (var x = centre - 260; x <= centre + 260; x++)
            {
                var pixel = bitmap.GetPixel(x, y);
                if (Math.Abs(pixel.Red - background.Red) > 24
                    || Math.Abs(pixel.Green - background.Green) > 24
                    || Math.Abs(pixel.Blue - background.Blue) > 24)
                {
                    return y;
                }
            }
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
            PublicSlug: "linko-public-code",
            PublicProfileVersion: "0123456789abcdef",
            Name: "Linko",
            Species: "Cat",
            CustomSpecies: null,
            Breed: "Domestic Shorthair",
            AgeDisplayLabel: "4 years old",
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
