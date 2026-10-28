using System.Security.Cryptography;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.SqlClient;
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

// An administrator's own signature, and signing the Delivered By section of a Delivery Order with
// it. Every signature here is a synthetic scribble drawn in code. AdminRecordId (AdminAccountId)
// and CheckerAdminId (OwnerAccountId) are two different administrators.
public sealed partial class ConsignmentRelationalTests
{
    private static async Task SignatureAccess(MyPetLinkDbContext db, Guid adminId, params string[] capabilities)
    {
        var role = new AdminRoleDefinition { Code = "SYN-SIGN-" + Guid.NewGuid().ToString("N")[..12], Name = "Synthetic signer" };
        foreach (var key in capabilities.Prepend(AdminCapabilities.ConsignmentView)) role.Capabilities.Add(new AdminRoleCapability { Capability = key });
        role.Assignments.Add(new AdminUserRoleAssignment { AdminUserId = adminId });
        db.AdminRoles.Add(role);
        await db.SaveChangesAsync();
    }

    private static DocumentSignatureService Signatures(MyPetLinkDbContext db) =>
        new(db, new AuditLogService(db, new HttpContextAccessor()), new FixedClock(Now));

    // The real access resolver, reading the roles granted above on every request.
    private static ConsignmentService Signer(MyPetLinkDbContext db)
    {
        var clock = new FixedClock(Now);
        var audit = new AuditLogService(db, new HttpContextAccessor());
        return new(db, audit, new BusinessIdentityService(db, audit, clock), new DocumentNumberService(db), clock,
            new AdminAccessResolver(db, new StubCurrentUserService(AdminAccountId)));
    }

    private static SaveDocumentSignatureRequest Upload(Guid? current, string name = "Synthetic Signatory", string position = "Director",
        byte[]? image = null, bool keepImage = false) =>
        new(name, position, keepImage ? null : Convert.ToBase64String(image ?? SignatureTestImages.Png()), keepImage ? null : DocumentSignatureImage.Detect(image ?? SignatureTestImages.Png()), current);

    private static ConsignmentDeliveryOrderSigningRequest Sign(Guid signatureId, bool confirmed = true) => new(signatureId, confirmed);

    private sealed record PdfLayout(int Pages, string Text, IReadOnlyList<UglyToad.PdfPig.Core.PdfRectangle> Images,
        UglyToad.PdfPig.Core.PdfRectangle DeliveredBy, UglyToad.PdfPig.Core.PdfRectangle ReceivedBy);

    private static PdfLayout Layout(byte[] pdf)
    {
        using var document = PdfDocument.Open(pdf);
        var page = document.GetPages().Last();
        var words = page.GetWords().ToList();
        return new(document.NumberOfPages, string.Join(" ", document.GetPages().Select(p => p.Text)),
            document.GetPages().SelectMany(p => p.GetImages()).Select(i => i.Bounds).ToList(),
            Lowest(words, "DELIVERED"), Lowest(words, "RECEIVED"));
        // The signature block headings are the last of these words on the page.
        static UglyToad.PdfPig.Core.PdfRectangle Lowest(List<UglyToad.PdfPig.Content.Word> words, string text) =>
            words.Where(w => w.Text == text).OrderBy(w => w.BoundingBox.Bottom).First().BoundingBox;
    }

