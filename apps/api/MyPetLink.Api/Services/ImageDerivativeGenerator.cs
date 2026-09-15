using SkiaSharp;

namespace MyPetLink.Api.Services;

public sealed record ImageDerivative(byte[] Bytes, string ContentType, int Width, int Height);

public interface IImageDerivativeGenerator
{
    /// <summary>
    /// Produces a downscaled JPEG from encoded image bytes, or <c>null</c> when
    /// the source cannot be decoded, is implausibly large, or is already small
    /// enough that a derivative would not save anything.
    /// </summary>
    ImageDerivative? CreateThumbnail(byte[] sourceBytes, int maxEdgePixels, int jpegQuality);
}

/// <summary>
/// Turns an uploaded image into the smaller copy that grids and cards should
/// load instead of the original.
///
/// SkiaSharp is already a dependency (the social-card renderer uses it), so this
/// adds a capability rather than a package.
///
/// Three things are worth knowing about what this does:
///
/// <list type="bullet">
/// <item><b>It never decodes at full size.</b> Dimensions are read from the
/// header first and the decode itself is requested at a reduced size, so a
/// small file describing an enormous canvas cannot turn into an enormous
/// allocation.</item>
/// <item><b>It honours EXIF orientation.</b> Phone photos routinely store a
/// landscape buffer plus "rotate me", and re-encoding without applying that
/// would silently turn every portrait photo on its side.</item>
/// <item><b>It drops EXIF entirely.</b> The derivative is drawn onto a fresh
/// surface and re-encoded, so no original metadata survives — including GPS
/// coordinates, which is the point.</item>
/// </list>
///
/// It does not preserve transparency: a PNG with an alpha channel is composited
/// onto white, because JPEG has no alpha and a thumbnail is always drawn on a
/// card surface. The original keeps its transparency and is what any full-size
/// view loads.
/// </summary>
public sealed class ImageDerivativeGenerator : IImageDerivativeGenerator
{
    /// <summary>
    /// Sanity bounds on the DECLARED dimensions, checked before anything is
    /// allocated. Well beyond any real camera; a file claiming more than this is
    /// not a pet photo.
    /// </summary>
    public const int MaxSourceEdge = 20_000;

    /// <summary>
    /// Upper bound on the declared pixel count. Note this is a sanity check, not
    /// the memory protection — the scaled decode below is what actually bounds
    /// the allocation.
    /// </summary>
    public const long MaxSourcePixels = 100_000_000;

    /// <summary>
    /// Hard ceiling on the decoded buffer. Even after requesting a reduced
    /// decode, refuse anything that would still be larger than this: at 4 bytes
    /// per pixel this caps one decode at roughly 64 MB.
    /// </summary>
    public const long MaxDecodedPixels = 16_000_000;

    /// <summary>
    /// Below this the original is already small; a derivative would add an
    /// object and a round trip for no bandwidth saving.
    /// </summary>
    private const int MinimumUsefulReduction = 32;

