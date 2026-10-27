using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using UglyToad.PdfPig;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

// The agreement document is generated from the saved row, frozen when issued, and
// never approves anything. All parties, terms and files below are synthetic.
public sealed partial class ConsignmentRelationalTests
{
    private const string PartnerName = "Synthetic Paws Trading Sdn Bhd";

    private static async Task DocumentAccess(MyPetLinkDbContext db, Guid adminId, params string[] capabilities)
    {
        var role = new AdminRoleDefinition { Code = "SYN-DOC-" + Guid.NewGuid().ToString("N")[..12], Name = "Synthetic agreement desk" };
        foreach (var key in capabilities.Prepend(AdminCapabilities.ConsignmentView)) role.Capabilities.Add(new AdminRoleCapability { Capability = key });
        role.Assignments.Add(new AdminUserRoleAssignment { AdminUserId = adminId });
        db.AdminRoles.Add(role);
        var merchant = await db.Merchants.SingleAsync(m => m.Id == MerchantId);
        merchant.LegalBusinessName = PartnerName; merchant.BusinessRegistrationNumber = "SYN-202601000777";
        if (!await db.ConsignmentPartnerPrefixes.AnyAsync(x => x.MerchantId == MerchantId))
            db.ConsignmentPartnerPrefixes.Add(new() { MerchantId = MerchantId, Prefix = "SYNPAWS", UpdatedAt = Now, UpdatedByAdminUserId = AdminRecordId });
        await db.SaveChangesAsync();
    }

    private static ConsignmentService AgreementDesk(MyPetLinkDbContext db, DateTimeOffset? now = null)
    {
        var clock = new FixedClock(now ?? Now);
        var audit = new AuditLogService(db, new HttpContextAccessor());
        return new(db, audit, new BusinessIdentityService(db, audit, clock), new DocumentNumberService(db), clock,
            new AdminAccessResolver(db, new StubCurrentUserService(AdminAccountId)));
    }

    // Commercial terms with nothing yet signed: the state an agreement is in when it is sent to the partner.
    private static SaveConsignmentAgreementRequest UnsignedTerms(decimal rate = 35m) => new(MerchantId, null, rate,
        Now.AddDays(-1), Now.AddDays(364), "Synthetic twelve-month term, renewing only by written agreement.", "Synthetic monthly settlement",
        21, "Synthetic: partner may discount up to RM 3 with written approval.", "Synthetic: unsold tags returned within 10 business days.",
        "Synthetic: partner responsible for loss from receipt until return.", null, "SYN-TRACKER");

    private static string Text(byte[] pdf)
    {
        using var document = PdfDocument.Open(pdf);
        return string.Join("\n", document.GetPages().Select(p => p.Text));
    }
    private static string Squash(string value) => new(value.Where(c => !char.IsWhiteSpace(c)).ToArray());

    private static byte[] SyntheticSignedPdf(string marker = "1") =>
        SignedCopyFixtures.Pdf(marker);   // a genuine, parseable PDF: signed copies are opened in full before they are kept

    private static UploadConsignmentSignedAgreementRequest Signed(Guid issued, byte[]? content = null, string type = "application/pdf",
        string name = "signed.pdf", DateOnly? signedOn = null) =>
        new(issued, name, type, Convert.ToBase64String(content ?? SyntheticSignedPdf()), "Synthetic Signatory", "Director",
            signedOn ?? DateOnly.FromDateTime(Now.ToOffset(TimeSpan.FromHours(8)).DateTime), null, null, null, "Synthetic test copy");

