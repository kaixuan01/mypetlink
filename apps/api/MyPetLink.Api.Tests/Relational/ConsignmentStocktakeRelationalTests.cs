using System.Globalization;
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

// Phase 1B: monthly stocktake, period close and carry forward, and discrepancy investigation,
// all on the Phase 1A SKU ledger. No test here may see a Tag Code assigned to an aggregate figure.
public sealed partial class ConsignmentRelationalTests
{
    private const string StocktakeMigration = "20261019025050_AddConsignmentStocktakeAndCarryForward";

    /// <summary>A count taken at 9 pm on the count day, Malaysia time.</summary>
    private static SaveConsignmentStocktakeRequest Count(string date, int sellable, int unsellable = 0, string? key = null) =>
        new(BranchId, date, "Shop owner", "Count sheet photo", "Count sheet photo " + date, null, [new(NfcVariantId, sellable, unsellable)], key,
            CountedAt: CountTime(date, 21));

    private static DateTimeOffset CountTime(string date, int hour, int minute = 0) =>
        DateTimeOffset.ParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture).Date is var day
            ? new DateTimeOffset(day.Year, day.Month, day.Day, 0, 0, 0, Myt).AddHours(hour).AddMinutes(minute) : default;

    /// <summary>Closing with the findings exactly as the reviewer was shown them.</summary>
    private static ConsignmentReviewRequest Close(ConsignmentStocktakeResponse s, ConsignmentSelfReview? selfReview = null) =>
        new(s.ConcurrencyToken, SelfReview: selfReview, AcknowledgeWarnings: true, ReviewedFingerprint: s.ReviewFingerprint);

    /// <summary>Counted and recorded by the operator; still open, nothing in the books has changed.</summary>
    private static async Task<ConsignmentStocktakeResponse> RecordedCount(MyPetLinkDbContext db, SaveConsignmentStocktakeRequest request, DateTimeOffset? clock = null)
    {
        var s = At(db, clock ?? ReportClock);
        var draft = await s.CreateStocktakeAsync(AdminAccountId, request, default);
        return await s.RecordStocktakeAsync(AdminAccountId, draft.Id, new(draft.ConcurrencyToken), default);
    }

    /// <summary>Recorded by the operator and closed by an independent reviewer.</summary>
    private static async Task<ConsignmentStocktakeResponse> ClosedCount(MyPetLinkDbContext db, SaveConsignmentStocktakeRequest request, DateTimeOffset? clock = null)
    {
        var recorded = await RecordedCount(db, request, clock);
        return await At(db, clock ?? ReportClock).ApproveStocktakeAsync(OwnerAccountId, recorded.Id, Close(recorded), default);
    }

    private static async Task<(int Sellable, int Unsellable, int Investigation, int Sold, int Lost, int Custody, bool Balanced)> Ledger(MyPetLinkDbContext db)
    {
        var p = await Position(db);
        return (p.Sellable, p.Unsellable, p.Investigation, p.SoldUnidentified, p.LostUnidentified, p.CustodyUnits, p.TieOutBalanced);
    }

    /// <summary>Investigation holds exactly what open shortages say is missing.</summary>
    private static async Task AssertInvestigationMatchesOpenShortages(MyPetLinkDbContext db)
    {
        var open = await db.ConsignmentStockDiscrepancies.AsNoTracking().Where(d => d.Status == ConsignmentDiscrepancyStatus.Open
            && (d.Kind == ConsignmentDiscrepancyKind.Shortage || d.Kind == ConsignmentDiscrepancyKind.UnsellableShortage)).SumAsync(d => d.OpenQuantity);
        Assert.Equal(open, (await Position(db)).Investigation);
    }

    private static Task<ConsignmentDiscrepancyResponse> Resolve(MyPetLinkDbContext db, ConsignmentDiscrepancyResponse d, string outcome, int quantity,
        Guid? related = null, DateTimeOffset? clock = null) =>
        At(db, clock ?? ReportClock).ResolveDiscrepancyAsync(OwnerAccountId, d.Id, new(d.ConcurrencyToken, outcome, quantity,
            "Shop photo and owner message", "Checked with the shop owner today", related), default);

    private static async Task<ConsignmentDiscrepancyResponse> OpenDiscrepancy(MyPetLinkDbContext db, string kind) =>
        (await Later(db).DiscrepanciesAsync(BranchId, "Open", default)).Single(d => d.Kind == kind);

    /// <summary>10 tags received under an agreement from 1 Aug, with 3 sales verified for 1–15 Aug.</summary>
    private static async Task<(ConsignmentAgreementResponse Agreement, ConsignmentPriceTermResponse Price, ConsignmentDispatchResponse Dispatch)> Month(
        MyPetLinkDbContext db, string key)
    {
        var a = await AgreementFrom(db, AugustFirst); var price = await Price(db, a.Id, AugustFirst);
        var d = await ReceiveUnder(db, a.Id, 10, key);
        await Verified(db, ReportFor(a.Id, "2026-08", 1, key.ToUpperInvariant() + "-A", [Sale(price.Id, 3)]));
        return (a, price, d);
    }

    // --- Clean close and carry forward ---------------------------------------------------

    [Fact]
    public async Task AMatchingCountClosesTheMonthFreezesItAndCarriesForward()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        var (_, _, d) = await Month(db, "st-clean");
        var units = await db.ConsignmentUnits.AsNoTracking().Select(u => new { u.Id, u.Status, u.CurrentHandoverRecordId }).OrderBy(u => u.Id).ToListAsync();
        var expected = await Later(db).StocktakeExpectationAsync(BranchId, "2026-08-15", default);
        Assert.Equal((7, 0, 0), (expected.Lines.Single().ExpectedSellable, expected.Lines.Single().ExpectedUnsellable, expected.Lines.Single().BookInvestigation));
        var recorded = await RecordedCount(db, Count("2026-08-15", 7));
        Assert.Empty(recorded.Issues); Assert.Empty(recorded.Warnings);
        var before = await db.ConsignmentStockLedgerEntries.CountAsync();
        var closed = await Later(db).ApproveStocktakeAsync(OwnerAccountId, recorded.Id, new(recorded.ConcurrencyToken), default);
        Assert.Equal(("Approved", "Independent (Team)"), (closed.Status, closed.ReviewMode));
        var line = Assert.Single(closed.Lines);
        Assert.True(line.Frozen); Assert.Equal((7, 3, 7, 0), (line.BookSellable, line.BookSold, line.ClosingSellable, line.Shortage + line.Surplus));
        // Nothing moves, nothing is re-dispatched, no unit changes; the Summary report is corroborated.
        Assert.Equal(before, await db.ConsignmentStockLedgerEntries.CountAsync());
        Assert.Empty(db.ConsignmentStockDiscrepancies);
        Assert.Equal(units, await db.ConsignmentUnits.AsNoTracking().Select(u => new { u.Id, u.Status, u.CurrentHandoverRecordId }).OrderBy(u => u.Id).ToListAsync());
        Assert.Equal(1, await db.ConsignmentDispatches.CountAsync());
        Assert.True(await db.ConsignmentSalesReportLines.AllAsync(l => l.CorroboratedByStocktakeId == closed.Id));
        Assert.True(await db.ConsignmentReviewEvents.AnyAsync(e => e.SubjectType == "ConsignmentStocktake" && e.SubjectId == closed.Id));
        // The next month opens from the closing position.
        var next = await RecordedCount(db, Count("2026-08-31", 7));
        Assert.Equal(closed.Id, (await Later(db).ApproveStocktakeAsync(OwnerAccountId, next.Id, new(next.ConcurrencyToken), default)).PreviousStocktakeId);
        Assert.Equal((7, 0, 0, 3, 0, 10, true), await Ledger(db));
    }

    [Fact]
    public async Task CountsMustCloseASalesPeriodAndWaitForItsReports()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        var (a, price, _) = await Month(db, "st-gate");
        var s = Later(db);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => s.CreateStocktakeAsync(AdminAccountId, Count("2026-08-20", 7), default))).StatusCode);
        // An unverified report in the month blocks the close: counts are compared with verified sales only.
        await Recorded(db, ReportFor(a.Id, "2026-08", 2, "ST-GATE-B", [Sale(price.Id, 1)]));
        var recorded = await RecordedCount(db, Count("2026-08-31", 6));
        Assert.Contains(recorded.Issues, i => i.Contains("ST-GATE-B"));
        await Assert.ThrowsAsync<ApiException>(() => s.ApproveStocktakeAsync(OwnerAccountId, recorded.Id, Close(recorded), default));
        // One count in progress per branch.
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => s.CreateStocktakeAsync(AdminAccountId, Count("2026-08-15", 7), default))).StatusCode);
        // A count can't close a day that hasn't ended.
        var voided = await s.VoidStocktakeAsync(AdminAccountId, recorded.Id, new(recorded.ConcurrencyToken, "Recounting after the report arrives"), default);
        Assert.Equal("Voided", voided.Status);
        var tooSoon = await RecordedCount(db, Count("2026-08-31", 6) with { IdempotencyKey = "ST-SOON", CountedAt = CountTime("2026-08-31", 19) },
            new DateTimeOffset(2026, 8, 31, 20, 0, 0, Myt));
        Assert.Contains(tooSoon.Issues, i => i.Contains("hasn't ended"));
        Assert.Equal(0, await db.ConsignmentStockLedgerEntries.CountAsync(e => e.SourceType == ConsignmentLedgerSources.StocktakeLine));
    }

    // --- Shortage, surplus and damaged stock -------------------------------------------------

    [Fact]
    public async Task AShortageIsInvestigatedResolvedInPartsAndOnlyLaterApprovedAsALoss()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        await Month(db, "st-short");
        var closed = await ClosedCount(db, Count("2026-08-15", 5));
        var line = Assert.Single(closed.Lines);
        Assert.Equal((2, 5, 2), (line.Shortage, line.ClosingSellable, line.ClosingInvestigation));
        Assert.Equal((5, 0, 2, 3, 0, 10, true), await Ledger(db));
        await AssertInvestigationMatchesOpenShortages(db);
        // Never treated as sold, returned or written off automatically.
        Assert.Equal(3, (await Position(db)).SoldUnidentified);
        var shortage = await OpenDiscrepancy(db, "Shortage");
        Assert.Equal((2, 2), (shortage.Quantity, shortage.OpenQuantity));
        shortage = await Resolve(db, shortage, "Found", 1);
        Assert.Equal(("Open", 1), (shortage.Status, shortage.OpenQuantity));
        Assert.Equal((6, 0, 1, 3, 0, 10, true), await Ledger(db));
        await AssertInvestigationMatchesOpenShortages(db);
        // A loss needs a later count that confirms the unit is still missing.
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => Resolve(db, shortage, "ApprovedLoss", 1))).StatusCode);
        await Assert.ThrowsAsync<ApiException>(() => Resolve(db, shortage, "Found", 2));
        // Today's Found is after 31 Aug, so the confirming count is the next one, on 15 Sep.
        var confirming = await ClosedCount(db, Count("2026-09-15", 6), LateClock);
        Assert.Equal(0, confirming.Lines.Single().Shortage + confirming.Lines.Single().Surplus);
        shortage = await Resolve(db, (await Later(db).DiscrepanciesAsync(BranchId, null, default)).Single(d => d.Id == shortage.Id), "ApprovedLoss", 1, clock: LateClock);
        Assert.Equal(("Resolved", 0), (shortage.Status, shortage.OpenQuantity));
        Assert.Equal(["Found", "ApprovedLoss"], shortage.Resolutions.Select(r => r.Outcome));
        // An approved loss stays accountable in custody: no unit is written off or released.
        Assert.Equal((6, 0, 0, 3, 1, 10, true), await Ledger(db));
        Assert.All(await db.ConsignmentUnits.ToListAsync(), u => Assert.Equal(ConsignmentUnitStatus.Received, u.Status));
        await Assert.ThrowsAsync<ApiException>(() => Resolve(db, shortage, "Found", 1));
    }

    [Fact]
    public async Task ASurplusIsANoteThatNeverAddsStockAndCarriesForward()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        await Month(db, "st-surplus");
        var closed = await ClosedCount(db, Count("2026-08-15", 9));
        Assert.Equal((2, 7, 2), (closed.Lines.Single().Surplus, closed.Lines.Single().ClosingSellable, closed.Lines.Single().OpenSurplusAfter));
        // No units invented: the books stay at 7 and custody still ties out.
        Assert.Equal((7, 0, 0, 3, 0, 10, true), await Ledger(db));
        Assert.Equal(2, (await Position(db)).OpenSurplus);
        // The next count expects book plus the open note, so the same surplus isn't raised twice;
        // when one of the two is no longer there, the note shrinks and nothing goes missing.
        var next = await RecordedCount(db, Count("2026-08-31", 8));
        Assert.Equal(9, next.Lines.Single().ExpectedSellable);
        var nextClosed = await Later(db).ApproveStocktakeAsync(OwnerAccountId, next.Id, Close(next), default);
        Assert.Equal((0, 0, 1, 1), (nextClosed.Lines.Single().Shortage, nextClosed.Lines.Single().Surplus, nextClosed.Lines.Single().SurplusNoLongerPresent,
            nextClosed.Lines.Single().OpenSurplusAfter));
        var note = await OpenDiscrepancy(db, "Surplus");
        await Resolve(db, note, "RecountError", 1);
        Assert.Equal(0, (await Position(db)).OpenSurplus);
        Assert.Equal((7, 0, 0, 3, 0, 10, true), await Ledger(db));
    }

    [Fact]
    public async Task DamagedAndMissingUnsellableStockAreInvestigatedNotWrittenOff()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        await Month(db, "st-damage");
        var closed = await ClosedCount(db, Count("2026-08-15", 6, 1));
        Assert.Equal(1, closed.Lines.Single().UnsellableFound);
        Assert.Equal((6, 1, 0, 3, 0, 10, true), await Ledger(db));
        var found = await OpenDiscrepancy(db, "UnsellableFound");
        // Damaged stock is never certified as returned by a resolution: it leaves through a dispatch return.
        Assert.Equal(["ConfirmedDamaged", "RecountSellable"], found.AllowedOutcomes);
        await Resolve(db, found, "RecountSellable", 1);
        Assert.Equal((7, 0, 0, 3, 0, 10, true), await Ledger(db));
        // Later the shop finds one more damaged package, then can't find it at the following count.
        await ClosedCount(db, Count("2026-09-15", 6, 1), LateClock);
        await Resolve(db, await OpenDiscrepancy(db, "UnsellableFound"), "ConfirmedDamaged", 1, clock: LateClock);
        var missing = await ClosedCount(db, Count("2026-09-30", 6, 0), LateClock);
        Assert.Equal(1, missing.Lines.Single().UnsellableShortage);
        Assert.Equal((6, 0, 1, 3, 0, 10, true), await Ledger(db));
        await AssertInvestigationMatchesOpenShortages(db);
    }

    [Fact]
    public async Task AnEarlierShortageFoundThroughASurplusSettlesBoth()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        await Month(db, "st-both");
        await ClosedCount(db, Count("2026-08-15", 5));
        var shortage = await OpenDiscrepancy(db, "Shortage");
        await ClosedCount(db, Count("2026-08-31", 7));
        var surplus = await OpenDiscrepancy(db, "Surplus");
        Assert.Equal(2, surplus.Quantity);
        // Not related to this SKU's shortage → refused; the real one settles both, posting once.
        await Assert.ThrowsAsync<ApiException>(() => Resolve(db, surplus, "EarlierShortageFound", 1, Guid.NewGuid()));
        surplus = await Resolve(db, surplus, "EarlierShortageFound", 2, shortage.Id);
        Assert.Equal("Resolved", surplus.Status);
        Assert.Equal("Resolved", (await Later(db).DiscrepanciesAsync(BranchId, null, default)).Single(d => d.Id == shortage.Id).Status);
        Assert.Equal((7, 0, 0, 3, 0, 10, true), await Ledger(db));
        Assert.Equal(1, await db.ConsignmentStockLedgerEntries.CountAsync(e => e.EntryType == ConsignmentLedgerEntryTypes.DiscrepancyResolution));
        await AssertInvestigationMatchesOpenShortages(db);
    }

    // --- Idempotency, concurrency and balances -------------------------------------------------

    [Fact]
    public async Task AMonthClosesOnceEvenWhenApprovedTwiceOrConcurrently()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        await Month(db, "st-twice");
        var recorded = await RecordedCount(db, Count("2026-08-15", 5));
        var results = await Task.WhenAll(Enumerable.Range(0, 2).Select(async _ => {
            await using var context = scope.NewContext();
            try { await Later(context).ApproveStocktakeAsync(OwnerAccountId, recorded.Id, Close(recorded), default); return 200; }
            catch (ApiException e) { return e.StatusCode; }
        }));
        Assert.Equal([200, 409], results.Order());
        var again = await Assert.ThrowsAsync<ApiException>(() => Later(db).ApproveStocktakeAsync(OwnerAccountId, recorded.Id, Close(recorded), default));
        Assert.Equal(409, again.StatusCode);
        Assert.Equal(1, await db.ConsignmentStockLedgerEntries.CountAsync(e => e.EntryType == ConsignmentLedgerEntryTypes.StocktakeShortage));
        Assert.Equal(1, await db.ConsignmentStockDiscrepancies.CountAsync());
        Assert.Equal(1, await db.ConsignmentReviewEvents.CountAsync(e => e.SubjectType == "ConsignmentStocktake"));
        // A replayed creation returns the same count; a changed one is a clear conflict.
        var key = Count("2026-08-31", 5, key: "ST-REPLAY");
        var first = await Later(db).CreateStocktakeAsync(AdminAccountId, key, default);
        Assert.Equal(first.Id, (await Later(db).CreateStocktakeAsync(AdminAccountId, key, default)).Id);
        Assert.Equal("submission_changed", (await Assert.ThrowsAsync<ApiException>(() => Later(db).CreateStocktakeAsync(AdminAccountId,
            Count("2026-08-31", 4, key: "ST-REPLAY"), default))).Code);
    }

    [Fact]
    public async Task AShortageThatWouldTakeTodaysStockBelowZeroRefusesTheWholeClose()
    {
        await using var scope = await Database(4); await using var db = scope.NewContext();
        var a = await AgreementFrom(db, AugustFirst);
        var d = await ReceiveUnder(db, a.Id, 4, "st-negative");
        var recorded = await RecordedCount(db, Count("2026-08-15", 1));
        // After the count day, three packages come back to MyPetLink: today's shelf can't give up three more.
        var s = Later(db); d = await s.GetAsync(d.Id, false, default);
        await s.ActionAsync(AdminAccountId, d.Id, "return", Action(d, "RETURN-AFTER-COUNT", d.Units.Take(3).Select(u => u.Id).ToArray()), default);
        var ledger = await db.ConsignmentStockLedgerEntries.CountAsync();
        recorded = await Later(db).GetStocktakeAsync(recorded.Id, default);
        var refused = await Assert.ThrowsAsync<ApiException>(() => Later(db).ApproveStocktakeAsync(OwnerAccountId, recorded.Id, Close(recorded), default));
        Assert.Equal(409, refused.StatusCode);
        Assert.Equal(ledger, await db.ConsignmentStockLedgerEntries.CountAsync());
        Assert.Equal("Recorded", (await Later(db).GetStocktakeAsync(recorded.Id, default)).Status);
        Assert.Empty(db.ConsignmentStockDiscrepancies);
        Assert.Equal((1, 0, 0, 0, 0, 1, true), await Ledger(db));
    }

    // --- Late reports and refunds after a close -------------------------------------------------

    [Fact]
    public async Task ALateReportExplainsTheShortageWithoutRewritingTheClosedMonth()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        var (a, price, _) = await Month(db, "st-late");
        // Two sales in 16–31 Aug weren't reported in time: the count finds them missing.
        var closed = await ClosedCount(db, Count("2026-08-31", 5));
        var frozen = await db.ConsignmentStocktakeLines.AsNoTracking().SingleAsync();
        Assert.Equal((5, 0, 2, 3, 0, 10, true), await Ledger(db));
        var late = await Recorded(db, ReportFor(a.Id, "2026-08", 2, "ST-LATE-B", [Sale(price.Id, 2)]));
        Assert.Contains(late.Warnings, w => w.Contains("already closed") && w.Contains("found 2 missing"));
        var candidate = late.LateReport!.Skus.Single().Candidates.Single();
        Assert.Equal((closed.Id, "Shortage", 2, 2), (candidate.OriginStocktakeId, candidate.Kind, candidate.OpenQuantity, late.LateReport.Skus.Single().Capacity));
        await Assert.ThrowsAsync<ApiException>(() => Later(db).VerifySalesReportAsync(OwnerAccountId, late.Id, new(late.ConcurrencyToken), default));
        await Later(db).VerifySalesReportAsync(OwnerAccountId, late.Id, new(late.ConcurrencyToken, AcknowledgeWarnings: true,
            Allocations: [new(candidate.DiscrepancyId, 2, "POS receipts 20 and 28 Aug", "Both packages were sold before the count")]), default);
        // The shelf is unchanged; the two leave Investigation as sold. Postings are dated now and flagged.
        Assert.Equal((5, 0, 0, 5, 0, 10, true), await Ledger(db));
        var shortage = (await Later(db).DiscrepanciesAsync(BranchId, null, default)).Single();
        Assert.Equal(("Resolved", "ExplainedByLateReport", (Guid?)late.Id), (shortage.Status, shortage.Resolutions.Single().Outcome, shortage.Resolutions.Single().LinkedSalesReportId));
        Assert.Equal("POS receipts 20 and 28 Aug", shortage.Resolutions.Single().EvidenceReference);
        var latePostings = await db.ConsignmentStockLedgerEntries.AsNoTracking().Where(e => e.EffectiveAt >= closed.CutoffAt).ToListAsync();
        Assert.Equal(2, latePostings.Count);
        Assert.All(latePostings, e => Assert.True(e.IsPriorPeriodCorrection));
        // The closed snapshot is exactly as it was approved.
        var after = await db.ConsignmentStocktakeLines.AsNoTracking().SingleAsync();
        Assert.Equal((frozen.ClosingSellable, frozen.ClosingInvestigation, frozen.ClosingSold, frozen.FrozenAt),
            (after.ClosingSellable, after.ClosingInvestigation, after.ClosingSold, after.FrozenAt));
        await AssertInvestigationMatchesOpenShortages(db);
    }

    [Fact]
    public async Task ALateSealedRefundSettlesTheSurplusTheCountFound()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        var (a, price, _) = await Month(db, "st-refund");
        // A customer returned a sealed package in late August, unreported: the count finds 8, not 7.
        await ClosedCount(db, Count("2026-08-31", 8));
        Assert.Equal(1, (await Position(db)).OpenSurplus);
        var refund = await Recorded(db, ReportFor(a.Id, "2026-08", 2, "ST-REFUND-B", [Refund(price.Id, 1, AugustFirst, restock: 1)]));
        Assert.Contains(refund.Warnings, w => w.Contains("found 1 extra"));
        var note = refund.LateReport!.Skus.Single().Candidates.Single();
        Assert.Equal("Surplus", note.Kind);
        await Later(db).VerifySalesReportAsync(OwnerAccountId, refund.Id, new(refund.ConcurrencyToken, AcknowledgeWarnings: true,
            Allocations: [new(note.DiscrepancyId, 1, "Refund slip 29 Aug, sealed", "The returned package was put back on the shelf before the count")]), default);
        Assert.Equal((8, 0, 0, 2, 0, 10, true), await Ledger(db));
        Assert.Equal(0, (await Position(db)).OpenSurplus);
        // So the next count of 8 matches exactly, with no surplus raised twice.
        var next = await ClosedCount(db, Count("2026-09-15", 8), LateClock);
        Assert.Equal(0, next.Lines.Single().Surplus + next.Lines.Single().Shortage);
    }

    [Fact]
    public async Task StockCarriesForwardAcrossAnAgreementRenewalWithoutAnyPosting()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        var (v1, _, _) = await Month(db, "st-renew");
        await ClosedCount(db, Count("2026-08-15", 7));
        var v2 = await AgreementFrom(db, AugustSixteenth, null, v1.Id);
        var v2Price = await Price(db, v2.Id, AugustSixteenth, 42m);
        var entries = await db.ConsignmentStockLedgerEntries.CountAsync();
        Assert.Equal((7, 0, 0, 3, 0, 10, true), await Ledger(db));
        Assert.Equal(entries, await db.ConsignmentStockLedgerEntries.CountAsync());
        await Verified(db, ReportFor(v2.Id, "2026-08", 2, "ST-RENEW-B", [Sale(v2Price.Id, 2, 42m)]));
        var closed = await ClosedCount(db, Count("2026-08-31", 5));
        Assert.Equal((7, 2, 5, 0), (closed.Lines.Single().BookSellable + 2, closed.Lines.Single().BookSold - 3, closed.Lines.Single().ClosingSellable,
            closed.Lines.Single().Shortage + closed.Lines.Single().Surplus));
    }

    // --- Independence ------------------------------------------------------------------------------

    [Fact]
    public async Task TeamModeNeedsSomeoneWhoDidntCountAndSoloNeedsTheFounderWithEvidence()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext(); await AddReviewer(db);
        await Month(db, "st-team");
        var s = Later(db);
        var draft = await s.CreateStocktakeAsync(AdminAccountId, Count("2026-08-15", 7), default);
        draft = await s.UpdateStocktakeAsync(ReviewerUser, draft.Id, draft.ConcurrencyToken, Count("2026-08-15", 6), default);
        var recorded = await s.RecordStocktakeAsync(AdminAccountId, draft.Id, new(draft.ConcurrencyToken), default);
        foreach (var maker in new[] { AdminAccountId, ReviewerUser })
            Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => s.ApproveStocktakeAsync(maker, recorded.Id, Close(recorded), default))).StatusCode);
        // Whoever counted isn't independent of what the count found either.
        var closed = await s.ApproveStocktakeAsync(OwnerAccountId, recorded.Id, Close(recorded), default);
        Assert.Equal("Independent (Team)", closed.ReviewMode);
        var shortage = await OpenDiscrepancy(db, "Shortage");
        Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => s.ResolveDiscrepancyAsync(ReviewerUser, shortage.Id,
            new(shortage.ConcurrencyToken, "Found", 1, "Shop photo", "Found behind the counter"), default))).StatusCode);
        // Solo: the named founder self-reviews their own count only with its own evidence.
        await SoloAccess(db); await SetMode(db);
        var solo = SoloLater(db);
        var next = await solo.CreateStocktakeAsync(AdminAccountId, Count("2026-08-31", 6), default);
        next = await solo.RecordStocktakeAsync(AdminAccountId, next.Id, new(next.ConcurrencyToken), default);
        await Assert.ThrowsAsync<ApiException>(() => solo.ApproveStocktakeAsync(AdminAccountId, next.Id, Close(next), default));
        await Assert.ThrowsAsync<ApiException>(() => solo.ApproveStocktakeAsync(AdminAccountId, next.Id, Close(next, Attest("SOME-OTHER-EVIDENCE")), default));
        var soloClosed = await solo.ApproveStocktakeAsync(AdminAccountId, next.Id, Close(next, Attest("Count sheet photo 2026-08-31")), default);
        Assert.Equal("Self-reviewed (Solo)", soloClosed.ReviewMode);
    }

    // --- The migrated schema: triggers, unique keys, rowversion and rollback ---------------------

    [Fact]
    public async Task MigratedSchemaKeepsClosedMonthsImmutableForEveryWritePath()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(10); await using var db = scope.NewContext();
            Assert.Contains(StocktakeMigration, await db.Database.GetAppliedMigrationsAsync());
            await Month(db, "st-sql");
            var closed = await ClosedCount(db, Count("2026-08-15", 5));
            var shortage = await Resolve(db, await OpenDiscrepancy(db, "Shortage"), "Found", 1);
            var line = closed.Lines.Single().Id;
            Assert.Equal(51049, (await SqlFailure(() => db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE ConsignmentStocktakeLines SET CountedSellable = 7 WHERE Id = {line}"))).Number);
            // Deleting it is refused too: by the discrepancy that references it, and otherwise by the trigger.
            Assert.Contains((await SqlFailure(() => db.Database.ExecuteSqlInterpolatedAsync(
                $"DELETE FROM ConsignmentStocktakeLines WHERE Id = {line}"))).Number, new[] { 547, 51049 });
            Assert.Equal(51050, (await SqlFailure(() => db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE ConsignmentStocktakes SET Status = 'Voided' WHERE Id = {closed.Id}"))).Number);
            Assert.Equal(51048, (await SqlFailure(() => db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE ConsignmentDiscrepancyResolutions SET Quantity = 2 WHERE DiscrepancyId = {shortage.Id}"))).Number);
            Assert.Equal(51048, (await SqlFailure(() => db.Database.ExecuteSqlInterpolatedAsync(
                $"DELETE FROM ConsignmentDiscrepancyResolutions WHERE DiscrepancyId = {shortage.Id}"))).Number);
            Assert.Equal(51043, (await SqlFailure(() => db.Database.ExecuteSqlInterpolatedAsync(
                $"DELETE FROM ConsignmentStockLedgerEntries WHERE SourceLineId = {line}"))).Number);
            // One approved close per cutoff, one open count per branch.
            Assert.Equal(2601, (await SqlFailure(() => db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT ConsignmentStocktakes(Id,MerchantId,MerchantBranchId,CutoffAt,CountedBy,EvidenceKind,EvidenceReference,Status,CreatedByAdminUserId,
                  IdempotencyKey,ContributorHistoryComplete,CreatedAt,UpdatedAt)
                VALUES({Guid.NewGuid()},{MerchantId},{BranchId},{closed.CutoffAt},'Shop owner','Other','Synthetic','Approved',{AdminRecordId},'ST-SQL-DUP',1,{Now},{Now})
                """))).Number);
            // A stale token loses to the newer write, and EF refuses to edit the closed month.
            var open = await RecordedCount(db, Count("2026-08-31", 6));
            await Later(db).VoidStocktakeAsync(AdminAccountId, open.Id, new(open.ConcurrencyToken, "Counted the wrong shelf"), default);
            Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => Later(db).RecordStocktakeAsync(AdminAccountId, open.Id, new(open.ConcurrencyToken), default))).StatusCode);
            var tracked = await db.ConsignmentStocktakes.SingleAsync(x => x.Id == closed.Id);
            tracked.Notes = "Edited later";
            await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
            db.ChangeTracker.Clear();
            Assert.Equal((6, 0, 1, 3, 0, 10, true), await Ledger(db));
        }
        finally { MigratedSchema.Value = false; }
    }

    [Fact]
    public async Task StocktakeRollbackIsBlockedWithHistoryAndCleanWhenEmpty()
    {
        Assert.True(RelationalDatabase.IsAvailable, "SQL Server migration verification must not skip.");
        await using (var empty = await RelationalDatabase.CreateAsync(createSchema: false))
        {
            await using var db = empty.NewContext();
            await db.Database.MigrateAsync();
            await db.GetService<IMigrator>().MigrateAsync("20261019010452_ProtectConsignmentContributorHistory");
            Assert.DoesNotContain(StocktakeMigration, await db.Database.GetAppliedMigrationsAsync());
            await db.Database.MigrateAsync();
            Assert.Empty(await db.Database.GetPendingMigrationsAsync());
        }
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(4); await using var db = scope.NewContext();
            var a = await AgreementFrom(db, AugustFirst); await ReceiveUnder(db, a.Id, 4, "st-down");
            var counted = await RecordedCount(db, Count("2026-08-15", 4));
            // The newest guard holding history refuses first: count times are closed-month history too.
            // The agreement-document migration above it holds nothing here, so it rolls back cleanly first.
            await ReleaseReferenceRollbackGuard(db, "20261019010452_ProtectConsignmentContributorHistory");
            var blocked = await Assert.ThrowsAnyAsync<Exception>(() => db.GetService<IMigrator>().MigrateAsync("20261019010452_ProtectConsignmentContributorHistory"));
            Assert.Contains("51053", blocked.ToString());
            db.ChangeTracker.Clear();
            Assert.Equal([AgreementDocumentsMigration, ReferencesMigration], await db.Database.GetPendingMigrationsAsync());
            // Without the new history, the hardening rolls back and the stocktake guard still refuses (non-atomic chain).
            await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE ConsignmentStocktakes SET Status = 'Voided' WHERE Id = {counted.Id}");
            await db.Database.ExecuteSqlRawAsync("DISABLE TRIGGER TR_ConsignmentStocktakes_Closed ON ConsignmentStocktakes; UPDATE ConsignmentStocktakes SET CountedAt = NULL; ENABLE TRIGGER TR_ConsignmentStocktakes_Closed ON ConsignmentStocktakes;");
            blocked = await Assert.ThrowsAnyAsync<Exception>(() => db.GetService<IMigrator>().MigrateAsync("20261019010452_ProtectConsignmentContributorHistory"));
            Assert.Contains("51051", blocked.ToString());
            db.ChangeTracker.Clear();
            Assert.Equal([HardeningMigration, AgreementDocumentsMigration, ReferencesMigration], await db.Database.GetPendingMigrationsAsync());
            Assert.Equal(1, await db.ConsignmentStocktakes.CountAsync());
            await db.Database.MigrateAsync();
            Assert.Empty(await db.Database.GetPendingMigrationsAsync());
        }
        finally { MigratedSchema.Value = false; }
    }
}
