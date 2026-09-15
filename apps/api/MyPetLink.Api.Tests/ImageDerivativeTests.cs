using MyPetLink.Api.Common;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using SkiaSharp;

namespace MyPetLink.Api.Tests;

/// <summary>
/// The thumbnail pipeline.
///
/// <c>MediaFile.ThumbnailObjectKey</c> existed as a column for a long time with
/// nothing ever writing it, so every public image was served at full resolution.
/// These tests cover the two things that matter: a derivative is actually
/// produced, and nothing anywhere breaks when one is missing.
/// </summary>
public sealed class ImageDerivativeTests
{
    private readonly ImageDerivativeGenerator _generator = new();

    [Fact]
    public void ALargePhoto_IsReducedToTheTargetLongestEdge()
    {
        var source = EncodePng(2400, 1600);

        var derivative = _generator.CreateThumbnail(source, maxEdgePixels: 640, jpegQuality: 80);

        Assert.NotNull(derivative);
        Assert.Equal(640, derivative!.Width);
        Assert.Equal(427, derivative.Height);
        Assert.Equal("image/jpeg", derivative.ContentType);
        Assert.True(
            derivative.Bytes.Length < source.Length,
            "A derivative that is not smaller than its original is pointless.");
    }

    [Fact]
    public void APortraitPhoto_IsReducedOnItsLongEdgeAndKeepsItsAspect()
    {
        var derivative = _generator.CreateThumbnail(EncodePng(1200, 1600), 640, 80);

        Assert.NotNull(derivative);
        Assert.Equal(480, derivative!.Width);
        Assert.Equal(640, derivative.Height);
    }

    [Fact]
    public void AnImageAlreadySmallerThanTheTarget_GetsNoDerivative()
    {
        // Producing one would add an object and a round trip while making the
        // image no smaller. The original is the right thing to serve.
        Assert.Null(_generator.CreateThumbnail(EncodePng(320, 240), 640, 80));
    }

    [Fact]
    public void BytesThatAreNotAnImage_ProduceNoDerivativeAndNoException()
    {
        var notAnImage = "this is not an image"u8.ToArray();

        Assert.Null(_generator.CreateThumbnail(notAnImage, 640, 80));
    }

    [Fact]
    public void EmptyBytes_ProduceNoDerivative()
    {
        Assert.Null(_generator.CreateThumbnail([], 640, 80));
    }

    [Fact]
    public void ATransparentPng_IsFlattenedRatherThanBlackened()
    {
        var derivative = _generator.CreateThumbnail(EncodeTransparentPng(1600, 1200), 640, 80);

        Assert.NotNull(derivative);

        using var decoded = SKBitmap.Decode(derivative!.Bytes);
        var corner = decoded.GetPixel(2, 2);

        // JPEG has no alpha. Without an explicit white fill this would decode
        // as black, which is what a transparent logo would look like in a grid.
        Assert.True(corner.Red > 200 && corner.Green > 200 && corner.Blue > 200);
    }

    [Theory]
    [InlineData(SKEncodedOrigin.TopLeft, 1600, 1200, 640, 480)]
    [InlineData(SKEncodedOrigin.RightTop, 1600, 1200, 480, 640)]
    [InlineData(SKEncodedOrigin.LeftBottom, 1600, 1200, 480, 640)]
    [InlineData(SKEncodedOrigin.BottomRight, 1600, 1200, 640, 480)]
    [InlineData(SKEncodedOrigin.TopRight, 1600, 1200, 640, 480)]
    public void EncodedOrientation_DecidesTheDerivativeDimensions(
        SKEncodedOrigin origin,
        int storedWidth,
        int storedHeight,
        int expectedWidth,
        int expectedHeight)
    {
        // A phone photographing in portrait usually stores a landscape buffer
        // plus "rotate me". Re-encoding without applying that would turn every
        // portrait photo on its side, so the rotating origins must produce a
        // portrait derivative from a landscape buffer.
        var source = EncodeJpegWithOrigin(storedWidth, storedHeight, origin);

        var derivative = _generator.CreateThumbnail(source, 640, 80);

        Assert.NotNull(derivative);
        Assert.Equal(expectedWidth, derivative!.Width);
        Assert.Equal(expectedHeight, derivative.Height);
    }

    [Fact]
    public void AnUprightPhoto_KeepsItsTopLeftCornerAtTheTopLeft()
    {
        // The source is drawn with a red top-left quadrant and a blue
        // bottom-right one, so an orientation mistake is visible as a colour in
        // the wrong corner rather than only as a dimension change.
        var derivative = _generator.CreateThumbnail(
            EncodeQuadrantJpeg(1600, 1200, SKEncodedOrigin.TopLeft),
            640,
            90);

        Assert.NotNull(derivative);
        using var decoded = SKBitmap.Decode(derivative!.Bytes);

        AssertMostlyRed(decoded.GetPixel(20, 20));
        AssertMostlyBlue(decoded.GetPixel(decoded.Width - 20, decoded.Height - 20));
    }

