using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

// Regression tests for the Phase 1B final gate's findings R1 (a historical close must not settle obligations
// changed after its cutoff) and R2 (a sold-out late report must be linkable). Real service paths with
// controlled time; no trigger is disabled.
public sealed partial class ConsignmentRelationalTests
{
    private const string HistoricalCountIncompatible = "historical_count_incompatible";

    /// <summary>Correct a verified report at a given time: started by the owner, entered and recorded by the operator.</summary>
    private static async Task<ConsignmentSalesReportResponse> CorrectAt(MyPetLinkDbContext db, ConsignmentSalesReportResponse original,
        SaveConsignmentSalesReportRequest values, DateTimeOffset clock)
    {
        var s = At(db, clock);
        var current = await s.GetSalesReportAsync(original.Id, default);
        var draft = await s.CorrectSalesReportAsync(OwnerAccountId, original.Id, new(current.ConcurrencyToken, "Partner sent corrected figures"), default);
        draft = await s.UpdateSalesReportAsync(AdminAccountId, draft.Id, draft.ConcurrencyToken, values, default);
        return await s.RecordSalesReportAsync(AdminAccountId, draft.Id, new(draft.ConcurrencyToken), default);
    }

    private static async Task<(int Entries, int Resolutions, int Discrepancies, string Frozen)> HistorySnapshot(MyPetLinkDbContext db) =>
        (await db.ConsignmentStockLedgerEntries.CountAsync(), await db.ConsignmentDiscrepancyResolutions.CountAsync(),
            await db.ConsignmentStockDiscrepancies.CountAsync(),
            string.Join(";", (await db.ConsignmentStocktakeLines.AsNoTracking().Where(l => l.FrozenAt != null).OrderBy(l => l.Id)
                .Select(l => new { l.Id, l.CountedSellable, l.ClosingSellable, l.OpenSurplusAfter, l.FrozenAt }).ToListAsync()).Select(x => x.ToString())));

    /// <summary>
    /// Codex FG11: August finds 2 extra; a late sealed refund explains 1; mid- and end-September counts of 8 close;
    /// on 20 Oct the refund is corrected to money-only, reopening 1 extra. Returns the reopened note.
    /// </summary>
    private static async Task<(ConsignmentAgreementResponse Agreement, ConsignmentPriceTermResponse Price, ConsignmentSalesReportResponse Corrected,
        Guid Note)> ReopenedAfterSeptember(MyPetLinkDbContext db, string key)
    {
        var (a, price, _) = await Month(db, key);
        await ClosedCount(db, Count("2026-08-31", 9));
        var note = await OpenDiscrepancy(db, "Surplus");
        var v1 = await Recorded(db, ReportFor(a.Id, "2026-08", 2, key.ToUpperInvariant() + "-B", [Refund(price.Id, 1, AugustFirst, restock: 1)]));
        v1 = await VerifyLinked(db, v1, [Link(note.Id, 1, "Original dated refund slip")]);
        await ClosedCount(db, Count("2026-09-15", 8), CountTime("2026-09-16", 10));
        await ClosedCount(db, Count("2026-09-30", 8), CountTime("2026-10-01", 10));
        Assert.Equal((8, 0, 0, 2, 0, 10, true), await Ledger(db));
        Assert.Equal(0, (await Position(db)).OpenSurplus);
        var v2 = await CorrectAt(db, v1, ReportFor(a.Id, "2026-08", 2, key.ToUpperInvariant() + "-B", [Refund(price.Id, 1, AugustFirst)]), CountTime("2026-10-20", 10));
        v2 = await VerifyLinked(db, v2, null, CountTime("2026-10-20", 10), ReviewerUser);
        Assert.Equal((7, 0, 0, 3, 0, 10, true), await Ledger(db));
        Assert.Equal(1, (await Position(db)).OpenSurplus);
        return (a, price, v2, note.Id);
    }

    // --- R1 -----------------------------------------------------------------------------------------

