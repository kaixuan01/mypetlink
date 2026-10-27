using Microsoft.AspNetCore.Http;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

// Regression tests for the second independent review's findings N1–N4.
public sealed partial class ConsignmentRelationalTests
{
    private static ConsignmentService SoloLater(MyPetLinkDbContext db)
    {
        var audit = new AuditLogService(db, new HttpContextAccessor());
        return new(db, audit, new BusinessIdentityService(db, audit, new FixedClock(ReportClock)), new DocumentNumberService(db),
            new FixedClock(ReportClock), new MyPetLink.Api.Auth.AdminAccessResolver(db, new StubCurrentUserService(AdminAccountId)));
    }

    private static Task<bool> IsPriceContributor(MyPetLinkDbContext db, Guid term, Guid admin) =>
        db.ConsignmentRecordContributors.AnyAsync(c => c.SubjectType == "ConsignmentPriceTerm" && c.SubjectId == term && c.AdminUserId == admin);

    // --- N1 -------------------------------------------------------------------------

    [Fact]
    public async Task N1TheReviewedDelimiterCollisionIsStillAnEditAndBlocksTeamApproval()
    {
        await using var scope = await Database(4); await using var db = scope.NewContext(); await AddReviewer(db);
        var a = await AgreementFrom(db, AugustFirst); var s = Later(db);
        var (from, to) = (AugustFirst.UtcTicks, AugustSixteenth.UtcTicks);
        // The exact fields from the review's evidence: joined with '|', both versions read the same.
        var draft = await s.SavePriceTermAsync(AdminAccountId, null, new(a.Id, NfcVariantId, "Promotion", "Opening", 39.90m, AugustFirst, AugustSixteenth,
            $"X|1.00|{from}|{to}|Genuine partner acceptance"), null, default);
        var edited = await s.SavePriceTermAsync(ReviewerUser, draft.Id, new(a.Id, NfcVariantId, "Promotion", $"Opening|39.90|{from}|{to}|X", 1.00m,
            AugustFirst, AugustSixteenth, "Genuine partner acceptance"), draft.ConcurrencyToken, default);
        Assert.Equal(1.00m, edited.UnitNetPrice);
        Assert.True(await IsPriceContributor(db, draft.Id, ReviewerAdmin));
        var refused = await Assert.ThrowsAsync<ApiException>(() => s.ApprovePriceTermAsync(ReviewerUser, edited.Id, new(edited.ConcurrencyToken), default));
        Assert.Equal(403, refused.StatusCode);
        Assert.Equal("Draft", (await s.PriceTermsAsync(a.Id, default)).Single().Status);
        Assert.Empty(db.ConsignmentReviewEvents.Where(e => e.SubjectId == draft.Id));
        // The creator can't approve either; someone who touched neither version can.
        await Assert.ThrowsAsync<ApiException>(() => s.ApprovePriceTermAsync(AdminAccountId, edited.Id, new(edited.ConcurrencyToken), default));
        Assert.Equal("Independent (Team)", (await s.ApprovePriceTermAsync(OwnerAccountId, edited.Id, new(edited.ConcurrencyToken), default)).ReviewMode);
    }

    public static TheoryData<string, string?, decimal, int, string, string?, decimal, int, bool> PriceEdits => new()
    {
        // before name, evidence, price, start day offset → after …, is it a real edit?
        { "A|B", "E|F-OK", 39.90m, 0, "A|B|E", "F-OK", 39.90m, 0, true },
        { "Promo\u001eA", "PARTNER-OK", 39.90m, 0, "Promo\u001eB", "PARTNER-OK", 39.90m, 0, true },
        { "Promo\u0000", "PARTNER\u001fOK", 39.90m, 0, "Promo", "PARTNER\u001fOK", 39.90m, 0, true },
        { "Opening", null, 39.90m, 0, "Opening", "", 39.90m, 0, false },
        { "Opening", "  PARTNER-OK  ", 39.90m, 0, "Opening ", "PARTNER-OK", 39.90m, 0, false },
        { "Opening", "PARTNER-OK", 39.90m, 0, "Opening", "PARTNER-OK", 39.9m, 0, false },
        { "Opening", "PARTNER-OK", 39.90m, 0, "Opening", "PARTNER-OK", 39.91m, 0, true },
        { "Opening", "PARTNER-OK", 39.90m, 0, "Opening", "PARTNER-OK", 39.90m, 1, true },
        { "Opening", null, 39.90m, 0, "Opening", "PARTNER-OK", 39.90m, 0, true },
    };