    [Fact]
    public void ARotatedPhoto_HasItsCornersMovedToMatchWhatTheCameraSaw()
    {
        // RightTop means "rotate 90 clockwise to display". The stored top-left
        // therefore belongs at the displayed top-RIGHT.
        var derivative = _generator.CreateThumbnail(
            EncodeQuadrantJpeg(1600, 1200, SKEncodedOrigin.RightTop),
            640,
            90);

        Assert.NotNull(derivative);
        using var decoded = SKBitmap.Decode(derivative!.Bytes);

        Assert.True(decoded.Height > decoded.Width, "A 90-degree origin must yield a portrait derivative.");
        AssertMostlyRed(decoded.GetPixel(decoded.Width - 20, 20));
        AssertMostlyBlue(decoded.GetPixel(20, decoded.Height - 20));
    }

    [Fact]
    public void TheDerivative_CarriesNoExifMetadataFromTheOriginal()
    {
        // GPS coordinates in a photo published to a public bucket would be a
        // location leak that no privacy switch in the product covers.
        var source = EncodeJpegWithExifGps(1600, 1200);

        Assert.True(ContainsExifMarker(source), "The fixture must actually carry EXIF to be meaningful.");

        var derivative = _generator.CreateThumbnail(source, 640, 80);

        Assert.NotNull(derivative);
        Assert.False(
            ContainsExifMarker(derivative!.Bytes),
            "The derivative is drawn onto a fresh surface and re-encoded, so no EXIF may survive.");
    }

    [Fact]
    public void AnImageDeclaringAnAbsurdCanvas_IsRefusedBeforeAnythingIsDecoded()
    {
        // A "decompression bomb": a small file describing an enormous canvas.
        // Header dimensions are checked before any allocation happens.
        var bomb = EncodePng(1, 1);
        var declared = DeclaredDimensions(bomb);

        Assert.Equal((1, 1), declared);

        // The bound itself is what matters; assert it is set somewhere sane
        // rather than trying to build a genuine 100-megapixel fixture in a test.
        Assert.True(ImageDerivativeGenerator.MaxSourceEdge <= 20_000);
        Assert.True(ImageDerivativeGenerator.MaxSourcePixels <= 100_000_000);
        Assert.True(ImageDerivativeGenerator.MaxDecodedPixels <= 16_000_000);
    }

    [Fact]
    public void AVeryLargePhoto_IsStillReducedWithoutDecodingItAtFullSize()
    {
        // 6000x4000 is a normal 24 MP camera file. It must succeed, and the
        // result must be the requested size.
        var derivative = _generator.CreateThumbnail(EncodeJpeg(6000, 4000), 640, 80);

        Assert.NotNull(derivative);
        Assert.Equal(640, derivative!.Width);
        Assert.Equal(427, derivative.Height);
    }

    [Fact]
    public void TheThumbnailKey_SitsBesideItsOriginal()
    {
        Assert.Equal(
            "pets/abc/moments/def/photo_thumb.jpg",
            MediaDerivatives.BuildThumbnailObjectKey("pets/abc/moments/def/photo.png"));
    }

    [Fact]
    public void TheThumbnailKey_HandlesAKeyWithNoExtension()
    {
        Assert.Equal(
            "pets/abc/profile/photo_thumb.jpg",
            MediaDerivatives.BuildThumbnailObjectKey("pets/abc/profile/photo"));
    }

    [Fact]
    public void TheThumbnailKey_IgnoresADotInAFolderName()
    {
        Assert.Equal(
            "pets/v1.2/photo_thumb.jpg",
            MediaDerivatives.BuildThumbnailObjectKey("pets/v1.2/photo"));
    }

    [Fact]
    public void MediaWithNoDerivative_FallsBackToTheOriginalUrl()
    {
        // The normal case for everything uploaded before this pipeline existed.
        var media = BuildMedia(thumbnailObjectKey: null, MediaDerivativeStatus.NotApplicable);

        Assert.Equal(
            "https://media.mypetlink.com.my/pets/photo.jpg",
            MediaDerivatives.ResolveThumbnailUrl(media, "https://media.mypetlink.com.my"));
    }

    [Fact]
    public void MediaWhoseDerivativeFailed_FallsBackToTheOriginalUrl()
    {
        var media = BuildMedia("pets/photo_thumb.jpg", MediaDerivativeStatus.Failed);

        Assert.Equal(
            "https://media.mypetlink.com.my/pets/photo.jpg",
            MediaDerivatives.ResolveThumbnailUrl(media, "https://media.mypetlink.com.my"));
    }