    [Fact]
    public async Task IssuedDocumentIsGeneratedFromTheSavedAgreementAndApprovesNothing()
    {
        await using var scope = await Database(1); await using var db = scope.NewContext();
        await DocumentAccess(db, AdminRecordId, AdminCapabilities.ConsignmentAgreementsManage);
        var s = AgreementDesk(db);
        var a = await s.SaveAgreementAsync(AdminAccountId, null, UnsignedTerms(), null, default);
        Assert.Contains("Signed agreement reference", a.PendingTerms);

        var summary = await s.AgreementDocumentAsync(a.Id, default);
        Assert.Equal("ready", summary.Status); Assert.Equal("Ready for Signature", summary.StatusLabel);
        Assert.Empty(summary.MissingForDocument); Assert.True(summary.CanIssue);

        summary = await s.IssueAgreementAsync(AdminAccountId, a.Id, new(a.ConcurrencyToken), default);
        Assert.Equal("issued", summary.Status);
        var issued = Assert.Single(summary.IssuedDocuments);
        Assert.Equal(1, issued.IssueNumber); Assert.True(issued.IsCurrent);
        Assert.Equal("MyPetLink_Consignment_SYNPAWS-CONS-2026-001_v1.pdf", issued.FileName);

        var file = await s.IssuedAgreementPdfAsync(AdminAccountId, a.Id, issued.Id, default);
        var text = Squash(Text(file.Content));
        foreach (var expected in new[] { "CONSIGNMENTAGREEMENT", "ISSUEDFORSIGNATURE—NOTYETSIGNED", Squash(PartnerName), "SYN-202601000777",
            "TestSeller", "TEST-REG", "35%ofeachsale", "65%", "Synthetictwelve-monthterm,renewingonlybywrittenagreement.",
            "Syntheticmonthlysettlement", "21days", "partnermaydiscountuptoRM3withwrittenapproval.",
            "unsoldtagsreturnedwithin10businessdays.", "partnerresponsibleforlossfromreceiptuntilreturn.",
            "Forandonbehalfof", "Printedname", "Designation", Squash(summary.CurrentTermsFingerprint![..4]) })
            Assert.True(text.Contains(expected, StringComparison.Ordinal), $"Missing '{expected}' in: {text}");
        Assert.DoesNotContain("SYN-TRACKER", text);
        Assert.DoesNotContain("DRAFTPREVIEW", text);

        // Generating and downloading change nothing about the agreement's lifecycle.
        var row = await db.ConsignmentAgreements.AsNoTracking().SingleAsync(x => x.Id == a.Id);
        Assert.Equal(ConsignmentAgreementStatus.Draft, row.Status); Assert.Null(row.ApprovedAt); Assert.Null(row.ApprovedByAdminUserId);
        Assert.Null(row.SignedAgreementReference);
        Assert.DoesNotContain(await db.ConsignmentReviewEvents.AsNoTracking().ToListAsync(), e => e.AgreementId == a.Id);
        Assert.True(await db.AuditLogs.AnyAsync(e => e.Action == "consignment.agreement-document-issued"));
        Assert.True(await db.AuditLogs.AnyAsync(e => e.Action == "consignment.agreement-document-downloaded"));

        var preview = await s.PreviewAgreementAsync(AdminAccountId, a.Id, a.ConcurrencyToken, default);
        Assert.Contains("DRAFTPREVIEW—NOTFORSIGNATURE", Squash(Text(preview.Content)));
        Assert.EndsWith("_PREVIEW.pdf", preview.FileName);
        Assert.Single(db.ConsignmentAgreementDocuments);
    }

    [Theory]
    [InlineData("20.5", "20.50%", "79.50%")]
    [InlineData("40", "40%", "60%")]
    public async Task CommissionIsPrintedExactlyAsSaved(string rate, string partner, string share)
    {
        await using var scope = await Database(1); await using var db = scope.NewContext();
        await DocumentAccess(db, AdminRecordId, AdminCapabilities.ConsignmentAgreementsManage);
        var s = AgreementDesk(db);
        var a = await s.SaveAgreementAsync(AdminAccountId, null, UnsignedTerms(decimal.Parse(rate, System.Globalization.CultureInfo.InvariantCulture)), null, default);
        var preview = Squash(Text((await s.PreviewAgreementAsync(AdminAccountId, a.Id, a.ConcurrencyToken, default)).Content));
        Assert.Contains(partner + "ofeachsale", preview); Assert.Contains("MyPetLinkshare" + share, preview);
        Assert.DoesNotContain("35%", preview);
    }

