using System.Collections.Concurrent;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Storage;
using SkiaSharp;

namespace MyPetLink.Api.Services;

public sealed class PublicProfileSocialCardRenderer : IPublicProfileSocialCardRenderer
{
    public const int Width = 1200;
    public const int Height = 630;

    private const int MaxSourceImageBytes = 8 * 1024 * 1024;
    private const int MaxSourceImageDimension = 8192;
    private const long MaxSourceImagePixels = 40_000_000;
    private static readonly TimeSpan MediaFetchTimeout = TimeSpan.FromSeconds(4.5);
    private readonly ConcurrentDictionary<string, Lazy<Task<byte[]>>> _inflight = new();
    private readonly CloudflareR2Options _r2Options;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IWebHostEnvironment _hostEnvironment;
    private readonly IMemoryCache _memoryCache;

    public PublicProfileSocialCardRenderer(
        IHttpClientFactory httpClientFactory,
        IMemoryCache memoryCache,
        IWebHostEnvironment hostEnvironment,
        IOptions<CloudflareR2Options> r2Options)
    {
        _httpClientFactory = httpClientFactory;
        _memoryCache = memoryCache;
        _hostEnvironment = hostEnvironment;
        _r2Options = r2Options.Value;
    }

    public async Task<byte[]> RenderAsync(
        PublicProfileSocialResponse profile,
        CancellationToken cancellationToken = default)
    {
        var cacheKey = $"public-social-card:{profile.PublicCode}:{profile.PublicProfileVersion}";
        if (_memoryCache.TryGetValue<byte[]>(cacheKey, out var cached) && cached is not null)
        {
            return cached;
        }

        var generation = _inflight.GetOrAdd(
            cacheKey,
            _ => new Lazy<Task<byte[]>>(
                () => GenerateAndCacheAsync(cacheKey, profile, cancellationToken),
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
        var jpeg = DrawCard(profile, profileImage, coverImage, logo);

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
            var path = Path.Combine(_hostEnvironment.ContentRootPath, "Assets", "logo-horizontal.png");
            return File.Exists(path) ? SKBitmap.Decode(path) : null;
        }
        catch
        {
            return null;
        }
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

    private static byte[] DrawCard(
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
        DrawCover(canvas, coverRect, coverImage, profile.CoverPositionX, profile.CoverPositionY);
        DrawProfilePhoto(canvas, new SKPoint(545, Height - 127), 93, profileImage, profile.Name);
        DrawContent(canvas, profile, logo, top, imageHeight);

        using var image = surface.Snapshot();
        using var data = image.Encode(SKEncodedImageFormat.Jpeg, 84);
        return data.ToArray();
    }

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
        byte focalY)
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
            using var gradient = Paint();
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
            DrawPaw(canvas, inner.MidX, inner.MidY - 12, 1.85f, SKColors.White.WithAlpha(150));
            DrawCenteredText(canvas, "MYPETLINK", inner.MidX, inner.Bottom - 55, 21, SKColor.Parse("#53627F"), true);
        }

        canvas.Restore();
    }

    private static void DrawProfilePhoto(
        SKCanvas canvas,
        SKPoint center,
        float radius,
        SKBitmap? photo,
        string name)
    {
        using var shadow = Paint(SKColor.Parse("#102247").WithAlpha(45));
        canvas.DrawCircle(center.X + 5, center.Y + 10, radius + 8, shadow);
        using var border = Paint(SKColor.Parse("#FFF8E8"));
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
            using var gradient = Paint();
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
        var species = string.Equals(profile.Species, "Other", StringComparison.OrdinalIgnoreCase)
            ? profile.CustomSpecies
            : profile.Species;
        var values = new[] { species, profile.Breed, profile.AgeDisplayLabel }
            .Select(value => CleanOptionalText(value, 48))
            .Where(value => value is not null);
        return string.Join("  -  ", values!);
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
