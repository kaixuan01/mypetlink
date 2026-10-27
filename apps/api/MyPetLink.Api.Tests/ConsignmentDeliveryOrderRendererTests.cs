using MyPetLink.Api.Services;
using UglyToad.PdfPig;

namespace MyPetLink.Api.Tests;

// Layout checks on synthetic snapshots: long SKU lists run onto further pages with the table
// header repeated, long text wraps instead of clipping, and the signatures stay together.
[Collection("PDF document rendering")]
public sealed class ConsignmentDeliveryOrderRendererTests
{
    public ConsignmentDeliveryOrderRendererTests() => QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;

    private static readonly DateTimeOffset Delivered = new(2026, 10, 23, 2, 30, 0, TimeSpan.Zero);

    internal static ConsignmentService.DeliveryOrderSnapshot Snapshot(int skus, ConsignmentService.DeliveryOrderReceipt? receipt = null,
        string partner = "Synthetic Paws Trading Sdn Bhd", string? registration = "SYN-202601000777", string? branch = "Synthetic HQ")
    {
        var lines = Enumerable.Range(1, skus).Select(i => new ConsignmentService.DeliveryOrderLine(
            $"SYN-DESIGN-{i:000}-LW-QR-NFC", i % 7 == 0 ? $"Synthetic Extra Long Collection Name For Wrapping Check Number {i}" : "Synthetic Pawsome Pet Tag",
            i % 2 == 0 ? "Standard" : "Lightweight", 10 + i, receipt is null ? null : 10 + i)).ToArray();
        return new("MPL-DO-261023-0001", Guid.NewGuid(), "MPL-CS-261023-0001", "MyPetLink", "Synthetic Software Solutions",
            "SYN-REG-001", ["1 Synthetic Road", "50000 Kuala Lumpur", "Malaysia"], "support@example.com", null, partner, null, registration,
            branch, "Synthetic HQ, 12 Jalan Synthetic, 50000, Kuala Lumpur, Malaysia", "Synthetic Contact", "+60 12-000 0000",
            "SYNPAWSGROUP-CONS-2026-001", 1, Delivered, "Hand delivered", "Synthetic Operator", lines, lines.Sum(l => l.Delivered), receipt, Delivered);
    }

    private static (int Pages, string[] Text) Read(byte[] pdf)
    {
        using var document = PdfDocument.Open(pdf);
        return (document.NumberOfPages, document.GetPages().Select(p => new string(p.Text.Where(c => !char.IsWhiteSpace(c)).ToArray())).ToArray());
    }

    [Fact]
    public void TypicalDeliveryFitsOneA4Page()
    {
        var pdf = ConsignmentDeliveryOrderRenderer.Render(new(Snapshot(3), []));
        if (Environment.GetEnvironmentVariable("MYPETLINK_DELIVERY_ORDER_PDF_QA") is { Length: > 0 } dir)
            File.WriteAllBytes(Path.Combine(dir, "three-sku-like-reference.pdf"), pdf);
        var (pages, text) = Read(pdf);
        Assert.Equal(1, pages);
        using var document = PdfDocument.Open(pdf);
        var size = document.GetPage(1);
        Assert.Equal(595, Math.Round(size.Width)); Assert.Equal(842, Math.Round(size.Height));   // A4 in points
        Assert.Contains("Page1of1", text[0]);
        Assert.Contains("RECEIVEDBY/FORCONSIGNEE", text[0]);
    }