    [Fact]
    public async Task MissingTermsOrPartyDetailsBlockTheDocumentWithoutInventingValues()
    {
        await using var scope = await Database(1); await using var db = scope.NewContext();
        await DocumentAccess(db, AdminRecordId, AdminCapabilities.ConsignmentAgreementsManage);
        var s = AgreementDesk(db);
        var a = await s.SaveAgreementAsync(AdminAccountId, null, UnsignedTerms() with { DurationTerms = null, PaymentDeadlineDays = null }, null, default);
        var merchant = await db.Merchants.SingleAsync(m => m.Id == MerchantId); merchant.BusinessRegistrationNumber = null; await db.SaveChangesAsync();

        var summary = await s.AgreementDocumentAsync(a.Id, default);
        Assert.Equal("incomplete", summary.Status); Assert.False(summary.CanIssue); Assert.Null(summary.CurrentTermsFingerprint);
        Assert.Equal(new[] { "Duration", "Payment deadline", "Partner business registration number" }, summary.MissingForDocument);
        var issue = await Assert.ThrowsAsync<ApiException>(() => s.IssueAgreementAsync(AdminAccountId, a.Id, new(a.ConcurrencyToken), default));
        Assert.Equal("agreement_document_incomplete", issue.Code);
        Assert.Contains("Duration", issue.Message); Assert.Contains("Partner business registration number", issue.Message);
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => s.PreviewAgreementAsync(AdminAccountId, a.Id, a.ConcurrencyToken, default))).StatusCode);

        var seller = await db.BusinessIdentitySettings.SingleAsync(); seller.BusinessRegistrationNumber = ""; await db.SaveChangesAsync();
        Assert.Contains("MyPetLink business registration number", (await s.AgreementDocumentAsync(a.Id, default)).MissingForDocument);
        Assert.Empty(db.ConsignmentAgreementDocuments);
    }

    [Fact]
    public async Task OnlyTheSavedVersionTheOperatorSawCanBePreviewedOrIssued()
    {
        await using var scope = await Database(1); await using var db = scope.NewContext();
        await DocumentAccess(db, AdminRecordId, AdminCapabilities.ConsignmentAgreementsManage);
        var s = AgreementDesk(db);
        var seen = await s.SaveAgreementAsync(AdminAccountId, null, UnsignedTerms(), null, default);
        // Someone saves different terms after the operator loaded the page.
        await s.SaveAgreementAsync(AdminAccountId, seen.Id, UnsignedTerms(30m), seen.ConcurrencyToken, default);
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => s.PreviewAgreementAsync(AdminAccountId, seen.Id, seen.ConcurrencyToken, default))).StatusCode);
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => s.IssueAgreementAsync(AdminAccountId, seen.Id, new(seen.ConcurrencyToken), default))).StatusCode);
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => s.PreviewAgreementAsync(AdminAccountId, seen.Id, null, default))).StatusCode);
        Assert.Empty(db.ConsignmentAgreementDocuments);
    }

    [Fact]
    public async Task EditingIssuedTermsSupersedesTheOldIssueWithoutChangingIt()
    {
        await using var scope = await Database(1); await using var db = scope.NewContext();
        await DocumentAccess(db, AdminRecordId, AdminCapabilities.ConsignmentAgreementsManage);
        var s = AgreementDesk(db);
        var a = await s.SaveAgreementAsync(AdminAccountId, null, UnsignedTerms(), null, default);
        var first = Assert.Single((await s.IssueAgreementAsync(AdminAccountId, a.Id, new(a.ConcurrencyToken), default)).IssuedDocuments);
        // Issuing the same saved terms again hands back the same copy.
        Assert.Single((await s.IssueAgreementAsync(AdminAccountId, a.Id, new(a.ConcurrencyToken), default)).IssuedDocuments);

        // Recording a tracker reference is not a change of terms.
        a = await s.SaveAgreementAsync(AdminAccountId, a.Id, UnsignedTerms() with { ExternalTrackerReference = "SYN-TRACKER-2" }, a.ConcurrencyToken, default);
        var summary = await s.AgreementDocumentAsync(a.Id, default);
        Assert.Equal("issued", summary.Status); Assert.Equal(first.Id, summary.CurrentIssuedDocumentId); Assert.False(summary.CanIssue);

        a = await s.SaveAgreementAsync(AdminAccountId, a.Id, UnsignedTerms() with { ExternalTrackerReference = "SYN-TRACKER-2",
            LossTerms = "Synthetic: MyPetLink bears loss in transit; partner bears loss on premises.", SettlementFrequency = "Synthetic fortnightly settlement" },
            a.ConcurrencyToken, default);
        summary = await s.AgreementDocumentAsync(a.Id, default);
        Assert.Equal("ready", summary.Status); Assert.Null(summary.CurrentIssuedDocumentId); Assert.True(summary.CanIssue);
        Assert.False(Assert.Single(summary.IssuedDocuments).IsCurrent);

        summary = await s.IssueAgreementAsync(AdminAccountId, a.Id, new(a.ConcurrencyToken), default);
        Assert.Equal(2, summary.IssuedDocuments.Count);
        var second = summary.IssuedDocuments[0];
        Assert.Equal(2, second.IssueNumber); Assert.True(second.IsCurrent); Assert.NotEqual(first.TermsFingerprint, second.TermsFingerprint);
        Assert.Equal("MyPetLink_Consignment_SYNPAWS-CONS-2026-001_v1_issue2.pdf", second.FileName);
        var oldText = Squash(Text((await s.IssuedAgreementPdfAsync(AdminAccountId, a.Id, first.Id, default)).Content));
        var newText = Squash(Text((await s.IssuedAgreementPdfAsync(AdminAccountId, a.Id, second.Id, default)).Content));
        Assert.Contains("partnerresponsibleforlossfromreceiptuntilreturn.", oldText); Assert.Contains("Syntheticmonthlysettlement", oldText);
        Assert.Contains("MyPetLinkbearslossintransit", newText); Assert.Contains("Syntheticfortnightlysettlement", newText);
        Assert.Contains("Issue2", newText);
        Assert.Equal(first.ContentSha256, (await db.ConsignmentAgreementDocuments.AsNoTracking().SingleAsync(d => d.Id == first.Id)).ContentSha256);

        var tracked = await db.ConsignmentAgreementDocuments.SingleAsync(d => d.Id == first.Id);
        tracked.FileName = "tampered.pdf";
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task SignedCopyIsLinkedToItsIssueAndValidatedByContent()
    {
        await using var scope = await Database(1); await using var db = scope.NewContext();
        await DocumentAccess(db, AdminRecordId, AdminCapabilities.ConsignmentAgreementsManage);
        var s = AgreementDesk(db);
        var a = await s.SaveAgreementAsync(AdminAccountId, null, UnsignedTerms(), null, default);
        var issued = Assert.Single((await s.IssueAgreementAsync(AdminAccountId, a.Id, new(a.ConcurrencyToken), default)).IssuedDocuments);

        var png = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3 };
        foreach (var bad in new[] {
            Signed(issued.Id, png),                                              // PNG claiming to be a PDF
            Signed(issued.Id, Encoding.ASCII.GetBytes("MZ not a document")),    // executable-looking bytes
            Signed(issued.Id, SyntheticSignedPdf(), name: "signed.png"),         // extension disagrees
            Signed(issued.Id, new byte[8 * 1024 * 1024 + 1]),                    // over the limit
            Signed(issued.Id, signedOn: DateOnly.FromDateTime(Now.AddDays(-30).DateTime)), // before it was issued
            Signed(issued.Id, signedOn: DateOnly.FromDateTime(Now.AddDays(3).DateTime)),   // in the future
            Signed(issued.Id) with { ContentBase64 = "not base64!" },
            Signed(issued.Id) with { PartnerSignatoryName = " " } })
            Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => s.UploadSignedAgreementAsync(AdminAccountId, a.Id, bad, default))).StatusCode);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => s.UploadSignedAgreementAsync(AdminAccountId, a.Id, Signed(Guid.NewGuid()), default))).StatusCode);

        var summary = await s.UploadSignedAgreementAsync(AdminAccountId, a.Id, Signed(issued.Id), default);
        Assert.Equal("signed-copy-received", summary.Status); Assert.True(summary.SignedCopyMatchesCurrentTerms);
        var copy = Assert.Single(summary.SignedCopies);
        Assert.Equal(issued.Id, copy.IssuedDocumentId); Assert.Equal(1, copy.IssueNumber); Assert.True(copy.MatchesCurrentTerms);
        Assert.Equal("Synthetic Signatory", copy.PartnerSignatoryName);
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => s.UploadSignedAgreementAsync(AdminAccountId, a.Id, Signed(issued.Id), default))).StatusCode);

        var file = await s.SignedAgreementFileAsync(AdminAccountId, a.Id, copy.Id, default);
        Assert.Equal(SyntheticSignedPdf(), file.Content); Assert.Equal("application/pdf", file.ContentType);
        Assert.Equal("MyPetLink_Consignment_SYNPAWS-CONS-2026-001_v1_issue1_SIGNED.pdf", file.FileName);
        // The uploaded copy is never confused with the generated one.
        Assert.NotEqual(issued.ContentSha256, copy.Sha256);

        // A signed copy is evidence only: approval still needs its own reference and review.
        var row = await db.ConsignmentAgreements.AsNoTracking().SingleAsync(x => x.Id == a.Id);
        Assert.Equal(ConsignmentAgreementStatus.Draft, row.Status); Assert.Null(row.SignedAgreementReference);
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() =>
            s.AgreementActionAsync(OwnerAccountId, a.Id, "approve", new(a.ConcurrencyToken, "Synthetic approval"), default))).StatusCode);
        Assert.True(await db.AuditLogs.AnyAsync(e => e.Action == "consignment.agreement-signed-copy-uploaded"));
    }

    [Fact]
    public async Task SignedTermsCanOnlyChangeThroughANewVersion()
    {
        await using var scope = await Database(1); await using var db = scope.NewContext();
        await DocumentAccess(db, AdminRecordId, AdminCapabilities.ConsignmentAgreementsManage);
        var s = AgreementDesk(db);
        var a = await s.SaveAgreementAsync(AdminAccountId, null, UnsignedTerms(), null, default);
        var stale = Assert.Single((await s.IssueAgreementAsync(AdminAccountId, a.Id, new(a.ConcurrencyToken), default)).IssuedDocuments);
        a = await s.SaveAgreementAsync(AdminAccountId, a.Id, UnsignedTerms(32m), a.ConcurrencyToken, default);
        // The partner signed the copy issued before the edit: it is not evidence for the current terms.
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => s.UploadSignedAgreementAsync(AdminAccountId, a.Id, Signed(stale.Id), default))).StatusCode);

        var current = (await s.IssueAgreementAsync(AdminAccountId, a.Id, new(a.ConcurrencyToken), default)).IssuedDocuments[0];
        await s.UploadSignedAgreementAsync(AdminAccountId, a.Id, Signed(current.Id), default);
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() =>
            s.SaveAgreementAsync(AdminAccountId, a.Id, UnsignedTerms(30m), a.ConcurrencyToken, default))).StatusCode);

        // Evidence references remain editable, so the signed copy can be recorded for approval.
        a = await s.SaveAgreementAsync(AdminAccountId, a.Id, UnsignedTerms(32m) with { SignedAgreementReference = "SYN-SIGNED-ISSUE-2" }, a.ConcurrencyToken, default);
        Assert.Empty(a.PendingTerms);
        Assert.Equal("signed-copy-received", (await s.AgreementDocumentAsync(a.Id, default)).Status);

        var revision = await s.SaveAgreementAsync(AdminAccountId, null, UnsignedTerms(30m) with { SupersedesAgreementId = a.Id }, null, default);
        Assert.Equal(2, revision.Version);
        var revisionSummary = await s.AgreementDocumentAsync(revision.Id, default);
        Assert.Equal("ready", revisionSummary.Status); Assert.Empty(revisionSummary.IssuedDocuments); Assert.Empty(revisionSummary.SignedCopies);
        Assert.Single((await s.AgreementDocumentAsync(a.Id, default)).SignedCopies);
    }

    [Fact]
    public async Task DocumentFilesNeedAgreementPermissionAndCannotBeReachedThroughAnotherAgreement()
    {
        await using var scope = await Database(1); await using var db = scope.NewContext();
        await DocumentAccess(db, AdminRecordId, AdminCapabilities.ConsignmentAgreementsManage);
        await DocumentAccess(db, CheckerAdminId);   // view only
        var s = AgreementDesk(db);
        var a = await s.SaveAgreementAsync(AdminAccountId, null, UnsignedTerms(), null, default);
        var b = await s.SaveAgreementAsync(AdminAccountId, null, UnsignedTerms(), null, default);
        var docA = Assert.Single((await s.IssueAgreementAsync(AdminAccountId, a.Id, new(a.ConcurrencyToken), default)).IssuedDocuments);
        var copyA = Assert.Single((await s.UploadSignedAgreementAsync(AdminAccountId, a.Id, Signed(docA.Id), default)).SignedCopies);

        Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => s.PreviewAgreementAsync(OwnerAccountId, a.Id, a.ConcurrencyToken, default))).StatusCode);
        Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => s.IssuedAgreementPdfAsync(OwnerAccountId, a.Id, docA.Id, default))).StatusCode);
        Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => s.SignedAgreementFileAsync(OwnerAccountId, a.Id, copyA.Id, default))).StatusCode);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => s.IssuedAgreementPdfAsync(AdminAccountId, b.Id, docA.Id, default))).StatusCode);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => s.SignedAgreementFileAsync(AdminAccountId, b.Id, copyA.Id, default))).StatusCode);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => s.UploadSignedAgreementAsync(AdminAccountId, b.Id, Signed(docA.Id, SyntheticSignedPdf("b")), default))).StatusCode);
        // The view-only reviewer still sees where the paperwork stands, without the files.
        Assert.Equal("signed-copy-received", (await s.AgreementDocumentAsync(a.Id, default)).Status);

        // An approver who does not draft agreements may still read what was signed.
        await DocumentAccess(db, CheckerAdminId, AdminCapabilities.ConsignmentAgreementsApprove);
        Assert.Equal(SyntheticSignedPdf(), (await AgreementDesk(db).SignedAgreementFileAsync(OwnerAccountId, a.Id, copyA.Id, default)).Content);
    }

    [Fact]
    public async Task LongTermsFlowOverPagesAndKeepTheSignaturesTogether()
    {
        await using var scope = await Database(1); await using var db = scope.NewContext();
        await DocumentAccess(db, AdminRecordId, AdminCapabilities.ConsignmentAgreementsManage);
        var s = AgreementDesk(db);
        static string Long(string topic) => string.Join(" ", Enumerable.Range(1, 60).Select(i => $"Synthetic {topic} clause {i} for layout testing."))[..1960];
        var a = await s.SaveAgreementAsync(AdminAccountId, null, UnsignedTerms() with { DurationTerms = Long("duration"), DiscountTerms = Long("discount"),
            ReturnTerms = Long("return"), LossTerms = Long("loss") + "\nFinal synthetic line." }, null, default);
        var issued = Assert.Single((await s.IssueAgreementAsync(AdminAccountId, a.Id, new(a.ConcurrencyToken), default)).IssuedDocuments);
        var pdf = (await s.IssuedAgreementPdfAsync(AdminAccountId, a.Id, issued.Id, default)).Content;
        using var document = PdfDocument.Open(pdf);
        var pages = document.GetPages().ToList();
        Assert.True(pages.Count >= 2, $"Expected a multi-page agreement, got {pages.Count} page(s).");
        foreach (var page in pages)
        {
            Assert.Equal(595, Math.Round(page.Width)); Assert.Equal(842, Math.Round(page.Height));   // A4
            Assert.Contains($"Page{page.Number}of{pages.Count}", Squash(page.Text));
            Assert.Contains(Squash(issued.TermsFingerprint[..4]), Squash(page.Text));
        }
        var signing = pages.Where(p => Squash(p.Text).Contains("Forandonbehalfof")).ToList();
        var signaturePage = Assert.Single(signing);
        Assert.Contains("TestSeller", Squash(signaturePage.Text)); Assert.Contains(Squash(PartnerName), Squash(signaturePage.Text));
        Assert.Equal(2, CountOf(Squash(signaturePage.Text), "Companystamp"));
        Assert.Contains("Finalsyntheticline.", Squash(string.Concat(pages.Select(p => p.Text))));
        var output = Environment.GetEnvironmentVariable("MYPETLINK_AGREEMENT_SAMPLE_PDF");
        if (!string.IsNullOrWhiteSpace(output)) await File.WriteAllBytesAsync(output, pdf);
    }

    private static int CountOf(string text, string value)
    {
        var count = 0;
        for (var i = text.IndexOf(value, StringComparison.Ordinal); i >= 0; i = text.IndexOf(value, i + value.Length, StringComparison.Ordinal)) count++;
        return count;
    }

    [Fact]
    public async Task MigratedSchemaKeepsIssuedAndSignedAgreementsAndBlocksTheirRollback()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(1); await using var db = scope.NewContext();
            await DocumentAccess(db, AdminRecordId, AdminCapabilities.ConsignmentAgreementsManage);
            var s = AgreementDesk(db);
            var a = await s.SaveAgreementAsync(AdminAccountId, null, UnsignedTerms(), null, default);
            var issued = Assert.Single((await s.IssueAgreementAsync(AdminAccountId, a.Id, new(a.ConcurrencyToken), default)).IssuedDocuments);
            await s.UploadSignedAgreementAsync(AdminAccountId, a.Id, Signed(issued.Id), default);
            foreach (var sql in new[] { "UPDATE ConsignmentAgreementDocuments SET FileName = 'x.pdf'", "DELETE FROM ConsignmentSignedAgreements" })
                Assert.Contains("51054", (await Assert.ThrowsAnyAsync<Exception>(() => db.Database.ExecuteSqlRawAsync(sql))).ToString());
            var migrator = db.GetService<Microsoft.EntityFrameworkCore.Migrations.IMigrator>();
            await ReleaseReferenceRollbackGuard(db, HardeningMigration);
            var blocked = await Assert.ThrowsAnyAsync<Exception>(() => migrator.MigrateAsync(HardeningMigration));
            Assert.Contains("51055", blocked.ToString());
            db.ChangeTracker.Clear();
            Assert.Equal([ReferencesMigration, CareCompletionIdempotencyMigration, DeliveryOrdersMigration, DocumentSignaturesMigration, SettlementsMigration, RecoveriesMigration], await db.Database.GetPendingMigrationsAsync());
            Assert.Single(db.ConsignmentSignedAgreements);
        }
        finally { MigratedSchema.Value = false; }
    }
}