    [Fact]
    public async Task R1_AnEarlierCountCanNotEraseSurplusReopenedAfterIt()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(10); await using var db = scope.NewContext(); await AddReviewer(db);
            var (_, _, _, note) = await ReopenedAfterSeptember(db, "r1");
            var units = await UnitSnapshot(db);
            var history = await HistorySnapshot(db);
            var october21 = CountTime("2026-10-21", 10);

            // The honest 15 Oct count of 8. At its cutoff the books were 8 and no extra was open: the reopening is later.
            var expected = (await At(db, october21).StocktakeExpectationAsync(BranchId, "2026-10-15", default));
            Assert.Equal((8, 0, 8), (expected.Lines.Single().BookSellable, expected.Lines.Single().OpenSurplusBefore, expected.Lines.Single().ExpectedSellable));
            Assert.Contains(expected.Issues, i => i.Contains("after this count date"));
            var recorded = await RecordedCount(db, Count("2026-10-15", 8), october21);
            Assert.Contains(recorded.Issues, i => i.Contains("count again on the next count date"));
            var refused = await Assert.ThrowsAsync<ApiException>(() => At(db, october21).ApproveStocktakeAsync(OwnerAccountId, recorded.Id, Close(recorded), default));
            Assert.Equal((409, HistoricalCountIncompatible), (refused.StatusCode, refused.Code));

            // Nothing changed: the reopened extra is still open, books, history and custody are as they were.
            Assert.Equal(1, (await Position(db)).OpenSurplus);
            Assert.Equal(("Open", 1), ((await DiscrepancyById(db, note)).Status, (await DiscrepancyById(db, note)).OpenQuantity));
            Assert.Equal((7, 0, 0, 3, 0, 10, true), await Ledger(db));
            Assert.Equal(history.Entries, await db.ConsignmentStockLedgerEntries.CountAsync());
            Assert.Equal(history.Resolutions, await db.ConsignmentDiscrepancyResolutions.CountAsync());
            Assert.Equal(history.Frozen, (await HistorySnapshot(db)).Frozen);
            Assert.Equal(units, await UnitSnapshot(db));
            var kept = await At(db, october21).GetStocktakeAsync(recorded.Id, default);
            Assert.Equal(("Recorded", CountTime("2026-10-15", 21), new DateTimeOffset(2026, 10, 16, 0, 0, 0, Myt)), (kept.Status, kept.CountedAt!.Value, kept.CutoffAt));

