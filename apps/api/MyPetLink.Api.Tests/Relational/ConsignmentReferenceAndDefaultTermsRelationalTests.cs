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

// Automatic agreement references and default agreement terms. Synthetic data only.
public sealed partial class ConsignmentRelationalTests
{
    private const string ReferencesMigration = "20261019124347_AddConsignmentReferencesAndDefaultTerms";
    // Added after the Consignment migrations; rolling back to any of them
    // rolls this one back first.
    private const string CareCompletionIdempotencyMigration = "20261020181228_AddCareCompletionIdempotency";
    private const string DeliveryOrdersMigration = "20261023171109_AddConsignmentDeliveryOrders";
    private const string DocumentSignaturesMigration = "20261024151533_AddDocumentSignatures";

    /// <summary>
    /// The newest rollback guard refuses first while automatic references exist. Older rollback
    /// tests assert that, then release it so they reach the guard they were written for.
    /// </summary>
    private static async Task ReleaseReferenceRollbackGuard(MyPetLinkDbContext db, string target)
    {
        var blocked = await Assert.ThrowsAnyAsync<Exception>(() => db.GetService<Microsoft.EntityFrameworkCore.Migrations.IMigrator>().MigrateAsync(target));
        Assert.Contains("51058", blocked.ToString());
        db.ChangeTracker.Clear();
        await db.Database.ExecuteSqlRawAsync("UPDATE ConsignmentPartnerPrefixes SET LockedAt = NULL; UPDATE ConsignmentAgreements SET CreationKey = NULL, DefaultTermsRevision = NULL;");
    }

    private static ConsignmentService Desk(MyPetLinkDbContext db, DateTimeOffset? now = null)
    {
        var clock = new FixedClock(now ?? Now);
        var audit = new AuditLogService(db, new HttpContextAccessor());
        return new(db, audit, new BusinessIdentityService(db, audit, clock), new DocumentNumberService(db), clock,
            new AdminAccessResolver(db, new StubCurrentUserService(AdminAccountId)));
    }

    // EnsureCreated schemas have no migration seed; give them the same inactive suggested row.
    private static async Task SeedDefaultTerms(MyPetLinkDbContext db)
    {
        if (await db.ConsignmentDefaultTerms.AnyAsync()) return;
        db.ConsignmentDefaultTermsRevisions.Add(new() { Revision = 1, IsActive = false, PartnerCommissionPercentage = 35m, TrialDurationDays = 60,
            DurationTerms = "Synthetic suggested duration", RecordedAt = Now });
        db.ConsignmentDefaultTerms.Add(new() { Revision = 1, IsActive = false, PartnerCommissionPercentage = 35m, TrialDurationDays = 60,
            DurationTerms = "Synthetic suggested duration" });
        await db.SaveChangesAsync();
    }

    private static ConsignmentDefaultTermsValues CompleteDefaults(decimal rate = 30m) => new(rate, 60, "Synthetic 60-day trial, renewal only in writing.",
        "Synthetic monthly settlement after reconciliation", 7, "Synthetic approved prices only", "Synthetic carry forward; return on termination",
        "Synthetic evidence-based loss responsibility");

    private static SaveConsignmentAgreementRequest FromDefaults(ConsignmentDefaultTermsValues v, int revision, string? key = null) =>
        new(MerchantId, null, v.PartnerCommissionPercentage, null, null, v.DurationTerms, v.SettlementFrequency, v.PaymentDeadlineDays,
            v.DiscountTerms, v.ReturnTerms, v.LossTerms, null, null, null, key, revision);