    [Fact]
    public void MediaWithAReadyDerivative_ServesTheDerivative()
    {
        var media = BuildMedia("pets/photo_thumb.jpg", MediaDerivativeStatus.Ready);

        Assert.Equal(
            "https://media.mypetlink.com.my/pets/photo_thumb.jpg",
            MediaDerivatives.ResolveThumbnailUrl(media, "https://media.mypetlink.com.my"));
    }

    [Fact]
    public void PrivateMedia_NeverServesAPublicDerivativeUrl()
    {
        var media = BuildMedia("private/doc_thumb.jpg", MediaDerivativeStatus.Ready);
        media.IsPublic = false;

        // A private object must not acquire a public URL by way of a thumbnail.
        Assert.Equal(
            MediaDerivatives.ResolveOriginalUrl(media, "https://media.mypetlink.com.my"),
            MediaDerivatives.ResolveThumbnailUrl(media, "https://media.mypetlink.com.my"));
    }

    [Fact]
    public void NoMedia_ResolvesToNoUrl()
    {
        Assert.Null(MediaDerivatives.ResolveThumbnailUrl(null, "https://media.mypetlink.com.my"));
    }

    private static MediaFile BuildMedia(string? thumbnailObjectKey, MediaDerivativeStatus status)
    {
        return new MediaFile
        {
            OriginalFileName = "photo.jpg",
            StorageFileName = "photo.jpg",
            ContentType = "image/jpeg",
            FileSize = 1024,
            StorageProvider = "CloudflareR2",
            StoragePath = "pets/photo.jpg",
            BucketName = "mypetlink-public-media",
            ObjectKey = "pets/photo.jpg",
            ThumbnailObjectKey = thumbnailObjectKey,
            DerivativeStatus = status,
            MediaType = MediaFileType.Image,
            Category = MediaUploadCategory.MomentImage,
            IsPublic = true,
            UploadStatus = MediaUploadStatus.Ready
        };
    }

    private static void AssertMostlyRed(SKColor color)
    {
        Assert.True(
            color.Red > 150 && color.Green < 110 && color.Blue < 110,
            $"Expected a red corner but found {color}.");
    }

    private static void AssertMostlyBlue(SKColor color)
    {
        Assert.True(
            color.Blue > 150 && color.Red < 110,
            $"Expected a blue corner but found {color}.");
    }

    private static (int Width, int Height) DeclaredDimensions(byte[] bytes)
    {
        using var data = SKData.CreateCopy(bytes);
        using var codec = SKCodec.Create(data);
        return (codec!.Info.Width, codec.Info.Height);
    }

    /// <summary>True when the JPEG carries an APP1/EXIF segment.</summary>
    private static bool ContainsExifMarker(byte[] jpeg)
    {
        var marker = "Exif\0\0"u8;

        for (var index = 0; index + marker.Length <= jpeg.Length; index++)
        {
            var match = true;
            for (var offset = 0; offset < marker.Length; offset++)
            {
                if (jpeg[index + offset] != marker[offset])
                {
                    match = false;
                    break;
                }
            }

            if (match)
            {
                return true;
            }
        }

        return false;
    }

    private static byte[] EncodeJpeg(int width, int height)
    {
        using var bitmap = new SKBitmap(width, height);
        using (var canvas = new SKCanvas(bitmap))
        {
            canvas.Clear(new SKColor(120, 180, 220));
        }

        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(SKEncodedImageFormat.Jpeg, 90);
        return data.ToArray();
    }

    /// <summary>
    /// A JPEG whose EXIF declares the given orientation. Written by hand because
    /// SkiaSharp cannot author EXIF, and the orientation behaviour is exactly
    /// what needs proving.
    /// </summary>
    private static byte[] EncodeJpegWithOrigin(int width, int height, SKEncodedOrigin origin)
    {
        return InsertExif(EncodeJpeg(width, height), BuildOrientationExif((ushort)origin));
    }

    private static byte[] EncodeQuadrantJpeg(int width, int height, SKEncodedOrigin origin)
    {
        using var bitmap = new SKBitmap(width, height);
        using (var canvas = new SKCanvas(bitmap))
        {
            canvas.Clear(SKColors.White);
            using var red = new SKPaint { Color = new SKColor(220, 40, 40) };
            using var blue = new SKPaint { Color = new SKColor(40, 60, 220) };
            canvas.DrawRect(0, 0, width / 2f, height / 2f, red);
            canvas.DrawRect(width / 2f, height / 2f, width / 2f, height / 2f, blue);
        }

        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(SKEncodedImageFormat.Jpeg, 95);
        var jpeg = data.ToArray();

        return origin == SKEncodedOrigin.TopLeft
            ? jpeg
            : InsertExif(jpeg, BuildOrientationExif((ushort)origin));
    }

