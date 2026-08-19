using System.Collections.Concurrent;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Storage;
using QRCoder;
using SkiaSharp;

namespace MyPetLink.Api.Services;

public sealed class PublicProfileSocialCardRenderer : IPublicProfileSocialCardRenderer
{
    public const int Width = 1200;
    public const int Height = 630;
    public const int ShareCardWidth = 1080;
    public const int ShareCardHeight = 1350;
    public const int ShareCardQrSize = 218;

    // Portrait Share Card text rhythm. These are gaps between measured ink
    // edges, not offsets from a band top, so every name size keeps the same
    // visible separation.
    internal const float ShareCardLogoToNameGap = 14f;
    /// <summary>
    /// Occasion cards put the QR panel directly under the brand lockup, and the
    /// panel is a filled white card rather than text, so it needs more clearance
    /// than a text-to-text gap.
    /// </summary>
    internal const float OccasionLogoToQrGap = 30f;
    internal const float ShareCardNameToSummaryGap = 16f;
    internal const float ShareCardSummaryToActionGap = 18f;
    /// <summary>Distance from the action block's top edge to its text baseline.</summary>
    internal const float ShareCardActionBaselineOffset = 39f;
    /// <summary>Top of the QR footer; the action block must finish above it.</summary>
    public const float ShareCardQrFooterTop = 1026f;

    /// <summary>How far the themed halo extends beyond the QR panel.</summary>
    public const float ShareCardQrHaloInset = 16f;

    /// <summary>Clear space required between the tagline and the QR halo.</summary>
    public const float ShareCardTaglineToQrGap = 12f;

    /// <summary>
    /// Lowest baseline the tagline may use. The content above it flows from the
    /// logo, so a short name - which gets the largest type - pushes the whole
    /// block down; without this clamp it slid under the QR panel.
    /// </summary>
    public static float ShareCardTaglineMaxBaseline =>
        ShareCardQrFooterTop
        - ShareCardQrHaloInset
        - ShareCardTaglineToQrGap
        - ShareCardTaglineBelowBaseline;

    /// <summary>How far the tagline pill extends below its own baseline.</summary>
    public const float ShareCardTaglineBelowBaseline = 25f;

    /// <summary>How far the tagline pill extends above its own baseline.</summary>
    public const float ShareCardTaglineAboveBaseline = 39f;

    /// <summary>Baseline gap from the QR panel to the scan instruction.</summary>
    public const float ShareCardQrToScanGap = 30f;

    /// <summary>Baseline gap from the scan instruction to the domain line.</summary>
    public const float ShareCardScanToDomainGap = 28f;

    /// <summary>
    /// Clear space the domain line must keep below its own descenders. The
    /// owner review flagged the domain as cramped against the bottom edge, so
    /// this is asserted in tests rather than left to drift.
    /// </summary>
    public const float ShareCardFooterBottomPadding = 46f;

    private const string BrandLogoResourceName = "MyPetLink.Api.Assets.Brand.mypetlink-logo-horizontal.png";

    private const int MaxSourceImageBytes = 8 * 1024 * 1024;
    private const int MaxSourceImageDimension = 8192;
    private const long MaxSourceImagePixels = 40_000_000;
    private static readonly TimeSpan MediaFetchTimeout = TimeSpan.FromSeconds(4.5);
    private readonly ConcurrentDictionary<string, Lazy<Task<byte[]>>> _inflight = new();
    private readonly CloudflareR2Options _r2Options;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IWebHostEnvironment _hostEnvironment;
    private readonly IMemoryCache _memoryCache;
    private readonly Uri? _publicSiteBaseUri;

    public PublicProfileSocialCardRenderer(
        IHttpClientFactory httpClientFactory,
        IMemoryCache memoryCache,
        IWebHostEnvironment hostEnvironment,
        IOptions<CloudflareR2Options> r2Options,
        IOptions<PublicSiteOptions> publicSiteOptions)
    {
        _httpClientFactory = httpClientFactory;
        _memoryCache = memoryCache;
        _hostEnvironment = hostEnvironment;
        _r2Options = r2Options.Value;
        _publicSiteBaseUri = ResolvePublicSiteBaseUri(
            publicSiteOptions.Value.BaseUrl,
            hostEnvironment.IsDevelopment());
    }

    public async Task<byte[]> RenderAsync(
        PublicProfileSocialResponse profile,
        PublicProfileSocialCardVariant variant = PublicProfileSocialCardVariant.OpenGraph,
        int? occasionCount = null,
        string? occasionCacheIdentity = null,
        CancellationToken cancellationToken = default)
    {
        var cacheKey = $"public-social-card:{variant.CacheIdentity()}:{profile.PublicCode}:{profile.PublicProfileVersion}:{occasionCacheIdentity}:{occasionCount}";
        if (_memoryCache.TryGetValue<byte[]>(cacheKey, out var cached) && cached is not null)
        {
            return cached;
        }

        var generation = _inflight.GetOrAdd(
            cacheKey,
            _ => new Lazy<Task<byte[]>>(
                () => GenerateAndCacheAsync(cacheKey, profile, variant, occasionCount, cancellationToken),
                LazyThreadSafetyMode.ExecutionAndPublication));

        try
        {
            return await generation.Value;
        }
        finally
        {
            _inflight.TryRemove(new KeyValuePair<string, Lazy<Task<byte[]>>>(cacheKey, generation));
        }
    }

