using System.Runtime.InteropServices;
using System.Security.Cryptography;
using MyPetLink.Api.Common;
using SkiaSharp;

namespace MyPetLink.Api.Services;

/// <summary>
/// Turns an uploaded signature into the image MyPetLink keeps. The upload must be a PNG or JPEG
/// whose bytes match its declared type and which decodes completely. The kept copy is redrawn
/// from the decoded pixels: cropped to the ink, with the paper made transparent, scaled down to
/// a sensible size and encoded as a fresh PNG. Nothing from the original file — metadata,
/// location, extra chunks or anything appended after the image — survives into it.
/// </summary>
public static class DocumentSignatureImage
{
    public const int MaxUploadBytes = 2 * 1024 * 1024;
    public const int MaxSourceEdge = 6000;
    public const long MaxSourcePixels = 16_000_000;
    public const int MaxWidth = 1200;
    public const int MaxHeight = 480;
    public const int MinInkWidth = 40;
    public const int MinInkHeight = 12;
    // Darker than this, and opaque enough, counts as ink. Lighter is paper and becomes transparent.
    private const int InkLuminance = 160;
    private const int PaperLuminance = 235;

    public sealed record Normalized(byte[] Png, int Width, int Height, string Sha256);

    public static byte[] Decode(string? base64)
    {
        // Checked before decoding so an oversized upload is never buffered twice.
        if (string.IsNullOrWhiteSpace(base64) || base64.Length > (MaxUploadBytes + 2) / 3 * 4 + 4)
            throw Invalid("Choose a signature image of up to 2 MB.");
        try
        {
            var content = Convert.FromBase64String(base64.Trim());
            if (content.Length is 0 or > MaxUploadBytes) throw Invalid("Choose a signature image of up to 2 MB.");
            return content;
        }
        catch (FormatException) { throw Invalid("The image could not be read. Choose it again."); }
    }

