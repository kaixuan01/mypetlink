using System.Text;
using MyPetLink.Api.Common;
using MyPetLink.Api.Services;
using SkiaSharp;

namespace MyPetLink.Api.Tests;

// The upload rules for a signature image: only a whole PNG or JPEG whose bytes match its declared
// type, with visible ink on a light background. What is kept is always a freshly drawn PNG.
public sealed class DocumentSignatureImageTests
{
    private static ApiException Refused(byte[] content, string? type) =>
        Assert.Throws<ApiException>(() => DocumentSignatureImage.Normalize(content, type));

    [Fact]
    public void APngSignatureIsCroppedToTheInkAndRedrawnWithATransparentBackground()
    {
        var upload = SignatureTestImages.Png(1600, 900);
        var kept = DocumentSignatureImage.Normalize(upload, "image/png");

        Assert.Equal("image/png", DocumentSignatureImage.Detect(kept.Png));
        Assert.Equal(Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(kept.Png)), kept.Sha256);
        // Cropped to the scribble and scaled to fit, never enlarged.
        Assert.InRange(kept.Width, 1, DocumentSignatureImage.MaxWidth);
        Assert.InRange(kept.Height, 1, DocumentSignatureImage.MaxHeight);
        Assert.True(kept.Width < 1600 && kept.Height < 900);