    private async Task<byte[]> GenerateAndCacheAsync(
        string cacheKey,
        PublicProfileSocialResponse profile,
        PublicProfileSocialCardVariant variant,
        int? occasionCount,
        CancellationToken cancellationToken)
    {
        if (_memoryCache.TryGetValue<byte[]>(cacheKey, out var cached) && cached is not null)
        {
            return cached;
        }

        var profileImageTask = LoadPublicImageAsync(profile.ProfilePhotoUrl, cancellationToken);
        var coverImageTask = LoadPublicImageAsync(profile.CoverPhotoUrl, cancellationToken);
        await Task.WhenAll(profileImageTask, coverImageTask);

        using var profileImage = DecodeImage(await profileImageTask);
        using var coverImage = DecodeImage(await coverImageTask);
        using var logo = LoadLogo();
        var publicProfileUrl = variant == PublicProfileSocialCardVariant.OpenGraph
            ? null
            : BuildPublicProfileUrl(profile.PublicSlug);
        var jpeg = variant switch
        {
            PublicProfileSocialCardVariant.ShareCard => DrawShareCard(profile, profileImage, coverImage, logo, publicProfileUrl!),
            PublicProfileSocialCardVariant.Birthday => DrawOccasionCard(profile, profileImage, coverImage, logo, publicProfileUrl!, occasionCount ?? 0, true),
            PublicProfileSocialCardVariant.Adoption => DrawOccasionCard(profile, profileImage, coverImage, logo, publicProfileUrl!, occasionCount ?? 0, false),
            _ => DrawOpenGraphCard(profile, profileImage, coverImage, logo)
        };

        _memoryCache.Set(
            cacheKey,
            jpeg,
            new MemoryCacheEntryOptions
            {
                SlidingExpiration = TimeSpan.FromDays(2),
                AbsoluteExpirationRelativeToNow = TimeSpan.FromDays(7)
            });

        return jpeg;
    }

    private async Task<byte[]?> LoadPublicImageAsync(
        string? value,
        CancellationToken cancellationToken)
    {
        if (!TryValidatePublicMediaUrl(value, out var url))
        {
            return null;
        }

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(MediaFetchTimeout);

        try
        {
            var client = _httpClientFactory.CreateClient("PublicProfileSocialMedia");
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Accept.ParseAdd("image/jpeg, image/png, image/webp");
            using var response = await client.SendAsync(
                request,
                HttpCompletionOption.ResponseHeadersRead,
                timeout.Token);

            if (!response.IsSuccessStatusCode || IsRedirect(response.StatusCode))
            {
                return null;
            }

            var mediaType = response.Content.Headers.ContentType?.MediaType?.ToLowerInvariant();
            if (mediaType is not ("image/jpeg" or "image/png" or "image/webp"))
            {
                return null;
            }

            if (response.Content.Headers.ContentLength > MaxSourceImageBytes)
            {
                return null;
            }

            await using var source = await response.Content.ReadAsStreamAsync(timeout.Token);
            using var destination = new MemoryStream();
            var buffer = new byte[81920];
            var total = 0;

            while (true)
            {
                var read = await source.ReadAsync(buffer, timeout.Token);
                if (read == 0)
                {
                    break;
                }

                total += read;
                if (total > MaxSourceImageBytes)
                {
                    return null;
                }

                await destination.WriteAsync(buffer.AsMemory(0, read), timeout.Token);
            }

            return total == 0 ? null : destination.ToArray();
        }
        catch (Exception exception) when (exception is HttpRequestException
                                              or OperationCanceledException
                                              or IOException)
        {
            return null;
        }
    }

    private bool TryValidatePublicMediaUrl(string? value, out Uri url)
    {
        url = null!;
        if (!Uri.TryCreate(value, UriKind.Absolute, out var candidate)
            || candidate.Scheme != Uri.UriSchemeHttps
            || !candidate.IsDefaultPort
            || !string.IsNullOrEmpty(candidate.UserInfo))
        {
            return false;
        }

        var allowedHosts = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "media.mypetlink.com.my"
        };

        if (Uri.TryCreate(_r2Options.PublicBaseUrl, UriKind.Absolute, out var configured)
            && configured.Scheme == Uri.UriSchemeHttps)
        {
            allowedHosts.Add(configured.Host);
        }

        if (!allowedHosts.Contains(candidate.Host))
        {
            return false;
        }