    // Shaped like the first paper handover: three catalogue SKUs, 100 pieces, a long agreement reference.
    [Fact]
    public void ReferenceShapedHandoverFitsOnePageWithEveryQuantity()
    {
        ConsignmentService.DeliveryOrderLine[] lines =
        [
            new("MYBOSS-LW-QR-NFC", "MyPetLink MyBoss Pet Tag", "Lightweight", 20, null),
            new("PAWSOME-LW-QR-NFC", "MyPetLink Pawsome Pet Tag", "Lightweight", 40, null),
            new("PAWSOME-SD-QR-NFC", "MyPetLink Pawsome Pet Tag", "Standard", 40, null),
        ];
        var pdf = ConsignmentDeliveryOrderRenderer.Render(new(Snapshot(0) with { Lines = lines, TotalQuantity = 100 }, []));
        if (Environment.GetEnvironmentVariable("MYPETLINK_DELIVERY_ORDER_PDF_QA") is { Length: > 0 } dir)
            File.WriteAllBytes(Path.Combine(dir, "reference-shaped-100-pcs.pdf"), pdf);
        var (pages, text) = Read(pdf);
        Assert.Equal(1, pages);
        foreach (var expected in new[] { "SYNPAWSGROUP-CONS-2026-001|Version1", "1MYBOSS-LW-QR-NFCMyPetLinkMyBossPetTagLightweight20",
            "2PAWSOME-LW-QR-NFCMyPetLinkPawsomePetTagLightweight40", "3PAWSOME-SD-QR-NFCMyPetLinkPawsomePetTagStandard40",
            "Totaldelivered100", "DELIVEREDTOTAL:100QR+NFCSMARTTAGS", "Differencevs100pcs:", "RECEIVEDBY/FORCONSIGNEE" })
            Assert.Contains(expected, text[0]);
    }

    [Fact]
    public void ManySkusPaginateWithRepeatedHeaderAndSignaturesKeptTogether()
    {
        var snapshot = Snapshot(45);
        var pdf = ConsignmentDeliveryOrderRenderer.Render(new(snapshot, []));
        if (Environment.GetEnvironmentVariable("MYPETLINK_DELIVERY_ORDER_PDF_QA") is { Length: > 0 } dir)
            File.WriteAllBytes(Path.Combine(dir, "pagination-45-skus.pdf"), pdf);
        var (pages, text) = Read(pdf);
        Assert.True(pages >= 2, $"Expected at least two pages, got {pages}.");
        // The header row repeats on every page that carries table rows.
        foreach (var page in text.Where(t => t.Contains("SYN-DESIGN-")))
            Assert.Contains("SKU/Productcode", page);
        for (var i = 1; i <= 45; i++) Assert.Single(text, t => t.Contains($"SYN-DESIGN-{i:000}-LW-QR-NFC"));
        Assert.Contains($"Totaldelivered{snapshot.TotalQuantity}", string.Concat(text).Replace(",", ""));
        // Both signature blocks land on the same, last page, and every page names the DO and its position.
        var signatures = text.Single(t => t.Contains("DELIVEREDBY/FORCONSIGNOR"));
        Assert.Contains("RECEIVEDBY/FORCONSIGNEE", signatures);
        Assert.Same(signatures, text[^1]);
        for (var p = 1; p <= pages; p++) Assert.Contains($"MPL-DO-261023-0001|Page{p}of{pages}", text[p - 1]);
        Assert.Contains("SyntheticExtraLongCollectionNameForWrappingCheckNumber42", string.Concat(text));
    }

    // A printed row is a count line: its SKU, design, size, delivered quantity and count box must stay on one page.
    [Theory]
    [InlineData(45)]
    [InlineData(14)]
    [InlineData(15)]
    [InlineData(16)]
    [InlineData(17)]
    [InlineData(30)]
    [InlineData(60)]
    public void EverySkuRowStaysWhole(int skus)
    {
        var snapshot = Snapshot(skus) with { Lines = Snapshot(skus).Lines.Select((l, i) => i % 3 == 1
            ? l with { Design = $"Synthetic Extra Long Collection Name For Wrapping Check Number {i + 1} With A Second Line Of Text" } : l).ToArray() };
        var pdf = ConsignmentDeliveryOrderRenderer.Render(new(snapshot, []));
        if (skus == 45 && Environment.GetEnvironmentVariable("MYPETLINK_DELIVERY_ORDER_PDF_QA") is { Length: > 0 } dir)
            File.WriteAllBytes(Path.Combine(dir, "pagination-45-skus-long-designs.pdf"), pdf);
        var (pages, text) = Read(pdf);
        var number = 0;
        foreach (var line in snapshot.Lines)
        {
            number++;
            var row = new string($"{number}{line.Sku}{line.Design}{line.Size}{line.Delivered}".Where(c => !char.IsWhiteSpace(c)).ToArray());
            Assert.True(text.Count(t => t.Contains(row, StringComparison.Ordinal)) == 1, $"Row {number} is split or missing across {pages} pages.");
        }
        for (var p = 1; p <= pages; p++) Assert.Contains($"|Page{p}of{pages}", text[p - 1]);
        Assert.Contains("RECEIVEDBY/FORCONSIGNEE", text[^1]);
    }