    public static Normalized Normalize(byte[] content, string? declaredType)
    {
        var detected = Detect(content) ?? throw Invalid("Upload the signature as a PNG or JPEG image.");
        var declared = declaredType?.Trim().ToLowerInvariant() is "image/jpg" ? "image/jpeg" : declaredType?.Trim().ToLowerInvariant();
        if (declared != detected)
            throw Invalid("The file’s contents don’t match its type. Upload the original PNG or JPEG.");

        using var data = SKData.CreateCopy(content);
        using var codec = SKCodec.Create(data);
        var expected = detected == "image/png" ? SKEncodedImageFormat.Png : SKEncodedImageFormat.Jpeg;
        if (codec is null || codec.EncodedFormat != expected)
            throw Invalid("The image couldn't be opened. Upload the original PNG or JPEG.");
        var (width, height) = (codec.Info.Width, codec.Info.Height);
        if (width <= 0 || height <= 0 || width > MaxSourceEdge || height > MaxSourceEdge || (long)width * height > MaxSourcePixels)
            throw Invalid($"The image must be at most {MaxSourceEdge:N0} pixels on each side and {MaxSourcePixels / 1_000_000} megapixels.");

        // Decoding every pixel is what tells a whole image from one cut off after its header.
        var info = new SKImageInfo(width, height, SKColorType.Rgba8888, SKAlphaType.Unpremul);
        using var source = new SKBitmap(info);
        if (codec.GetPixels(info, source.GetPixels()) != SKCodecResult.Success)
            throw Invalid("The image is damaged or incomplete. Upload the original PNG or JPEG.");
        var pixels = source.GetPixelSpan().ToArray();
        // The pixels come back as stored: the decoder never applies a JPEG's EXIF orientation, but
        // browsers do, so the signature the administrator saw upright may be stored turned or
        // mirrored. Turn it here, exactly once, before anything is measured or cropped. Only JPEG:
        // PNG pixels are kept as stored. A missing or invalid orientation reads as upright.
        if (detected == "image/jpeg" && codec.EncodedOrigin != SKEncodedOrigin.TopLeft)
            (pixels, width, height) = Orient(pixels, width, height, codec.EncodedOrigin);

        var (left, top, right, bottom, ink) = (width, height, -1, -1, 0L);
        for (var y = 0; y < height; y++)
            for (var x = 0; x < width; x++)
            {
                var i = (y * width + x) * 4;
                if (pixels[i + 3] < 64 || Luminance(pixels, i) >= InkLuminance) continue;
                ink++;
                if (x < left) left = x;
                if (x > right) right = x;
                if (y < top) top = y;
                if (y > bottom) bottom = y;
            }
        if (ink == 0)
            throw Invalid("We couldn’t find a signature in this image. Upload a dark signature on a white or transparent background.");
        var (inkWidth, inkHeight) = (right - left + 1, bottom - top + 1);
        if (inkWidth < MinInkWidth || inkHeight < MinInkHeight)
            throw Invalid("The signature is too small to print clearly. Upload a larger, sharper image.");
        // A signature is mostly paper. An image that is mostly dark is a photo or a filled shape.
        if (ink > (long)inkWidth * inkHeight * 6 / 10)
            throw Invalid("This doesn’t look like a signature. Upload a dark signature on a white or transparent background.");

        var pad = Math.Max(4, Math.Max(inkWidth, inkHeight) / 40);
        left = Math.Max(0, left - pad); top = Math.Max(0, top - pad);
        right = Math.Min(width - 1, right + pad); bottom = Math.Min(height - 1, bottom + pad);
        var (cropWidth, cropHeight) = (right - left + 1, bottom - top + 1);

        // Paper fades to transparent; ink keeps its colour, so blue and black pens both survive.
        var cropped = new byte[cropWidth * cropHeight * 4];
        for (var y = 0; y < cropHeight; y++)
            for (var x = 0; x < cropWidth; x++)
            {
                var i = ((top + y) * width + left + x) * 4;
                var o = (y * cropWidth + x) * 4;
                var luminance = Luminance(pixels, i);
                var keep = luminance >= PaperLuminance ? 0d : luminance <= 100 ? 1d : (PaperLuminance - luminance) / (double)(PaperLuminance - 100);
                cropped[o] = pixels[i]; cropped[o + 1] = pixels[i + 1]; cropped[o + 2] = pixels[i + 2];
                cropped[o + 3] = (byte)Math.Round(pixels[i + 3] * keep);
            }

        var scale = Math.Min(1d, Math.Min(MaxWidth / (double)cropWidth, MaxHeight / (double)cropHeight));
        var (outWidth, outHeight) = (Math.Max(1, (int)Math.Round(cropWidth * scale)), Math.Max(1, (int)Math.Round(cropHeight * scale)));
        using var croppedImage = SKImage.FromPixelCopy(new SKImageInfo(cropWidth, cropHeight, SKColorType.Rgba8888, SKAlphaType.Unpremul),
            cropped, cropWidth * 4) ?? throw Invalid("The image couldn't be prepared. Upload the original PNG or JPEG.");
        using var surface = SKSurface.Create(new SKImageInfo(outWidth, outHeight, SKColorType.Rgba8888, SKAlphaType.Premul))
            ?? throw Invalid("The image couldn't be prepared. Upload the original PNG or JPEG.");
        surface.Canvas.Clear(SKColors.Transparent);
        surface.Canvas.DrawImage(croppedImage, new SKRect(0, 0, outWidth, outHeight),
            new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear));
        surface.Canvas.Flush();
        using var snapshot = surface.Snapshot();
        using var encoded = snapshot.Encode(SKEncodedImageFormat.Png, 100)
            ?? throw Invalid("The image couldn't be prepared. Upload the original PNG or JPEG.");
        var png = encoded.ToArray();
        return new(png, outWidth, outHeight, Convert.ToHexString(SHA256.HashData(png)));
    }

    /// <summary>The type the bytes claim to be, whatever the browser said.</summary>
    public static string? Detect(ReadOnlySpan<byte> c)
    {
        if (c.Length >= 8 && c[..8].SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A })) return "image/png";
        if (c.Length >= 3 && c[0] == 0xFF && c[1] == 0xD8 && c[2] == 0xFF) return "image/jpeg";
        return null;
    }

    /// <summary>
    /// The stored RGBA pixels turned the way <paramref name="origin"/> says they are shown. For each
    /// shown pixel (x, y) it reads the stored pixel that lands there; orientations 5-8 swap the sides.
    /// </summary>
    private static (byte[] Pixels, int Width, int Height) Orient(byte[] stored, int width, int height, SKEncodedOrigin origin)
    {
        Func<int, int, (int X, int Y)> source = origin switch
        {
            SKEncodedOrigin.TopRight => (x, y) => (width - 1 - x, y),                 // 2: mirrored left to right
            SKEncodedOrigin.BottomRight => (x, y) => (width - 1 - x, height - 1 - y), // 3: turned 180°
            SKEncodedOrigin.BottomLeft => (x, y) => (x, height - 1 - y),              // 4: mirrored top to bottom
            SKEncodedOrigin.LeftTop => (x, y) => (y, x),                              // 5: mirrored on the diagonal
            SKEncodedOrigin.RightTop => (x, y) => (y, height - 1 - x),                // 6: turned 90° clockwise
            SKEncodedOrigin.RightBottom => (x, y) => (width - 1 - y, height - 1 - x), // 7: mirrored on the other diagonal
            SKEncodedOrigin.LeftBottom => (x, y) => (width - 1 - y, x),               // 8: turned 90° anticlockwise
            _ => (x, y) => (x, y),
        };
        var (shownWidth, shownHeight) = origin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop
            or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom ? (height, width) : (width, height);
        var shown = new byte[stored.Length];
        var from = MemoryMarshal.Cast<byte, uint>(stored.AsSpan());
        var to = MemoryMarshal.Cast<byte, uint>(shown.AsSpan());
        for (var y = 0; y < shownHeight; y++)
            for (var x = 0; x < shownWidth; x++)
            {
                var (sx, sy) = source(x, y);
                to[y * shownWidth + x] = from[sy * width + sx];
            }
        return (shown, shownWidth, shownHeight);
    }

    private static int Luminance(byte[] p, int i) => (p[i] * 299 + p[i + 1] * 587 + p[i + 2] * 114) / 1000;

    private static ApiException Invalid(string message) => new(400, "signature_image_invalid", message);
}