        using var bitmap = SKBitmap.Decode(kept.Png);
        Assert.Equal(kept.Width, bitmap.Width);
        // The white paper became transparent; the ink stayed opaque.
        Assert.Equal(0, bitmap.GetPixel(0, 0).Alpha);
        var opaque = Enumerable.Range(0, bitmap.Width * bitmap.Height).Count(i => bitmap.GetPixel(i % bitmap.Width, i / bitmap.Width).Alpha > 200);
        Assert.True(opaque > 0);
    }

    [Fact]
    public void AJpegSignatureIsAcceptedAndKeptAsPng()
    {
        var kept = DocumentSignatureImage.Normalize(SignatureTestImages.Jpeg(), "image/jpg");
        Assert.Equal("image/png", DocumentSignatureImage.Detect(kept.Png));
    }

    [Fact]
    public void NothingAfterTheImageOrInItsMetadataSurvives()
    {
        var marker = Encoding.ASCII.GetBytes("SYNTHETIC-HIDDEN-PAYLOAD-<script>alert(1)</script>");
        var upload = SignatureTestImages.Png().Concat(marker).ToArray();
        var kept = DocumentSignatureImage.Normalize(upload, "image/png");
        Assert.Equal(-1, kept.Png.AsSpan().IndexOf(marker));
        Assert.Equal(-1, kept.Png.AsSpan().IndexOf("SYNTHETIC-HIDDEN"u8));
    }

    [Fact]
    public void ADeclaredTypeThatDoesNotMatchTheBytesIsRefused()
    {
        Assert.Equal("signature_image_invalid", Refused(SignatureTestImages.Png(), "image/jpeg").Code);
        Assert.Equal(400, Refused(SignatureTestImages.Jpeg(), "image/png").StatusCode);
        Assert.Equal(400, Refused(SignatureTestImages.Png(), null).StatusCode);
    }

    [Theory]
    [InlineData("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF", "application/pdf")]
    [InlineData("<svg xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M0 0L10 10\"/></svg>", "image/svg+xml")]
    [InlineData("GIF89a\u0001\u0000\u0001\u0000\u0000\u0000\u0000;", "image/gif")]
    [InlineData("<html><body>signature</body></html>", "image/png")]
    public void OnlyPngAndJpegAreAccepted(string content, string type)
    {
        var error = Refused(Encoding.Latin1.GetBytes(content), type);
        Assert.Contains("PNG or JPEG", error.Message);
    }

    [Fact]
    public void ACutOffImageIsRefusedEvenWithAValidHeader()
    {
        var png = SignatureTestImages.Png();
        var error = Refused(png[..(png.Length / 2)], "image/png");
        Assert.Equal(400, error.StatusCode);
    }

    [Fact]
    public void ABlankOrFilledImageIsNotASignature()
    {
        Assert.Contains("couldn’t find a signature", Refused(SignatureTestImages.Blank(), "image/png").Message);
        Assert.Contains("couldn’t find a signature", Refused(SignatureTestImages.Blank(colour: SKColors.Transparent), "image/png").Message);
        Assert.Contains("doesn’t look like a signature", Refused(SignatureTestImages.Blank(colour: SKColors.Black), "image/png").Message);
    }

    [Fact]
    public void ATinySignatureIsRefusedAsUnprintable()
    {
        Assert.Contains("too small", Refused(SignatureTestImages.Png(40, 14, stroke: 1), "image/png").Message);
    }

    [Fact]
    public void OversizedImagesAreRefusedBeforeTheirPixelsAreDecoded()
    {
        // 6,001 pixels wide: refused from the header alone.
        Assert.Contains("6,000 pixels", Refused(SignatureTestImages.Blank(6001, 10), "image/png").Message);
    }

    [Fact]
    public void UploadsOverTwoMegabytesOrNotBase64AreRefused()
    {
        var tooBig = Convert.ToBase64String(new byte[DocumentSignatureImage.MaxUploadBytes + 1]);
        Assert.Contains("2 MB", Assert.Throws<ApiException>(() => DocumentSignatureImage.Decode(tooBig)).Message);
        Assert.Contains("2 MB", Assert.Throws<ApiException>(() => DocumentSignatureImage.Decode("")).Message);
        Assert.Contains("could not be read", Assert.Throws<ApiException>(() => DocumentSignatureImage.Decode("not base64!")).Message);
        Assert.Equal(SignatureTestImages.Png(), DocumentSignatureImage.Decode(Convert.ToBase64String(SignatureTestImages.Png())));
    }

    // ---- EXIF orientation. A phone writes the pixels as the sensor saw them plus a tag saying how
    // to turn them; browsers obey the tag, so the kept copy must too. Every comparison below is of
    // the actual kept pixels against the upright signature, never of the metadata.

    private const int GridWidth = 60, GridHeight = 24;

    // The kept image's ink, resampled to a coarse grid so a JPEG's soft edges don't matter.
    private static bool[] Ink(byte[] png)
    {
        using var kept = SKBitmap.Decode(png);
        using var grid = kept.Resize(new SKImageInfo(GridWidth, GridHeight, SKColorType.Rgba8888, SKAlphaType.Unpremul),
            new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear));
        return Enumerable.Range(0, GridWidth * GridHeight).Select(i => grid.GetPixel(i % GridWidth, i / GridWidth).Alpha >= 96).ToArray();
    }

    private static double Overlap(bool[] a, bool[] b) =>
        a.Zip(b).Count(p => p.First && p.Second) / (double)a.Zip(b).Count(p => p.First || p.Second);

    private static bool[] Turned(bool[] ink, Func<int, int, (int X, int Y)> from) =>
        Enumerable.Range(0, ink.Length).Select(i => { var (x, y) = from(i % GridWidth, i / GridWidth); return ink[y * GridWidth + x]; }).ToArray();

    private static readonly Lazy<DocumentSignatureImage.Normalized> UprightReference =
        new(() => DocumentSignatureImage.Normalize(SignatureTestImages.OrientedJpeg(0), "image/jpeg"));

    private static void AssertUpright(DocumentSignatureImage.Normalized kept)
    {
        var reference = UprightReference.Value;
        // Wide, as signed: a quarter-turn left in place would swap the sides.
        Assert.InRange(kept.Width, reference.Width - 3, reference.Width + 3);
        Assert.InRange(kept.Height, reference.Height - 3, reference.Height + 3);
        Assert.True(Overlap(Ink(kept.Png), Ink(reference.Png)) >= 0.85, "The kept signature isn't the upright one.");
    }

    [Fact]
    public void TheTestSignatureLooksDifferentTurnedOrMirroredAnyWay()
    {
        var upright = Ink(UprightReference.Value.Png);
        Assert.True(Overlap(upright, Turned(upright, (x, y) => (GridWidth - 1 - x, y))) < 0.5);
        Assert.True(Overlap(upright, Turned(upright, (x, y) => (x, GridHeight - 1 - y))) < 0.5);
        Assert.True(Overlap(upright, Turned(upright, (x, y) => (GridWidth - 1 - x, GridHeight - 1 - y))) < 0.5);
    }

    [Theory]
    [InlineData(1, false)]
    [InlineData(2, false)]
    [InlineData(3, false)]
    [InlineData(3, true)]
    [InlineData(4, false)]
    [InlineData(5, false)]
    [InlineData(6, false)]
    [InlineData(6, true)]
    [InlineData(7, false)]
    [InlineData(8, false)]
    public void AJpegIsKeptUprightWhicheverWayItsExifOrientationSaysToShowIt(int orientation, bool bigEndian)
    {
        var upload = SignatureTestImages.OrientedJpeg(orientation, bigEndian);
        var kept = DocumentSignatureImage.Normalize(upload, "image/jpeg");
        AssertUpright(kept);

        // The kept copy carries no orientation of its own, so it is never turned a second time.
        using (var codec = SKCodec.Create(new MemoryStream(kept.Png)))
            Assert.Equal(SKEncodedOrigin.TopLeft, codec.EncodedOrigin);
        Assert.DoesNotContain("Exif", Encoding.ASCII.GetString(kept.Png));
        AssertUpright(DocumentSignatureImage.Normalize(kept.Png, "image/png"));

        // The ink keeps its pen colour (navy) and the paper is transparent.
        using var bitmap = SKBitmap.Decode(kept.Png);
        var ink = bitmap.Pixels.Where(p => p.Alpha == 255).ToList();
        Assert.NotEmpty(ink);
        Assert.True(ink.Average(p => p.Blue) > ink.Average(p => p.Red) + 60);
        Assert.Equal(0, bitmap.GetPixel(0, 0).Alpha);
    }

    [Theory]
    [InlineData((ushort)0)]
    [InlineData((ushort)9)]
    [InlineData(ushort.MaxValue)]
    public void AJpegWithAnInvalidOrientationIsKeptAsStored(ushort value)
    {
        // Browsers ignore an orientation outside 1-8 and show the pixels as stored, which here are upright.
        var upload = SignatureTestImages.WithExif(SignatureTestImages.OrientedJpeg(0), SignatureTestImages.ExifOrientation(value));
        AssertUpright(DocumentSignatureImage.Normalize(upload, "image/jpeg"));
    }

    [Fact]
    public void AJpegWithUnreadableExifIsKeptAsStored()
    {
        var plain = SignatureTestImages.OrientedJpeg(0);
        var tiff = SignatureTestImages.ExifOrientation(3);
        // Not a TIFF header at all.
        AssertUpright(DocumentSignatureImage.Normalize(SignatureTestImages.WithExif(plain, [.. "XX"u8.ToArray(), .. tiff[2..]]), "image/jpeg"));
        // The first entry list points past the end of the block.
        var pastTheEnd = tiff.ToArray(); pastTheEnd[4] = 0xF0;
        AssertUpright(DocumentSignatureImage.Normalize(SignatureTestImages.WithExif(plain, pastTheEnd), "image/jpeg"));
        // Cut off inside the orientation entry.
        AssertUpright(DocumentSignatureImage.Normalize(SignatureTestImages.WithExif(plain, tiff[..12]), "image/jpeg"));
    }

    [Fact]
    public void AJpegWhoseExifBlockSwallowsTheImageIsRefused()
    {
        var plain = SignatureTestImages.OrientedJpeg(0);
        var tiff = SignatureTestImages.ExifOrientation(3);
        // A block that claims to run past the end of the file swallows the image after it.
        Assert.Equal("signature_image_invalid", Refused(SignatureTestImages.WithExif(plain, tiff, declaredLength: 0xFFFF), "image/jpeg").Code);
    }

    [Fact]
    public void APngIsKeptExactlyAsItsPixelsAreStored()
    {
        using var upright = SignatureTestImages.Upright();
        using (var image = SKImage.FromBitmap(upright))
        using (var png = image.Encode(SKEncodedImageFormat.Png, 100))
            AssertUpright(DocumentSignatureImage.Normalize(png.ToArray(), "image/png"));

        // A PNG drawn upside down stays upside down: PNG pixels are never turned.
        using var turned = new SKBitmap(upright.Info);
        using (var canvas = new SKCanvas(turned))
        {
            canvas.RotateDegrees(180, upright.Width / 2f, upright.Height / 2f);
            canvas.DrawBitmap(upright, 0, 0);
        }
        using var turnedImage = SKImage.FromBitmap(turned);
        using var turnedPng = turnedImage.Encode(SKEncodedImageFormat.Png, 100);
        var kept = Ink(DocumentSignatureImage.Normalize(turnedPng.ToArray(), "image/png").Png);
        var reference = Ink(UprightReference.Value.Png);
        Assert.True(Overlap(kept, Turned(reference, (x, y) => (GridWidth - 1 - x, GridHeight - 1 - y))) >= 0.85);
    }
}