    // The longest values the snapshot columns allow still fit one row on one page: no crash and nothing clipped.
    [Fact]
    public void MaximumLengthRowValuesRenderInFull()
    {
        var sku = new string('S', 80);
        var design = string.Join(" ", Enumerable.Repeat("Design", 28)).PadRight(200, 'D')[..200];
        var size = string.Join(" ", Enumerable.Repeat("Size", 40)).PadRight(200, 'Z')[..200];
        var lines = Enumerable.Range(1, 6).Select(i => new ConsignmentService.DeliveryOrderLine(sku[..^1] + i, design, size, i, null)).ToArray();
        var pdf = ConsignmentDeliveryOrderRenderer.Render(new(Snapshot(0) with { Lines = lines, TotalQuantity = lines.Sum(l => l.Delivered) }, []));
        if (Environment.GetEnvironmentVariable("MYPETLINK_DELIVERY_ORDER_PDF_QA") is { Length: > 0 } dir)
            File.WriteAllBytes(Path.Combine(dir, "maximum-length-rows.pdf"), pdf);
        var (_, text) = Read(pdf);
        var all = string.Concat(text);
        for (var i = 1; i <= 6; i++)
            Assert.Single(text, t => t.Contains(sku[..^1] + i, StringComparison.Ordinal));
        Assert.Equal(6, CountOf(all, new string(design.Where(c => !char.IsWhiteSpace(c)).ToArray())));
        Assert.Equal(6, CountOf(all, new string(size.Where(c => !char.IsWhiteSpace(c)).ToArray())));
    }

    private static int CountOf(string text, string value)
    {
        var count = 0;
        for (var i = text.IndexOf(value, StringComparison.Ordinal); i >= 0; i = text.IndexOf(value, i + value.Length, StringComparison.Ordinal)) count++;
        return count;
    }

    [Fact]
    public void BlankFormLeavesCountsForHandwritingAndMissingDetailsAreNotInvented()
    {
        var (_, text) = Read(ConsignmentDeliveryOrderRenderer.Render(new(Snapshot(2, registration: null, branch: null), [])));
        var page = text[0];
        Assert.Contains("Fillcountedquantitiesbyhandaftercheck", page);
        Assert.DoesNotContain("Recordedatreceipt", page);
        Assert.DoesNotContain("SYN-202601000777", page);
        Assert.Contains("Branch/outlet:", page);
        Assert.Contains("SyntheticOperator", page);   // the admin who confirmed dispatch, never a drawn signature
    }

    [Fact]
    public void RecordedReceiptFillsTheCountAndExceptions()
    {
        var receipt = new ConsignmentService.DeliveryOrderReceipt(20, 18, 2, 1, 0, 0, 0,
            [new(Delivered.AddHours(3), "Synthetic Receiver", 18, 2, 1)], []);
        var (_, text) = Read(ConsignmentDeliveryOrderRenderer.Render(new(Snapshot(2, receipt) with { TotalQuantity = 21 }, [])));
        var page = text[0];
        Assert.Contains("Recordedatreceipt:2damaged,1missing.", page);
        Assert.Contains("SyntheticReceiver", page);
        Assert.Contains("23-10-202613:30", page);   // Malaysian time of the recorded receipt
        Assert.Contains("Recordedreceipt:23-10-202613:30,SyntheticReceiver:18good,2damaged,1missing.", page);
    }