        url = candidate;
        return true;
    }

    private SKBitmap? LoadLogo()
    {
        try
        {
            var assembly = typeof(PublicProfileSocialCardRenderer).Assembly;
            using var embedded = assembly.GetManifestResourceStream(BrandLogoResourceName);
            if (embedded is not null)
            {
                return SKBitmap.Decode(embedded);
            }

            var path = Path.Combine(
                _hostEnvironment.ContentRootPath,
                "Assets",
                "Brand",
                "mypetlink-logo-horizontal.png");
            return File.Exists(path) ? SKBitmap.Decode(path) : null;
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// The public site origin baked into a portrait Share Card's QR.
    ///
    /// Production stays strict: HTTPS on the default port, no credentials,
    /// query, fragment, or path. Development additionally allows a loopback
    /// origin on a development port, because a local site necessarily runs on
    /// one (http://localhost:3000) and rejecting it made Share Cards
    /// unrenderable on every developer machine. The relaxation is loopback
    /// only - it never widens the set of hosts, just the port for a host that
    /// is already unreachable from outside the machine.
    /// </summary>
    public static Uri? ResolvePublicSiteBaseUri(string value, bool allowDevelopmentLoopback = false)
    {
        var normalized = value.Trim().TrimEnd('/') + "/";
        if (!Uri.TryCreate(normalized, UriKind.Absolute, out var uri)
            || !string.IsNullOrEmpty(uri.UserInfo)
            || !string.IsNullOrEmpty(uri.Query)
            || !string.IsNullOrEmpty(uri.Fragment)
            || uri.AbsolutePath != "/")
        {
            return null;
        }

        var loopbackHttp = uri.Scheme == Uri.UriSchemeHttp && uri.IsLoopback;
        if (uri.Scheme != Uri.UriSchemeHttps && !loopbackHttp)
        {
            return null;
        }

        if (!uri.IsDefaultPort && !(allowDevelopmentLoopback && loopbackHttp))
        {
            return null;
        }

        return uri;
    }

    private string BuildPublicProfileUrl(string publicSlug)
    {
        if (_publicSiteBaseUri is null)
        {
            throw new InvalidOperationException(
                "PublicSite:BaseUrl must be an HTTPS origin, or an HTTP loopback origin for local development, to render a portrait Share Card.");
        }

        var slug = Uri.EscapeDataString(CleanText(publicSlug, 160, string.Empty));
        if (string.IsNullOrEmpty(slug))
        {
            throw new InvalidOperationException("A public profile slug is required to render a portrait Share Card.");
        }

        return new Uri(_publicSiteBaseUri, $"p/{slug}").AbsoluteUri;
    }

    private static SKBitmap? DecodeImage(byte[]? bytes)
    {
        if (bytes is null)
        {
            return null;
        }

        try
        {
            using var data = SKData.CreateCopy(bytes);
            using var codec = SKCodec.Create(data);
            if (codec is null
                || codec.Info.Width <= 0
                || codec.Info.Height <= 0
                || codec.Info.Width > MaxSourceImageDimension
                || codec.Info.Height > MaxSourceImageDimension
                || (long)codec.Info.Width * codec.Info.Height > MaxSourceImagePixels)
            {
                return null;
            }

            return SKBitmap.Decode(bytes);
        }
        catch
        {
            return null;
        }
    }

    private static byte[] DrawOpenGraphCard(
        PublicProfileSocialResponse profile,
        SKBitmap? profileImage,
        SKBitmap? coverImage,
        SKBitmap? logo)
    {
        using var surface = SKSurface.Create(new SKImageInfo(Width, Height));
        var canvas = surface.Canvas;
        canvas.Clear(SKColor.Parse("#FFF8E8"));

        DrawBackgroundDecorations(canvas);
        var lost = profile.LostModeEnabled && profile.LifecycleStatus == Entities.PetLifecycleStatus.Active;
        var top = lost ? 82f : 58f;
        var imageHeight = lost ? 472f : 514f;

        if (lost)
        {
            using var banner = Paint(SKColor.Parse("#E95F55"));
            canvas.DrawRect(0, 0, Width, 58, banner);
            DrawCenteredText(
                canvas,
                "PET IS LOST  -  Open this profile to contact the owner.",
                Width / 2f,
                37,
                24,
                SKColors.White,
                true);
        }

        var coverRect = new SKRect(58, top, 606, top + imageHeight);
        DrawCover(canvas, coverRect, coverImage, profile.CoverPositionX, profile.CoverPositionY, profile.Name);
        DrawProfilePhoto(canvas, new SKPoint(545, Height - 127), 93, profileImage, profile.Name);
        DrawContent(canvas, profile, logo, top, imageHeight);

        using var image = surface.Snapshot();
        using var data = image.Encode(SKEncodedImageFormat.Jpeg, 84);
        return data.ToArray();
    }

    private static byte[] DrawShareCard(
        PublicProfileSocialResponse profile,
        SKBitmap? profileImage,
        SKBitmap? coverImage,
        SKBitmap? logo,
        string publicProfileUrl)
    {
        // One layout, themed colours. See ShareCardPalette for the bounds.
        var palette = ShareCardPalette.Resolve(profile.ProfileTheme);

        using var surface = SKSurface.Create(new SKImageInfo(ShareCardWidth, ShareCardHeight));
        var canvas = surface.Canvas;
        canvas.Clear(palette.Background);

        using (var primaryBlob = Paint(palette.BlobPrimary))
        using (var secondaryBlob = Paint(palette.BlobSecondary))
        {
            canvas.DrawCircle(20, 70, 190, primaryBlob);
            canvas.DrawCircle(1050, 1315, 230, secondaryBlob);
        }

        var lost = profile.LostModeEnabled && profile.LifecycleStatus == Entities.PetLifecycleStatus.Active;
        var bannerHeight = lost ? 74f : 0f;
        if (lost)
        {
            using var banner = Paint(SKColor.Parse("#E95F55"));
            canvas.DrawRect(0, 0, ShareCardWidth, bannerHeight, banner);
            DrawCenteredText(
                canvas,
                "PET IS LOST  -  Open this profile to contact the owner.",
                ShareCardWidth / 2f,
                48,
                25,
                SKColors.White,
                true);
        }

        var heroTop = bannerHeight + 50;
        var heroBottom = lost ? 680f : 650f;
        var heroRect = new SKRect(64, heroTop, ShareCardWidth - 64, heroBottom);
        var heroImage = coverImage ?? profileImage;
        DrawCover(canvas, heroRect, heroImage, profile.CoverPositionX, profile.CoverPositionY, profile.Name);

        // The hero photo and the circular portrait below it are both deliberate
        // parts of this composition. Neither is optional.
        var portraitCenter = new SKPoint(ShareCardWidth / 2f, heroBottom - 6);
        DrawProfilePhoto(canvas, portraitCenter, 112, profileImage, profile.Name, palette);

        DrawShareCardContent(canvas, profile, logo, publicProfileUrl, 786, palette);

        using var image = surface.Snapshot();
        using var data = image.Encode(SKEncodedImageFormat.Jpeg, 84);
        return data.ToArray();
    }

    private static byte[] DrawOccasionCard(
        PublicProfileSocialResponse profile,
        SKBitmap? profileImage,
        SKBitmap? coverImage,
        SKBitmap? logo,
        string publicProfileUrl,
        int count,
        bool birthday)
    {
        using var surface = SKSurface.Create(new SKImageInfo(ShareCardWidth, ShareCardHeight));
        var canvas = surface.Canvas;
        var background = birthday ? SKColor.Parse("#FFF2D8") : SKColor.Parse("#EAF8F2");
        var accent = birthday ? SKColor.Parse("#E95F55") : SKColor.Parse("#157A6E");
        var softAccent = birthday ? SKColor.Parse("#FFD2C5") : SKColor.Parse("#BCEBDD");
        canvas.Clear(background);

        using (var decoration = Paint(softAccent.WithAlpha(205)))
        using (var sky = Paint(SKColor.Parse("#D7E8FF").WithAlpha(190)))
        {
            canvas.DrawCircle(25, 60, 215, decoration);
            canvas.DrawCircle(1050, 1300, 245, sky);
            canvas.DrawCircle(970, 120, 72, decoration);
            canvas.DrawCircle(110, 1160, 54, decoration);
        }

        var lost = profile.LostModeEnabled && profile.LifecycleStatus == Entities.PetLifecycleStatus.Active;
        if (lost)
        {
            using var banner = Paint(SKColor.Parse("#E95F55"));
            canvas.DrawRect(0, 0, ShareCardWidth, 70, banner);
            DrawCenteredText(
                canvas,
                "PET IS LOST  -  Open this profile to contact the owner.",
                ShareCardWidth / 2f,
                46,
                24,
                SKColors.White,
                true);
        }

        var heroRect = new SKRect(68, lost ? 96 : 72, ShareCardWidth - 68, 620);
        DrawCover(canvas, heroRect, coverImage ?? profileImage, profile.CoverPositionX, profile.CoverPositionY, profile.Name);
        DrawProfilePhoto(canvas, new SKPoint(ShareCardWidth / 2f, 616), 104, profileImage, profile.Name);

        var centerX = ShareCardWidth / 2f;
        var y = 758f;
        var eyebrow = birthday ? "HAPPY BIRTHDAY" : "HAPPY ADOPTION DAY";
        DrawCenteredText(canvas, eyebrow, centerX, y, 27, accent, true);

        y += 78;
        var name = CleanText(profile.Name, 48, "Pet");
        var headline = birthday
            ? count == 0 ? $"Celebrating {name} today" : $"{name} turns {count}"
            : count == 0 ? $"{name} joined our family today" : count == 1
                ? $"1 year with {name}"
                : $"{count} years with {name}";
        var headlineSize = headline.Length switch
        {
            > 34 => 50,
            > 25 => 58,
            _ => 68
        };
        var fittedHeadline = birthday && count > 0
            ? FitTextPreservingSuffix(name, $" turns {count}", ShareCardWidth - 130, headlineSize, true)
            : FitText(headline, ShareCardWidth - 130, headlineSize, true);
        DrawCenteredText(
            canvas,
            fittedHeadline,
            centerX,
            y,
            headlineSize,
            SKColor.Parse("#102247"),
            true);

        y += headlineSize + 38;
        var message = birthday
            ? "A little more loved with every year."
            : count == 1
                ? "One wonderful year since joining our family."
                : "Forever grateful you joined our family.";
        DrawCenteredText(canvas, message, centerX, y, 29, SKColor.Parse("#53627F"), true);

        // Same rule as the portrait Share Card: the QR footer is placed from the
        // logo's measured bottom, not from a fixed offset that assumed a shorter
        // text lockup.
        // Raised with the Share Card footer so the closing domain line keeps the
        // same breathing room above the bottom edge on every portrait card.
        var occasionLogoBottom = DrawBrandLogoCentered(canvas, logo, centerX, 944, 250, 50);
        DrawProfileQrFooter(
            canvas,
            publicProfileUrl,
            name,
            occasionLogoBottom + OccasionLogoToQrGap,
            softAccent.WithAlpha(150),
            SKColor.Parse("#53627F"));

        using var image = surface.Snapshot();
        using var data = image.Encode(SKEncodedImageFormat.Jpeg, 86);
        return data.ToArray();
    }

    private static void DrawShareCardContent(
        SKCanvas canvas,
        PublicProfileSocialResponse profile,
        SKBitmap? logo,
        string publicProfileUrl,
        float top,
        ShareCardPalette palette)
    {
        var centerX = ShareCardWidth / 2f;

        var logoBottom = DrawBrandLogoCentered(canvas, logo, centerX, top, 290, 58);

        var name = CleanText(profile.Name, 48, "Pet");
        var nameSize = ResolveShareCardNameSize(name);
        var displayName = FitText(name, ShareCardWidth - 150, nameSize, true);

        // Lay the name out from the logo's real bottom and the name's own ink
        // bounds. Spacing used to be a fixed offset from the logo band's top,
        // which ignored both the logo's real height and the tall ascenders that
        // the largest (shortest-name) size produces — so short names collided
        // with the logo while long ones looked correct.
        float y;
        float nameInkBottom;
        using (var nameStyle = new TextStyle(nameSize, SKColors.Black, true))
        {
            var ink = nameStyle.MeasureInk(displayName);
            y = logoBottom + ShareCardLogoToNameGap - ink.Top;
            nameInkBottom = y + Math.Max(0, ink.Bottom);
        }

        DrawCenteredText(canvas, displayName, centerX, y, nameSize, ShareCardPalette.PrimaryText, true);

        y = nameInkBottom + ShareCardNameToSummaryGap;
        var summary = BuildSummary(profile);
        if (!string.IsNullOrWhiteSpace(summary))
        {
            var summaryText = FitText(summary, ShareCardWidth - 150, 28, true);
            using (var summaryStyle = new TextStyle(28, SKColors.Black, true))
            {
                var ink = summaryStyle.MeasureInk(summaryText);
                y -= ink.Top;
                DrawCenteredText(canvas, summaryText, centerX, y, 28, palette.SupportingText, true);
                y += Math.Max(0, ink.Bottom) + ShareCardSummaryToActionGap;
            }
        }

        // The call to action is drawn from its baseline; shift so the measured
        // block top lands where the flow reached, then hold it clear of the QR
        // halo. Short names take the largest type, so the flow above can push
        // this far enough down to slide behind the QR panel.
        y = Math.Min(y + ShareCardActionBaselineOffset, ShareCardTaglineMaxBaseline);

        var callToAction = FitText($"Meet {name} on MyPetLink", 650, 27, true);
        using (var taglineFill = Paint(palette.TaglineFill))
        using (var taglineText = new TextStyle(27, palette.TaglineText, true))
        {
            var taglineWidth = Math.Min(720, taglineText.MeasureText(callToAction) + 68);
            var taglineRect = new SKRect(
                centerX - taglineWidth / 2,
                y - ShareCardTaglineAboveBaseline,
                centerX + taglineWidth / 2,
                y + ShareCardTaglineBelowBaseline);
            canvas.DrawRoundRect(taglineRect, 32, 32, taglineFill);
            taglineText.Draw(canvas, callToAction, centerX - taglineText.MeasureText(callToAction) / 2, y + 1);
        }

        DrawProfileQrFooter(
            canvas,
            publicProfileUrl,
            name,
            ShareCardQrFooterTop,
            palette.QrSurround,
            palette.SupportingText);
    }

    /// <summary>
    /// Name size for the portrait Share Card. Short names get the largest size,
    /// which is exactly the case that used to collide with the brand lockup.
    /// </summary>
    internal static float ResolveShareCardNameSize(string name) => name.Length switch
    {
        > 30 => 52,
        > 20 => 61,
        > 14 => 70,
        _ => 82
    };

    private static void DrawBackgroundDecorations(SKCanvas canvas)
    {
        using var mint = Paint(SKColor.Parse("#CCEFE4").WithAlpha(190));
        using var sky = Paint(SKColor.Parse("#D7E8FF").WithAlpha(200));
        canvas.DrawCircle(55, 20, 135, mint);
        canvas.DrawCircle(1145, 615, 170, sky);
    }

    private static void DrawCover(
        SKCanvas canvas,
        SKRect rect,
        SKBitmap? cover,
        byte focalX,
        byte focalY,
        string petName)
    {
        using var shadow = Paint(SKColor.Parse("#D7CCB7").WithAlpha(150));
        canvas.DrawRoundRect(new SKRect(rect.Left + 8, rect.Top + 14, rect.Right + 8, rect.Bottom + 14), 42, 42, shadow);

        using var border = Paint(SKColors.White.WithAlpha(235));
        canvas.DrawRoundRect(rect, 42, 42, border);
        var inner = new SKRect(rect.Left + 8, rect.Top + 8, rect.Right - 8, rect.Bottom - 8);

        canvas.Save();
        using var clip = new SKPath();
        clip.AddRoundRect(inner, 35, 35);
        canvas.ClipPath(clip, antialias: true);

        if (cover is not null)
        {
            DrawCroppedBitmap(canvas, cover, inner, focalX, focalY);
        }
        else
        {
            using var gradient = Paint(SKColors.White);
            gradient.Shader = SKShader.CreateLinearGradient(
                new SKPoint(inner.Left, inner.Top),
                new SKPoint(inner.Right, inner.Bottom),
                new[]
                {
                    SKColor.Parse("#A9D8FF"),
                    SKColor.Parse("#BCEBDC"),
                    SKColor.Parse("#FFD8C7")
                },
                new[] { 0f, 0.56f, 1f },
                SKShaderTileMode.Clamp);
            canvas.DrawRect(inner, gradient);

            using (var glow = Paint(SKColors.White.WithAlpha(68)))
            using (var soft = Paint(SKColor.Parse("#157A6E").WithAlpha(28)))
            {
                canvas.DrawCircle(inner.Left + inner.Width * 0.16f, inner.Top + inner.Height * 0.20f, inner.Width * 0.20f, glow);
                canvas.DrawCircle(inner.Right - inner.Width * 0.11f, inner.Bottom - inner.Height * 0.13f, inner.Width * 0.18f, soft);
            }

            var name = CleanText(petName, 24, "Pet");
            var initial = name[0].ToString().ToUpperInvariant();
            DrawPaw(canvas, inner.Right - 105, inner.Top + 100, 0.9f, SKColors.White.WithAlpha(92));
            DrawCenteredText(canvas, initial, inner.MidX, inner.MidY + 48, 146, SKColor.Parse("#102247").WithAlpha(218), true);
        }

        canvas.Restore();
    }

    private static void DrawProfilePhoto(
        SKCanvas canvas,
        SKPoint center,
        float radius,
        SKBitmap? photo,
        string name,
        ShareCardPalette? palette = null)
    {
        var resolved = palette ?? ShareCardPalette.Default;
        using var shadow = Paint(SKColor.Parse("#102247").WithAlpha(45));
        canvas.DrawCircle(center.X + 5, center.Y + 10, radius + 8, shadow);
        using (var accent = Paint(resolved.AvatarRing))
        {
            canvas.DrawCircle(center, radius + 13, accent);
        }

        using var border = Paint(resolved.HeroFrame);
        canvas.DrawCircle(center, radius + 9, border);

        canvas.Save();
        using var clip = new SKPath();
        clip.AddCircle(center.X, center.Y, radius);
        canvas.ClipPath(clip, antialias: true);

        var rect = new SKRect(center.X - radius, center.Y - radius, center.X + radius, center.Y + radius);
        if (photo is not null)
        {
            DrawCroppedBitmap(canvas, photo, rect, 50, 50);
        }
        else
        {
            using var gradient = Paint(SKColors.White);
            gradient.Shader = SKShader.CreateLinearGradient(
                rect.Location,
                new SKPoint(rect.Right, rect.Bottom),
                new[] { SKColor.Parse("#FFB69D"), SKColor.Parse("#8BD9C6") },
                null,
                SKShaderTileMode.Clamp);
            canvas.DrawRect(rect, gradient);
            var initial = string.IsNullOrWhiteSpace(name)
                ? "P"
                : name.Trim()[0].ToString().ToUpperInvariant();
            DrawCenteredText(canvas, initial, center.X, center.Y + 27, 76, SKColor.Parse("#102247"), true);
        }

        canvas.Restore();
    }

    /// <summary>
    /// Draws the brand lockup and returns the bottom edge it actually occupied.
    ///
    /// The real logo asset carries a tagline line, so the drawn height depends on
    /// the asset's aspect ratio rather than the requested band. Callers must lay
    /// the next element out from this measured value: spacing taken from the band
    /// top instead let tall name glyphs run back into the logo.
    /// </summary>
    private static float DrawBrandLogoCentered(
        SKCanvas canvas,
        SKBitmap? logo,
        float centerX,
        float top,
        float maxWidth,
        float maxHeight)
    {
        if (logo is not null)
        {
            var bounds = new SKRect(
                centerX - maxWidth / 2,
                top,
                centerX + maxWidth / 2,
                top + maxHeight);
            var logoRect = FitInsideCentered(logo.Width, logo.Height, bounds);
            canvas.DrawBitmap(logo, logoRect);
            return logoRect.Bottom;
        }

        DrawPaw(canvas, centerX - 80, top + maxHeight / 2, 0.32f, SKColor.Parse("#E95F55"));
        DrawText(canvas, "MyPetLink", centerX - 49, top + maxHeight * 0.72f, 33, SKColor.Parse("#102247"), true);
        return top + maxHeight;
    }

    private static void DrawProfileQrFooter(
        SKCanvas canvas,
        string publicProfileUrl,
        string petName,
        float top,
        SKColor surroundColor,
        SKColor domainColor)
    {
        var left = (ShareCardWidth - ShareCardQrSize) / 2f;
        var bounds = new SKRect(left, top, left + ShareCardQrSize, top + ShareCardQrSize);

        // A soft halo behind the panel. The panel itself stays white and the
        // modules stay dark, so scanability never depends on the surrounding
        // colour.
        using (var surround = Paint(surroundColor))
        {
            var halo = SKRect.Inflate(bounds, ShareCardQrHaloInset, ShareCardQrHaloInset);
            canvas.DrawRoundRect(halo, 26, 26, surround);
        }

        DrawQrCode(canvas, publicProfileUrl, bounds);

        var name = CleanText(petName, 48, "Pet");
        DrawCenteredText(
            canvas,
            FitText($"Scan to view {name}'s profile", 690, 24, true),
            ShareCardWidth / 2f,
            bounds.Bottom + ShareCardQrToScanGap,
            24,
            ShareCardPalette.PrimaryText,
            true);
        DrawCenteredText(
            canvas,
            "mypetlink.com.my",
            ShareCardWidth / 2f,
            DomainBaselineFor(top),
            20,
            domainColor,
            true);
    }

    /// <summary>Baseline of the closing domain line for a QR footer at <paramref name="footerTop"/>.</summary>
    public static float DomainBaselineFor(float footerTop) =>
        footerTop + ShareCardQrSize + ShareCardQrToScanGap + ShareCardScanToDomainGap;

    /// <summary>Baseline of the closing domain line on the portrait Share Card.</summary>
    public static float ShareCardDomainBaseline => DomainBaselineFor(ShareCardQrFooterTop);

    private static void DrawQrCode(SKCanvas canvas, string payload, SKRect bounds)
    {
        using var data = QRCodeGenerator.GenerateQrCode(payload, QRCodeGenerator.ECCLevel.Q);
        var matrix = data.ModuleMatrix;
        var moduleCount = matrix.Count;
        var moduleSize = Math.Max(1, (int)Math.Floor(bounds.Width / moduleCount));
        var renderedSize = moduleCount * moduleSize;
        var left = bounds.MidX - renderedSize / 2f;
        var top = bounds.MidY - renderedSize / 2f;

        using var light = Paint(SKColors.White);
        using var dark = Paint(SKColor.Parse("#0D1B3D"));
        canvas.DrawRoundRect(bounds, 12, 12, light);

        for (var row = 0; row < moduleCount; row += 1)
        {
            for (var column = 0; column < moduleCount; column += 1)
            {
                if (!matrix[row][column]) continue;
                canvas.DrawRect(
                    left + column * moduleSize,
                    top + row * moduleSize,
                    moduleSize,
                    moduleSize,
                    dark);
            }
        }
    }

    private static void DrawContent(
        SKCanvas canvas,
        PublicProfileSocialResponse profile,
        SKBitmap? logo,
        float top,
        float height)
    {
        const float left = 682;
        const float right = 1142;
        var y = top + Math.Max(22, (height - 430) / 2);

        if (logo is not null)
        {
            var logoRect = FitInside(logo.Width, logo.Height, new SKRect(left, y, left + 255, y + 66));
            canvas.DrawBitmap(logo, logoRect);
        }
        else
        {
            DrawPaw(canvas, left + 24, y + 30, 0.34f, SKColor.Parse("#E95F55"));
            DrawText(canvas, "MyPetLink", left + 56, y + 42, 35, SKColor.Parse("#102247"), true);
        }

        y += 92;
        DrawText(canvas, "PET PROFILE", left, y, 20, SKColor.Parse("#E95F55"), true);
        y += 58;

        var name = CleanText(profile.Name, 48, "Pet");
        var nameSize = name.Length switch
        {
            > 30 => 43,
            > 20 => 51,
            > 14 => 59,
            _ => 68
        };
        var displayName = FitText(name, right - left, nameSize, true);
        DrawText(canvas, displayName, left, y, nameSize, SKColor.Parse("#102247"), true);
        y += nameSize + 24;

        var summary = BuildSummary(profile);
        if (!string.IsNullOrWhiteSpace(summary))
        {
            var summaryText = FitText(summary, right - left, 25, true);
            DrawText(canvas, summaryText, left, y, 25, SKColor.Parse("#53627F"), true);
            y += 55;
        }

        var callToAction = FitText($"View {name}'s profile", 350, 23, true);
        using var button = Paint(SKColor.Parse("#1570EF"));
        using var buttonText = new TextStyle(23, SKColors.White, true);
        var buttonWidth = Math.Min(410, buttonText.MeasureText(callToAction) + 48);
        var buttonRect = new SKRect(left, y - 30, left + buttonWidth, y + 20);
        canvas.DrawRoundRect(buttonRect, 25, 25, button);
        buttonText.Draw(canvas, callToAction, left + 24, y + 3);
        y += 74;

        DrawText(canvas, "mypetlink.com.my", left, y, 22, SKColor.Parse("#53627F"), true);
    }

    private static string BuildSummary(PublicProfileSocialResponse profile)
    {
        var values = BuildSummaryParts(profile);
        return string.Join("  -  ", values);
    }

    /// <summary>
    /// The one line of metadata under the pet's name.
    ///
    /// A breed already tells a reader the species, so "Cat - Domestic
    /// Shorthair - 4 years old" repeats itself. When a breed is known it stands
    /// in for the species; the species is only shown when there is no breed.
    /// Custom species and custom breeds flow through unchanged, and nothing new
    /// is exposed - every value here already appears on the public profile.
    /// </summary>
    public static IReadOnlyList<string> BuildSummaryParts(
        PublicProfileSocialResponse profile)
    {
        var species = string.Equals(profile.Species, "Other", StringComparison.OrdinalIgnoreCase)
            ? profile.CustomSpecies
            : profile.Species;

        var breed = CleanOptionalText(profile.Breed, 48);
        var age = CleanOptionalText(profile.AgeDisplayLabel, 48);
        var lead = breed ?? CleanOptionalText(species, 48);

        return new[] { lead, age }
            .Where(value => value is not null)
            .Select(value => value!)
            .ToArray();
    }

    private static string? CleanOptionalText(string? value, int maxLength)
    {
        var cleaned = CleanText(value, maxLength, string.Empty);
        return cleaned.ToLowerInvariant() is "" or "not set" or "not specified" or "unknown" or "age unknown"
            ? null
            : cleaned;
    }

    private static string CleanText(string? value, int maxLength, string fallback)
    {
        var cleaned = string.Join(
            " ",
            (value ?? string.Empty)
                .Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        if (string.IsNullOrWhiteSpace(cleaned))
        {
            return fallback;
        }

        return cleaned.Length <= maxLength ? cleaned : cleaned[..maxLength].TrimEnd();
    }

    private static string FitText(string value, float maxWidth, float textSize, bool bold)
    {
        using var paint = new TextStyle(textSize, SKColors.Black, bold);
        if (paint.MeasureText(value) <= maxWidth)
        {
            return value;
        }

        const string ellipsis = "...";
        var candidate = value;
        while (candidate.Length > 1 && paint.MeasureText(candidate + ellipsis) > maxWidth)
        {
            candidate = candidate[..^1];
        }

        return candidate.TrimEnd() + ellipsis;
    }

    private static string FitTextPreservingSuffix(
        string value,
        string suffix,
        float maxWidth,
        float textSize,
        bool bold)
    {
        using var paint = new TextStyle(textSize, SKColors.Black, bold);
        if (paint.MeasureText(value + suffix) <= maxWidth) return value + suffix;

        const string ellipsis = "...";
        var candidate = value;
        while (candidate.Length > 1
               && paint.MeasureText(candidate + ellipsis + suffix) > maxWidth)
        {
            candidate = candidate[..^1];
        }
        return candidate.TrimEnd() + ellipsis + suffix;
    }

    private static void DrawCroppedBitmap(
        SKCanvas canvas,
        SKBitmap bitmap,
        SKRect destination,
        byte focalX,
        byte focalY)
    {
        var scale = Math.Max(destination.Width / bitmap.Width, destination.Height / bitmap.Height);
        var width = bitmap.Width * scale;
        var height = bitmap.Height * scale;
        var x = destination.Left + (destination.Width - width) * Math.Clamp(focalX / 100f, 0, 1);
        var y = destination.Top + (destination.Height - height) * Math.Clamp(focalY / 100f, 0, 1);
        canvas.DrawBitmap(bitmap, new SKRect(x, y, x + width, y + height));
    }

    private static SKRect FitInside(float width, float height, SKRect bounds)
    {
        var scale = Math.Min(bounds.Width / width, bounds.Height / height);
        var targetWidth = width * scale;
        var targetHeight = height * scale;
        return new SKRect(
            bounds.Left,
            bounds.Top + (bounds.Height - targetHeight) / 2,
            bounds.Left + targetWidth,
            bounds.Top + (bounds.Height + targetHeight) / 2);
    }

    private static SKRect FitInsideCentered(float width, float height, SKRect bounds)
    {
        var fitted = FitInside(width, height, bounds);
        fitted.Offset((bounds.Width - fitted.Width) / 2f, 0);
        return fitted;
    }

    private static void DrawPaw(SKCanvas canvas, float x, float y, float scale, SKColor color)
    {
        using var paint = Paint(color);
        canvas.DrawOval(new SKRect(x - 26 * scale, y - 6 * scale, x + 26 * scale, y + 38 * scale), paint);
        canvas.DrawCircle(x - 34 * scale, y - 25 * scale, 13 * scale, paint);
        canvas.DrawCircle(x - 11 * scale, y - 39 * scale, 14 * scale, paint);
        canvas.DrawCircle(x + 15 * scale, y - 39 * scale, 14 * scale, paint);
        canvas.DrawCircle(x + 38 * scale, y - 23 * scale, 13 * scale, paint);
    }

    private static void DrawCenteredText(
        SKCanvas canvas,
        string value,
        float centerX,
        float baselineY,
        float size,
        SKColor color,
        bool bold)
    {
        using var paint = new TextStyle(size, color, bold);
        paint.Draw(canvas, value, centerX - paint.MeasureText(value) / 2, baselineY);
    }

    private static void DrawText(
        SKCanvas canvas,
        string value,
        float x,
        float baselineY,
        float size,
        SKColor color,
        bool bold)
    {
        using var paint = new TextStyle(size, color, bold);
        paint.Draw(canvas, value, x, baselineY);
    }

    private static SKPaint Paint(SKColor? color = null)
    {
        return new SKPaint
        {
            IsAntialias = true,
            Color = color ?? SKColors.Transparent
        };
    }

    private static bool IsRedirect(System.Net.HttpStatusCode statusCode)
    {
        var numeric = (int)statusCode;
        return numeric is >= 300 and < 400;
    }

    private sealed class TextStyle : IDisposable
    {
        private readonly SKTypeface _typeface;
        private readonly SKFont _font;
        private readonly SKPaint _paint;

        public TextStyle(float size, SKColor color, bool bold)
        {
            _typeface = SKTypeface.FromFamilyName(
                "Arial",
                bold ? SKFontStyle.Bold : SKFontStyle.Normal);
            _font = new SKFont(_typeface, size);
            _paint = Paint(color);
        }

        public float MeasureText(string value) => _font.MeasureText(value, _paint);

        /// <summary>
        /// Tight ink bounds of this exact string relative to its baseline at the
        /// origin: <c>Top</c> is negative (above the baseline) and <c>Bottom</c>
        /// positive. Layout uses these real bounds rather than font-wide metrics
        /// so a short all-caps-height name does not reserve accent headroom it
        /// never uses.
        /// </summary>
        public SKRect MeasureInk(string value)
        {
            _font.MeasureText(value, out var bounds, _paint);
            return bounds;
        }

        public void Draw(SKCanvas canvas, string value, float x, float baselineY)
        {
            canvas.DrawText(value, x, baselineY, _font, _paint);
        }

        public void Dispose()
        {
            _paint.Dispose();
            _font.Dispose();
            _typeface.Dispose();
        }
    }
}
