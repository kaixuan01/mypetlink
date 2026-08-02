using MyPetLink.Api.Common;

namespace MyPetLink.Api.Tests;

public sealed class MediaFileMetadataTests
{
    [Theory]
    [InlineData("../../../etc/passwd.png", "passwd.png")]
    [InlineData(@"C:\\receipts\\bank-payment.jpg", "bank-payment.jpg")]
    [InlineData("receipt\r\nadmin.pdf", "receiptadmin.pdf")]
    [InlineData("receipt\u0001\u0002.png", "receipt.png")]
    [InlineData("<>:\"/\\|?*", null)]
    [InlineData("resit-pembayaran-猫.png", "resit-pembayaran-猫.png")]
    [InlineData("Maybank receipt 2026-08-03.pdf", "Maybank receipt 2026-08-03.pdf")]
    public void SanitizeOriginalFileName_RemovesUnsafeInputAndKeepsReadableNames(
        string input,
        string? expected)
    {
        Assert.Equal(expected, MediaFileMetadata.SanitizeOriginalFileName(input));
    }

    [Fact]
    public void SanitizeOriginalFileName_TruncatesLongNamesAndPreservesSafeExtension()
    {
        var sanitized = MediaFileMetadata.SanitizeOriginalFileName($"receipt-{new string('a', 400)}.png");

        Assert.NotNull(sanitized);
        Assert.Equal(MediaFileMetadata.MaxOriginalFileNameLength, sanitized.Length);
        Assert.EndsWith(".png", sanitized, StringComparison.OrdinalIgnoreCase);
        Assert.StartsWith("receipt-", sanitized, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("receipt.jpg", "image/jpeg")]
    [InlineData("receipt.JPEG", "image/jpeg")]
    [InlineData("receipt.png", "image/png")]
    [InlineData("receipt.WEBP", "image/webp")]
    [InlineData("receipt.pdf", "application/pdf")]
    [InlineData("receipt.exe", "application/octet-stream")]
    public void InferContentType_RecognizesSupportedPaymentProofExtensions(
        string fileName,
        string expected)
    {
        Assert.Equal(expected, MediaFileMetadata.InferContentType(fileName));
    }
}