    private static ConsignmentService.DeliveryOrderSigning Signed(string name = "Synthetic Signatory", string position = "Director") =>
        new(Guid.NewGuid(), name, position, Delivered.AddHours(1), new string('A', 64));

    [Fact]
    public void ASigningIsNeverPrintedWithoutItsImageOrTheOtherWayRound()
    {
        var png = SignatureTestImages.Png();
        Assert.Throws<InvalidOperationException>(() => ConsignmentDeliveryOrderRenderer.Render(new(Snapshot(1) with { Signature = Signed() }, [])));
        Assert.Throws<InvalidOperationException>(() => ConsignmentDeliveryOrderRenderer.Render(new(Snapshot(1), [], png)));
    }

    [Fact]
    public void SignedDeliveredByKeepsReceivedByBlankAndFitsOnePage()
    {
        var image = DocumentSignatureImage.Normalize(SignatureTestImages.Png(), "image/png").Png;
        var pdf = ConsignmentDeliveryOrderRenderer.Render(new(Snapshot(3) with
            { Signature = Signed("Synthetic Signatory Binti Abdullah", "Founder and Managing Director") }, [], image));
        var preview = ConsignmentDeliveryOrderRenderer.Render(new(Snapshot(3) with { Number = ConsignmentService.PreviewNumber, Signature = Signed() }, [], image, Preview: true));
        if (Environment.GetEnvironmentVariable("MYPETLINK_DELIVERY_ORDER_PDF_QA") is { Length: > 0 } dir)
        {
            File.WriteAllBytes(Path.Combine(dir, "signed-long-signatory.pdf"), pdf);
            File.WriteAllBytes(Path.Combine(dir, "signed-preview.pdf"), preview);
        }
        var (pages, text) = Read(pdf);
        Assert.Equal(1, pages);
        Assert.Contains("SyntheticSignatoryBintiAbdullah,FounderandManagingDirector", text[0]);
        Assert.Contains("23-10-202611:30", text[0]);   // signed at issue, Malaysian time
        // Received By still has its blank lines, filled by nobody.
        Assert.Contains("RECEIVEDBY/FORCONSIGNEESignature/companystamp(ifavailable)Name/title:Date/time:", text[0]);
        Assert.Equal(1, Read(preview).Pages);
    }

    [Fact]
    public void TheLongestSignatoryDetailsKeepBothSignatureBlocksTogetherInFull()
    {
        var max = DocumentSignatureService.MaxTextLength;
        var name = string.Concat(Enumerable.Repeat("Synthetic Signatory ", 4))[..max];
        var position = string.Concat(Enumerable.Repeat("Managing Director ", 4))[..max];
        var image = DocumentSignatureImage.Normalize(SignatureTestImages.Png(), "image/png").Png;
        var pdf = ConsignmentDeliveryOrderRenderer.Render(new(Snapshot(3) with { Signature = Signed(name, position) }, [], image));
        if (Environment.GetEnvironmentVariable("MYPETLINK_DELIVERY_ORDER_PDF_QA") is { Length: > 0 } dir)
            File.WriteAllBytes(Path.Combine(dir, "signed-maximum-length-signatory.pdf"), pdf);
        var (pages, text) = Read(pdf);
        Assert.InRange(pages, 1, 2);
        // Whatever page the signatures land on, both blocks and the whole name and position are on it.
        var last = text[^1];
        Assert.Contains("DELIVEREDBY/FORCONSIGNOR", last);
        Assert.Contains("RECEIVEDBY/FORCONSIGNEE", last);
        Assert.Contains($"{name},{position}".Replace(" ", ""), last);
    }
}
