using MyPetLink.Api.Services;
using SkiaSharp;

namespace MyPetLink.Api.Common;

/// <summary>Bounded raster decoding and fresh encoding for public merchant logos.</summary>
public static class MerchantLogoImage
{
    public const long MaxBytes = 2 * 1024 * 1024;
    public const int MaxSourceEdge = 4096;

    public static ImageDerivative Normalize(byte[] bytes, string contentType)
    {
        using var data = SKData.CreateCopy(bytes);
        using var codec = SKCodec.Create(data);
        var expected = contentType.ToLowerInvariant() switch
        {
            "image/png" => SKEncodedImageFormat.Png,
            "image/jpeg" => SKEncodedImageFormat.Jpeg,
            "image/webp" => SKEncodedImageFormat.Webp,
            _ => (SKEncodedImageFormat?)null
        };
        if (bytes.Length == 0 || bytes.Length > MaxBytes || codec is null || expected is null
            || codec.EncodedFormat != expected || codec.FrameCount > 1
            || codec.Info.Width <= 0 || codec.Info.Height <= 0
            || codec.Info.Width > MaxSourceEdge || codec.Info.Height > MaxSourceEdge)
            throw InvalidImage();

        using var bitmap = new SKBitmap(new SKImageInfo(codec.Info.Width, codec.Info.Height,
            SKColorType.Rgba8888, SKAlphaType.Premul));
        if (codec.GetPixels(bitmap.Info, bitmap.GetPixels()) != SKCodecResult.Success) throw InvalidImage();
        var swaps = ImageDerivativeGenerator.SwapsAxes(codec.EncodedOrigin);
        var displayWidth = swaps ? bitmap.Height : bitmap.Width;
        var displayHeight = swaps ? bitmap.Width : bitmap.Height;
        var scale = Math.Min(1d, 512d / Math.Max(displayWidth, displayHeight));
        var width = Math.Max(1, (int)Math.Round(displayWidth * scale));
        var height = Math.Max(1, (int)Math.Round(displayHeight * scale));
        using var surface = SKSurface.Create(new SKImageInfo(width, height, SKColorType.Rgba8888, SKAlphaType.Premul));
        surface.Canvas.Clear(SKColors.Transparent);
        surface.Canvas.Concat(ImageDerivativeGenerator.OrientationMatrix(codec.EncodedOrigin, width, height));
        using var paint = new SKPaint { IsAntialias = true };
        surface.Canvas.DrawBitmap(bitmap, new SKRect(0, 0, swaps ? height : width, swaps ? width : height), paint);
        using var image = surface.Snapshot();
        using var encoded = image.Encode(SKEncodedImageFormat.Png, 100);
        return new ImageDerivative(encoded.ToArray(), "image/png", width, height);
    }

    private static ApiException InvalidImage() => new(415, "invalid_logo_image",
        "Choose a valid, non-animated PNG, JPG or WebP logo, up to 2 MB and 4096 × 4096 pixels.");
}
