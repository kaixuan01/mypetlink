using MyPetLink.Api.Common;
using SkiaSharp;
using UglyToad.PdfPig;

namespace MyPetLink.Api.Services;

/// <summary>
/// Checks that a signed agreement file is a document someone can actually open before it is kept
/// as evidence. A matching header is not enough: the whole PDF must parse with readable pages, and
/// an image must decode completely. Nothing here reads text or judges a signature — a scanned page
/// with no selectable text is accepted.
/// </summary>
internal static class SignedAgreementFileValidator
{
    internal const int MaxPdfPages = 500;
    internal const int MaxImageEdge = 12000;
    internal const long MaxImagePixels = 40_000_000;
    private static readonly TimeSpan PdfParseLimit = TimeSpan.FromSeconds(15);

    /// <summary>Throws a 400 explaining the problem; returns normally only for a readable file.</summary>
    public static async Task RequireReadableAsync(byte[] content, string contentType, CancellationToken ct)
    {
        if (contentType == "application/pdf") await RequireReadablePdfAsync(content, ct);
        else RequireReadableImage(content, contentType);
    }

    private static async Task RequireReadablePdfAsync(byte[] content, CancellationToken ct)
    {
        if (!EndsLikeAPdf(content))
            throw Unreadable("The PDF looks incomplete. Upload the full signed file again.");
        // Parsing is bounded by the 8 MB upload limit, a page cap and a time limit.
        var parse = Task.Run(() => InspectPdf(content), ct);
        try
        {
            await parse.WaitAsync(PdfParseLimit, ct);
        }
        catch (TimeoutException)
        {
            throw Unreadable("The PDF couldn't be checked. Save or scan it again as a standard PDF and upload that copy.");
        }
    }

    // A complete PDF ends with its end-of-file marker; a cut-off upload does not.
    private static bool EndsLikeAPdf(byte[] content) =>
        content.AsSpan(Math.Max(0, content.Length - 1024)).IndexOf("%%EOF"u8) >= 0;

    private static void InspectPdf(byte[] content)
    {
        PdfDocument document;
        try
        {
            document = PdfDocument.Open(content);
        }
        catch (Exception e) when (e is not OutOfMemoryException)
        {
            throw Unreadable("The PDF couldn't be opened. Upload the original signed PDF, or a scan of it.");
        }
        using (document)
        {
            if (document.IsEncrypted)
                throw Unreadable("The PDF is password-protected or encrypted. Upload an unprotected copy, or a scan of the signed pages.");
            int pages;
            try { pages = document.NumberOfPages; }
            catch (Exception e) when (e is not OutOfMemoryException) { pages = 0; }
            if (pages < 1)
                throw Unreadable("The PDF has no readable pages. Upload the signed agreement itself.");
            if (pages > MaxPdfPages)
                throw Unreadable($"The PDF has more than {MaxPdfPages} pages. Upload only the signed agreement.");
            for (var number = 1; number <= pages; number++)
            {
                try
                {
                    var page = document.GetPage(number);
                    if (page.Width <= 0 || page.Height <= 0) throw new InvalidDataException();
                }
                catch (Exception e) when (e is not OutOfMemoryException)
                {
                    throw Unreadable($"Page {number} of the PDF couldn't be read. Upload the original signed PDF, or a scan of it.");
                }
            }
        }
    }

    private static void RequireReadableImage(byte[] content, string contentType)
    {
        var expected = contentType == "image/png" ? SKEncodedImageFormat.Png : SKEncodedImageFormat.Jpeg;
        using var data = SKData.CreateCopy(content);
        using var codec = SKCodec.Create(data);
        if (codec is null || codec.EncodedFormat != expected)
            throw Unreadable("The image couldn't be opened. Upload the original photo or scan.");
        var (width, height) = (codec.Info.Width, codec.Info.Height);
        if (width <= 0 || height <= 0 || width > MaxImageEdge || height > MaxImageEdge || (long)width * height > MaxImagePixels)
            throw Unreadable($"The image must be at most {MaxImageEdge:N0} pixels on each side and {MaxImagePixels / 1_000_000} megapixels.");
        // Decoding every pixel is what tells a whole image from one cut off after its header.
        using var bitmap = new SKBitmap(new SKImageInfo(width, height, SKColorType.Rgba8888, SKAlphaType.Premul));
        if (codec.GetPixels(bitmap.Info, bitmap.GetPixels()) != SKCodecResult.Success)
            throw Unreadable("The image is damaged or incomplete. Upload the original photo or scan.");
    }

    private static ApiException Unreadable(string message) => new(400, "signed_copy_unreadable", message);
}