            // The way forward: discard it and count again after the correction. 7 verified + 1 extra = the same 8 packages.
            await At(db, october21).VoidStocktakeAsync(AdminAccountId, recorded.Id, new(kept.ConcurrencyToken, "Count predates the 20 Oct correction"), default);
            var next = await ClosedCount(db, Count("2026-10-31", 8), CountTime("2026-11-01", 10));
            Assert.Equal((7, 1, 8, 0, 0, 1), (next.Lines.Single().BookSellable, next.Lines.Single().OpenSurplusBefore, next.Lines.Single().ExpectedSellable,
                next.Lines.Single().Shortage + next.Lines.Single().Surplus, next.Lines.Single().SurplusNoLongerPresent, next.Lines.Single().OpenSurplusAfter));
            Assert.Equal(1, (await Position(db)).OpenSurplus);
            Assert.Equal((7, 0, 0, 3, 0, 10, true), await Ledger(db));
            Assert.Equal(units, await UnitSnapshot(db));
            await AssertInvestigationMatchesOpenShortages(db);
        }
        finally { MigratedSchema.Value = false; }
    }

    [Fact]
    public async Task R1_ACountReviewedBeforeALaterReopeningCanNotThenCloseOnIt()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext(); await AddReviewer(db);
        var (a, price, _) = await Month(db, "r1-race");
        await ClosedCount(db, Count("2026-08-31", 9));
        var note = await OpenDiscrepancy(db, "Surplus");
        var v1 = await Recorded(db, ReportFor(a.Id, "2026-08", 2, "R1R-B", [Refund(price.Id, 1, AugustFirst, restock: 1)]));
        v1 = await VerifyLinked(db, v1, [Link(note.Id, 1, "Original dated refund slip")]);
        // The 15 Sep count is recorded and reviewed on 16 Sep; the refund is corrected on 17 Sep, before the close.
        var recorded = await RecordedCount(db, Count("2026-09-15", 9), CountTime("2026-09-16", 10));
        Assert.Empty(recorded.Issues);
        var v2 = await CorrectAt(db, v1, ReportFor(a.Id, "2026-08", 2, "R1R-B", [Refund(price.Id, 1, AugustFirst)]), CountTime("2026-09-17", 10));
        await VerifyLinked(db, v2, null, CountTime("2026-09-17", 10), ReviewerUser);
        var before = await HistorySnapshot(db);
        var refused = await Assert.ThrowsAsync<ApiException>(() => At(db, CountTime("2026-09-18", 10)).ApproveStocktakeAsync(OwnerAccountId, recorded.Id,
            Close(recorded), default));
        Assert.Equal((409, HistoricalCountIncompatible), (refused.StatusCode, refused.Code));
        Assert.Equal(before, await HistorySnapshot(db));
        Assert.Equal(2, (await Position(db)).OpenSurplus);
        Assert.Equal((7, 0, 0, 3, 0, 10, true), await Ledger(db));
    }

    [Fact]
    public async Task R1_SurplusSettledAfterTheCutoffIsAlsoRefusedButEarlierChangesAreNot()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        await Month(db, "r1-partial");
        await ClosedCount(db, Count("2026-08-15", 10));
        var note = await OpenDiscrepancy(db, "Surplus");
        // A partial resolution before the next count's cutoff is ordinary: 1 of 3 was a recount error.
        await Resolve(db, note, "RecountError", 1, clock: CountTime("2026-08-20", 10));
        var ordinary = await ClosedCount(db, Count("2026-08-31", 9), CountTime("2026-09-01", 10));
        Assert.Equal((7, 2, 9, 0), (ordinary.Lines.Single().BookSellable, ordinary.Lines.Single().OpenSurplusBefore,
            ordinary.Lines.Single().ExpectedSellable, ordinary.Lines.Single().Shortage + ordinary.Lines.Single().Surplus));
        // A partial resolution after the 15 Sep cutoff but before its close can't be placed in time: refused, history kept.
        var recorded = await RecordedCount(db, Count("2026-09-15", 9), CountTime("2026-09-16", 10));
        await Resolve(db, await DiscrepancyById(db, note.Id), "RecountError", 1, clock: CountTime("2026-09-17", 10));
        var reviewed = await At(db, CountTime("2026-09-18", 10)).GetStocktakeAsync(recorded.Id, default);
        Assert.Contains(reviewed.Issues, i => i.Contains("17 Sep 2026"));
        Assert.Equal(2, reviewed.Lines.Single().OpenSurplusBefore);
        var before = await HistorySnapshot(db);
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => At(db, CountTime("2026-09-18", 10)).ApproveStocktakeAsync(OwnerAccountId,
            reviewed.Id, Close(reviewed), default))).StatusCode);
        Assert.Equal(before, await HistorySnapshot(db));
        Assert.Equal(1, (await Position(db)).OpenSurplus);
    }

    [Fact]
    public async Task R1_AnEarlierCountClosedLateDoesNotBlockTheNextOne()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        await Month(db, "r1-late-close");
        await ClosedCount(db, Count("2026-08-15", 9));
        // The 31 Aug count no longer finds the 2 extras, but is only closed on 3 Oct, after the 15 Sep count date.
        await ClosedCount(db, Count("2026-08-31", 7), CountTime("2026-10-03", 10));
        Assert.Equal(0, (await Position(db)).OpenSurplus);
        // That close's "not found" settlements date from 31 Aug, so the 15 Sep count still closes normally.
        var september = await ClosedCount(db, Count("2026-09-15", 7), CountTime("2026-10-04", 10));
        Assert.Equal(("Approved", 0, 0), (september.Status, september.Lines.Single().OpenSurplusBefore,
            september.Lines.Single().Shortage + september.Lines.Single().Surplus + september.Lines.Single().SurplusNoLongerPresent));
        Assert.Equal((7, 0, 0, 3, 0, 10, true), await Ledger(db));
    }

    [Fact]
    public async Task R1_ACorrectedCorrectionAfterTheCutoffIsRefusedUntilACountAfterIt()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext(); await AddReviewer(db);
        var (a, price, v2, note) = await ReopenedAfterSeptember(db, "r1-chain");
        // 22 Oct: the partner confirms the sealed return after all; the correction of the correction relinks it.
        var v3 = await CorrectAt(db, v2, ReportFor(a.Id, "2026-08", 2, "R1-CHAIN-B", [Refund(price.Id, 1, AugustFirst, restock: 1)]), CountTime("2026-10-22", 10));
        await VerifyLinked(db, v3, [Link(note, 1, "Shop photo of the returned sealed package")], CountTime("2026-10-22", 10), ReviewerUser);
        Assert.Equal((8, 0, 0, 2, 0, 10, true), await Ledger(db));
        Assert.Equal(0, (await Position(db)).OpenSurplus);
        // Both changes postdate the 15 Oct cutoff, so that count is refused; the 31 Oct count closes cleanly at 8.
        var recorded = await RecordedCount(db, Count("2026-10-15", 8), CountTime("2026-10-23", 10));
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => At(db, CountTime("2026-10-23", 10)).ApproveStocktakeAsync(OwnerAccountId,
            recorded.Id, Close(recorded), default))).StatusCode);
        await At(db, CountTime("2026-10-23", 10)).VoidStocktakeAsync(AdminAccountId, recorded.Id,
            new((await Later(db).GetStocktakeAsync(recorded.Id, default)).ConcurrencyToken, "Count predates the corrections"), default);
        var next = await ClosedCount(db, Count("2026-10-31", 8), CountTime("2026-11-01", 10));
        Assert.Equal(0, next.Lines.Single().Shortage + next.Lines.Single().Surplus + next.Lines.Single().SurplusNoLongerPresent);
        Assert.Equal((8, 0, 0, 2, 0, 10, true), await Ledger(db));
    }

    [Fact]
    public async Task R1_AShortageReopenedAfterTheCutoffStaysOpenThroughAnEarlierClose()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext(); await AddReviewer(db);
        var (a, price, _) = await Month(db, "r1-short");
        await ClosedCount(db, Count("2026-08-31", 5));
        var shortage = await OpenDiscrepancy(db, "Shortage");
        var v1 = await Recorded(db, ReportFor(a.Id, "2026-08", 2, "R1S-B", [Sale(price.Id, 2)]));
        v1 = await VerifyLinked(db, v1, [Link(shortage.Id, 2, "POS receipts 20 and 28 Aug")]);
        await ClosedCount(db, Count("2026-09-15", 5), CountTime("2026-09-16", 10));
        // 20 Oct: one of the two sales is withdrawn; one unit is missing again.
        var v2 = await CorrectAt(db, v1, ReportFor(a.Id, "2026-08", 2, "R1S-B", [Sale(price.Id, 1)]), CountTime("2026-10-20", 10));
        await VerifyLinked(db, v2, null, CountTime("2026-10-20", 10), ReviewerUser);
        Assert.Equal((4, 0, 2, 4, 0, 10, true), await Ledger(db));
        // A close never settles a shortage, so the earlier 30 Sep count closes on its own books and the obligation survives.
        var september = await ClosedCount(db, Count("2026-09-30", 5), CountTime("2026-10-21", 10));
        Assert.Equal((5, 0, 0), (september.Lines.Single().BookSellable, september.Lines.Single().Shortage, september.Lines.Single().Surplus));
        Assert.Equal(("Open", 2), ((await DiscrepancyById(db, shortage.Id)).Status, (await DiscrepancyById(db, shortage.Id)).OpenQuantity));
        Assert.Equal((4, 0, 2, 4, 0, 10, true), await Ledger(db));
        await AssertInvestigationMatchesOpenShortages(db);
    }
}
