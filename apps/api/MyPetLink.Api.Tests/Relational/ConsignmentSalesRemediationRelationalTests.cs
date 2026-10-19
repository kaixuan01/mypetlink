using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

// Regression tests for the Phase 1A independent review findings F1–F8. Each test
// asserts the invariant itself (balances, identities, limits), not just an error.
public sealed partial class ConsignmentRelationalTests
{
    private static readonly TimeSpan Myt = TimeSpan.FromHours(8);
    private static readonly DateTimeOffset AugustFirst = new(2026, 8, 1, 0, 0, 0, Myt);
    private static readonly DateTimeOffset AugustSixteenth = new(2026, 8, 16, 0, 0, 0, Myt);

    private static ConsignmentService At(MyPetLinkDbContext db, DateTimeOffset clock)
    {
        var audit = new AuditLogService(db, new HttpContextAccessor());
        return new(db, audit, new BusinessIdentityService(db, audit, new FixedClock(clock)), new DocumentNumberService(db), new FixedClock(clock));
    }

    /// <summary>An agreement starting on a period boundary, so report periods are never cut.</summary>
    private static async Task<ConsignmentAgreementResponse> AgreementFrom(MyPetLinkDbContext db, DateTimeOffset from, DateTimeOffset? to = null,
        Guid? supersedes = null)
    {
        var s = Custody(db);
        var a = await s.SaveAgreementAsync(AdminAccountId, null, Terms() with { EffectiveFrom = from, EffectiveTo = to, SupersedesAgreementId = supersedes }, null, default);
        return await s.AgreementActionAsync(OwnerAccountId, a.Id, "approve", new(a.ConcurrencyToken, "Test approval"), default);
    }

    private static async Task<ConsignmentDispatchResponse> ReceiveUnder(MyPetLinkDbContext db, Guid agreement, int quantity, string key)
    {
        var s = Custody(db);
        var d = await s.ReserveAsync(AdminAccountId, Reserve(agreement, quantity, key), default);
        d = await s.ActionAsync(AdminAccountId, d.Id, "dispatch", Action(d, "SHIP-" + key), default);
        return await s.ActionAsync(OwnerAccountId, d.Id, "receive", Action(d, "RX-" + key) with { Receipt = Receipt(d) }, default);
    }

    private static async Task<ConsignmentPriceTermResponse> Price(MyPetLinkDbContext db, Guid agreement, DateTimeOffset from, decimal price = 39.90m)
    {
        var s = Later(db);
        var draft = await s.SavePriceTermAsync(AdminAccountId, null, new(agreement, NfcVariantId, "Standard", null, price, from, null, "PARTNER-PRICE-OK"), null, default);
        return await s.ApprovePriceTermAsync(OwnerAccountId, draft.Id, new(draft.ConcurrencyToken), default);
    }

    private static SaveConsignmentSalesReportRequest ReportFor(Guid agreement, string month, int half, string reference,
        IReadOnlyList<ConsignmentSalesLineRequest> lines, string? key = null) =>
        new(agreement, BranchId, month, half, reference, ReportClock.AddDays(-1), "Summary", "WhatsApp summary", "WA EVIDENCE " + reference, null, lines, key);

    private static ConsignmentSalesLineRequest Refund(Guid term, int quantity, DateTimeOffset origin, int restock = 0, int unsellable = 0, decimal price = 39.90m) =>
        new(NfcVariantId, "Refund", term, price, quantity, origin, restock, unsellable, null,
            SealedReturnConfirmed: restock > 0, SealedReturnEvidence: restock > 0 ? "Shop photo shows the seal intact" : null);

    /// <summary>Far enough after every period these tests report, so only the rule under test can refuse.</summary>
    private static readonly DateTimeOffset LateClock = new(2026, 12, 20, 0, 0, 0, Myt);

    /// <summary>Create, record and verify (independently) a report; returns the verified report.</summary>
    private static async Task<ConsignmentSalesReportResponse> Verified(MyPetLinkDbContext db, SaveConsignmentSalesReportRequest request,
        DateTimeOffset? clock = null)
    {
        var s = At(db, clock ?? ReportClock);
        var draft = await s.CreateSalesReportAsync(AdminAccountId, request, default);
        var r = await s.RecordSalesReportAsync(AdminAccountId, draft.Id, new(draft.ConcurrencyToken), default);
        return await s.VerifySalesReportAsync(OwnerAccountId, r.Id, new(r.ConcurrencyToken, AcknowledgeWarnings: true), default);
    }

    private static async Task<ConsignmentSalesReportResponse> Correct(MyPetLinkDbContext db, ConsignmentSalesReportResponse original,
        SaveConsignmentSalesReportRequest values)
    {
        var s = Later(db);
        var current = await s.GetSalesReportAsync(original.Id, default);
        var draft = await s.CorrectSalesReportAsync(OwnerAccountId, original.Id, new(current.ConcurrencyToken, "Partner sent corrected figures"), default);
        draft = await s.UpdateSalesReportAsync(AdminAccountId, draft.Id, draft.ConcurrencyToken, values, default);
        return await s.RecordSalesReportAsync(AdminAccountId, draft.Id, new(draft.ConcurrencyToken), default);
    }