    [Theory]
    [MemberData(nameof(PriceEdits))]
    public async Task N1EditsAreComparedFieldByFieldNotAsJoinedText(string name, string? evidence, decimal price, int startDays,
        string newName, string? newEvidence, decimal newPrice, int newStartDays, bool isEdit)
    {
        await using var scope = await Database(4); await using var db = scope.NewContext(); await AddReviewer(db);
        var a = await AgreementFrom(db, AugustFirst); var s = Later(db);
        var draft = await s.SavePriceTermAsync(AdminAccountId, null, new(a.Id, NfcVariantId, "Promotion", name, price, AugustFirst.AddDays(startDays),
            AugustSixteenth, evidence), null, default);
        // The same instant written in UTC instead of Malaysia time is the same date.
        var edited = await s.SavePriceTermAsync(ReviewerUser, draft.Id, new(a.Id, NfcVariantId, "Promotion", newName, newPrice,
            AugustFirst.AddDays(newStartDays).ToUniversalTime(), AugustSixteenth, newEvidence), draft.ConcurrencyToken, default);
        Assert.Equal(isEdit, await IsPriceContributor(db, draft.Id, ReviewerAdmin));
        Assert.Equal(newPrice, edited.UnitNetPrice);
        if (isEdit && edited.ApprovalEvidenceReference is { Length: >= 5 })
            Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => s.ApprovePriceTermAsync(ReviewerUser, edited.Id, new(edited.ConcurrencyToken), default))).StatusCode);
    }

    [Fact]
    public async Task N1EveryEditorIsExcludedAndOnlyTheNamedFounderMaySelfReviewInSolo()
    {
        await using var scope = await Database(4); await using var db = scope.NewContext(); await AddReviewer(db);
        var a = await AgreementFrom(db, AugustFirst); var s = Later(db);
        var draft = await s.SavePriceTermAsync(OwnerAccountId, null, new(a.Id, NfcVariantId, "Standard", null, 39.90m, AugustFirst, null, "PARTNER-PRICE-OK"), null, default);
        draft = await s.SavePriceTermAsync(ReviewerUser, draft.Id, new(a.Id, NfcVariantId, "Standard", null, 41.90m, AugustFirst, null, "PARTNER-PRICE-OK"), draft.ConcurrencyToken, default);
        draft = await s.SavePriceTermAsync(AdminAccountId, draft.Id, new(a.Id, NfcVariantId, "Standard", null, 41.90m, AugustFirst, null, "PARTNER|PRICE-OK"), draft.ConcurrencyToken, default);
        foreach (var editor in new[] { OwnerAccountId, ReviewerUser, AdminAccountId })
            Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => s.ApprovePriceTermAsync(editor, draft.Id, new(draft.ConcurrencyToken), default))).StatusCode);
        await SoloAccess(db); await SetMode(db);
        var solo = SoloLater(db);
        await Assert.ThrowsAsync<ApiException>(() => solo.ApprovePriceTermAsync(AdminAccountId, draft.Id, new(draft.ConcurrencyToken), default));
        await Assert.ThrowsAsync<ApiException>(() => solo.ApprovePriceTermAsync(AdminAccountId, draft.Id, new(draft.ConcurrencyToken, SelfReview: Attest("SOME-OTHER-EVIDENCE")), default));
        var approved = await solo.ApprovePriceTermAsync(AdminAccountId, draft.Id, new(draft.ConcurrencyToken, SelfReview: Attest("PARTNER|PRICE-OK")), default);
        Assert.Equal("Self-reviewed (Solo)", approved.ReviewMode);
    }

    [Fact]
    public async Task N1AReportEditHiddenInDelimitedTextIsStillAnEdit()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext(); await AddReviewer(db);
        var a = await AgreementFrom(db, AugustFirst); var price = await Price(db, a.Id, AugustFirst);
        await ReceiveUnder(db, a.Id, 10, "n1r");
        var s = Later(db);
        var original = ReportFor(a.Id, "2026-08", 1, "N1-R", [Sale(price.Id, 2)], key: "N1-R-KEY") with { EvidenceReference = "WA EVIDENCE", Notes = "X\u001eY" };
        var draft = await s.CreateSalesReportAsync(AdminAccountId, original, default);
        // Separator text moved from the notes into the evidence: joined, both read the same.
        var moved = original with { EvidenceReference = "WA EVIDENCE\u001eX", Notes = "Y" };
        var saved = await s.UpdateSalesReportAsync(ReviewerUser, draft.Id, draft.ConcurrencyToken, moved, default);
        Assert.Equal(("WA EVIDENCE\u001eX", "Y"), (saved.EvidenceReference, saved.Notes));
        Assert.True(await db.ConsignmentRecordContributors.AnyAsync(c => c.SubjectId == draft.Id && c.AdminUserId == ReviewerAdmin));
        // A retry of the original submission is not the edited report.
        var retry = await Assert.ThrowsAsync<ApiException>(() => s.CreateSalesReportAsync(AdminAccountId, original, default));
        Assert.Equal("submission_changed", retry.Code);
    }

    // --- N2 -------------------------------------------------------------------------

    [Fact]
    public async Task N2ContributorHistoryRefusesRawSqlEditsOnTheMigratedSchema()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(4); await using var db = scope.NewContext(); await AddReviewer(db);
            var a = await AgreementFrom(db, AugustFirst); var s = Later(db);
            var draft = await s.SavePriceTermAsync(AdminAccountId, null, new(a.Id, NfcVariantId, "Standard", null, 39.90m, AugustFirst, null, "PARTNER-PRICE-OK"), null, default);
            draft = await s.SavePriceTermAsync(ReviewerUser, draft.Id, new(a.Id, NfcVariantId, "Standard", null, 1.00m, AugustFirst, null, "PARTNER-PRICE-OK"), draft.ConcurrencyToken, default);
            Assert.True(await IsPriceContributor(db, draft.Id, ReviewerAdmin));
            Assert.Equal(51046, (await SqlFailure(() => db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE ConsignmentRecordContributors SET AdminUserId = {CheckerAdminId} WHERE SubjectId = {draft.Id} AND AdminUserId = {ReviewerAdmin}"))).Number);
            Assert.Equal(51046, (await SqlFailure(() => db.Database.ExecuteSqlInterpolatedAsync(
                $"DELETE FROM ConsignmentRecordContributors WHERE SubjectId = {draft.Id}"))).Number);
            Assert.True(await IsPriceContributor(db, draft.Id, ReviewerAdmin));
            // Tracked EF writes stay refused too.
            var row = await db.ConsignmentRecordContributors.FirstAsync(c => c.SubjectId == draft.Id);
            db.ConsignmentRecordContributors.Remove(row);
            await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
            db.ChangeTracker.Clear();
            // Inserts and ordinary reviews still work: the editor is refused, an outsider approves.
            Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => s.ApprovePriceTermAsync(ReviewerUser, draft.Id, new(draft.ConcurrencyToken), default))).StatusCode);
            Assert.Equal("Independent (Team)", (await s.ApprovePriceTermAsync(OwnerAccountId, draft.Id, new(draft.ConcurrencyToken), default)).ReviewMode);
        }
        finally { MigratedSchema.Value = false; }
    }

    // --- N3 -------------------------------------------------------------------------

    [Fact]
    public async Task N3UnknownEditorsFromTheOriginalPhase1ASchemaAreNotTreatedAsIndependent()
    {
        Assert.True(RelationalDatabase.IsAvailable, "SQL Server migration verification must not skip.");
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true, createSchema: false); await using var db = scope.NewContext();
        await db.GetService<IMigrator>().MigrateAsync(SalesLedgerMigration);
        await SeedConsignment(db, 10); await AddReviewer(db);
        // Agreements already existed in the original Phase 1A schema. (Stock is received after the
        // upgrade below: today's ledger posting reads tables a later migration adds.)
        // Written in the original schema's own shape: today's save also writes columns added later.
        var a = (Id: Guid.NewGuid(), Unused: 0);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT ConsignmentAgreements(Id,MerchantId,Reference,Version,PartnerCommissionPercentage,EffectiveFrom,EffectiveTo,DurationTerms,
              SettlementFrequency,PaymentDeadlineDays,DiscountTerms,ReturnTerms,LossTerms,SignedAgreementReference,ExternalTrackerReference,
              Status,UpdatedByAdminUserId,ApprovedByAdminUserId,ApprovedAt,ApprovalReviewMode,DraftContributorHistoryComplete,CreatedAt,UpdatedAt)
            VALUES({a.Id},{MerchantId},'N3-LEGACY',1,35,{AugustFirst},NULL,'Test-only duration','Test-only settlement',14,'Test-only discounts',
              'Test-only returns','Test-only loss','TEST-SIGNED','TEST-TRACKER','Active',{AdminRecordId},{CheckerAdminId},{Now},'Independent (Team)',1,{Now},{Now});
            INSERT ConsignmentDraftContributors(AgreementId,AdminUserId,FirstContributedAt,IsCreator) VALUES({a.Id},{AdminRecordId},{Now},1);
            """);
        var sku = await db.TagProductVariants.Where(v => v.Id == NfcVariantId).Select(v => v.Sku).SingleAsync();
        var (standard, edited, report) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        // As the original API left them: an approved price, and a draft the admin created and someone
        // else later changed to RM1.00 — no record of that editor exists anywhere.
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT ConsignmentPriceTerms(Id,AgreementId,ProductVariantId,SkuSnapshot,Kind,Name,UnitNetPrice,ValidFrom,ValidToExclusive,
              ApprovalEvidenceReference,Status,CreatedByAdminUserId,ApprovedByAdminUserId,ApprovedAt,ReviewMode,CreatedAt,UpdatedAt)
            VALUES({standard},{a.Id},{NfcVariantId},{sku},'Standard','Standard price',39.90,{AugustFirst},NULL,'PARTNER-PRICE-OK','Approved',
              {AdminRecordId},{CheckerAdminId},{Now},'Independent (Team)',{Now},{Now}),
              ({edited},{a.Id},{NfcVariantId},{sku},'Promotion','Opening',1.00,{AugustFirst},{AugustSixteenth},'PARTNER-PROMO-OK','Draft',
              {AdminRecordId},NULL,NULL,NULL,{Now},{Now});
            INSERT ConsignmentSalesReports(Id,MerchantId,MerchantBranchId,AgreementId,PeriodStart,PeriodEndExclusive,PartnerReference,Version,
              ReportReceivedAt,EvidenceLevel,EvidenceKind,EvidenceReference,Status,CreatedByAdminUserId,RecordedByAdminUserId,RecordedAt,
              IdempotencyKey,CreatedAt,UpdatedAt)
            VALUES({report},{MerchantId},{BranchId},{a.Id},{AugustFirst},{AugustSixteenth},'N3-A',1,{AugustSixteenth},'Summary','WhatsApp summary',
              'WA EVIDENCE N3-A','Recorded',{AdminRecordId},{AdminRecordId},{Now},'N3-KEY',{Now},{Now});
            INSERT ConsignmentSalesReportLines(Id,SalesReportId,ProductVariantId,SkuSnapshot,ProductNameSnapshot,LineType,PriceTermId,
              UnitListPriceSnapshot,UnitNetPrice,Quantity,RestockableQuantity,UnsellableReturnedQuantity,QuantityExplainingDiscrepancy)
            VALUES({Guid.NewGuid()},{report},{NfcVariantId},{sku},'Synthetic tag',  'Sale',{standard},39.90,39.90,2,0,0,0);
            """);
        await db.Database.MigrateAsync(); db.ChangeTracker.Clear();
        await ReceiveUnder(db, a.Id, 10, "n3");
        var s = Later(db);
        // Nobody is provably independent of the RM1.00 edit, so Team approval is refused for everyone.
        foreach (var reviewer in new[] { ReviewerUser, OwnerAccountId })
        {
            var token = (await s.PriceTermsAsync(a.Id, default)).Single(t => t.Id == edited).ConcurrencyToken;
            Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => s.ApprovePriceTermAsync(reviewer, edited, new(token), default))).StatusCode);
        }
        var recorded = await s.GetSalesReportAsync(report, default);
        Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => s.VerifySalesReportAsync(ReviewerUser, report, new(recorded.ConcurrencyToken, AcknowledgeWarnings: true), default))).StatusCode);
        // Nothing historical was rewritten, deleted or invented.
        Assert.Equal(1.00m, (await db.ConsignmentPriceTerms.SingleAsync(t => t.Id == edited)).UnitNetPrice);
        Assert.Equal("Recorded", (await s.GetSalesReportAsync(report, default)).Status);
        Assert.False(await db.ConsignmentRecordContributors.AnyAsync(c => c.AdminUserId == ReviewerAdmin));
    }

    [Fact]
    public async Task N3AnUpgradeFromTheSoloSchemaWithNoSalesRecordsAddsNoRestriction()
    {
        Assert.True(RelationalDatabase.IsAvailable, "SQL Server migration verification must not skip.");
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true, createSchema: false); await using var db = scope.NewContext();
        await db.GetService<IMigrator>().MigrateAsync(SoloPolicyMigration);
        await SeedConsignment(db, 4);
        await db.Database.MigrateAsync(); db.ChangeTracker.Clear();
        var a = await AgreementFrom(db, AugustFirst);
        var price = await Price(db, a.Id, AugustFirst);
        Assert.Equal("Independent (Team)", price.ReviewMode);
    }

    // --- N4 -------------------------------------------------------------------------

    private static readonly DateTimeOffset AugustTenth = new(2026, 8, 10, 0, 0, 0, Myt);

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task N4ARenewalSplitsReportsAtTheSuccessorsStart(bool fixedEnd)
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        // v1 open-ended, or with a fixed end the revision comes before.
        var v1 = await AgreementFrom(db, AugustFirst, fixedEnd ? new DateTimeOffset(2026, 9, 1, 0, 0, 0, Myt) : null);
        var v1Price = await Price(db, v1.Id, AugustFirst);
        await ReceiveUnder(db, v1.Id, 10, "n4");
        var v2 = await AgreementFrom(db, AugustTenth, null, v1.Id);
        var v2Price = await Price(db, v2.Id, AugustTenth, 42m);
        var before = await Verified(db, ReportFor(v1.Id, "2026-08", 1, "N4-A", [Sale(v1Price.Id, 3)]));
        Assert.Equal((AugustFirst, AugustTenth), (before.PeriodStart, before.PeriodEndExclusive));
        var after = await Verified(db, ReportFor(v2.Id, "2026-08", 1, "N4-B", [Sale(v2Price.Id, 2, 42m)]));
        Assert.Equal((AugustTenth, AugustSixteenth), (after.PeriodStart, after.PeriodEndExclusive));
        // A v1 report for a later period starts and ends nowhere: it's outside v1's dates.
        var late = await Recorded(db, ReportFor(v1.Id, "2026-08", 2, "N4-LATE", [Sale(v1Price.Id, 1)]));
        Assert.Contains(late.Issues, i => i.Contains("outside the agreement's approved dates"));
        await Later(db).DisputeSalesReportAsync(OwnerAccountId, late.Id, new(late.ConcurrencyToken, "Sold under the renewed agreement"), default);
        // Refund of the v1 sale, reported under v2 at v1's price.
        var refund = await Verified(db, ReportFor(v2.Id, "2026-09", 1, "N4-C", [Refund(v1Price.Id, 1, AugustFirst, restock: 1)]), LateClock);
        Assert.Equal("Verified", refund.Status);
        Assert.Equal((6, 0, 4, 10, true), await Buckets(db));
        // History stays as it was: each report keeps its own agreement version and price.
        Assert.Equal(v1.Id, (await Later(db).GetSalesReportAsync(before.Id, default)).AgreementId);
        Assert.Equal(v1Price.Id, (await Later(db).GetSalesReportAsync(before.Id, default)).Lines.Single().PriceTermId);
    }

    [Fact]
    public async Task N4ARevisionCantStartInsideAPeriodAlreadyReportedUnderTheEarlierVersion()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        var v1 = await AgreementFrom(db, AugustFirst); var v1Price = await Price(db, v1.Id, AugustFirst);
        await ReceiveUnder(db, v1.Id, 10, "n4c");
        var reported = await Verified(db, ReportFor(v1.Id, "2026-08", 1, "N4-V1", [Sale(v1Price.Id, 3)]));
        Assert.Equal(AugustSixteenth, reported.PeriodEndExclusive);
        var s = Custody(db);
        var draft = await s.SaveAgreementAsync(AdminAccountId, null, Terms() with { EffectiveFrom = AugustTenth, SupersedesAgreementId = v1.Id }, null, default);
        var refused = await Assert.ThrowsAsync<ApiException>(() => s.AgreementActionAsync(OwnerAccountId, draft.Id, "approve", new(draft.ConcurrencyToken, "Test approval"), default));
        Assert.Equal(409, refused.StatusCode);
        Assert.Contains("16 Aug 2026", refused.Message);
        // Nothing was rewritten: v1 stays in force and its verified report keeps its dates.
        Assert.Equal("Active", (await db.ConsignmentAgreements.AsNoTracking().SingleAsync(x => x.Id == v1.Id)).Status.ToString());
        Assert.Equal(AugustSixteenth, (await Later(db).GetSalesReportAsync(reported.Id, default)).PeriodEndExclusive);
        // Starting the revision where reporting ends works.
        var next = await s.SaveAgreementAsync(AdminAccountId, null, Terms() with { EffectiveFrom = AugustSixteenth, SupersedesAgreementId = v1.Id }, null, default);
        await s.AgreementActionAsync(OwnerAccountId, next.Id, "approve", new(next.ConcurrencyToken, "Test approval"), default);
    }

    // --- N3 recovery ----------------------------------------------------------------

    /// <summary>What the migration does to a record that predates contributor history.</summary>
    private static Task MarkHistoryUnknown(MyPetLinkDbContext db, string table, Guid id) =>
        db.Database.ExecuteSqlRawAsync($"UPDATE {table} SET ContributorHistoryComplete = 0 WHERE Id = {{0}}", id);

    [Fact]
    public async Task N3NewRecordsHaveCompleteHistory()
    {
        await using var scope = await Database(4); await using var db = scope.NewContext();
        var a = await AgreementFrom(db, AugustFirst); var price = await Price(db, a.Id, AugustFirst);
        await ReceiveUnder(db, a.Id, 4, "n3n");
        var report = await Recorded(db, ReportFor(a.Id, "2026-08", 1, "N3-N", [Sale(price.Id, 1)]));
        Assert.True(price.ContributorHistoryComplete); Assert.True(report.ContributorHistoryComplete);
    }

    [Fact]
    public async Task N3APriceWithUnknownHistoryIsRecoveredByAddingItAgain()
    {
        await using var scope = await Database(4); await using var db = scope.NewContext(); await AddReviewer(db);
        var a = await AgreementFrom(db, AugustFirst); var s = Later(db);
        var old = await s.SavePriceTermAsync(AdminAccountId, null, new(a.Id, NfcVariantId, "Standard", null, 1.00m, AugustFirst, null, "PARTNER-PRICE-OK"), null, default);
        await MarkHistoryUnknown(db, "ConsignmentPriceTerms", old.Id);
        old = (await s.PriceTermsAsync(a.Id, default)).Single();
        Assert.False(old.ContributorHistoryComplete);
        foreach (var reviewer in new[] { ReviewerUser, OwnerAccountId, AdminAccountId })
            Assert.Equal("contributor_history_incomplete",
                (await Assert.ThrowsAsync<ApiException>(() => s.ApprovePriceTermAsync(reviewer, old.Id, new(old.ConcurrencyToken), default))).Code);
        // Recovery: withdraw it and add the price again; whoever adds it is its maker, so someone else approves.
        await s.WithdrawPriceTermAsync(OwnerAccountId, old.Id, new(old.ConcurrencyToken), default);
        var fresh = await s.SavePriceTermAsync(OwnerAccountId, null, new(a.Id, NfcVariantId, "Standard", null, 39.90m, AugustFirst, null, "PARTNER-PRICE-OK"), null, default);
        Assert.True(fresh.ContributorHistoryComplete);
        Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => s.ApprovePriceTermAsync(OwnerAccountId, fresh.Id, new(fresh.ConcurrencyToken), default))).StatusCode);
        Assert.Equal("Independent (Team)", (await s.ApprovePriceTermAsync(ReviewerUser, fresh.Id, new(fresh.ConcurrencyToken), default)).ReviewMode);
        // The unknown draft stays in history, withdrawn and unchanged.
        var kept = await db.ConsignmentPriceTerms.AsNoTracking().SingleAsync(t => t.Id == old.Id);
        Assert.Equal((ConsignmentPriceTermStatus.Withdrawn, 1.00m, false), (kept.Status, kept.UnitNetPrice, kept.ContributorHistoryComplete));
    }

    [Fact]
    public async Task N3UnknownHistoryCanOnlyBeSelfReviewedBySoloFounderWithEvidence()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        var a = await AgreementFrom(db, AugustFirst); var price = await Price(db, a.Id, AugustFirst);
        await ReceiveUnder(db, a.Id, 10, "n3s");
        var s = Later(db);
        var draft = await s.SavePriceTermAsync(OwnerAccountId, null, new(a.Id, NfcVariantId, "Promotion", "Opening", 34.90m, AugustFirst, AugustSixteenth, "PARTNER-PROMO-OK"), null, default);
        await MarkHistoryUnknown(db, "ConsignmentPriceTerms", draft.Id);
        var report = await Recorded(db, ReportFor(a.Id, "2026-08", 1, "N3-S", [Sale(price.Id, 2)]));
        await MarkHistoryUnknown(db, "ConsignmentSalesReports", report.Id);
        await SoloAccess(db); await SetMode(db);
        var solo = SoloLater(db);
        draft = (await solo.PriceTermsAsync(a.Id, default)).Single(t => t.Id == draft.Id);
        // Never independent: the founder must self-review, with the record's own evidence.
        Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => solo.ApprovePriceTermAsync(OwnerAccountId, draft.Id, new(draft.ConcurrencyToken), default))).StatusCode);
        await Assert.ThrowsAsync<ApiException>(() => solo.ApprovePriceTermAsync(AdminAccountId, draft.Id, new(draft.ConcurrencyToken), default));
        Assert.Equal("Self-reviewed (Solo)", (await solo.ApprovePriceTermAsync(AdminAccountId, draft.Id,
            new(draft.ConcurrencyToken, SelfReview: Attest("PARTNER-PROMO-OK")), default)).ReviewMode);
        report = await solo.GetSalesReportAsync(report.Id, default);
        Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => solo.VerifySalesReportAsync(OwnerAccountId, report.Id, new(report.ConcurrencyToken, AcknowledgeWarnings: true), default))).StatusCode);
        Assert.Equal("Self-reviewed (Solo)", (await solo.VerifySalesReportAsync(AdminAccountId, report.Id,
            new(report.ConcurrencyToken, SelfReview: Attest(report.EvidenceReference), AcknowledgeWarnings: true), default)).ReviewMode);
    }

    [Fact]
    public async Task N3AReportWithUnknownHistoryIsReEnteredFromEvidenceAndReversedOnce()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext(); await AddReviewer(db);
        var a = await AgreementFrom(db, AugustFirst); var price = await Price(db, a.Id, AugustFirst);
        await ReceiveUnder(db, a.Id, 10, "n3r");
        var s = Later(db);
        // A verified report from before contributor history was kept.
        var v1 = await Verified(db, ReportFor(a.Id, "2026-08", 1, "N3-R", [Sale(price.Id, 4)]));
        await MarkHistoryUnknown(db, "ConsignmentSalesReports", v1.Id);
        Assert.False((await s.GetSalesReportAsync(v1.Id, default)).ContributorHistoryComplete);
        // An ordinary correction inherits the unknown history, so nobody can verify it in Team Mode.
        var v2 = await Correct(db, await s.GetSalesReportAsync(v1.Id, default), ReportFor(a.Id, "2026-08", 1, "N3-R", [Sale(price.Id, 3)]));
        Assert.False(v2.ContributorHistoryComplete);
        Assert.Equal("contributor_history_incomplete", (await Assert.ThrowsAsync<ApiException>(() => s.VerifySalesReportAsync(ReviewerUser, v2.Id,
            new(v2.ConcurrencyToken, AcknowledgeWarnings: true), default))).Code);
        v2 = await s.DisputeSalesReportAsync(OwnerAccountId, v2.Id, new(v2.ConcurrencyToken, "History unknown, re-enter from evidence"), default);
        // Re-entering needs a reason and a report whose history is really unknown.
        await Assert.ThrowsAsync<ApiException>(() => s.ReenterSalesReportAsync(OwnerAccountId, v2.Id, new(v2.ConcurrencyToken, "short"), default));
        var v3 = await s.ReenterSalesReportAsync(OwnerAccountId, v2.Id, new(v2.ConcurrencyToken, "Partner re-sent the figures; earlier editors unknown"), default);
        Assert.Empty(v3.Lines); Assert.True(v3.ContributorHistoryComplete); Assert.Equal(3, v3.Version);
        v3 = await s.UpdateSalesReportAsync(AdminAccountId, v3.Id, v3.ConcurrencyToken, ReportFor(a.Id, "2026-08", 1, "N3-R", [Sale(price.Id, 3)]), default);
        v3 = await s.RecordSalesReportAsync(AdminAccountId, v3.Id, new(v3.ConcurrencyToken), default);
        // The re-enterer and the recorder are its makers; someone else verifies it as independent.
        foreach (var maker in new[] { OwnerAccountId, AdminAccountId })
            Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => s.VerifySalesReportAsync(maker, v3.Id, new(v3.ConcurrencyToken, AcknowledgeWarnings: true), default))).StatusCode);
        var verified = await s.VerifySalesReportAsync(ReviewerUser, v3.Id, new(v3.ConcurrencyToken, AcknowledgeWarnings: true), default);
        Assert.Equal("Independent (Team)", verified.ReviewMode);
        // v1's postings were reversed exactly once and every earlier version is history.
        Assert.Equal((7, 0, 3, 10, true), await Buckets(db));
        Assert.Equal(1, await db.ConsignmentStockLedgerEntries.CountAsync(e => e.EntryType == ConsignmentLedgerEntryTypes.Reversal));
        foreach (var old in new[] { v1.Id, v2.Id }) Assert.Equal("Superseded", (await s.GetSalesReportAsync(old, default)).Status);
        // A report whose history is complete is changed with Correct, not re-entered.
        var current = await s.GetSalesReportAsync(v3.Id, default);
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => s.ReenterSalesReportAsync(OwnerAccountId, v3.Id,
            new(current.ConcurrencyToken, "Trying to reset a complete history"), default))).StatusCode);
    }

    [Fact]
    public async Task N2ContributorRollbackGuardRefusesWhileHistoryExists()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(4); await using var db = scope.NewContext();
            var a = await AgreementFrom(db, AugustFirst); await Price(db, a.Id, AugustFirst);
            await ReleaseReferenceRollbackGuard(db, "20261018164233_HardenConsignmentSalesReporting");
            var blocked = await Assert.ThrowsAnyAsync<Exception>(() => db.GetService<IMigrator>().MigrateAsync("20261018164233_HardenConsignmentSalesReporting"));
            Assert.Contains("51047", blocked.ToString());
            db.ChangeTracker.Clear();
            // Downgrades aren't atomic: the empty stocktake and agreement-document migrations rolled back before 51047 refused.
            Assert.Equal(["20261019025050_AddConsignmentStocktakeAndCarryForward", "20261019060824_HardenConsignmentStocktakeReconciliation",
                AgreementDocumentsMigration, ReferencesMigration, CareCompletionIdempotencyMigration, DeliveryOrdersMigration, DocumentSignaturesMigration, SettlementsMigration, RecoveriesMigration], await db.Database.GetPendingMigrationsAsync());
            Assert.Equal(1, await db.ConsignmentPriceTerms.CountAsync());
            await db.Database.MigrateAsync();
            Assert.Empty(await db.Database.GetPendingMigrationsAsync());
        }
        finally { MigratedSchema.Value = false; }
    }
}