    [Fact]
    public async Task ReferencesUseAStableMerchantPrefixAndAYearlySequence()
    {
        await using var scope = await Database(1); await using var db = scope.NewContext();
        var s = Desk(db);
        var preview = await s.AgreementPrefixAsync(MerchantId, default);
        Assert.Null(preview.Prefix); Assert.Equal("HAPPYPAWS", preview.SuggestedPrefix); Assert.False(preview.Locked);
        Assert.Equal("HAPPYPAWS-CONS-2026-", preview.ReferencePattern);

        var first = await s.SaveAgreementAsync(AdminAccountId, null, Terms(), null, default);
        var second = await s.SaveAgreementAsync(AdminAccountId, null, Terms(), null, default);
        Assert.Equal("HAPPYPAWS-CONS-2026-001", first.Reference); Assert.Equal("HAPPYPAWS-CONS-2026-002", second.Reference);
        var prefixRow = await db.ConsignmentPartnerPrefixes.AsNoTracking().SingleAsync(p => p.MerchantId == MerchantId);
        Assert.Equal("HAPPYPAWS", prefixRow.Prefix); Assert.NotNull(prefixRow.LockedAt);
        Assert.True(await db.AuditLogs.AnyAsync(e => e.Action == "consignment.agreement-prefix-changed"));

        // A reference can no longer be typed for a new agreement.
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => s.SaveAgreementAsync(AdminAccountId, null, Terms("MANUAL-1"), null, default))).StatusCode);
        // A used prefix is fixed.
        var token = (await s.AgreementPrefixAsync(MerchantId, default)).ConcurrencyToken;
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => s.SaveAgreementPrefixAsync(AdminAccountId, MerchantId, new("PAWS", token), default))).StatusCode);

        // A closed agreement keeps its number; the next agreement never reuses it.
        await s.AgreementActionAsync(OwnerAccountId, second.Id, "close", new(second.ConcurrencyToken, "Synthetic withdrawal"), default);
        Assert.Equal("HAPPYPAWS-CONS-2026-003", (await s.SaveAgreementAsync(AdminAccountId, null, Terms(), null, default)).Reference);

        // Renaming the merchant renames nothing.
        var merchant = await db.Merchants.SingleAsync(m => m.Id == MerchantId);
        merchant.LegalBusinessName = "Entirely Renamed Sdn Bhd"; merchant.TradingName = "Renamed"; await db.SaveChangesAsync();
        Assert.Equal("HAPPYPAWS-CONS-2026-004", (await s.SaveAgreementAsync(AdminAccountId, null, Terms(), null, default)).Reference);
        Assert.Equal("HAPPYPAWS-CONS-2026-001", (await db.ConsignmentAgreements.AsNoTracking().SingleAsync(a => a.Id == first.Id)).Reference);
    }

    [Fact]
    public async Task NumbersFollowTheMalaysianCalendarYear()
    {
        await using var scope = await Database(1); await using var db = scope.NewContext();
        // 23:59:59 on 31 December in Malaysia, then one second later.
        var lastSecond = new DateTimeOffset(2026, 12, 31, 15, 59, 59, TimeSpan.Zero);
        Assert.Equal("HAPPYPAWS-CONS-2026-001", (await Desk(db, lastSecond).SaveAgreementAsync(AdminAccountId, null, Terms(), null, default)).Reference);
        Assert.Equal("HAPPYPAWS-CONS-2027-001", (await Desk(db, lastSecond.AddSeconds(1)).SaveAgreementAsync(AdminAccountId, null, Terms(), null, default)).Reference);
        Assert.Equal("HAPPYPAWS-CONS-2026-002", (await Desk(db, lastSecond).SaveAgreementAsync(AdminAccountId, null, Terms(), null, default)).Reference);
    }

    [Fact]
    public async Task PrefixesAreUniqueAcrossMerchantsAndAdjustableBeforeUse()
    {
        await using var scope = await Database(1); await using var db = scope.NewContext();
        var s = Desk(db);
        // A partner whose name suggests the same prefix gets the next free one.
        var other = await db.Merchants.SingleAsync(m => m.Id == OtherMerchantId);
        other.LegalBusinessName = "Happy Paws Veterinary Group Sdn Bhd"; await db.SaveChangesAsync();
        Assert.Equal("HAPPYPAWS-CONS-2026-001", (await s.SaveAgreementAsync(AdminAccountId, null, Terms(), null, default)).Reference);
        Assert.Equal("HAPPYPAWS2", (await s.AgreementPrefixAsync(OtherMerchantId, default)).SuggestedPrefix);

        var token = (await s.AgreementPrefixAsync(OtherMerchantId, default)).ConcurrencyToken;
        foreach (var bad in new[] { "A", "1PAWS", "PAWS-SHOP", "THIRTEENCHARS" })
            Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => s.SaveAgreementPrefixAsync(AdminAccountId, OtherMerchantId, new(bad, token), default))).StatusCode);
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => s.SaveAgreementPrefixAsync(AdminAccountId, OtherMerchantId, new("HAPPYPAWS", token), default))).StatusCode);
        var adjusted = await s.SaveAgreementPrefixAsync(AdminAccountId, OtherMerchantId, new("pawsclinic", token), default);
        Assert.Equal("PAWSCLINIC", adjusted.Prefix); Assert.False(adjusted.Locked);
        Assert.Equal("PAWSCLINIC-CONS-2026-001", (await s.SaveAgreementAsync(AdminAccountId, null, Terms() with { MerchantId = OtherMerchantId }, null, default)).Reference);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => s.AgreementPrefixAsync(Guid.NewGuid(), default))).StatusCode);
    }

    [Fact]
    public async Task HandEnteredHistoryIsKeptAndItsNumbersAreSkipped()
    {
        await using var scope = await Database(1); await using var db = scope.NewContext();
        db.ConsignmentAgreements.AddRange(
            new ConsignmentAgreement { MerchantId = MerchantId, Reference = "HAPPYPAWS-CONS-2026-001", UpdatedByAdminUserId = AdminRecordId },
            new ConsignmentAgreement { MerchantId = MerchantId, Reference = "SECOND-CONS-2025-004", UpdatedByAdminUserId = AdminRecordId });
        await db.SaveChangesAsync();
        var s = Desk(db);
        Assert.Equal("HAPPYPAWS-CONS-2026-002", (await s.SaveAgreementAsync(AdminAccountId, null, Terms(), null, default)).Reference);
        // Another partner's hand-typed references keep their stem, so "Second Merchant" can't take SECOND.
        Assert.Equal("SECOND2", (await s.AgreementPrefixAsync(OtherMerchantId, default)).SuggestedPrefix);
        var otherToken = (await s.AgreementPrefixAsync(OtherMerchantId, default)).ConcurrencyToken;
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => s.SaveAgreementPrefixAsync(AdminAccountId, OtherMerchantId,
            new("SECOND", otherToken), default))).StatusCode);
        Assert.Equal(["HAPPYPAWS-CONS-2026-001", "SECOND-CONS-2025-004"],
            await db.ConsignmentAgreements.Where(a => a.Reference == "HAPPYPAWS-CONS-2026-001" || a.Reference == "SECOND-CONS-2025-004").OrderBy(a => a.Reference).Select(a => a.Reference).ToListAsync());
    }

    [Fact]
    public async Task ARetriedCreateReturnsTheSameDraftAndNumber()
    {
        await using var scope = await Database(1); await using var db = scope.NewContext();
        var s = Desk(db);
        var request = Terms() with { IdempotencyKey = "synthetic-wizard-1" };
        var first = await s.SaveAgreementAsync(AdminAccountId, null, request, null, default);
        // The response was lost; the browser sends the same request again.
        var retry = await Desk(db).SaveAgreementAsync(AdminAccountId, null, request, null, default);
        Assert.Equal(first.Id, retry.Id); Assert.Equal(first.Reference, retry.Reference);
        Assert.Equal(1, await db.ConsignmentAgreements.CountAsync());
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() =>
            s.SaveAgreementAsync(AdminAccountId, null, request with { PartnerCommissionPercentage = 31m }, null, default))).StatusCode);
        Assert.Equal("HAPPYPAWS-CONS-2026-002", (await s.SaveAgreementAsync(AdminAccountId, null, Terms() with { IdempotencyKey = "synthetic-wizard-2" }, null, default)).Reference);
    }

    [Fact]
    public async Task SimultaneousDraftsNeverShareANumber()
    {
        await using var scope = await Database(1);
        await using (var warm = scope.NewContext()) await Desk(warm).SaveAgreementAsync(AdminAccountId, null, Terms(), null, default);
        var results = await Task.WhenAll(Enumerable.Range(0, 6).Select(async i => {
            await using var db = scope.NewContext();
            return (await Desk(db).SaveAgreementAsync(AdminAccountId, null, Terms() with { IdempotencyKey = "parallel-" + i }, null, default)).Reference;
        }));
        Assert.Equal(6, results.Distinct().Count());
        Assert.Equal(Enumerable.Range(2, 6).Select(n => $"HAPPYPAWS-CONS-2026-{n:000}").Order(), results.Order());
    }

    [Fact]
    public async Task RevisionsKeepTheirReferenceAndTakeNoNumber()
    {
        await using var scope = await Database(1); await using var db = scope.NewContext();
        await SeedDefaultTerms(db);
        var s = Desk(db);
        var v1 = await s.SaveAgreementAsync(AdminAccountId, null, Terms(), null, default);
        v1 = await s.AgreementActionAsync(OwnerAccountId, v1.Id, "approve", new(v1.ConcurrencyToken, "Synthetic approval"), default);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() =>
            s.SaveAgreementAsync(AdminAccountId, null, Terms("OTHER-REF") with { SupersedesAgreementId = v1.Id }, null, default))).StatusCode);
        var v2 = await s.SaveAgreementAsync(AdminAccountId, null, Terms() with { SupersedesAgreementId = v1.Id, DefaultTermsRevision = 1 }, null, default);
        Assert.Equal(v1.Reference, v2.Reference); Assert.Equal(2, v2.Version);
        Assert.Null(v2.DefaultTermsRevision);   // A revision starts from its predecessor, never the defaults.
        var echoed = await s.SaveAgreementAsync(AdminAccountId, v2.Id, Terms(v1.Reference) with { SupersedesAgreementId = v1.Id }, v2.ConcurrencyToken, default);
        Assert.Equal(v1.Reference, echoed.Reference);
        Assert.Equal("HAPPYPAWS-CONS-2026-002", (await s.SaveAgreementAsync(AdminAccountId, null, Terms(), null, default)).Reference);
    }

    [Fact]
    public async Task DefaultTermsStartInactiveAndOnlyCompleteTermsCanBeUsed()
    {
        await using var scope = await Database(1); await using var db = scope.NewContext();
        await SeedDefaultTerms(db);
        var s = Desk(db);
        var d = await s.DefaultTermsAsync(default);
        Assert.False(d.IsActive); Assert.Equal(1, d.Revision); Assert.Contains("Settlement frequency", d.Missing);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => s.SaveDefaultTermsAsync(AdminAccountId, new(d.ConcurrencyToken, true, d.Terms), default))).StatusCode);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() =>
            s.SaveDefaultTermsAsync(AdminAccountId, new(d.ConcurrencyToken, true, CompleteDefaults() with { TrialDurationDays = 0 }), default))).StatusCode);

        var saved = await s.SaveDefaultTermsAsync(AdminAccountId, new(d.ConcurrencyToken, true, CompleteDefaults()), default);
        Assert.True(saved.IsActive); Assert.Equal(2, saved.Revision); Assert.Empty(saved.Missing);
        Assert.Equal([2, 1], saved.History.Select(h => h.Revision));
        // Saving the same values again records nothing new.
        Assert.Equal(2, (await s.SaveDefaultTermsAsync(AdminAccountId, new(saved.ConcurrencyToken, true, CompleteDefaults()), default)).Revision);
        // Someone else's change in between is refused, not overwritten.
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() =>
            s.SaveDefaultTermsAsync(AdminAccountId, new(d.ConcurrencyToken, true, CompleteDefaults(31m)), default))).StatusCode);
        var log = await db.AuditLogs.AsNoTracking().SingleAsync(e => e.Action == "consignment.default-terms-changed");
        Assert.Contains("35", log.OldValue); Assert.Contains("30", log.NewValue);

        var tracked = await db.ConsignmentDefaultTermsRevisions.SingleAsync(r => r.Revision == 1);
        tracked.LossTerms = "Tampered";
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task AgreementsKeepTheirOwnCopyWhenTheDefaultsChange()
    {
        await using var scope = await Database(1); await using var db = scope.NewContext();
        await SeedDefaultTerms(db);
        var s = Desk(db);
        var d = await s.SaveDefaultTermsAsync(AdminAccountId, new((await s.DefaultTermsAsync(default)).ConcurrencyToken, true, CompleteDefaults()), default);
        var defaults = d.Terms;

        // Not a confirmed revision: refused rather than recorded.
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => s.SaveAgreementAsync(AdminAccountId, null, FromDefaults(defaults, 1), null, default))).StatusCode);

        // One partner keeps the defaults, the other negotiates its own commission and returns.
        var plain = await s.SaveAgreementAsync(AdminAccountId, null, FromDefaults(defaults, d.Revision), null, default);
        var custom = await s.SaveAgreementAsync(AdminAccountId, null, FromDefaults(defaults, d.Revision) with {
            MerchantId = OtherMerchantId, PartnerCommissionPercentage = 40m, ReturnTerms = "Synthetic negotiated returns" }, null, default);
        Assert.Equal(d.Revision, plain.DefaultTermsRevision); Assert.Equal(30m, plain.PartnerCommissionPercentage);
        Assert.Equal(40m, custom.PartnerCommissionPercentage); Assert.Equal("Synthetic negotiated returns", custom.ReturnTerms);
        // Evidence is never defaulted.
        Assert.Null(plain.EffectiveFrom); Assert.Null(plain.SignedAgreementReference); Assert.Null(plain.ExternalTrackerReference);

        var approvedDraft = await s.SaveAgreementAsync(AdminAccountId, plain.Id, FromDefaults(defaults, d.Revision) with {
            EffectiveFrom = Now.AddDays(-1), SignedAgreementReference = "SYN-SIGNED", ExternalTrackerReference = "SYN-TRACKER" }, plain.ConcurrencyToken, default);
        await s.AgreementActionAsync(OwnerAccountId, plain.Id, "approve", new(approvedDraft.ConcurrencyToken, "Synthetic approval"), default);

        // A form loaded before the defaults changed still saves the revision it showed.
        var later = await s.SaveDefaultTermsAsync(AdminAccountId, new((await s.DefaultTermsAsync(default)).ConcurrencyToken, true,
            CompleteDefaults(25m) with { LossTerms = "Synthetic revised loss" }), default);
        Assert.Equal(3, later.Revision);
        var stale = await s.SaveAgreementAsync(AdminAccountId, null, FromDefaults(defaults, d.Revision), null, default);
        Assert.Equal(d.Revision, stale.DefaultTermsRevision); Assert.Equal(30m, stale.PartnerCommissionPercentage);

        var rows = await db.ConsignmentAgreements.AsNoTracking().Where(a => a.Id == plain.Id || a.Id == custom.Id).ToDictionaryAsync(a => a.Id);
        Assert.Equal(30m, rows[plain.Id].PartnerCommissionPercentage); Assert.Equal(ConsignmentAgreementStatus.Active, rows[plain.Id].Status);
        Assert.Equal("Synthetic evidence-based loss responsibility", rows[plain.Id].LossTerms);
        Assert.Equal(40m, rows[custom.Id].PartnerCommissionPercentage); Assert.Equal("Synthetic negotiated returns", rows[custom.Id].ReturnTerms);
    }

    [Fact]
    public async Task GeneratedReferencesFlowIntoIssuedAndSignedDocuments()
    {
        await using var scope = await Database(1); await using var db = scope.NewContext();
        await SeedDefaultTerms(db);
        await DocumentAccess(db, AdminRecordId, AdminCapabilities.ConsignmentAgreementsManage, AdminCapabilities.ConsignmentAgreementsApprove);
        var s = Desk(db);
        var d = await s.SaveDefaultTermsAsync(AdminAccountId, new((await s.DefaultTermsAsync(default)).ConcurrencyToken, true, CompleteDefaults()), default);
        var a = await s.SaveAgreementAsync(AdminAccountId, null, FromDefaults(d.Terms, d.Revision) with { EffectiveFrom = Now.AddDays(-1) }, null, default);
        Assert.Equal("SYNPAWS-CONS-2026-001", a.Reference);
        var issued = Assert.Single((await s.IssueAgreementAsync(AdminAccountId, a.Id, new(a.ConcurrencyToken), default)).IssuedDocuments);
        Assert.Equal("MyPetLink_Consignment_SYNPAWS-CONS-2026-001_v1.pdf", issued.FileName);
        var before = await s.IssuedAgreementPdfAsync(AdminAccountId, a.Id, issued.Id, default);

        // Changing the defaults touches neither the saved terms nor what was issued.
        await s.SaveDefaultTermsAsync(AdminAccountId, new((await s.DefaultTermsAsync(default)).ConcurrencyToken, true, CompleteDefaults(20m)), default);
        var summary = await s.AgreementDocumentAsync(a.Id, default);
        Assert.Equal("issued", summary.Status); Assert.Equal(issued.Id, summary.CurrentIssuedDocumentId);
        var after = await s.IssuedAgreementPdfAsync(AdminAccountId, a.Id, issued.Id, default);
        Assert.Equal(before.Content, after.Content);
        using (var pdf = PdfDocument.Open(after.Content))
        {
            var text = string.Concat(pdf.GetPages().Select(p => p.Text)).Replace(" ", "");
            Assert.Contains("SYNPAWS-CONS-2026-001", text); Assert.Contains("30%ofeachsale", text); Assert.DoesNotContain("20%ofeachsale", text);
        }
        var preview = await s.PreviewAgreementAsync(AdminAccountId, a.Id, a.ConcurrencyToken, default);
        Assert.Contains("30%ofeachsale", string.Concat(PdfDocument.Open(preview.Content).GetPages().Select(p => p.Text)).Replace(" ", ""));

        var copy = Assert.Single((await s.UploadSignedAgreementAsync(AdminAccountId, a.Id, Signed(issued.Id), default)).SignedCopies);
        Assert.Equal("MyPetLink_Consignment_SYNPAWS-CONS-2026-001_v1_issue1_SIGNED.pdf", (await s.SignedAgreementFileAsync(AdminAccountId, a.Id, copy.Id, default)).FileName);
    }

    [Fact]
    public async Task MigratedSchemaSeedsInactiveSuggestedTermsAndGuardsItsHistory()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(1); await using var db = scope.NewContext();
            var t = await db.ConsignmentDefaultTerms.AsNoTracking().SingleAsync();
            Assert.False(t.IsActive); Assert.Equal(1, t.Revision); Assert.Equal(35m, t.PartnerCommissionPercentage); Assert.Equal(60, t.TrialDurationDays);
            Assert.Equal(7, t.PaymentDeadlineDays); Assert.Contains("does not renew automatically", t.DurationTerms);
            Assert.Null(t.UpdatedByAdminUserId);
            Assert.Contains("51057", (await Assert.ThrowsAnyAsync<Exception>(() =>
                db.Database.ExecuteSqlRawAsync("UPDATE ConsignmentDefaultTermsRevisions SET LossTerms = N'x'"))).ToString());

            await Desk(db).SaveAgreementAsync(AdminAccountId, null, Terms(), null, default);
            Assert.Contains("CK_ConsignmentPartnerPrefix_Format", (await Assert.ThrowsAnyAsync<Exception>(() =>
                db.Database.ExecuteSqlRawAsync("UPDATE ConsignmentPartnerPrefixes SET Prefix = N'bad-prefix'"))).ToString());
            var blocked = await Assert.ThrowsAnyAsync<Exception>(() => db.GetService<Microsoft.EntityFrameworkCore.Migrations.IMigrator>()
                .MigrateAsync(AgreementDocumentsMigration));
            Assert.Contains("51058", blocked.ToString());
            db.ChangeTracker.Clear();
            // Migrations roll back newest first, each in its own transaction:
            // the later care migration is undone before the guard stops the
            // run, and no Consignment migration is.
            Assert.Equal([CareCompletionIdempotencyMigration, DeliveryOrdersMigration, DocumentSignaturesMigration, SettlementsMigration, RecoveriesMigration, SignatureOwnershipMigration], await db.Database.GetPendingMigrationsAsync());
        }
        finally { MigratedSchema.Value = false; }
    }
}
