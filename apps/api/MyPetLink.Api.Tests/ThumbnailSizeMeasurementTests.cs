using MyPetLink.Api.Services;
using SkiaSharp;
using Xunit.Abstractions;

namespace MyPetLink.Api.Tests;

/// <summary>
/// What a bigger feed derivative would actually cost.
///
/// The 640px derivative is comfortably sharp on a grid tile and marginal on a
/// full-width feed card at DPR 2, where a 390 CSS px card wants about 780
/// device pixels. Raising it is a configuration change, not a schema one — the
/// single derivative already has a configurable longest edge — so the decision
/// comes down to bytes on every card against sharpness on one surface.
///
/// This measures the bytes with the real generator rather than estimating them.
/// The source is synthesised, so the absolute numbers are not a photo's
/// numbers; the RATIO between the two sizes is what the decision turns on, and
/// that holds for any source.
/// </summary>
public sealed class ThumbnailSizeMeasurementTests
{
    private readonly ITestOutputHelper _output;

    public ThumbnailSizeMeasurementTests(ITestOutputHelper output)
    {
        _output = output;
    }

    [Theory]
    [InlineData(640)]
    [InlineData(768)]
    [InlineData(960)]
    [InlineData(1080)]
    public void MeasureDerivativeSize(int maxEdge)
    {
        var source = SynthesisePhotograph(3000, 4000);
        var generator = new ImageDerivativeGenerator();

        var result = generator.CreateThumbnail(source, maxEdge, jpegQuality: 80);

        Assert.NotNull(result);

        var kilobytes = result!.Bytes.Length / 1024d;
        _output.WriteLine(
            $"maxEdge={maxEdge}: {result.Width}x{result.Height}, "
            + $"{kilobytes:F1} KB");

        Assert.True(Math.Max(result.Width, result.Height) <= maxEdge);
    }

    /// <summary>
    /// A photograph-shaped source: smooth tonal areas with fine detail on top,
    /// which is what makes a JPEG's size respond to resolution the way a real
    /// photo's does. Flat colour would compress to nothing and tell us nothing.
    /// </summary>
    private static byte[] SynthesisePhotograph(int width, int height)
    {
        using var bitmap = new SKBitmap(width, height);
        using (var canvas = new SKCanvas(bitmap))
        {
            using var background = new SKPaint
            {
                Shader = SKShader.CreateLinearGradient(
                    new SKPoint(0, 0),
                    new SKPoint(width, height),
                    new[] { new SKColor(214, 198, 160), new SKColor(72, 96, 84) },
                    null,
                    SKShaderTileMode.Clamp)
            };
            canvas.DrawRect(new SKRect(0, 0, width, height), background);

            var random = new Random(20260915);
            using var detail = new SKPaint { IsAntialias = true };

            for (var index = 0; index < 40_000; index += 1)
            {
                detail.Color = new SKColor(
                    (byte)random.Next(256),
                    (byte)random.Next(256),
                    (byte)random.Next(256),
                    (byte)random.Next(40, 140));
                canvas.DrawCircle(
                    random.Next(width),
                    random.Next(height),
                    random.Next(1, 7),
                    detail);
            }
        }

        using var image = SKImage.FromBitmap(bitmap);
        using var encoded = image.Encode(SKEncodedImageFormat.Jpeg, 92);
        return encoded.ToArray();
    }
}