    public ImageDerivative? CreateThumbnail(byte[] sourceBytes, int maxEdgePixels, int jpegQuality)
    {
        if (sourceBytes.Length == 0 || maxEdgePixels <= 0)
        {
            return null;
        }

        var quality = Math.Clamp(jpegQuality, 1, 100);

        using var data = SKData.CreateCopy(sourceBytes);
        using var codec = SKCodec.Create(data);

        if (codec is null)
        {
            return null;
        }

        var storedWidth = codec.Info.Width;
        var storedHeight = codec.Info.Height;

        // Header-only check. Nothing has been decoded yet, so a "decompression
        // bomb" — a tiny file declaring a vast canvas — is rejected here rather
        // than by running out of memory.
        if (storedWidth <= 0
            || storedHeight <= 0
            || storedWidth > MaxSourceEdge
            || storedHeight > MaxSourceEdge
            || (long)storedWidth * storedHeight > MaxSourcePixels)
        {
            return null;
        }

        var origin = codec.EncodedOrigin;
        var swapsAxes = SwapsAxes(origin);

        // The dimensions a viewer actually sees, after EXIF orientation.
        var displayWidth = swapsAxes ? storedHeight : storedWidth;
        var displayHeight = swapsAxes ? storedWidth : storedHeight;
        var longestDisplayEdge = Math.Max(displayWidth, displayHeight);

        if (longestDisplayEdge <= maxEdgePixels + MinimumUsefulReduction)
        {
            return null;
        }

        var scale = (double)maxEdgePixels / longestDisplayEdge;
        var targetWidth = Math.Max(1, (int)Math.Round(displayWidth * scale));
        var targetHeight = Math.Max(1, (int)Math.Round(displayHeight * scale));

        // Ask the codec to decode at a reduced size. JPEG supports 1/2, 1/4 and
        // 1/8 natively, so a 100 MP photo is never fully materialised.
        var scaledSize = codec.GetScaledDimensions((float)scale);

        if (scaledSize.Width <= 0
            || scaledSize.Height <= 0
            || (long)scaledSize.Width * scaledSize.Height > MaxDecodedPixels)
        {
            return null;
        }

        var decodeInfo = new SKImageInfo(
            scaledSize.Width,
            scaledSize.Height,
            SKColorType.Rgba8888,
            SKAlphaType.Premul);

        using var source = SKBitmap.Decode(codec, decodeInfo);

        if (source is null)
        {
            return null;
        }

        var info = new SKImageInfo(targetWidth, targetHeight, SKColorType.Rgba8888, SKAlphaType.Premul);
        using var surface = SKSurface.Create(info);

        if (surface is null)
        {
            return null;
        }

        var canvas = surface.Canvas;

        // JPEG has no alpha channel. Painting white first means a transparent
        // PNG becomes a clean white-backed thumbnail rather than a black one.
        // Plain white, deliberately: image processing is not the place to
        // introduce a brand colour.
        canvas.Clear(SKColors.White);

        // The rectangle the bitmap is drawn into is expressed BEFORE the
        // orientation transform, so its axes are swapped for the rotating
        // origins.
        var preOrientationWidth = swapsAxes ? targetHeight : targetWidth;
        var preOrientationHeight = swapsAxes ? targetWidth : targetHeight;

        canvas.Save();
        canvas.Concat(OrientationMatrix(origin, targetWidth, targetHeight));

        using (var paint = new SKPaint { IsAntialias = true })
        {
            canvas.DrawBitmap(
                source,
                new SKRect(0, 0, preOrientationWidth, preOrientationHeight),
                paint);
        }

        canvas.Restore();
        canvas.Flush();

        using var image = surface.Snapshot();

        // A fresh encode of freshly drawn pixels. SkiaSharp writes no EXIF here,
        // so the original's metadata — camera, timestamps and GPS coordinates —
        // is not carried into a file served from a public bucket.
        using var encoded = image.Encode(SKEncodedImageFormat.Jpeg, quality);

        if (encoded is null)
        {
            return null;
        }

        return new ImageDerivative(encoded.ToArray(), "image/jpeg", targetWidth, targetHeight);
    }

    /// <summary>
    /// True for the EXIF origins that rotate by 90 degrees, where the stored
    /// buffer's width becomes the displayed height.
    /// </summary>
    private static bool SwapsAxes(SKEncodedOrigin origin)
    {
        return origin is SKEncodedOrigin.LeftTop
            or SKEncodedOrigin.RightTop
            or SKEncodedOrigin.RightBottom
            or SKEncodedOrigin.LeftBottom;
    }

    /// <summary>
    /// The transform that turns the stored buffer into what the photographer
    /// saw, for the given EXIF origin. <paramref name="width"/> and
    /// <paramref name="height"/> are the FINAL displayed dimensions.
    /// </summary>
    private static SKMatrix OrientationMatrix(SKEncodedOrigin origin, float width, float height)
    {
        return origin switch
        {
            SKEncodedOrigin.TopRight => new SKMatrix(-1, 0, width, 0, 1, 0, 0, 0, 1),
            SKEncodedOrigin.BottomRight => new SKMatrix(-1, 0, width, 0, -1, height, 0, 0, 1),
            SKEncodedOrigin.BottomLeft => new SKMatrix(1, 0, 0, 0, -1, height, 0, 0, 1),
            SKEncodedOrigin.LeftTop => new SKMatrix(0, 1, 0, 1, 0, 0, 0, 0, 1),
            SKEncodedOrigin.RightTop => new SKMatrix(0, -1, width, 1, 0, 0, 0, 0, 1),
            SKEncodedOrigin.RightBottom => new SKMatrix(0, -1, width, -1, 0, height, 0, 0, 1),
            SKEncodedOrigin.LeftBottom => new SKMatrix(0, 1, 0, -1, 0, height, 0, 0, 1),
            _ => SKMatrix.Identity
        };
    }
}