    private static async Task<(int Sellable, int Unsellable, int Sold, int Custody, bool Balanced)> Buckets(MyPetLinkDbContext db)
    {
        var p = await Position(db);
        return (p.Sellable, p.Unsellable, p.SoldUnidentified, p.CustodyUnits, p.TieOutBalanced);
    }

    // --- F1 -------------------------------------------------------------------------

    [Theory]
    [InlineData("AggregateSale")]
    [InlineData("NonSaleWithdrawal")]
    public async Task F1CorrectedHandoverKeepsOneLedgerIdentityThroughTrackingStartAndReversal(string attribution)
    {
        await using var scope = await Database(4); await using var db = scope.NewContext();
        var a = await AgreementFrom(db, AugustFirst); var price = await Price(db, a.Id, AugustFirst);
        var d = await ReceiveUnder(db, a.Id, 4, "f1");
        await Verified(db, ReportFor(a.Id, "2026-08", 1, "F1-A", [Sale(price.Id, 2)]));
        var s = Custody(db); var unit = d.Units[0].Id;
        d = await s.GetAsync(d.Id, false, default);
        d = await s.ActionAsync(AdminAccountId, d.Id, "external-handover", Action(d, "Tracker H1", [unit]) with {
            Handover = new("F1-H1", Now, false, null, null, null, null, attribution) }, default);
        var afterHandover = await Buckets(db); var entries = await db.ConsignmentStockLedgerEntries.CountAsync();
        var original = d.Units.Single(u => u.Id == unit).CurrentHandoverRecordId;
        d = await s.ActionAsync(AdminAccountId, d.Id, "correct-handover", Action(d, "Tracker H1 corrected", [unit]) with {
            Handover = new("F1-H2", Now, false, null, null, null, original) }, default);
        Assert.Equal(entries, await db.ConsignmentStockLedgerEntries.CountAsync());
        // Tracking start, and a retry of it, must recognise the corrected handover as already posted.
        await Later(db).StartStockTrackingAsync(AdminAccountId, new(BranchId, "Synthetic tracking start after a correction"), default);
        await Later(db).StartStockTrackingAsync(AdminAccountId, new(BranchId, "Synthetic tracking start retried again"), default);
        Assert.Equal(entries, await db.ConsignmentStockLedgerEntries.CountAsync());
        Assert.Equal(afterHandover, await Buckets(db));
        var handoverEntries = await db.ConsignmentStockLedgerEntries.Where(e => e.EntryType == ConsignmentLedgerEntryTypes.IdentifiedHandover).ToListAsync();
        Assert.Equal(original, Assert.Single(handoverEntries).SourceLineId);
        // Reversal undoes exactly the one original movement.
        d = await s.GetAsync(d.Id, false, default);
        d = await s.ActionAsync(AdminAccountId, d.Id, "reverse-handover", Action(d, "Tracker reversal", [unit]) with {
            Handover = new("F1-H3", Now, false, null, null, null, d.Units.Single(u => u.Id == unit).CurrentHandoverRecordId) }, default);
        var final = await Buckets(db);
        Assert.Equal((2, 0, 2, 4, true), final);
    }

    // --- F2 -------------------------------------------------------------------------