    [Fact]
    public async Task OwnSignatureIsKeptPrivatelyReplacedAndRemovedWithItsHistory()
    {
        await using var scope = await Database(1); await using var db = scope.NewContext();
        var mine = Signatures(db);

        var saved = (await mine.SaveOwnAsync(AdminAccountId, Upload(null), default)).Signature!;
        Assert.Equal(("Synthetic Signatory", "Director"), (saved.SignatoryName, saved.SignatoryPosition));
        var stored = await db.DocumentSignatures.AsNoTracking().SingleAsync();
        Assert.Equal(AdminRecordId, stored.SignatoryAdminUserId);
        Assert.Equal(Convert.ToHexString(SHA256.HashData(stored.Image!)), stored.ImageSha256);
        Assert.Equal(stored.Image, await mine.OwnImageAsync(AdminAccountId, default));
        // Whitespace is tidied; nothing is invented.
        Assert.Equal("Synthetic  Director".Replace("  ", " "), (await mine.SaveOwnAsync(AdminAccountId,
            Upload(saved.Id, "  Synthetic   Signatory ", " Synthetic  Director ", keepImage: true), default)).Signature!.SignatoryPosition);

        // Another administrator sees no signature and cannot reach this one.
        Assert.Null((await mine.GetOwnAsync(OwnerAccountId, default)).Signature);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => mine.OwnImageAsync(OwnerAccountId, default))).StatusCode);

        var current = (await mine.GetOwnAsync(AdminAccountId, default)).Signature!;
        Assert.NotEqual(saved.Id, current.Id);
        // A change made from a stale page never overwrites the current signature.
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => mine.SaveOwnAsync(AdminAccountId, Upload(saved.Id), default))).StatusCode);
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => mine.SaveOwnAsync(AdminAccountId, Upload(null), default))).StatusCode);
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => mine.RemoveOwnAsync(AdminAccountId, new(saved.Id), default))).StatusCode);
        // Saving unchanged details keeps the same version.
        Assert.Equal(current.Id, (await mine.SaveOwnAsync(AdminAccountId,
            Upload(current.Id, current.SignatoryName, current.SignatoryPosition, keepImage: true), default)).Signature!.Id);
        // Name and position are required and bounded; the first upload needs an image.
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => mine.SaveOwnAsync(AdminAccountId, Upload(current.Id, " "), default))).StatusCode);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => mine.SaveOwnAsync(AdminAccountId, Upload(current.Id, position: new string('x', 121)), default))).StatusCode);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => mine.SaveOwnAsync(OwnerAccountId, Upload(null, keepImage: true), default))).StatusCode);

        var replaced = (await mine.SaveOwnAsync(AdminAccountId, Upload(current.Id, image: SignatureTestImages.Jpeg()), default)).Signature!;
        Assert.Null((await mine.RemoveOwnAsync(AdminAccountId, new(replaced.Id), default)).Signature);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => mine.OwnImageAsync(AdminAccountId, default))).StatusCode);

        // Every version is kept, ended once, with its image erased.
        var history = await db.DocumentSignatures.AsNoTracking().OrderBy(s => s.CreatedAt).ThenBy(s => s.EndedAt).ToListAsync();
        Assert.Equal(3, history.Count);
        Assert.All(history, s => { Assert.Null(s.Image); Assert.NotNull(s.EndedAt); Assert.Equal(AdminRecordId, s.EndedByAdminUserId); });
        // The first two versions share one image (only the wording changed); the removed one had a new image.
        var removed = Assert.Single(history, s => s.EndReason == DocumentSignatureEndReason.Removed);
        var replacedVersions = history.Where(s => s.EndReason == DocumentSignatureEndReason.Replaced).ToList();
        Assert.Equal(2, replacedVersions.Count);
        Assert.Equal(replacedVersions[0].ImageSha256, replacedVersions[1].ImageSha256);
        Assert.NotEqual(replacedVersions[0].ImageSha256, removed.ImageSha256);

        var audits = await db.AuditLogs.AsNoTracking().Where(a => a.Entity == nameof(DocumentSignature)).OrderBy(a => a.CreatedAt).ToListAsync();
        Assert.Equal(["document-signature.saved", "document-signature.saved", "document-signature.saved", "document-signature.removed"],
            audits.Select(a => a.Action).OrderBy(a => a == "document-signature.removed"));
        Assert.All(audits, a => Assert.Equal(AdminRecordId, a.ActorId));
        // The audit trail names the change, never the image itself.
        Assert.All(audits, a => Assert.DoesNotContain("iVBOR", (a.OldValue ?? "") + a.NewValue));

        // The context refuses to edit or delete a saved version.
        var row = await db.DocumentSignatures.FirstAsync();
        row.SignatoryName = "Changed";
        Assert.Throws<InvalidOperationException>(() => db.SaveChanges());
        db.ChangeTracker.Clear();
        db.DocumentSignatures.Remove(await db.DocumentSignatures.FirstAsync());
        Assert.Throws<InvalidOperationException>(() => db.SaveChanges());
    }

    [Fact]
    public async Task SignedDeliveryOrderCarriesOnlyTheIssuersOwnSignatureInDeliveredBy()
    {
        await using var scope = await Database(); await using var db = scope.NewContext();
        await SignatureAccess(db, AdminRecordId, AdminCapabilities.ConsignmentDispatch, AdminCapabilities.DocumentSignatureManage);
        var signature = (await Signatures(db).SaveOwnAsync(AdminAccountId, Upload(null, "Synthetic Signatory", "Director"), default)).Signature!;
        var a = await Agreement(db);
        var unsigned = await Dispatched(db, a.Id, 2, "do-unsigned-compare");
        var d = await Dispatched(db, a.Id, 3, "do-signed");
        var before = await Footprint(db, d.Id);

        var issued = await Signer(db).IssueDeliveryOrderAsync(AdminAccountId, d.Id, Sign(signature.Id), default);
        Assert.Equal(("Synthetic Signatory", "Director", (DateTimeOffset?)Now), (issued.SignatoryName, issued.SignatoryPosition, issued.SignedAt));
        Assert.Equal(before, await Footprint(db, d.Id));
        Assert.Equal(1, await DeliveryOrderCounter(db));

        var row = await db.ConsignmentDeliveryOrders.AsNoTracking().SingleAsync(x => x.DispatchId == d.Id);
        Assert.Equal((signature.Id, (Guid?)AdminRecordId, row.IssuedAt), (row.SignatureId!.Value, row.SignedByAdminUserId, row.SignedAt!.Value));
        var stored = await db.DocumentSignatures.AsNoTracking().SingleAsync();
        Assert.Equal(stored.ImageSha256, row.SignatureImageSha256);
        var snapshot = await StoredSnapshot(db, d.Id);
        Assert.Equal(new ConsignmentService.DeliveryOrderSigning(signature.Id, "Synthetic Signatory", "Director", Now, stored.ImageSha256), snapshot.Signature);
        // The stored snapshot never carries the image itself.
        Assert.DoesNotContain("iVBOR", row.SnapshotJson);

        var signed = Layout(row.Content);
        Assert.Equal(1, signed.Pages);
        Assert.Contains("Signed electronically by the authorised signatory at issue", signed.Text);
        Assert.Contains("Synthetic Signatory, Director", signed.Text);
        Assert.Contains("MyPetLink has signed Delivered By; the partner signs Received By", signed.Text);
        // Exactly one image more than an unsigned copy: the signature, inside Delivered By and never in Received By.
        await Signer(db).IssueDeliveryOrderAsync(AdminAccountId, unsigned.Id, null, default);
        var plain = Layout(await db.ConsignmentDeliveryOrders.AsNoTracking().Where(x => x.DispatchId == unsigned.Id).Select(x => x.Content).SingleAsync());
        Assert.Equal(plain.Images.Count + 1, signed.Images.Count);
        Assert.DoesNotContain("Signed electronically", plain.Text);
        var image = Assert.Single(signed.Images, i => i.Top < signed.DeliveredBy.Bottom);
        Assert.True(image.Left >= signed.DeliveredBy.Left - 12 && image.Right < signed.ReceivedBy.Left,
            $"The signature must sit inside Delivered By, left of Received By ({image}).");
        Assert.True(image.Top > signed.DeliveredBy.Bottom - 80, $"The signature must sit on Delivered By's signature line ({image}).");

        var applied = await db.AuditLogs.AsNoTracking().SingleAsync(x => x.Action == "document-signature.applied");
        Assert.Equal((signature.Id, (Guid?)AdminRecordId), (applied.EntityId!.Value, applied.ActorId));
        Assert.Contains(issued.DeliveryOrderNumber, applied.NewValue);
        var issueAudit = await db.AuditLogs.AsNoTracking().Where(x => x.Action == "consignment.delivery-order-issued" && x.EntityId == d.Id).SingleAsync();
        Assert.Contains("\"signed\":true", issueAudit.NewValue!.Replace(" ", ""));
        Assert.Contains(stored.ImageSha256, issueAudit.NewValue);
    }

    [Fact]
    public async Task SigningNeedsConfirmationPermissionAndYourOwnCurrentSignatureAndTakesNoNumberWhenRefused()
    {
        await using var scope = await Database(); await using var db = scope.NewContext();
        await SignatureAccess(db, AdminRecordId, AdminCapabilities.ConsignmentDispatch, AdminCapabilities.DocumentSignatureManage);
        await SignatureAccess(db, CheckerAdminId, AdminCapabilities.ConsignmentDispatch, AdminCapabilities.DocumentSignatureManage);
        var mine = (await Signatures(db).SaveOwnAsync(AdminAccountId, Upload(null), default)).Signature!;
        var theirs = (await Signatures(db).SaveOwnAsync(OwnerAccountId, Upload(null, "Synthetic Checker", "Manager"), default)).Signature!;
        var a = await Agreement(db);
        var d = await Dispatched(db, a.Id, 2, "do-refused");
        var before = await Footprint(db, d.Id);
        async Task<ApiException> Refused(Guid? actor, ConsignmentDeliveryOrderSigningRequest r) =>
            await Assert.ThrowsAsync<ApiException>(() => Signer(db).IssueDeliveryOrderAsync(actor, d.Id, r, default));

        // Naming a signature without confirming is not consent to sign.
        var unconfirmed = await Refused(AdminAccountId, Sign(mine.Id, confirmed: false));
        Assert.Equal((400, "signature_not_confirmed"), (unconfirmed.StatusCode, unconfirmed.Code));
        // Another administrator's signature is never applied, confirmed or not, and looks the same as one that doesn't exist.
        var foreign = await Refused(AdminAccountId, Sign(theirs.Id));
        Assert.Equal((403, "signature_not_yours"), (foreign.StatusCode, foreign.Code));
        Assert.Equal((403, "signature_not_yours"), ((await Refused(OwnerAccountId, Sign(mine.Id))).StatusCode, (await Refused(OwnerAccountId, Sign(mine.Id))).Code));
        Assert.Equal((403, "signature_not_yours"), ((await Refused(AdminAccountId, Sign(Guid.NewGuid()))).StatusCode, (await Refused(AdminAccountId, Sign(Guid.NewGuid()))).Code));
        // A retired version can't be applied.
        var renamed = (await Signatures(db).SaveOwnAsync(AdminAccountId, Upload(mine.Id, "Synthetic Signatory", "Managing Director", keepImage: true), default)).Signature!;
        Assert.Equal((409, "signature_changed"), ((await Refused(AdminAccountId, Sign(mine.Id))).StatusCode, (await Refused(AdminAccountId, Sign(mine.Id))).Code));
        // Losing the signing capability stops signing straight away, even with your own signature.
        db.AdminUserRoles.RemoveRange(db.AdminUserRoles.Where(x => x.AdminUserId == AdminRecordId));
        await db.SaveChangesAsync();
        await SignatureAccess(db, AdminRecordId, AdminCapabilities.ConsignmentDispatch);
        var withoutPermission = await Refused(AdminAccountId, Sign(renamed.Id));
        Assert.Equal((403, "forbidden"), (withoutPermission.StatusCode, withoutPermission.Code));

        // None of that issued anything or used a number, and the next request still gets the first one.
        Assert.False(await db.ConsignmentDeliveryOrders.AnyAsync());
        Assert.Equal(0, await DeliveryOrderCounter(db));
        Assert.Empty(db.AuditLogs.Where(x => x.Action == "document-signature.applied"));
        Assert.Equal(before, await Footprint(db, d.Id));

        // Unsigned generation works exactly as before, and the copy stays unsigned.
        var issued = await Signer(db).IssueDeliveryOrderAsync(AdminAccountId, d.Id, new(null, true), default);
        Assert.EndsWith("-0001", issued.DeliveryOrderNumber);
        Assert.Null(issued.SignatoryName);
        var row = await db.ConsignmentDeliveryOrders.AsNoTracking().SingleAsync();
        Assert.Equal((null, null, null), (row.SignatureId, row.SignedByAdminUserId, row.SignedAt));
        Assert.Null((await StoredSnapshot(db, d.Id)).Signature);
    }

    [Fact]
    public async Task AnIssuedDeliveryOrderNeverChangesWhenTheSignatureIsLaterReplacedOrRemoved()
    {
        await using var scope = await Database(); await using var db = scope.NewContext();
        await SignatureAccess(db, AdminRecordId, AdminCapabilities.ConsignmentDispatch, AdminCapabilities.DocumentSignatureManage, AdminCapabilities.ConsignmentManifestExport);
        var signatures = Signatures(db);
        var signature = (await signatures.SaveOwnAsync(AdminAccountId, Upload(null), default)).Signature!;
        var a = await Agreement(db);
        var d = await Dispatched(db, a.Id, 2, "do-frozen");
        var issued = await Signer(db).IssueDeliveryOrderAsync(AdminAccountId, d.Id, Sign(signature.Id), default);
        var frozen = await db.ConsignmentDeliveryOrders.AsNoTracking().SingleAsync();

        // Repeating the same signed request returns the same copy; a different request changes nothing.
        Assert.Equal(issued, await Signer(db).IssueDeliveryOrderAsync(AdminAccountId, d.Id, Sign(signature.Id), default));
        var unsignedAgain = await Assert.ThrowsAsync<ApiException>(() => Signer(db).IssueDeliveryOrderAsync(AdminAccountId, d.Id, null, default));
        Assert.Equal((409, "consignment_delivery_order_already_issued"), (unsignedAgain.StatusCode, unsignedAgain.Code));
        Assert.Contains("with a signature", unsignedAgain.Message);
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() =>
            Signer(db).PreviewDeliveryOrderAsync(AdminAccountId, d.Id, null, default))).StatusCode);

        var replaced = (await signatures.SaveOwnAsync(AdminAccountId, Upload(signature.Id, "Someone Else Entirely", "Clerk", SignatureTestImages.Jpeg()), default)).Signature!;
        await signatures.RemoveOwnAsync(AdminAccountId, new(replaced.Id), default);

        var after = await db.ConsignmentDeliveryOrders.AsNoTracking().SingleAsync();
        Assert.Equal(frozen.Content, after.Content);
        Assert.Equal((frozen.ContentSha256, frozen.SnapshotJson, frozen.SignatoryName, frozen.SignatoryPosition, frozen.SignatureImageSha256),
            (after.ContentSha256, after.SnapshotJson, after.SignatoryName, after.SignatoryPosition, after.SignatureImageSha256));
        Assert.Equal(Convert.ToHexString(SHA256.HashData(after.Content)), after.ContentSha256);
        var documents = new ConsignmentDocumentService(db, Signer(db), new AuditLogService(db, new HttpContextAccessor()));
        Assert.Equal(frozen.Content, (await documents.DeliveryOrderPdfAsync(AdminAccountId, d.Id, default)).Content);
        Assert.Contains("Synthetic Signatory, Director", Layout(after.Content).Text);
        Assert.Equal(1, await DeliveryOrderCounter(db));
    }

    [Fact]
    public async Task PreviewIsWatermarkedTakesNoNumberAndShowsOnlyYourOwnSignature()
    {
        await using var scope = await Database(); await using var db = scope.NewContext();
        await SignatureAccess(db, AdminRecordId, AdminCapabilities.ConsignmentDispatch, AdminCapabilities.DocumentSignatureManage);
        await SignatureAccess(db, CheckerAdminId, AdminCapabilities.ConsignmentDispatch, AdminCapabilities.DocumentSignatureManage);
        var mine = (await Signatures(db).SaveOwnAsync(AdminAccountId, Upload(null), default)).Signature!;
        var a = await Agreement(db);
        var d = await Dispatched(db, a.Id, 2, "do-preview");
        var before = await Footprint(db, d.Id);

        var plain = await Signer(db).PreviewDeliveryOrderAsync(AdminAccountId, d.Id, null, default);
        var signedPreview = await Signer(db).PreviewDeliveryOrderAsync(AdminAccountId, d.Id, mine.Id, default);
        Assert.StartsWith("MyPetLink_Delivery_Order_PREVIEW_", plain.FileName);
        var plainText = Layout(plain.Content).Text; var signedText = Layout(signedPreview.Content);
        // The watermark is drawn at an angle, so its extracted words run together.
        Assert.Contains("PREVIEW-NOTISSUED", plainText.Replace(" ", ""));
        Assert.Contains("Not issued (preview)", plainText);
        Assert.Contains("Preview only. Not a Delivery Order", plainText);
        Assert.DoesNotContain("MPL-DO-", plainText);
        Assert.Contains("Synthetic Signatory, Director", signedText.Text);
        Assert.Equal(Layout(plain.Content).Images.Count + 1, signedText.Images.Count);

        // Someone else's signature is refused in a preview too.
        Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() =>
            Signer(db).PreviewDeliveryOrderAsync(OwnerAccountId, d.Id, mine.Id, default))).StatusCode);

        Assert.False(await db.ConsignmentDeliveryOrders.AnyAsync());
        Assert.Equal(0, await DeliveryOrderCounter(db));
        Assert.Equal(before, await Footprint(db, d.Id));
        var previewed = await db.AuditLogs.AsNoTracking().SingleAsync(x => x.Action == "document-signature.previewed");
        Assert.Equal((mine.Id, (Guid?)AdminRecordId), (previewed.EntityId!.Value, previewed.ActorId));
    }

    [Fact]
    public async Task AgreementDocumentsAreNeverSignedWithASignatureOnFile()
    {
        await using var scope = await Database(1); await using var db = scope.NewContext();
        await DocumentAccess(db, AdminRecordId, AdminCapabilities.ConsignmentAgreementsManage, AdminCapabilities.DocumentSignatureManage);
        await Signatures(db).SaveOwnAsync(AdminAccountId, Upload(null), default);
        var s = AgreementDesk(db);
        var agreement = await s.SaveAgreementAsync(AdminAccountId, null, UnsignedTerms(), null, default);
        var summary = await s.IssueAgreementAsync(AdminAccountId, agreement.Id, new(agreement.ConcurrencyToken), default);
        var content = await db.ConsignmentAgreementDocuments.AsNoTracking().Where(x => x.Id == summary.IssuedDocuments[0].Id).Select(x => x.Content).SingleAsync();
        using var pdf = PdfDocument.Open(content);
        // Only the brand logo is drawn: the agreement's signature blocks stay blank for wet or separate signing.
        var signatureSize = await db.DocumentSignatures.AsNoTracking().Select(x => new { x.ImageWidth, x.ImageHeight }).SingleAsync();
        Assert.All(pdf.GetPages().SelectMany(p => p.GetImages()), image =>
            Assert.NotEqual((signatureSize.ImageWidth, signatureSize.ImageHeight), (image.WidthInSamples, image.HeightInSamples)));
        Assert.DoesNotContain("Signed electronically", string.Join(" ", pdf.GetPages().Select(p => p.Text)));
        Assert.Contains("ISSUED FOR SIGNATURE", string.Join(" ", pdf.GetPages().Select(p => p.Text)));
    }

    [Fact]
    public async Task MigratedSchemaRefusesEditsToSignaturesAndSignedDeliveryOrders()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(); await using var db = scope.NewContext();
            await SignatureAccess(db, AdminRecordId, AdminCapabilities.ConsignmentDispatch, AdminCapabilities.DocumentSignatureManage);
            var signatures = Signatures(db);
            var first = (await signatures.SaveOwnAsync(AdminAccountId, Upload(null), default)).Signature!;
            var a = await Agreement(db);
            var d = await Dispatched(db, a.Id, 2, "do-migrated-signed");
            await Signer(db).IssueDeliveryOrderAsync(AdminAccountId, d.Id, Sign(first.Id), default);
            var current = (await signatures.SaveOwnAsync(AdminAccountId, Upload(first.Id, "Synthetic Signatory", "Partner", keepImage: true), default)).Signature!;

            async Task<int> SqlError(string sql) =>
                (await Assert.ThrowsAsync<SqlException>(() => db.Database.ExecuteSqlRawAsync(sql))).Number;
            // A retired version can't be edited, revived or deleted; the current one can't be edited in place.
            Assert.Equal(51061, await SqlError($"UPDATE DocumentSignatures SET SignatoryName = N'Forged' WHERE Id = '{first.Id}'"));
            // Reviving a retired version next to the current one breaks the one-on-file rule before the trigger runs.
            Assert.Equal(2601, await SqlError($"UPDATE DocumentSignatures SET EndedAt = NULL, EndReason = NULL, EndedByAdminUserId = NULL WHERE Id = '{first.Id}'"));
            // The version a Delivery Order was signed with is also held by that document's reference to it.
            Assert.Equal(547, await SqlError($"DELETE FROM DocumentSignatures WHERE Id = '{first.Id}'"));
            Assert.Equal(51061, await SqlError($"DELETE FROM DocumentSignatures WHERE Id = '{current.Id}'"));
            Assert.Equal(51061, await SqlError($"UPDATE DocumentSignatures SET SignatoryPosition = N'Forged' WHERE Id = '{current.Id}'"));
            Assert.Equal(51061, await SqlError($"UPDATE DocumentSignatures SET Image = 0x89504E47 WHERE Id = '{current.Id}'"));
            // Retiring without erasing the image breaks the lifecycle rule.
            Assert.Equal(547, await SqlError($"UPDATE DocumentSignatures SET EndedAt = SYSDATETIMEOFFSET(), EndReason = 'Removed', EndedByAdminUserId = '{AdminRecordId}' WHERE Id = '{current.Id}'"));
            // At most one signature on file per administrator.
            Assert.Equal(2601, await SqlError($"INSERT INTO DocumentSignatures (Id, SignatoryAdminUserId, SignatoryName, SignatoryPosition, Image, ImageSha256, ImageWidth, ImageHeight, CreatedAt) "
                + $"VALUES (NEWID(), '{AdminRecordId}', N'Second', N'Second', 0x01, REPLICATE('A', 64), 1, 1, SYSDATETIMEOFFSET())"));
            // The signed Delivery Order is as append-only as any other.
            Assert.Equal(51059, await SqlError($"UPDATE ConsignmentDeliveryOrders SET SignatoryName = N'Forged' WHERE DispatchId = '{d.Id}'"));

            // Retiring through the service still works under the trigger.
            Assert.Null((await signatures.RemoveOwnAsync(AdminAccountId, new(current.Id), default)).Signature);
            Assert.Equal(2, await db.DocumentSignatures.CountAsync(s => s.Image == null));
        }
        finally { MigratedSchema.Value = false; }
    }

    [Fact]
    public async Task SignatureMigrationRollsBackAndReappliesUntilASignatureIsSavedThenRefuses()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(); await using var db = scope.NewContext();
            var migrator = db.GetService<Microsoft.EntityFrameworkCore.Migrations.IMigrator>();
            async Task<string[]> Rules() => (await db.Database.SqlQueryRaw<string>(
                "SELECT name AS Value FROM sys.check_constraints WHERE is_not_trusted = 0 AND is_disabled = 0 AND name IN "
                + "('CK_ConsignmentDeliveryOrder_Signature','CK_DocumentSignature_Lifecycle','CK_DocumentSignature_Image','CK_DocumentSignature_Signatory')")
                .ToListAsync()).Order().ToArray();
            string[] all = ["CK_ConsignmentDeliveryOrder_Signature", "CK_DocumentSignature_Image", "CK_DocumentSignature_Lifecycle", "CK_DocumentSignature_Signatory"];
            Assert.Equal(all, await Rules());

            // Before anyone saves a signature, the step rolls back cleanly and applies again.
            await migrator.MigrateAsync(DeliveryOrdersMigration);
            Assert.Equal([DocumentSignaturesMigration, SettlementsMigration, RecoveriesMigration, SignatureOwnershipMigration], await db.Database.GetPendingMigrationsAsync());
            Assert.Empty(await Rules());
            await db.Database.MigrateAsync();
            Assert.Empty(await db.Database.GetPendingMigrationsAsync());
            Assert.Equal(all, await Rules());

            // Once one is saved, even if later removed, rolling back is refused and nothing changes.
            await SignatureAccess(db, AdminRecordId, AdminCapabilities.DocumentSignatureManage);
            var signatures = Signatures(db);
            var saved = (await signatures.SaveOwnAsync(AdminAccountId, Upload(null), default)).Signature!;
            await signatures.RemoveOwnAsync(AdminAccountId, new(saved.Id), default);
            // The newest step, the ownership rule, refuses first (51066), so no step rolls back at all
            // and the signature step's own guard (51062) is never left as the only protection.
            Assert.Contains("51066", (await Assert.ThrowsAnyAsync<Exception>(() => migrator.MigrateAsync(DeliveryOrdersMigration))).ToString());
            db.ChangeTracker.Clear();
            Assert.Empty(await db.Database.GetPendingMigrationsAsync());
            Assert.Equal(all, await Rules());
            Assert.True(await OwnershipRuleTrusted(db));
            Assert.Equal(1, await db.DocumentSignatures.CountAsync());
        }
        finally { MigratedSchema.Value = false; }
    }

    // Written straight to SQL Server, bypassing EF and the API: a NULL must never satisfy a rule
    // by making it unknown rather than false.
    [Fact]
    public async Task MigratedSchemaRefusesIncompleteSigningOrRetirementWrittenDirectly()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(); await using var db = scope.NewContext();
            await SignatureAccess(db, AdminRecordId, AdminCapabilities.ConsignmentDispatch, AdminCapabilities.DocumentSignatureManage);
            var signatures = Signatures(db);
            var signature = (await signatures.SaveOwnAsync(AdminAccountId, Upload(null), default)).Signature!;
            var a = await Agreement(db);
            var signed = await Dispatched(db, a.Id, 2, "do-sql-signed");
            var target = await Dispatched(db, a.Id, 1, "do-sql-target");
            var other = await Dispatched(db, a.Id, 1, "do-sql-other");
            await Signer(db).IssueDeliveryOrderAsync(AdminAccountId, signed.Id, Sign(signature.Id), default);

            const string valid = "SignatureId, SignedByAdminUserId, SignedAt, SignatoryName, SignatoryPosition, SignatureImageSha256";
            const string unsigned = "NULL, NULL, NULL, NULL, NULL, NULL";
            // A copy of the signed Delivery Order for another delivery, with its signing columns replaced.
            string Insert(Guid dispatch, string number, string signing) =>
                "INSERT INTO ConsignmentDeliveryOrders (Id, DispatchId, MerchantId, DeliveryOrderNumber, DeliveredQuantity, SnapshotJson, Content, "
                + "ContentSha256, FileName, IssuedAt, IssuedByAdminUserId, SignatureId, SignedByAdminUserId, SignedAt, SignatoryName, SignatoryPosition, "
                + $"SignatureImageSha256) SELECT NEWID(), '{dispatch}', MerchantId, N'{number}', DeliveredQuantity, SnapshotJson, Content, ContentSha256, "
                + $"FileName, IssuedAt, IssuedByAdminUserId, {signing} FROM ConsignmentDeliveryOrders WHERE DispatchId = '{signed.Id}'";
            // Each attempt runs in its own rolled-back transaction, so every one is tried and every one wrongly accepted is listed.
            var accepted = new List<string>();
            async Task Refused(string sql, string constraint, string? label = null)
            {
                await using var attempt = await db.Database.BeginTransactionAsync();
                try { await db.Database.ExecuteSqlRawAsync(sql); accepted.Add(label ?? sql); }
                catch (SqlException error) { Assert.Equal(547, error.Number); Assert.Contains(constraint, error.Message); }
                finally { await attempt.RollbackAsync(); }
            }
            const string doRule = "CK_ConsignmentDeliveryOrder_Signature";
            foreach (var signing in new[]
            {
                // Marked signed, but missing who signed, when, or both.
                "SignatureId, NULL, SignedAt, SignatoryName, SignatoryPosition, SignatureImageSha256",
                "SignatureId, SignedByAdminUserId, NULL, SignatoryName, SignatoryPosition, SignatureImageSha256",
                "SignatureId, NULL, NULL, SignatoryName, SignatoryPosition, SignatureImageSha256",
                // Missing or blank printed details, or a fingerprint that isn't one.
                "SignatureId, SignedByAdminUserId, SignedAt, NULL, SignatoryPosition, SignatureImageSha256",
                "SignatureId, SignedByAdminUserId, SignedAt, SignatoryName, NULL, SignatureImageSha256",
                "SignatureId, SignedByAdminUserId, SignedAt, SignatoryName, SignatoryPosition, NULL",
                "SignatureId, SignedByAdminUserId, SignedAt, N'   ', SignatoryPosition, SignatureImageSha256",
                "SignatureId, SignedByAdminUserId, SignedAt, SignatoryName, CHAR(9) + CHAR(13) + CHAR(10), SignatureImageSha256",
                "SignatureId, SignedByAdminUserId, SignedAt, SignatoryName, SignatoryPosition, LEFT(SignatureImageSha256, 63)",
                "SignatureId, SignedByAdminUserId, SignedAt, SignatoryName, SignatoryPosition, REPLICATE('Z', 64)",
                // Signed by someone other than the issuer, or at another time.
                $"SignatureId, '{CheckerAdminId}', SignedAt, SignatoryName, SignatoryPosition, SignatureImageSha256",
                "SignatureId, SignedByAdminUserId, DATEADD(SECOND, 1, SignedAt), SignatoryName, SignatoryPosition, SignatureImageSha256",
                // Not signed, yet carrying part of a signing.
                "NULL, SignedByAdminUserId, NULL, NULL, NULL, NULL",
                "NULL, NULL, SignedAt, NULL, NULL, NULL",
                "NULL, NULL, NULL, SignatoryName, NULL, NULL",
                "NULL, SignedByAdminUserId, SignedAt, SignatoryName, SignatoryPosition, SignatureImageSha256",
            })
                await Refused(Insert(target.Id, "MPL-DO-SQL-PROBE", signing), doRule, signing);
            Assert.True(accepted.Count == 0, "Accepted: " + string.Join(" | ", accepted));
            Assert.False(await db.ConsignmentDeliveryOrders.AnyAsync(o => o.DispatchId == target.Id));

            // Complete states are still accepted: unsigned, and signed in full by the issuer.
            await db.Database.ExecuteSqlRawAsync(Insert(target.Id, "MPL-DO-SQL-UNSIGNED", unsigned));
            await db.Database.ExecuteSqlRawAsync(Insert(other.Id, "MPL-DO-SQL-SIGNED", valid));
            Assert.Equal(2, await db.ConsignmentDeliveryOrders.CountAsync(o => o.SignatureId == signature.Id));
            // And once written, neither can be signed, unsigned or re-signed.
            Assert.Equal(51059, (await Assert.ThrowsAsync<SqlException>(() => db.Database.ExecuteSqlRawAsync(
                $"UPDATE o SET SignatureId = s.SignatureId, SignedByAdminUserId = s.SignedByAdminUserId, SignedAt = s.SignedAt, SignatoryName = s.SignatoryName, "
                + $"SignatoryPosition = s.SignatoryPosition, SignatureImageSha256 = s.SignatureImageSha256 FROM ConsignmentDeliveryOrders o "
                + $"CROSS JOIN ConsignmentDeliveryOrders s WHERE o.DispatchId = '{target.Id}' AND s.DispatchId = '{signed.Id}'"))).Number);
            Assert.Equal(51059, (await Assert.ThrowsAsync<SqlException>(() => db.Database.ExecuteSqlRawAsync(
                $"UPDATE ConsignmentDeliveryOrders SET SignatureId = NULL, SignedByAdminUserId = NULL, SignedAt = NULL, SignatoryName = NULL, "
                + $"SignatoryPosition = NULL, SignatureImageSha256 = NULL WHERE DispatchId = '{other.Id}'"))).Number);

            // A retired version always says why it ended: exactly Replaced or Removed.
            const string signatureRule = "CK_DocumentSignature_Lifecycle";
            string Retired(string reason) =>
                "INSERT INTO DocumentSignatures (Id, SignatoryAdminUserId, SignatoryName, SignatoryPosition, Image, ImageSha256, ImageWidth, ImageHeight, "
                + $"CreatedAt, EndedAt, EndReason, EndedByAdminUserId) VALUES (NEWID(), '{AdminRecordId}', N'Synthetic Signatory', N'Director', NULL, "
                + $"REPLICATE('A', 64), 300, 100, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET(), {reason}, '{AdminRecordId}')";
            foreach (var reason in new[] { "NULL", "N''", "N'   '", "N'Replaced '", "N' Removed'", "N'removed'", "N'Expired'" })
                await Refused(Retired(reason), signatureRule, "retired: " + reason);
            await Refused($"UPDATE DocumentSignatures SET EndedAt = SYSDATETIMEOFFSET(), EndReason = NULL, EndedByAdminUserId = '{AdminRecordId}', Image = NULL "
                + $"WHERE Id = '{signature.Id}'", signatureRule, "retire with no reason");
            await Refused($"UPDATE DocumentSignatures SET EndedAt = SYSDATETIMEOFFSET(), EndReason = N'Removed', EndedByAdminUserId = NULL, Image = NULL "
                + $"WHERE Id = '{signature.Id}'", signatureRule, "retire by no one");
            // A version on file is complete too: an image, its details and no ending.
            string Active(string name, string reason) =>
                "INSERT INTO DocumentSignatures (Id, SignatoryAdminUserId, SignatoryName, SignatoryPosition, Image, ImageSha256, ImageWidth, ImageHeight, "
                + $"CreatedAt, EndReason) VALUES (NEWID(), '{CheckerAdminId}', {name}, N'Director', 0x01, REPLICATE('A', 64), 1, 1, SYSDATETIMEOFFSET(), {reason})";
            await Refused(Active("N'  '", "NULL"), "CK_DocumentSignature_Signatory", "active: blank name");
            await Refused(Active("NCHAR(160) + CHAR(9)", "NULL"), "CK_DocumentSignature_Signatory", "active: whitespace name");
            await Refused(Active("N'Synthetic Checker'", "NULL").Replace("REPLICATE('A', 64)", "REPLICATE('G', 64)"), "CK_DocumentSignature_Image", "active: not a fingerprint");
            await Refused(Active("N'Synthetic Checker'", "N'Removed'"), signatureRule, "active: with a reason");
            Assert.True(accepted.Count == 0, "Accepted: " + string.Join(" | ", accepted));
            Assert.Equal(1, await db.DocumentSignatures.CountAsync());

            // Both reasons, and a version on file, are accepted when written in full.
            await db.Database.ExecuteSqlRawAsync(Retired("N'Replaced'"));
            await db.Database.ExecuteSqlRawAsync(Retired("N'Removed'"));
            await db.Database.ExecuteSqlRawAsync(Active("N'Synthetic Checker'", "NULL"));
            await db.Database.ExecuteSqlRawAsync($"UPDATE DocumentSignatures SET EndedAt = SYSDATETIMEOFFSET(), EndReason = N'Removed', "
                + $"EndedByAdminUserId = '{AdminRecordId}', Image = NULL WHERE Id = '{signature.Id}'");
            Assert.Equal(new[] { DocumentSignatureEndReason.Replaced, DocumentSignatureEndReason.Removed, DocumentSignatureEndReason.Removed },
                (await db.DocumentSignatures.Where(s => s.EndedAt != null).Select(s => s.EndReason!.Value).ToListAsync()).Order());
        }
        finally { MigratedSchema.Value = false; }
    }
}
