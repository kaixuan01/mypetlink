using System.Text;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Entities;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

// Independent review R1 (historical reference case) and R2 (signed-copy content). Synthetic data only.
public sealed partial class ConsignmentRelationalTests
{
    private static async Task HistoricalAgreement(Guid merchantId, string reference, RelationalScope scope)
    {
        // Written as the earlier, hand-typed form left it.
        await using var db = scope.NewContext();
        db.ConsignmentAgreements.Add(new ConsignmentAgreement { MerchantId = merchantId, Reference = reference, PartnerCommissionPercentage = 31m,
            UpdatedByAdminUserId = AdminRecordId });
        await db.SaveChangesAsync();
    }

    // ---- R1 -----------------------------------------------------------------------------------------

    [Theory]
    [InlineData("legacy-cons-2025-001")]
    [InlineData("Legacy-Cons-2025-001")]
    [InlineData("LEGACY-CONS-2025-001")]
    public async Task R1_AHistoricalReferenceInAnyCaseReservesItsPrefixWithoutBreakingOthers(string historical)
    {
        await using var scope = await Database(1);
        await HistoricalAgreement(OtherMerchantId, historical, scope);
        await using var db = scope.NewContext();
        var merchant = await db.Merchants.SingleAsync(m => m.Id == MerchantId);
        merchant.TradingName = "Legacy"; await db.SaveChangesAsync();
        var s = Desk(db);

        var prefix = await s.AgreementPrefixAsync(MerchantId, default);
        Assert.Equal("LEGACY2", prefix.SuggestedPrefix);
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() =>
            s.SaveAgreementPrefixAsync(AdminAccountId, MerchantId, new("LEGACY", prefix.ConcurrencyToken), default))).StatusCode);
        Assert.Equal("LEGACY2-CONS-2026-001", (await s.SaveAgreementAsync(AdminAccountId, null, Terms(), null, default)).Reference);

        // The historical row is untouched, letter for letter.
        var kept = await db.ConsignmentAgreements.AsNoTracking().SingleAsync(a => a.MerchantId == OtherMerchantId);
        Assert.Equal(historical, kept.Reference, StringComparer.Ordinal);
        Assert.Equal(31m, kept.PartnerCommissionPercentage);
    }

    [Fact]
    public async Task R1_MalformedHistoricalReferencesNeverFailAndStillClaimWhatTheyCan()
    {
        await using var scope = await Database(1);
        foreach (var reference in new[] { "-CONS-2025-001", "NODELIMITER-2025-001", "--cons--x", "ank pets-cons-2024-9", "cons-only", "-cons-" })
            await HistoricalAgreement(OtherMerchantId, reference, scope);
        await using var db = scope.NewContext();
        var merchant = await db.Merchants.SingleAsync(m => m.Id == MerchantId);
        merchant.TradingName = "Ank Pets"; await db.SaveChangesAsync();
        var s = Desk(db);
        // "ank pets-cons-…" claims ANKPETS; the others carry no usable prefix and claim nothing.
        Assert.Equal("ANKPETS2", (await s.AgreementPrefixAsync(MerchantId, default)).SuggestedPrefix);
        Assert.Equal("ANKPETS2-CONS-2026-001", (await s.SaveAgreementAsync(AdminAccountId, null, Terms(), null, default)).Reference);
        Assert.Equal(6, await db.ConsignmentAgreements.CountAsync(a => a.MerchantId == OtherMerchantId));
    }

    [Fact]
    public async Task R1_OwnHistoricalNumbersInAnyCaseAreSkippedEvenUnderConcurrencyAndRetries()
    {
        await using var scope = await Database(1);
        await HistoricalAgreement(MerchantId, "happypaws-cons-2026-001", scope);
        await HistoricalAgreement(MerchantId, "HappyPaws-Cons-2026-003", scope);
        var results = await Task.WhenAll(Enumerable.Range(0, 4).Select(async i => {
            await using var db = scope.NewContext();
            return (await Desk(db).SaveAgreementAsync(AdminAccountId, null, Terms() with { IdempotencyKey = "r1-parallel-" + i }, null, default)).Reference;
        }));
        Assert.Equal(["HAPPYPAWS-CONS-2026-002", "HAPPYPAWS-CONS-2026-004", "HAPPYPAWS-CONS-2026-005", "HAPPYPAWS-CONS-2026-006"], results.Order().ToArray());
        await using var check = scope.NewContext();
        // A retry hands back the draft it already created; no number is taken twice.
        var retry = await Desk(check).SaveAgreementAsync(AdminAccountId, null, Terms() with { IdempotencyKey = "r1-parallel-2" }, null, default);
        Assert.Contains(retry.Reference, results);
        var all = await check.ConsignmentAgreements.AsNoTracking().Select(a => a.Reference).ToListAsync();
        Assert.Equal(all.Count, all.Select(r => r.ToUpperInvariant()).Distinct().Count());
        Assert.Contains("happypaws-cons-2026-001", all);
        Assert.Contains("HappyPaws-Cons-2026-003", all);
    }

    // ---- R2 -----------------------------------------------------------------------------------------

    private static byte[] MinimalPdf(string pages)
    {
        // Hand-built so the structure is exactly what the test names, with correct offsets.
        var body = new StringBuilder("%PDF-1.4\n");
        var offsets = new List<int>();
        foreach (var obj in new[] { "<< /Type /Catalog /Pages 2 0 R >>", pages })
        {
            offsets.Add(Encoding.ASCII.GetByteCount(body.ToString()));
            body.Append($"{offsets.Count} 0 obj\n{obj}\nendobj\n");
        }
        var xref = Encoding.ASCII.GetByteCount(body.ToString());
        body.Append($"xref\n0 {offsets.Count + 1}\n0000000000 65535 f \n");
        foreach (var o in offsets) body.Append($"{o:0000000000} 00000 n \n");
        body.Append($"trailer\n<< /Size {offsets.Count + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n");
        return Encoding.ASCII.GetBytes(body.ToString());
    }

    public static TheoryData<string, string, string> UnreadableFiles() => new()
    {
        { "header-only-pdf", "application/pdf", "signed.pdf" },
        { "truncated-pdf", "application/pdf", "signed.pdf" },
        { "truncated-pdf-with-eof", "application/pdf", "signed.pdf" },
        { "zero-page-pdf", "application/pdf", "signed.pdf" },
        { "corrupt-png", "image/png", "signed.png" },
        { "truncated-png", "image/png", "signed.png" },
        { "truncated-jpeg", "image/jpeg", "signed.jpg" },
        { "oversized-png", "image/png", "signed.png" },
        { "jpeg-declared-as-png", "image/png", "signed.png" },
        { "pdf-named-as-jpeg", "image/jpeg", "signed.jpg" },
    };

    private static byte[] UnreadableContent(string kind)
    {
        var pdf = SignedCopyFixtures.Pdf("r2-source");
        return kind switch
        {
            "header-only-pdf" => Encoding.ASCII.GetBytes("%PDF-this is not a readable PDF document"),
            "truncated-pdf" => pdf[..(pdf.Length / 2)],
            "truncated-pdf-with-eof" => [.. pdf[..(pdf.Length / 3)], .. Encoding.ASCII.GetBytes("\n%%EOF\n")],
            "zero-page-pdf" => MinimalPdf("<< /Type /Pages /Kids [] /Count 0 >>"),
            "corrupt-png" => [.. SignedCopyFixtures.Png()[..8], .. Enumerable.Repeat((byte)0x5A, 400)],
            "truncated-png" => SignedCopyFixtures.Png()[..(SignedCopyFixtures.Png().Length * 3 / 5)],
            "truncated-jpeg" => SignedCopyFixtures.Jpeg()[..(SignedCopyFixtures.Jpeg().Length / 2)],
            "oversized-png" => SignedCopyFixtures.Png(SignedAgreementFileLimits.MaxEdge + 1, 1, "wide"),
            "jpeg-declared-as-png" => SignedCopyFixtures.Jpeg(),
            "pdf-named-as-jpeg" => pdf,
            _ => throw new ArgumentOutOfRangeException(nameof(kind)),
        };
    }

    [Theory]
    [MemberData(nameof(UnreadableFiles))]
    public async Task R2_UnreadableFilesAreRefusedAndLeaveNoEvidence(string kind, string type, string name)
    {
        await using var scope = await Database(1); await using var db = scope.NewContext();
        await DocumentAccess(db, AdminRecordId, AdminCapabilities.ConsignmentAgreementsManage);
        var s = AgreementDesk(db);
        var a = await s.SaveAgreementAsync(AdminAccountId, null, UnsignedTerms(), null, default);
        var issued = Assert.Single((await s.IssueAgreementAsync(AdminAccountId, a.Id, new(a.ConcurrencyToken), default)).IssuedDocuments);

        var failure = await Assert.ThrowsAsync<ApiException>(() =>
            s.UploadSignedAgreementAsync(AdminAccountId, a.Id, Signed(issued.Id, UnreadableContent(kind), type, name), default));
        Assert.Equal(400, failure.StatusCode);
        Assert.Contains(failure.Code, new[] { "signed_copy_unreadable", "validation_failed" });

        Assert.Empty(db.ConsignmentSignedAgreements);
        var summary = await s.AgreementDocumentAsync(a.Id, default);
        Assert.Equal("issued", summary.Status); Assert.False(summary.SignedCopyMatchesCurrentTerms); Assert.Empty(summary.SignedCopies);
        Assert.False(await db.AuditLogs.AnyAsync(e => e.Action == "consignment.agreement-signed-copy-uploaded"));
        Assert.Equal(issued.ContentSha256, (await db.ConsignmentAgreementDocuments.AsNoTracking().SingleAsync()).ContentSha256);
        // A refused upload doesn't lock the terms.
        var edited = await s.SaveAgreementAsync(AdminAccountId, a.Id, UnsignedTerms(33m), a.ConcurrencyToken, default);
        Assert.Equal(33m, edited.PartnerCommissionPercentage);
    }

    [Fact]
    public async Task R2_GenuinePdfsScansAndImagesAreAcceptedAndKeptExactly()
    {
        await using var scope = await Database(1); await using var db = scope.NewContext();
        await DocumentAccess(db, AdminRecordId, AdminCapabilities.ConsignmentAgreementsManage);
        var s = AgreementDesk(db);
        var a = await s.SaveAgreementAsync(AdminAccountId, null, UnsignedTerms(), null, default);
        var issued = Assert.Single((await s.IssueAgreementAsync(AdminAccountId, a.Id, new(a.ConcurrencyToken), default)).IssuedDocuments);
        var issuedPdf = (await s.IssuedAgreementPdfAsync(AdminAccountId, a.Id, issued.Id, default)).Content;

        var files = new (byte[] Content, string Type, string Name)[] {
            (SignedCopyFixtures.Pdf("r2-valid"), "application/pdf", "signed.pdf"),
            (SignedCopyFixtures.ScannedPdf("r2-scan"), "application/pdf", "scan.pdf"),
            (SignedCopyFixtures.Png(900, 1200, "r2-photo"), "image/png", "photo.png"),
            (SignedCopyFixtures.Jpeg(900, 1200, "r2-photo"), "image/jpeg", "photo.jpeg"),
            (issuedPdf, "application/pdf", "countersigned.pdf"),   // the real generated agreement, as printed and scanned back
        };
        foreach (var f in files)
            await s.UploadSignedAgreementAsync(AdminAccountId, a.Id, Signed(issued.Id, f.Content, f.Type, f.Name), default);

        var summary = await s.AgreementDocumentAsync(a.Id, default);
        Assert.Equal("signed-copy-received", summary.Status); Assert.Equal(5, summary.SignedCopies.Count);
        foreach (var copy in summary.SignedCopies)
        {
            var original = files.Single(f => f.Name == copy.OriginalFileName);
            Assert.Equal(original.Content, (await s.SignedAgreementFileAsync(AdminAccountId, a.Id, copy.Id, default)).Content);
        }
        Assert.Equal(issued.ContentSha256, (await db.ConsignmentAgreementDocuments.AsNoTracking().SingleAsync()).ContentSha256);
    }
}

internal static class SignedAgreementFileLimits
{
    public const int MaxEdge = 12000;
}