    [Fact]
    public async Task F2CorrectionCannotLeaveMoreVerifiedRefundsThanSales()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        var a = await AgreementFrom(db, AugustFirst); var price = await Price(db, a.Id, AugustFirst);
        await ReceiveUnder(db, a.Id, 10, "f2");
        var sales = await Verified(db, ReportFor(a.Id, "2026-08", 1, "F2-A", [Sale(price.Id, 6)]));
        // Five refunds where the customers keep the tags: a financial-only refund with no stock effect.
        await Verified(db, ReportFor(a.Id, "2026-08", 2, "F2-B", [Refund(price.Id, 5, AugustFirst)]));
        var correction = await Correct(db, sales, ReportFor(a.Id, "2026-08", 1, "F2-A", [Sale(price.Id, 1)]));
        Assert.Contains(correction.Issues, i => i.Contains("refund"));
        var refused = await Assert.ThrowsAsync<ApiException>(() => Later(db).VerifySalesReportAsync(OwnerAccountId, correction.Id, new(correction.ConcurrencyToken, AcknowledgeWarnings: true), default));
        Assert.Equal(400, refused.StatusCode);
        Assert.Equal("Verified", (await Later(db).GetSalesReportAsync(sales.Id, default)).Status);
        Assert.Equal("Recorded", (await Later(db).GetSalesReportAsync(correction.Id, default)).Status);
        Assert.Equal((4, 0, 6, 10, true), await Buckets(db));
        // Removing the sales line entirely is refused the same way.
        await Later(db).DisputeSalesReportAsync(OwnerAccountId, correction.Id, new(correction.ConcurrencyToken, "Correction removes refunded sales"), default);
    }

    [Fact]
    public async Task F2RemovedLinesPriceChangesAndCorrectionsOfCorrectionsKeepRefundsCovered()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        var a = await AgreementFrom(db, AugustFirst); var standard = await Price(db, a.Id, AugustFirst);
        var s = Later(db);
        var promoDraft = await s.SavePriceTermAsync(AdminAccountId, null, new(a.Id, NfcVariantId, "Promotion", "Opening", 34.90m, AugustFirst, AugustSixteenth, "PARTNER-PROMO"), null, default);
        var promo = await s.ApprovePriceTermAsync(OwnerAccountId, promoDraft.Id, new(promoDraft.ConcurrencyToken), default);
        await ReceiveUnder(db, a.Id, 10, "f2b");
        var v1 = await Verified(db, ReportFor(a.Id, "2026-08", 1, "F2-P", [Sale(standard.Id, 4), Sale(promo.Id, 2, 34.90m)]));
        // Both promotion buyers came back: one sealed package restocked, one opened.
        await Verified(db, ReportFor(a.Id, "2026-08", 2, "F2-R", [Refund(promo.Id, 2, AugustFirst, restock: 1, unsellable: 1, price: 34.90m)]));
        var settled = await Buckets(db);
        Assert.Equal((5, 1, 4, 10, true), settled);

        // Removing the promotion line, or moving those sales to the standard price, leaves the refunds uncovered.
        var v2 = await Correct(db, v1, ReportFor(a.Id, "2026-08", 1, "F2-P", [Sale(standard.Id, 6)]));
        Assert.Contains(v2.Issues, i => i.Contains("refund"));
        await Assert.ThrowsAsync<ApiException>(() => s.VerifySalesReportAsync(OwnerAccountId, v2.Id, new(v2.ConcurrencyToken, AcknowledgeWarnings: true), default));
        Assert.Equal(settled, await Buckets(db));
        v2 = await s.DisputeSalesReportAsync(OwnerAccountId, v2.Id, new(v2.ConcurrencyToken, "Moves refunded promotion sales away"), default);

        // A correction of the disputed correction replaces the verified original once it is verified.
        var v3 = await Correct(db, v2, ReportFor(a.Id, "2026-08", 1, "F2-P", [Sale(standard.Id, 4), Sale(promo.Id, 3, 34.90m)]));
        Assert.Empty(v3.Issues);
        await s.VerifySalesReportAsync(OwnerAccountId, v3.Id, new(v3.ConcurrencyToken, AcknowledgeWarnings: true), default);
        Assert.Equal("Superseded", (await s.GetSalesReportAsync(v1.Id, default)).Status);
        Assert.Equal("Superseded", (await s.GetSalesReportAsync(v2.Id, default)).Status);
        Assert.Equal((4, 1, 5, 10, true), await Buckets(db));

        // A further correction that drops promotion sales below the two refunds is refused.
        var v4 = await Correct(db, await s.GetSalesReportAsync(v3.Id, default), ReportFor(a.Id, "2026-08", 1, "F2-P", [Sale(standard.Id, 4), Sale(promo.Id, 1, 34.90m)]));
        Assert.Contains(v4.Issues, i => i.Contains("refund"));
        await Assert.ThrowsAsync<ApiException>(() => s.VerifySalesReportAsync(OwnerAccountId, v4.Id, new(v4.ConcurrencyToken, AcknowledgeWarnings: true), default));
        Assert.Equal("Verified", (await s.GetSalesReportAsync(v3.Id, default)).Status);
        Assert.Equal((4, 1, 5, 10, true), await Buckets(db));
    }

    // --- F3 -------------------------------------------------------------------------

    [Fact]
    public async Task F3ContributionSurvivesDisablingAndReEnablingTheEditor()
    {
        await using var scope = await Database(4); await using var db = scope.NewContext(); await AddReviewer(db);
        var a = await AgreementFrom(db, AugustFirst); var s = Later(db);
        var draft = await s.SavePriceTermAsync(OwnerAccountId, null, new(a.Id, NfcVariantId, "Standard", null, 39.90m, AugustFirst, null, "PARTNER-PRICE-OK"), null, default);
        draft = await s.SavePriceTermAsync(ReviewerUser, draft.Id, new(a.Id, NfcVariantId, "Standard", null, 41.90m, AugustFirst, null, "PARTNER-PRICE-OK"), draft.ConcurrencyToken, default);
        var reviewer = await db.AdminUsers.SingleAsync(x => x.Id == ReviewerAdmin);
        reviewer.IsActive = false; await db.SaveChangesAsync();
        reviewer.IsActive = true; await db.SaveChangesAsync();
        await Assert.ThrowsAsync<ApiException>(() => s.ApprovePriceTermAsync(ReviewerUser, draft.Id, new(draft.ConcurrencyToken), default));
        await Assert.ThrowsAsync<ApiException>(() => s.ApprovePriceTermAsync(OwnerAccountId, draft.Id, new(draft.ConcurrencyToken), default));
        var approved = await s.ApprovePriceTermAsync(AdminAccountId, draft.Id, new(draft.ConcurrencyToken), default);
        Assert.Equal("Independent (Team)", approved.ReviewMode);
    }

    [Fact]
    public async Task F3PriceEditorCannotApproveTheirOwnChangeAsIndependent()
    {
        await using var scope = await Database(4); await using var db = scope.NewContext(); await AddReviewer(db);
        var a = await AgreementFrom(db, AugustFirst); var s = Later(db);
        var draft = await s.SavePriceTermAsync(AdminAccountId, null, new(a.Id, NfcVariantId, "Promotion", "Opening", 34.90m, AugustFirst, AugustSixteenth, "PARTNER-PROMO"), null, default);
        draft = await s.SavePriceTermAsync(ReviewerUser, draft.Id, new(a.Id, NfcVariantId, "Promotion", "Opening", 1m, AugustFirst, AugustSixteenth, "PARTNER-PROMO"), draft.ConcurrencyToken, default);
        var refused = await Assert.ThrowsAsync<ApiException>(() => s.ApprovePriceTermAsync(ReviewerUser, draft.Id, new(draft.ConcurrencyToken), default));
        Assert.Equal(403, refused.StatusCode);
        Assert.Equal("Draft", (await s.PriceTermsAsync(a.Id, default)).Single().Status);
        var approved = await s.ApprovePriceTermAsync(OwnerAccountId, draft.Id, new(draft.ConcurrencyToken), default);
        Assert.Equal("Independent (Team)", approved.ReviewMode);
    }

    [Fact]
    public async Task F3ReportEditorCannotVerifyAReportSomeoneElseRecorded()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext(); await AddReviewer(db);
        var a = await AgreementFrom(db, AugustFirst); var price = await Price(db, a.Id, AugustFirst);
        await ReceiveUnder(db, a.Id, 10, "f3");
        var s = Later(db);
        var draft = await s.CreateSalesReportAsync(AdminAccountId, ReportFor(a.Id, "2026-08", 1, "F3-A", [Sale(price.Id, 2)]), default);
        draft = await s.UpdateSalesReportAsync(ReviewerUser, draft.Id, draft.ConcurrencyToken, ReportFor(a.Id, "2026-08", 1, "F3-A", [Sale(price.Id, 3)]), default);
        var recorded = await s.RecordSalesReportAsync(OwnerAccountId, draft.Id, new(draft.ConcurrencyToken), default);
        var refused = await Assert.ThrowsAsync<ApiException>(() => s.VerifySalesReportAsync(ReviewerUser, recorded.Id, new(recorded.ConcurrencyToken, AcknowledgeWarnings: true), default));
        Assert.Equal(403, refused.StatusCode);
        Assert.Empty(db.ConsignmentStockLedgerEntries.Where(e => e.EntryType == ConsignmentLedgerEntryTypes.Sale));
    }

    [Fact]
    public async Task F3NoOpSaveDoesNotMakeAnOperatorAContributor()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext(); await AddReviewer(db);
        var a = await AgreementFrom(db, AugustFirst); var price = await Price(db, a.Id, AugustFirst);
        await ReceiveUnder(db, a.Id, 10, "f3n");
        var s = Later(db); var values = ReportFor(a.Id, "2026-08", 1, "F3-N", [Sale(price.Id, 2)]);
        var draft = await s.CreateSalesReportAsync(AdminAccountId, values, default);
        draft = await s.UpdateSalesReportAsync(ReviewerUser, draft.Id, draft.ConcurrencyToken, values, default);
        var recorded = await s.RecordSalesReportAsync(AdminAccountId, draft.Id, new(draft.ConcurrencyToken), default);
        var verified = await s.VerifySalesReportAsync(ReviewerUser, recorded.Id, new(recorded.ConcurrencyToken, AcknowledgeWarnings: true), default);
        Assert.Equal("Independent (Team)", verified.ReviewMode);
    }

    // --- F4 -------------------------------------------------------------------------

    [Theory]
    [InlineData("2026-08", 1, "2026-08-16T00:00:00+08:00")]
    [InlineData("2026-08", 2, "2026-09-01T00:00:00+08:00")]
    [InlineData("2028-02", 2, "2028-03-01T00:00:00+08:00")]
    public async Task F4ReportsCannotBeVerifiedBeforeTheirExclusiveMalaysiaEnd(string month, int half, string end)
    {
        await using var scope = await Database(4); await using var db = scope.NewContext();
        var a = await AgreementFrom(db, AugustFirst); var price = await Price(db, a.Id, AugustFirst);
        await ReceiveUnder(db, a.Id, 4, "f4");
        var boundary = DateTimeOffset.Parse(end, System.Globalization.CultureInfo.InvariantCulture);
        var request = ReportFor(a.Id, month, half, "F4-" + month + half, [Sale(price.Id, 1)]) with { ReportReceivedAt = boundary.AddHours(-2) };
        var early = At(db, boundary.AddTicks(-1));
        var draft = await early.CreateSalesReportAsync(AdminAccountId, request, default);
        Assert.Equal(boundary, draft.PeriodEndExclusive);
        var recorded = await early.RecordSalesReportAsync(AdminAccountId, draft.Id, new(draft.ConcurrencyToken), default);
        Assert.Contains(recorded.Issues, i => i.Contains("hasn't ended"));
        await Assert.ThrowsAsync<ApiException>(() => early.VerifySalesReportAsync(OwnerAccountId, recorded.Id, new(recorded.ConcurrencyToken, AcknowledgeWarnings: true), default));
        var onTime = await At(db, boundary).VerifySalesReportAsync(OwnerAccountId, recorded.Id, new(recorded.ConcurrencyToken, AcknowledgeWarnings: true), default);
        Assert.Equal("Verified", onTime.Status);
    }

    // --- F5 -------------------------------------------------------------------------

    [Fact]
    public async Task F5SamePeriodSalesAndSealedReturnVerifyWhenTheFinalPositionIsValid()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        var a = await AgreementFrom(db, AugustFirst); var price = await Price(db, a.Id, AugustFirst);
        await ReceiveUnder(db, a.Id, 10, "f5a");
        var report = await Recorded(db, ReportFor(a.Id, "2026-08", 1, "F5-A", [Sale(price.Id, 5), Refund(price.Id, 1, AugustFirst, restock: 1)]));
        Assert.Empty(report.Issues);
        await Later(db).VerifySalesReportAsync(OwnerAccountId, report.Id, new(report.ConcurrencyToken, AcknowledgeWarnings: true), default);
        Assert.Equal((6, 0, 4, 10, true), await Buckets(db));
    }

    [Fact]
    public async Task F5CorrectionAfterIdentifiedHandoversSucceedsWhenTheNetIsValid()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        var a = await AgreementFrom(db, AugustFirst); var price = await Price(db, a.Id, AugustFirst);
        var d = await ReceiveUnder(db, a.Id, 10, "f5b");
        var sales = await Verified(db, ReportFor(a.Id, "2026-08", 1, "F5-B", [Sale(price.Id, 3)]));
        var s = Custody(db);
        foreach (var (unit, i) in d.Units.Take(2).Select((u, i) => (u.Id, i)))
        {
            d = await s.GetAsync(d.Id, false, default);
            await s.ActionAsync(AdminAccountId, d.Id, "external-handover", Action(d, "Tracker", [unit]) with {
                Handover = new("F5-H" + i, Now, false, null, null, null, null, "AggregateSale") }, default);
        }
        var correction = await Correct(db, sales, ReportFor(a.Id, "2026-08", 1, "F5-B", [Sale(price.Id, 2)]));
        Assert.Empty(correction.Issues);
        await Later(db).VerifySalesReportAsync(OwnerAccountId, correction.Id, new(correction.ConcurrencyToken, AcknowledgeWarnings: true), default);
        Assert.Equal((8, 0, 0, 8, true), await Buckets(db));
    }

    [Fact]
    public async Task F5AnInvalidFinalPositionRollsBackEverything()
    {
        await using var scope = await Database(4); await using var db = scope.NewContext();
        var a = await AgreementFrom(db, AugustFirst); var price = await Price(db, a.Id, AugustFirst);
        var d = await ReceiveUnder(db, a.Id, 4, "f5c");
        var sales = await Verified(db, ReportFor(a.Id, "2026-08", 1, "F5-C", [Sale(price.Id, 1)]));
        // All three remaining shelf packages go back to MyPetLink, so a correction to 2 sales is impossible.
        var s = Custody(db);
        d = await s.GetAsync(d.Id, false, default);
        await s.ActionAsync(AdminAccountId, d.Id, "return", Action(d, "RETURN-ALL", d.Units.Skip(1).Select(u => u.Id).ToArray()), default);
        var before = (await db.ConsignmentStockLedgerEntries.CountAsync(), await Buckets(db));
        var correction = await Correct(db, sales, ReportFor(a.Id, "2026-08", 1, "F5-C", [Sale(price.Id, 2)]));
        await Assert.ThrowsAsync<ApiException>(() => Later(db).VerifySalesReportAsync(OwnerAccountId, correction.Id, new(correction.ConcurrencyToken, AcknowledgeWarnings: true), default));
        Assert.Equal(before, (await db.ConsignmentStockLedgerEntries.CountAsync(), await Buckets(db)));
        Assert.Equal("Verified", (await Later(db).GetSalesReportAsync(sales.Id, default)).Status);
    }

    // --- F6 -------------------------------------------------------------------------

    [Fact]
    public async Task F6RefundInARenewedVersionUsesTheOriginalSaleAndASplitPeriodStart()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        var split = new DateTimeOffset(2026, 8, 10, 0, 0, 0, Myt);
        var v1 = await AgreementFrom(db, AugustFirst, split);
        var v1Price = await Price(db, v1.Id, AugustFirst);
        await ReceiveUnder(db, v1.Id, 10, "f6");
        var v2 = await AgreementFrom(db, split, null, v1.Id);
        var v2Price = await Price(db, v2.Id, split, 42m);
        var firstPart = await Verified(db, ReportFor(v1.Id, "2026-08", 1, "F6-A", [Sale(v1Price.Id, 3)]));
        Assert.Equal(AugustFirst, firstPart.PeriodStart); Assert.Equal(split, firstPart.PeriodEndExclusive);
        var secondPart = await Verified(db, ReportFor(v2.Id, "2026-08", 1, "F6-B", [Sale(v2Price.Id, 2, 42m)]));
        Assert.Equal(split, secondPart.PeriodStart);
        // A refund under v2 of a sale made under v1, at v1's price, and one of a split-period v2 sale.
        var refunds = await Verified(db, ReportFor(v2.Id, "2026-08", 2, "F6-C",
            [Refund(v1Price.Id, 1, AugustFirst, restock: 1), Refund(v2Price.Id, 1, split, price: 42m)]));
        Assert.Equal("Verified", refunds.Status);
        Assert.Equal((6, 0, 4, 10, true), await Buckets(db));
    }

    // --- F7 -------------------------------------------------------------------------

    [Fact]
    public async Task F7RefundsMustMatchVerifiedSalesInTheirStatedOriginPeriod()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        var a = await AgreementFrom(db, AugustFirst); var price = await Price(db, a.Id, AugustFirst);
        await ReceiveUnder(db, a.Id, 10, "f7");
        await Verified(db, ReportFor(a.Id, "2026-08", 1, "F7-A", [Sale(price.Id, 2)]), LateClock);
        await Verified(db, ReportFor(a.Id, "2026-08", 2, "F7-B", [Sale(price.Id, 3)]), LateClock);
        // Three refunds, restocked, claimed against the first half, which only had two sales.
        await AssertRefundRefused(db, ReportFor(a.Id, "2026-09", 1, "F7-C", [Refund(price.Id, 3, AugustFirst, restock: 3)]));
        // A refund naming a period with no verified sales report.
        await AssertRefundRefused(db, ReportFor(a.Id, "2026-09", 2, "F7-D", [Refund(price.Id, 1, new DateTimeOffset(2026, 7, 16, 0, 0, 0, Myt))]));
        // A refund naming a later period than the report itself.
        await AssertRefundRefused(db, ReportFor(a.Id, "2026-10", 1, "F7-E", [Refund(price.Id, 1, new DateTimeOffset(2026, 10, 16, 0, 0, 0, Myt))]));
        // Two refunds against the first half fit; a third later refund against it does not.
        await Verified(db, ReportFor(a.Id, "2026-10", 2, "F7-F", [Refund(price.Id, 2, AugustFirst)]), LateClock);
        await AssertRefundRefused(db, ReportFor(a.Id, "2026-11", 1, "F7-G", [Refund(price.Id, 1, AugustFirst)]));
        Assert.Equal(2, await db.ConsignmentSalesReportLines.Where(l => l.LineType == ConsignmentSalesLineType.Refund
            && l.SalesReport.Status == ConsignmentSalesReportStatus.Verified).SumAsync(l => l.Quantity));
        Assert.Equal((5, 0, 5, 10, true), await Buckets(db));
    }

    /// <summary>The refund is refused when saved or at verification, and nothing reaches the ledger.</summary>
    private static async Task AssertRefundRefused(MyPetLinkDbContext db, SaveConsignmentSalesReportRequest request)
    {
        var before = await db.ConsignmentStockLedgerEntries.CountAsync();
        var s = At(db, LateClock);
        try
        {
            var draft = await s.CreateSalesReportAsync(AdminAccountId, request, default);
            var r = await s.RecordSalesReportAsync(AdminAccountId, draft.Id, new(draft.ConcurrencyToken), default);
            Assert.NotEmpty(r.Issues);
            await Assert.ThrowsAsync<ApiException>(() => s.VerifySalesReportAsync(OwnerAccountId, r.Id, new(r.ConcurrencyToken, AcknowledgeWarnings: true), default));
            await s.DisputeSalesReportAsync(OwnerAccountId, r.Id, new((await s.GetSalesReportAsync(r.Id, default)).ConcurrencyToken, "Refund does not match a verified sale"), default);
        }
        catch (ApiException e) when (e.StatusCode == 400) { /* Refused when saved. */ }
        Assert.Equal(before, await db.ConsignmentStockLedgerEntries.CountAsync());
    }

    // --- F8 -------------------------------------------------------------------------

    [Fact]
    public async Task F8ChangedRetryNeverReturnsTheOldQuantitiesSilently()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        var a = await AgreementFrom(db, AugustFirst); var price = await Price(db, a.Id, AugustFirst);
        await ReceiveUnder(db, a.Id, 10, "f8");
        var s = Later(db);
        var first = await s.CreateSalesReportAsync(AdminAccountId, ReportFor(a.Id, "2026-08", 1, "F8-A", [Sale(price.Id, 3)], key: "F8-KEY"), default);
        var identical = await s.CreateSalesReportAsync(AdminAccountId, ReportFor(a.Id, "2026-08", 1, "F8-A", [Sale(price.Id, 3)], key: "F8-KEY"), default);
        Assert.Equal(first.Id, identical.Id); Assert.Equal(3, identical.UnitsSold);
        // The response to the first attempt was lost; the operator changed 3 to 7 and retried.
        var changed = await s.CreateSalesReportAsync(AdminAccountId, ReportFor(a.Id, "2026-08", 1, "F8-A", [Sale(price.Id, 7)], key: "F8-KEY"), default);
        Assert.Equal(first.Id, changed.Id); Assert.Equal(7, changed.UnitsSold);
        var recorded = await s.RecordSalesReportAsync(AdminAccountId, changed.Id, new(changed.ConcurrencyToken), default);
        Assert.Equal(7, recorded.UnitsSold);
        // Once recorded, a changed retry is a clear conflict, never a silent replay.
        var conflict = await Assert.ThrowsAsync<ApiException>(() => s.CreateSalesReportAsync(AdminAccountId,
            ReportFor(a.Id, "2026-08", 1, "F8-A", [Sale(price.Id, 9)], key: "F8-KEY"), default));
        Assert.Equal(409, conflict.StatusCode);
        Assert.Equal("submission_changed", conflict.Code);
        Assert.Equal(7, (await s.GetSalesReportAsync(first.Id, default)).UnitsSold);
    }

    [Fact]
    public async Task F8ChangedRetryAfterSomeoneElseEditedTheDraftIsAConflict()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext(); await AddReviewer(db);
        var a = await AgreementFrom(db, AugustFirst); var price = await Price(db, a.Id, AugustFirst);
        await ReceiveUnder(db, a.Id, 10, "f8b");
        var s = Later(db);
        var first = await s.CreateSalesReportAsync(AdminAccountId, ReportFor(a.Id, "2026-08", 1, "F8-B", [Sale(price.Id, 3)], key: "F8-KEY-B"), default);
        await s.UpdateSalesReportAsync(ReviewerUser, first.Id, first.ConcurrencyToken, ReportFor(a.Id, "2026-08", 1, "F8-B", [Sale(price.Id, 4)]), default);
        var conflict = await Assert.ThrowsAsync<ApiException>(() => s.CreateSalesReportAsync(AdminAccountId,
            ReportFor(a.Id, "2026-08", 1, "F8-B", [Sale(price.Id, 5)], key: "F8-KEY-B"), default));
        Assert.Equal("submission_changed", conflict.Code);
        Assert.Equal(4, (await s.GetSalesReportAsync(first.Id, default)).UnitsSold);
        // Another admin can't take over someone else's submission reference either.
        await Assert.ThrowsAsync<ApiException>(() => s.CreateSalesReportAsync(ReviewerUser,
            ReportFor(a.Id, "2026-08", 1, "F8-B", [Sale(price.Id, 6)], key: "F8-KEY-B"), default));
    }

    // --- Additional review items ------------------------------------------------------

    [Fact]
    public async Task ReviewLogExportNamesTheSubjectOfEachDecision()
    {
        await using var scope = await Database(4); await using var db = scope.NewContext();
        var a = await AgreementFrom(db, AugustFirst); var price = await Price(db, a.Id, AugustFirst);
        var csv = System.Text.Encoding.UTF8.GetString(await Later(db).ReviewLogCsvAsync(AdminAccountId, Now.AddDays(-1), Now.AddDays(60), default));
        var lines = csv.TrimStart('﻿').Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries);
        Assert.EndsWith("\"Subject type\",\"Subject ID\"", lines[0]);
        Assert.Contains(lines, l => l.Contains("approve-price-term") && l.EndsWith($"\"ConsignmentPriceTerm\",\"{price.Id}\""));
        var review = await db.ConsignmentReviewEvents.AsNoTracking().SingleAsync(e => e.Action == "approve-price-term");
        Assert.Equal(("ConsignmentPriceTerm", (Guid?)price.Id), (review.SubjectType, review.SubjectId));
    }

    [Fact]
    public async Task RestockedReturnsNeedAPersistedSealedConfirmation()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        var a = await AgreementFrom(db, AugustFirst); var price = await Price(db, a.Id, AugustFirst);
        await ReceiveUnder(db, a.Id, 10, "seal");
        await Verified(db, ReportFor(a.Id, "2026-08", 1, "SEAL-A", [Sale(price.Id, 3)]));
        var s = Later(db);
        var unconfirmed = ReportFor(a.Id, "2026-08", 2, "SEAL-B", [new(NfcVariantId, "Refund", price.Id, 39.90m, 1, AugustFirst, 1, 0)]);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => s.CreateSalesReportAsync(AdminAccountId, unconfirmed, default))).StatusCode);
        var noEvidence = unconfirmed with { Lines = [new(NfcVariantId, "Refund", price.Id, 39.90m, 1, AugustFirst, 1, 0, null, true, " ")] };
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => s.CreateSalesReportAsync(AdminAccountId, noEvidence, default))).StatusCode);
        var recorded = await Recorded(db, ReportFor(a.Id, "2026-08", 2, "SEAL-B", [Refund(price.Id, 1, AugustFirst, restock: 1)]));
        var line = Assert.Single(recorded.Lines);
        Assert.True(line.SealedReturnConfirmed); Assert.Equal("Shop photo shows the seal intact", line.SealedReturnEvidence);
        // A line restocked before confirmation existed keeps an honest label and can't be verified as it is.
        await db.Database.ExecuteSqlRawAsync("UPDATE ConsignmentSalesReportLines SET SealedReturnConfirmed = 0, " +
            "SealedReturnEvidence = N'Entered before sealed-return confirmation was required' WHERE RestockableQuantity > 0");
        var legacy = await s.GetSalesReportAsync(recorded.Id, default);
        Assert.Contains(legacy.Issues, i => i.Contains("sealed"));
        await Assert.ThrowsAsync<ApiException>(() => s.VerifySalesReportAsync(OwnerAccountId, legacy.Id, new(legacy.ConcurrencyToken, AcknowledgeWarnings: true), default));
        Assert.Equal((7, 0, 3, 10, true), await Buckets(db));
    }

    [Fact]
    public async Task MixedTrackingInOneDeliveryIsDecidedPerUnit()
    {
        await using var scope = await Database(4); await using var db = scope.NewContext();
        var a = await AgreementFrom(db, AugustFirst); var price = await Price(db, a.Id, AugustFirst);
        var d = await ReceiveUnder(db, a.Id, 4, "mixed");
        await Verified(db, ReportFor(a.Id, "2026-08", 1, "MIX-A", [Sale(price.Id, 1)]));
        var legacyUnit = d.Units[0].Id; var trackedUnit = d.Units[1].Id;
        // One unit was received before tracking began (simulated in this triggerless fixture).
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM ConsignmentStockLedgerEntries WHERE SourceLineId = {legacyUnit}");
        var s = Custody(db);
        d = await s.GetAsync(d.Id, false, default);
        Assert.True(d.StockTracked);
        Assert.False(d.Units.Single(u => u.Id == legacyUnit).StockTracked);
        Assert.True(d.Units.Single(u => u.Id == trackedUnit).StockTracked);
        ConsignmentActionRequest Attributed(ConsignmentDispatchResponse current, string reference, params Guid[] units) =>
            Action(current, "Tracker " + reference, units) with { Handover = new(reference, Now, false, null, null, null, null, "AggregateSale") };
        ConsignmentActionRequest Priced(ConsignmentDispatchResponse current, string reference, params Guid[] units) =>
            Action(current, "Tracker " + reference, units) with { Handover = new(reference, Now, true, 39.90m, 0m, null, null) };
        // A selection mixing both is refused as a whole: nothing is recorded for either unit.
        await Assert.ThrowsAsync<ApiException>(() => s.ActionAsync(AdminAccountId, d.Id, "external-handover", Attributed(d, "MIX-1", legacyUnit, trackedUnit), default));
        Assert.Empty(db.ConsignmentHandoverRecords);
        await Assert.ThrowsAsync<ApiException>(() => s.ActionAsync(AdminAccountId, d.Id, "external-handover", Attributed(d, "MIX-2", legacyUnit), default));
        await Assert.ThrowsAsync<ApiException>(() => s.ActionAsync(AdminAccountId, d.Id, "external-handover", Priced(d, "MIX-3", trackedUnit), default));
        d = await s.ActionAsync(AdminAccountId, d.Id, "external-handover", Priced(d, "MIX-4", legacyUnit), default);
        d = await s.ActionAsync(AdminAccountId, d.Id, "external-handover", Attributed(d, "MIX-5", trackedUnit), default);
        Assert.Equal(2, d.ExternalHandovers);
        // The tracked unit left sold stock; the legacy unit stays outside the ledger until tracking starts.
        Assert.Equal(1, await db.ConsignmentStockLedgerEntries.CountAsync(e => e.EntryType == ConsignmentLedgerEntryTypes.IdentifiedHandover));
    }

    [Fact]
    public async Task LegacyCorrectedHandoverJoinsTrackingOnceAndReversesCleanly()
    {
        await using var scope = await Database(4); await using var db = scope.NewContext();
        var a = await AgreementFrom(db, AugustFirst);
        var d = await ReceiveUnder(db, a.Id, 4, "legacy");
        await db.Database.ExecuteSqlRawAsync("DELETE FROM ConsignmentStockLedgerEntries");
        var s = Custody(db); var unit = d.Units[0].Id;
        d = await s.ActionAsync(AdminAccountId, d.Id, "external-handover", Action(d, "Legacy sale", [unit]) with {
            Handover = new("LEG-H1", Now, true, 39.90m, 0m, null, null) }, default);
        var original = d.Units.Single(u => u.Id == unit).CurrentHandoverRecordId;
        d = await s.ActionAsync(AdminAccountId, d.Id, "correct-handover", Action(d, "Legacy price fix", [unit]) with {
            Handover = new("LEG-H2", Now, true, 38.90m, 0m, null, original) }, default);
        Assert.Empty(db.ConsignmentStockLedgerEntries);
        await Later(db).StartStockTrackingAsync(AdminAccountId, new(BranchId, "Bring earlier deliveries into tracking"), default);
        await Later(db).StartStockTrackingAsync(AdminAccountId, new(BranchId, "Bring earlier deliveries into tracking"), default);
        var handover = Assert.Single(await db.ConsignmentStockLedgerEntries.Where(e => e.EntryType == ConsignmentLedgerEntryTypes.IdentifiedHandover).ToListAsync());
        Assert.Equal(original, handover.SourceLineId); Assert.Equal(ConsignmentLedgerSources.Handover, handover.SourceType);
        Assert.Equal((3, 0, 0, 3, true), await Buckets(db));
        d = await s.GetAsync(d.Id, false, default);
        d = await s.ActionAsync(AdminAccountId, d.Id, "reverse-handover", Action(d, "Legacy entry was wrong", [unit]) with {
            Handover = new("LEG-H3", Now, false, null, null, null, d.Units.Single(u => u.Id == unit).CurrentHandoverRecordId) }, default);
        Assert.Equal((4, 0, 0, 4, true), await Buckets(db));
        Assert.Equal(1, await db.ConsignmentStockLedgerEntries.CountAsync(e => e.EntryType == ConsignmentLedgerEntryTypes.Reversal));
    }
}
