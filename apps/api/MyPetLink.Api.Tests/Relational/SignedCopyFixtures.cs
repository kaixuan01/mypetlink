using System.Collections.Concurrent;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using SkiaSharp;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// Genuinely valid synthetic signed copies: a text PDF, an image-only "scanned" PDF, PNG and JPEG.
/// Each is generated once per marker and cached, so a test can compare stored bytes exactly.
/// </summary>
internal static class SignedCopyFixtures
{
    private static readonly ConcurrentDictionary<string, byte[]> Cache = new();

    static SignedCopyFixtures() => QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;

    public static byte[] Pdf(string marker = "1") => Cache.GetOrAdd("pdf:" + marker, _ =>
        Document.Create(c => c.Page(page => {
            page.Size(PageSizes.A4); page.Margin(40);
            page.Content().Column(col => {
                col.Item().Text("Synthetic signed consignment agreement — test fixture only").FontSize(14);
                col.Item().Text($"Marker {marker}. Signed for and on behalf of Synthetic Paws Trading Sdn Bhd.");
            });
        })).GeneratePdf());

    /// <summary>A PDF whose only page is a picture, like a phone or office scan: no selectable text.</summary>
    public static byte[] ScannedPdf(string marker = "scan") => Cache.GetOrAdd("scan:" + marker, _ =>
    {
        var image = Png(600, 850, marker);
        return Document.Create(c => c.Page(page => {
            page.Size(PageSizes.A4); page.Margin(0);
            page.Content().Image(image).FitArea();
        })).GeneratePdf();
    });

    public static byte[] Png(int width = 320, int height = 240, string marker = "png") =>
        Cache.GetOrAdd($"png:{width}x{height}:{marker}", _ => Encode(width, height, marker, SKEncodedImageFormat.Png));

    public static byte[] Jpeg(int width = 320, int height = 240, string marker = "jpeg") =>
        Cache.GetOrAdd($"jpeg:{width}x{height}:{marker}", _ => Encode(width, height, marker, SKEncodedImageFormat.Jpeg));

    private static byte[] Encode(int width, int height, string marker, SKEncodedImageFormat format)
    {
        using var surface = SKSurface.Create(new SKImageInfo(width, height));
        surface.Canvas.Clear(SKColors.White);
        using var paint = new SKPaint { Color = SKColors.Black, StrokeWidth = 3, IsAntialias = true };
        // A scribble standing in for a handwritten signature, varied by marker so hashes differ.
        var seed = marker.Aggregate(7, (h, ch) => h * 31 + ch);
        for (var i = 0; i < 12; i++)
            surface.Canvas.DrawLine(20 + i * 10, height / 2 + (seed >> i) % 40, 30 + i * 12, height / 2 - (seed >> (i + 3)) % 40, paint);
        using var snapshot = surface.Snapshot();
        using var data = snapshot.Encode(format, 90);
        return data.ToArray();
    }
}