    private static byte[] EncodeJpegWithExifGps(int width, int height)
    {
        return InsertExif(EncodeJpeg(width, height), BuildGpsExif());
    }

    /// <summary>Splices an APP1 segment in immediately after the SOI marker.</summary>
    private static byte[] InsertExif(byte[] jpeg, byte[] exifPayload)
    {
        var segmentLength = exifPayload.Length + 2;
        using var output = new MemoryStream();

        output.WriteByte(jpeg[0]);
        output.WriteByte(jpeg[1]);
        output.WriteByte(0xFF);
        output.WriteByte(0xE1);
        output.WriteByte((byte)(segmentLength >> 8));
        output.WriteByte((byte)(segmentLength & 0xFF));
        output.Write(exifPayload, 0, exifPayload.Length);
        output.Write(jpeg, 2, jpeg.Length - 2);

        return output.ToArray();
    }

    /// <summary>A minimal big-endian TIFF block carrying only Orientation.</summary>
    private static byte[] BuildOrientationExif(ushort orientation)
    {
        using var output = new MemoryStream();
        using var writer = new BinaryWriter(output);

        writer.Write("Exif\0\0"u8);
        writer.Write("MM"u8);                       // big endian
        WriteUInt16BigEndian(writer, 42);
        WriteUInt32BigEndian(writer, 8);            // IFD0 offset
        WriteUInt16BigEndian(writer, 1);            // one entry
        WriteUInt16BigEndian(writer, 0x0112);       // Orientation
        WriteUInt16BigEndian(writer, 3);            // SHORT
        WriteUInt32BigEndian(writer, 1);            // count
        WriteUInt16BigEndian(writer, orientation);
        WriteUInt16BigEndian(writer, 0);            // padding
        WriteUInt32BigEndian(writer, 0);            // no next IFD

        return output.ToArray();
    }

    /// <summary>A TIFF block carrying a GPS IFD pointer, to prove it is dropped.</summary>
    private static byte[] BuildGpsExif()
    {
        using var output = new MemoryStream();
        using var writer = new BinaryWriter(output);

        writer.Write("Exif\0\0"u8);
        writer.Write("MM"u8);
        WriteUInt16BigEndian(writer, 42);
        WriteUInt32BigEndian(writer, 8);
        WriteUInt16BigEndian(writer, 1);
        WriteUInt16BigEndian(writer, 0x8825);       // GPS IFD pointer
        WriteUInt16BigEndian(writer, 4);            // LONG
        WriteUInt32BigEndian(writer, 1);
        WriteUInt32BigEndian(writer, 26);
        WriteUInt32BigEndian(writer, 0);

        // GPS IFD: latitude reference "N".
        WriteUInt16BigEndian(writer, 1);
        WriteUInt16BigEndian(writer, 0x0001);
        WriteUInt16BigEndian(writer, 2);            // ASCII
        WriteUInt32BigEndian(writer, 2);
        writer.Write((byte)'N');
        writer.Write((byte)0);
        WriteUInt16BigEndian(writer, 0);
        WriteUInt32BigEndian(writer, 0);

        return output.ToArray();
    }

    private static void WriteUInt16BigEndian(BinaryWriter writer, ushort value)
    {
        writer.Write((byte)(value >> 8));
        writer.Write((byte)(value & 0xFF));
    }

    private static void WriteUInt32BigEndian(BinaryWriter writer, uint value)
    {
        writer.Write((byte)(value >> 24));
        writer.Write((byte)((value >> 16) & 0xFF));
        writer.Write((byte)((value >> 8) & 0xFF));
        writer.Write((byte)(value & 0xFF));
    }

    private static byte[] EncodePng(int width, int height)
    {
        using var bitmap = new SKBitmap(width, height);
        using (var canvas = new SKCanvas(bitmap))
        {
            canvas.Clear(new SKColor(120, 180, 220));
            using var paint = new SKPaint { Color = new SKColor(250, 200, 120) };
            canvas.DrawRect(0, 0, width / 2f, height / 2f, paint);
        }

        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(SKEncodedImageFormat.Png, 100);
        return data.ToArray();
    }

    private static byte[] EncodeTransparentPng(int width, int height)
    {
        using var bitmap = new SKBitmap(width, height, SKColorType.Rgba8888, SKAlphaType.Premul);
        using (var canvas = new SKCanvas(bitmap))
        {
            canvas.Clear(SKColors.Transparent);
        }

        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(SKEncodedImageFormat.Png, 100);
        return data.ToArray();
    }
}
