using SkiaSharp;

namespace MyPetLink.Api.Tests;

/// <summary>Synthetic signature images drawn in code. None of them is a real person's signature.</summary>
internal static class SignatureTestImages
{
    public static byte[] Png(int width = 600, int height = 200, SKColor? ink = null, SKColor? paper = null, float stroke = 6) =>
        Draw(width, height, ink ?? SKColors.Black, paper ?? SKColors.White, stroke, SKEncodedImageFormat.Png);

    public static byte[] Jpeg(int width = 600, int height = 200) =>
        Draw(width, height, new SKColor(20, 40, 140), SKColors.White, 6, SKEncodedImageFormat.Jpeg);

    /// <summary>A solid image with no ink at all.</summary>
    public static byte[] Blank(int width = 400, int height = 150, SKColor? colour = null)
    {
        using var surface = SKSurface.Create(new SKImageInfo(width, height));
        surface.Canvas.Clear(colour ?? SKColors.White);
        using var image = surface.Snapshot();
        using var data = image.Encode(SKEncodedImageFormat.Png, 100);
        return data.ToArray();
    }

    /// <summary>
    /// An upright signature that looks different turned or mirrored any way: a tall stroke on the
    /// left, a long bar along the top, a short bar in the middle and a dot low on the right.
    /// </summary>
    public static SKBitmap Upright(int width = 600, int height = 240)
    {
        var bitmap = new SKBitmap(new SKImageInfo(width, height, SKColorType.Rgba8888, SKAlphaType.Unpremul));
        using var canvas = new SKCanvas(bitmap);
        canvas.Clear(SKColors.White);
        using var pen = new SKPaint { Color = new SKColor(20, 40, 140), StrokeWidth = 10, IsAntialias = true, Style = SKPaintStyle.Stroke, StrokeCap = SKStrokeCap.Round };
        canvas.DrawLine(width * 0.1f, height * 0.15f, width * 0.1f, height * 0.85f, pen);
        canvas.DrawLine(width * 0.1f, height * 0.15f, width * 0.65f, height * 0.15f, pen);
        canvas.DrawLine(width * 0.1f, height * 0.5f, width * 0.35f, height * 0.5f, pen);
        using var dot = new SKPaint { Color = new SKColor(20, 40, 140), IsAntialias = true, Style = SKPaintStyle.Fill };
        canvas.DrawCircle(width * 0.85f, height * 0.78f, height * 0.07f, dot);
        return bitmap;
    }

    /// <summary>
    /// A JPEG whose stored pixels, shown the way EXIF <paramref name="orientation"/> says, are the
    /// upright signature — as a phone camera writes it. Orientation 0 means no EXIF at all.
    /// </summary>
    public static byte[] OrientedJpeg(int orientation, bool bigEndian = false)
    {
        using var upright = Upright();
        var (w, h) = orientation >= 5 && orientation <= 8 ? (upright.Height, upright.Width) : (upright.Width, upright.Height);
        using var stored = new SKBitmap(new SKImageInfo(w, h, SKColorType.Rgba8888, SKAlphaType.Unpremul));
        // Where each stored pixel is shown, per the EXIF 2.3 definition of the tag.
        for (var y = 0; y < h; y++)
            for (var x = 0; x < w; x++)
            {
                var (ux, uy) = orientation switch
                {
                    2 => (w - 1 - x, y),
                    3 => (w - 1 - x, h - 1 - y),
                    4 => (x, h - 1 - y),
                    5 => (y, x),
                    6 => (h - 1 - y, x),
                    7 => (h - 1 - y, w - 1 - x),
                    8 => (y, w - 1 - x),
                    _ => (x, y),
                };
                stored.SetPixel(x, y, upright.GetPixel(ux, uy));
            }
        using var image = SKImage.FromBitmap(stored);
        using var data = image.Encode(SKEncodedImageFormat.Jpeg, 95);
        return orientation == 0 ? data.ToArray() : WithExif(data.ToArray(), ExifOrientation((ushort)orientation, bigEndian));
    }

    /// <summary>A TIFF block holding one IFD entry: Orientation, SHORT, count 1.</summary>
    public static byte[] ExifOrientation(ushort value, bool bigEndian = false)
    {
        byte[] U16(int v) => bigEndian ? [(byte)(v >> 8), (byte)v] : [(byte)v, (byte)(v >> 8)];
        byte[] U32(int v) => bigEndian ? [(byte)(v >> 24), (byte)(v >> 16), (byte)(v >> 8), (byte)v] : [(byte)v, (byte)(v >> 8), (byte)(v >> 16), (byte)(v >> 24)];
        return [.. (bigEndian ? "MM"u8.ToArray() : "II"u8.ToArray()), .. U16(42), .. U32(8), .. U16(1),
            .. U16(0x0112), .. U16(3), .. U32(1), .. U16(value), 0, 0, .. U32(0)];
    }

    /// <summary>The JPEG with an APP1 Exif segment holding <paramref name="tiff"/> placed straight after its start marker.</summary>
    public static byte[] WithExif(byte[] jpeg, byte[] tiff, int? declaredLength = null)
    {
        var length = declaredLength ?? 2 + 6 + tiff.Length;
        return [0xFF, 0xD8, 0xFF, 0xE1, (byte)(length >> 8), (byte)length, .. "Exif\0\0"u8.ToArray(), .. tiff, .. jpeg[2..]];
    }

    private static byte[] Draw(int width, int height, SKColor ink, SKColor paper, float stroke, SKEncodedImageFormat format)
    {
        using var surface = SKSurface.Create(new SKImageInfo(width, height));
        var canvas = surface.Canvas;
        canvas.Clear(paper);
        using var paint = new SKPaint { Color = ink, StrokeWidth = stroke, IsAntialias = true, Style = SKPaintStyle.Stroke, StrokeCap = SKStrokeCap.Round };
        using var path = new SKPath();
        // A looping synthetic scribble that spans most of the canvas, inset from the edges.
        path.MoveTo(width * 0.1f, height * 0.7f);
        path.CubicTo(width * 0.2f, height * 0.1f, width * 0.3f, height * 0.9f, width * 0.45f, height * 0.4f);
        path.CubicTo(width * 0.55f, height * 0.1f, width * 0.65f, height * 0.8f, width * 0.9f, height * 0.3f);
        canvas.DrawPath(path, paint);
        using var image = surface.Snapshot();
        using var data = image.Encode(format, 92);
        return data.ToArray();
    }
}
