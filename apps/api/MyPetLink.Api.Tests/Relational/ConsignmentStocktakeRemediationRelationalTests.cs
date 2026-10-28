using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

// Regression tests for the independent Phase 1B review's findings B1–B8, and the business checks
// that came with them. Every scenario runs through the real dispatch, receipt, report and stocktake
// paths with controlled time; none disables a trigger to set itself up.
public sealed partial class ConsignmentRelationalTests
{
    private const string HardeningMigration = "20261019060824_HardenConsignmentStocktakeReconciliation";
    private const string AgreementDocumentsMigration = "20261019110531_AddConsignmentAgreementDocuments";

    private static ConsignmentLateAllocationRequest Link(Guid discrepancy, int quantity, string evidence = "POS receipt dated in the period") =>
        new(discrepancy, quantity, evidence, "The partner's dated record accounts for what the count found");

    private static Task<ConsignmentSalesReportResponse> VerifyLinked(MyPetLinkDbContext db, ConsignmentSalesReportResponse r,
        IReadOnlyList<ConsignmentLateAllocationRequest>? links, DateTimeOffset? clock = null, Guid? actor = null) =>
        At(db, clock ?? ReportClock).VerifySalesReportAsync(actor ?? OwnerAccountId, r.Id,
            new(r.ConcurrencyToken, AcknowledgeWarnings: true, Allocations: links), default);

    private static async Task<ConsignmentDiscrepancyResponse> DiscrepancyById(MyPetLinkDbContext db, Guid id) =>
        (await Later(db).DiscrepanciesAsync(BranchId, null, default)).Single(d => d.Id == id);

    private static async Task<string> UnitSnapshot(MyPetLinkDbContext db) =>
        string.Join(";", (await db.ConsignmentUnits.AsNoTracking().OrderBy(u => u.Id)
            .Select(u => new { u.Id, u.Status, u.CurrentHandoverRecordId, u.SmartTagId }).ToListAsync()).Select(u => u.ToString()));

    private static async Task AssertNoFinancialRecords(MyPetLinkDbContext db)
    {
        Assert.Equal(0, await db.MerchantInvoices.CountAsync());
        Assert.Equal(0, await db.MerchantPayments.CountAsync());
        Assert.Equal(0, await db.SalesCommissions.CountAsync());
        Assert.Equal(0, await db.CommissionPayouts.CountAsync());
    }

    // --- B1: corrections of explained late reports -----------------------------------------------

    [Fact]
    public async Task B1_CorrectingAnExplainedLateSaleReopensTheShortageThroughEveryCorrection()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(10); await using var db = scope.NewContext(); await AddReviewer(db);
            var (a, price, _) = await Month(db, "b1");
            var units = await UnitSnapshot(db);
            // Codex's scenario: receive 10, verify 3 sales, close a count of 5.
            await ClosedCount(db, Count("2026-08-31", 5));
            Assert.Equal((5, 0, 2, 3, 0, 10, true), await Ledger(db));
            var shortage = await OpenDiscrepancy(db, "Shortage");

            // v1: two late sales, linked by the reviewer to the shortage.
            var v1 = await Recorded(db, ReportFor(a.Id, "2026-08", 2, "B1-B", [Sale(price.Id, 2)]));
            v1 = await VerifyLinked(db, v1, [Link(shortage.Id, 2)]);
            Assert.Equal((5, 0, 0, 5, 0, 10, true), await Ledger(db));
            Assert.Equal("Resolved", (await DiscrepancyById(db, shortage.Id)).Status);

            // v2: really only one sale. Verifying withdraws v1's explanation: the shortage is open again.
            var v2 = await Correct(db, v1, ReportFor(a.Id, "2026-08", 2, "B1-B", [Sale(price.Id, 1)]));
            var late = v2.LateReport!.Skus.Single();
            Assert.Equal((-1, 2), (late.LateShelfChange, late.Withdrawn.Single().Quantity));
            Assert.Equal(2, late.Candidates.Single().OpenQuantity);
            Assert.Contains(v2.Warnings, w => w.Contains("reopens them"));
            v2 = await VerifyLinked(db, v2, null, ReportClock.AddHours(1));
            Assert.Equal((4, 0, 2, 4, 0, 10, true), await Ledger(db));
            Assert.Equal(("Open", 2), ((await DiscrepancyById(db, shortage.Id)).Status, (await DiscrepancyById(db, shortage.Id)).OpenQuantity));
            await AssertInvestigationMatchesOpenShortages(db);

            // v3 (a correction of a correction) links its one sale; v4 removes the sale line altogether.
            var v3 = await Correct(db, v2, ReportFor(a.Id, "2026-08", 2, "B1-B", [Sale(price.Id, 1)]));
            Assert.Empty(v3.LateReport!.Skus.Single().Withdrawn);
            v3 = await VerifyLinked(db, v3, [Link(shortage.Id, 1, "POS receipt 30 Aug")], ReportClock.AddHours(2));
            Assert.Equal((5, 0, 1, 4, 0, 10, true), await Ledger(db));
            await AssertInvestigationMatchesOpenShortages(db);
            var v4 = await Correct(db, v3, ReportFor(a.Id, "2026-08", 2, "B1-B", [Refund(price.Id, 1, AugustFirst)]));
            await VerifyLinked(db, v4, null, ReportClock.AddHours(3));
            Assert.Equal((5, 0, 2, 3, 0, 10, true), await Ledger(db));
            await AssertInvestigationMatchesOpenShortages(db);

            // The history is append-only and complete: every explanation and its withdrawal, with compensating movements.
            var history = (await DiscrepancyById(db, shortage.Id)).Resolutions;
            Assert.Equal(["ExplainedByLateReport", "AllocationWithdrawn", "ExplainedByLateReport", "AllocationWithdrawn"], history.Select(r => r.Outcome));
            Assert.Equal([2, 2, 1, 1], history.Select(r => r.Quantity));
            Assert.Equal(history[0].Id, history[1].ReversesResolutionId);
            Assert.Equal(history[2].Id, history[3].ReversesResolutionId);
            Assert.Equal([(Guid?)v1.Id, v2.Id, v3.Id, v4.Id], history.Select(r => r.LinkedSalesReportId));
            var explained = await db.ConsignmentStockLedgerEntries.AsNoTracking()
                .Where(e => e.EntryType == ConsignmentLedgerEntryTypes.LateReportExplainsShortage).ToListAsync();
            Assert.Equal(2, explained.Count);
            Assert.All(explained, e => Assert.True(e.IsPriorPeriodCorrection));
            var explainedIds = explained.Select(x => x.Id).ToList();
            Assert.Equal(2, await db.ConsignmentStockLedgerEntries.CountAsync(e => e.ReversesEntryId != null && explainedIds.Contains(e.ReversesEntryId.Value)));
            // Each link names its own review of the discrepancy it settled.
            Assert.Equal(2, await db.ConsignmentReviewEvents.CountAsync(e => e.SubjectType == "ConsignmentStockDiscrepancy" && e.SubjectId == shortage.Id));
            // No Tag Code moved, nothing released from custody, no money posted.
            Assert.Equal(units, await UnitSnapshot(db));
            await AssertNoFinancialRecords(db);
        }
        finally { MigratedSchema.Value = false; }
    }

    [Fact]
    public async Task B1_ReducingAnExplainedLateRefundReopensTheSurplusNote()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        var (a, price, _) = await Month(db, "b1-refund");
        await ClosedCount(db, Count("2026-08-31", 9));
        var note = await OpenDiscrepancy(db, "Surplus");
        var v1 = await Recorded(db, ReportFor(a.Id, "2026-08", 2, "B1R-B", [Refund(price.Id, 2, AugustFirst, restock: 2)]));
        v1 = await VerifyLinked(db, v1, [Link(note.Id, 2, "Refund slips 25 and 29 Aug")]);
        Assert.Equal((9, 0, 0, 1, 0, 10, true), await Ledger(db));
        Assert.Equal(0, (await Position(db)).OpenSurplus);
        // Only one package came back: one of the two extra units is unexplained again.
        var v2 = await Correct(db, v1, ReportFor(a.Id, "2026-08", 2, "B1R-B", [Refund(price.Id, 1, AugustFirst, restock: 1)]));
        Assert.Equal((1, "Surplus", 2), (v2.LateReport!.Skus.Single().LateShelfChange, v2.LateReport.Skus.Single().ExplainsKind,
            v2.LateReport.Skus.Single().Candidates.Single().OpenQuantity));
        await Assert.ThrowsAsync<ApiException>(() => VerifyLinked(db, v2, [Link(note.Id, 2, "Refund slip 29 Aug")]));
        await VerifyLinked(db, v2, [Link(note.Id, 1, "Refund slip 29 Aug")]);
        Assert.Equal((8, 0, 0, 2, 0, 10, true), await Ledger(db));
        Assert.Equal(1, (await Position(db)).OpenSurplus);
        // The next count of the same 9 packages matches: 8 verified plus the 1 still noted.
        var next = await ClosedCount(db, Count("2026-09-15", 9), LateClock);
        Assert.Equal((8, 1, 9, 0), (next.Lines.Single().BookSellable, next.Lines.Single().OpenSurplusBefore, next.Lines.Single().ExpectedSellable,
            next.Lines.Single().Shortage + next.Lines.Single().Surplus));
    }

    // --- B2: explicit, temporally eligible links only -----------------------------------------------

    [Fact]
    public async Task B2_ALateSaleNeverExplainsAShortageFromALaterUnrelatedCount()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        var (a, price, _) = await Month(db, "b2-later");
        await ClosedCount(db, Count("2026-08-31", 7));
        var september = await ClosedCount(db, Count("2026-09-15", 6), LateClock);
        var shortage = await OpenDiscrepancy(db, "Shortage");
        Assert.Equal(september.Id, shortage.OriginStocktakeId);
        // The 16–31 Aug report's first count was 31 Aug, which matched: there is nothing for it to explain.
        var late = await At(db, LateClock).GetSalesReportAsync((await Recorded(db, ReportFor(a.Id, "2026-08", 2, "B2L-B", [Sale(price.Id, 1)]))).Id, default);
        Assert.Empty(late.LateReport!.Skus.Single().Candidates);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => VerifyLinked(db, late, [Link(shortage.Id, 1)], LateClock))).StatusCode);
        // Verified without a link, nothing is resolved by assumption.
        await VerifyLinked(db, late, null, LateClock);
        Assert.Equal((5, 0, 1, 4, 0, 10, true), await Ledger(db));
        Assert.Equal(("Open", 1), ((await DiscrepancyById(db, shortage.Id)).Status, (await DiscrepancyById(db, shortage.Id)).OpenQuantity));
        await AssertInvestigationMatchesOpenShortages(db);
    }

    [Fact]
    public async Task B2_ASaleNeverExplainsACountTakenBeforeItsPeriodAndEveryLinkIsChecked()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext(); await AddReviewer(db);
        var (a, price, _) = await Month(db, "b2-before");
        await ClosedCount(db, Count("2026-08-15", 5));
        var first = await OpenDiscrepancy(db, "Shortage");
        await Resolve(db, first, "Found", 1);
        // The next count, on 15 Sep, is counted and recorded by the reviewer, then closed by the owner.
        var svc = At(db, LateClock);
        var draft = await svc.CreateStocktakeAsync(ReviewerUser, Count("2026-09-15", 5), default);
        var recorded = await svc.RecordStocktakeAsync(ReviewerUser, draft.Id, new(draft.ConcurrencyToken), default);
        var second = await svc.ApproveStocktakeAsync(OwnerAccountId, recorded.Id, Close(recorded), default);
        var shortages = await Later(db).DiscrepanciesAsync(BranchId, "Open", default);
        var september = shortages.Single(d => d.OriginStocktakeId == second.Id);
        Assert.Equal((5, 0, 2, 3, 0, 10, true), await Ledger(db));

        // A 16–31 Aug sale was first counted on 15 Sep, so only that count's shortage is a candidate.
        var late = await Recorded(db, ReportFor(a.Id, "2026-08", 2, "B2B-B", [Sale(price.Id, 1)]));
        var candidate = late.LateReport!.Skus.Single().Candidates.Single();
        Assert.Equal((september.Id, "2026-09-15", 1), (candidate.DiscrepancyId, candidate.OriginCountDate, candidate.OpenQuantity));
        // Refused: the 15 Aug count was before these sales; the count sheet as proof; too many; twice; no explanation.
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => VerifyLinked(db, late, [Link(first.Id, 1)], LateClock))).StatusCode);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => VerifyLinked(db, late, [Link(september.Id, 1, "Count sheet photo 2026-09-15")], LateClock))).StatusCode);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => VerifyLinked(db, late, [Link(september.Id, 2)], LateClock))).StatusCode);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => VerifyLinked(db, late, [Link(september.Id, 1), Link(september.Id, 1)], LateClock))).StatusCode);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => VerifyLinked(db, late,
            [new ConsignmentLateAllocationRequest(september.Id, 1, "POS receipt 20 Aug", "sold")], LateClock))).StatusCode);
        // Whoever counted can't settle the count's finding through a report either; independent of the report isn't enough.
        Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => VerifyLinked(db, late, [Link(september.Id, 1)], LateClock, ReviewerUser))).StatusCode);
        Assert.Equal((5, 0, 2, 3, 0, 10, true), await Ledger(db));
        await VerifyLinked(db, late, [Link(september.Id, 1)], LateClock);

        // Only the 15 Sep shortage is explained; the earlier, partly resolved one is untouched.
        Assert.Equal("Resolved", (await DiscrepancyById(db, september.Id)).Status);
        Assert.Equal(("Open", 1), ((await DiscrepancyById(db, first.Id)).Status, (await DiscrepancyById(db, first.Id)).OpenQuantity));
        Assert.Equal((5, 0, 1, 4, 0, 10, true), await Ledger(db));
        await AssertInvestigationMatchesOpenShortages(db);
        Assert.True(await db.ConsignmentReviewEvents.AnyAsync(e => e.SubjectType == "ConsignmentStockDiscrepancy" && e.SubjectId == september.Id));
    }

    // --- B3: no return is certified without a physical return -----------------------------------------

    [Fact]
    public async Task B3_DamagedStockCanNotBeResolvedAsReturned()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        await Month(db, "b3");
        await ClosedCount(db, Count("2026-08-31", 6, 1));
        var damaged = await OpenDiscrepancy(db, "UnsellableFound");
        Assert.DoesNotContain("ReturnedToMyPetLink", damaged.AllowedOutcomes);
        var before = await Ledger(db);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => Resolve(db, damaged, "ReturnedToMyPetLink", 1))).StatusCode);
        Assert.Equal(("Open", 1), ((await DiscrepancyById(db, damaged.Id)).Status, (await DiscrepancyById(db, damaged.Id)).OpenQuantity));
        Assert.Equal(before, await Ledger(db));
        Assert.Empty(db.ConsignmentDiscrepancyResolutions);
        // Confirming the damage keeps it in Unsellable until it physically comes back.
        await Resolve(db, damaged, "ConfirmedDamaged", 1);
        Assert.Equal((6, 1, 0, 3, 0, 10, true), await Ledger(db));
    }

    // --- B4: independence over every affected subject ------------------------------------------------

    [Fact]
    public async Task B4_SettlingARelatedShortageNeedsIndependenceFromBothCounts()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext(); await AddReviewer(db);
        await Month(db, "b4");
        // A (the operator) counts the shortage; B (the reviewer) counts the later surplus; C (the owner) closes both.
        await ClosedCount(db, Count("2026-08-15", 5));
        var shortage = await OpenDiscrepancy(db, "Shortage");
        var svc = Later(db);
        var draft = await svc.CreateStocktakeAsync(ReviewerUser, Count("2026-08-31", 7), default);
        var recorded = await svc.RecordStocktakeAsync(ReviewerUser, draft.Id, new(draft.ConcurrencyToken), default);
        await svc.ApproveStocktakeAsync(OwnerAccountId, recorded.Id, Close(recorded), default);
        var surplus = await OpenDiscrepancy(db, "Surplus");
        var request = new ResolveConsignmentDiscrepancyRequest(surplus.ConcurrencyToken, "EarlierShortageFound", 2, "Shop photo of both packages 2 Sep",
            "Both missing packages were behind the counter", shortage.Id);
        // A can't settle their own shortage directly, nor through B's surplus.
        Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => svc.ResolveDiscrepancyAsync(AdminAccountId, shortage.Id,
            new(shortage.ConcurrencyToken, "Found", 2, "Shop photo of both packages 2 Sep", "Both missing packages were behind the counter"), default))).StatusCode);
        Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => svc.ResolveDiscrepancyAsync(AdminAccountId, surplus.Id, request, default))).StatusCode);
        Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => svc.ResolveDiscrepancyAsync(ReviewerUser, surplus.Id, request, default))).StatusCode);
        Assert.Empty(db.ConsignmentDiscrepancyResolutions);

        // Solo: the nominated founder may self-review both, with fresh evidence, and both subjects are journaled.
        await SoloAccess(db); await SetMode(db);
        var solo = SoloLater(db);
        await Assert.ThrowsAsync<ApiException>(() => solo.ResolveDiscrepancyAsync(AdminAccountId, surplus.Id, request, default));
        var resolved = await solo.ResolveDiscrepancyAsync(AdminAccountId, surplus.Id,
            request with { SelfReview = Attest("Shop photo of both packages 2 Sep") }, default);
        Assert.Equal(("Resolved", "Self-reviewed (Solo)"), (resolved.Status, resolved.Resolutions.Single().ReviewMode));
        var settled = await DiscrepancyById(db, shortage.Id);
        Assert.Equal(("Resolved", "Self-reviewed (Solo)"), (settled.Status, settled.Resolutions.Single().ReviewMode));
        var reviews = await db.ConsignmentReviewEvents.AsNoTracking().Where(e => e.SubjectType == "ConsignmentStockDiscrepancy").ToListAsync();
        Assert.Equal(new[] { shortage.Id, surplus.Id }.Order(), reviews.Select(e => e.SubjectId!.Value).Order());
        Assert.All(reviews, e => Assert.Equal("Self-reviewed (Solo)", e.ReviewMode));
        Assert.Equal((7, 0, 0, 3, 0, 10, true), await Ledger(db));
    }

    // --- B5: the physical count time ---------------------------------------------------------------

    [Fact]
    public async Task B5_CountTimeIsRecordedAndADelayedCountNeedsConfirmationWithNoMovement()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        var (_, _, d) = await Month(db, "b5");
        Assert.NotNull(typeof(ConsignmentStocktake).GetProperty("CountedAt"));
        var morning = new DateTimeOffset(2026, 9, 1, 9, 0, 0, Myt);
        var s = At(db, morning);
        async Task<int> Refused(SaveConsignmentStocktakeRequest r, ConsignmentService? service = null) =>
            (await Assert.ThrowsAsync<ApiException>(() => (service ?? s).CreateStocktakeAsync(AdminAccountId, r, default))).StatusCode;
        var count = Count("2026-08-31", 7);
        Assert.Equal(400, await Refused(count with { CountedAt = null }));
        Assert.Equal(400, await Refused(count with { CountedAt = CountTime("2026-08-30", 21) }));
        Assert.Equal(400, await Refused(count with { CountedAt = CountTime("2026-09-01", 10) }));
        Assert.Equal(400, await Refused(count with { CountedAt = CountTime("2026-09-02", 1) }, At(db, new DateTimeOffset(2026, 9, 2, 12, 0, 0, Myt))));
        // The next morning, before the shop opens: only with a documented confirmation that nothing moved.
        Assert.Equal(400, await Refused(count with { CountedAt = CountTime("2026-09-01", 4) }));
        var note = "Shop opens at 10 am; owner confirms no sales or deliveries before the count";
        // A unit goes back to MyPetLink at 5 am: a count after that can't be compared with the books at midnight.
        var custody = At(db, CountTime("2026-09-01", 5));
        d = await custody.GetAsync(d.Id, false, default);
        await custody.ActionAsync(AdminAccountId, d.Id, "return", Action(d, "RETURN-1-SEP", [d.Units.First().Id]), default);
        Assert.Equal(400, await Refused(count with { CountedAt = CountTime("2026-09-01", 8), CountedAfterCutoffNote = note }));
        var draft = await s.CreateStocktakeAsync(AdminAccountId, count with { CountedAt = CountTime("2026-09-01", 4), CountedAfterCutoffNote = note }, default);
        Assert.Equal((CountTime("2026-09-01", 4), note), (draft.CountedAt!.Value, draft.CountedAfterCutoffNote));
        var recorded = await s.RecordStocktakeAsync(AdminAccountId, draft.Id, new(draft.ConcurrencyToken), default);
        Assert.Empty(recorded.Issues);
        Assert.Contains(recorded.Warnings, w => w.Contains("after 31 Aug 2026 ended") && w.Contains(note));
        var closed = await s.ApproveStocktakeAsync(OwnerAccountId, recorded.Id, Close(recorded), default);
        Assert.Equal(("Approved", "2026-08-31"), (closed.Status, closed.CountDate));
        Assert.Equal(0, closed.Lines.Single().Shortage + closed.Lines.Single().Surplus);
        Assert.Equal((6, 0, 0, 3, 0, 9, true), await Ledger(db));
    }

    // --- B6: closed history across every write path --------------------------------------------------

    [Fact]
    public async Task B6_ClosedAndRecordedStocktakeLinesCanNotBeInsertedMovedOrRecounted()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(10); await using var db = scope.NewContext();
            Assert.Contains(HardeningMigration, await db.Database.GetAppliedMigrationsAsync());
            await Month(db, "b6");
            var closed = await ClosedCount(db, Count("2026-08-15", 7));
            var other = await db.TagProductVariants.Where(v => v.Id != NfcVariantId).Select(v => v.Id).FirstAsync();
            async Task<int> Sql(FormattableString sql) => (await SqlFailure(() => db.Database.ExecuteSqlInterpolatedAsync(sql))).Number;
            Assert.Equal(51052, await Sql($"INSERT INTO ConsignmentStocktakeLines(Id,StocktakeId,ProductVariantId,SkuSnapshot,CountedSellable,CountedUnsellable) VALUES({Guid.NewGuid()},{closed.Id},{other},{"INJECTED"},999,0)"));
            Assert.Single((await Later(db).GetStocktakeAsync(closed.Id, default)).Lines);

            // A draft is still freely edited, but its lines can't move into the closed month or arrive frozen.
            var draft = await Later(db).CreateStocktakeAsync(AdminAccountId, Count("2026-08-31", 7) with { CountedAt = CountTime("2026-08-31", 14) }, default);
            Assert.Equal(51052, await Sql($"INSERT INTO ConsignmentStocktakeLines(Id,StocktakeId,ProductVariantId,SkuSnapshot,CountedSellable,CountedUnsellable,FrozenAt) VALUES({Guid.NewGuid()},{draft.Id},{other},{"FROZEN"},1,0,{Now})"));
            // A draft accepts an ordinary new line on any write path, but it can't then move into the closed month.
            // (Moving the same SKU would also break the one-line-per-SKU key.)
            var draftLine = Guid.NewGuid();
            await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO ConsignmentStocktakeLines(Id,StocktakeId,ProductVariantId,SkuSnapshot,CountedSellable,CountedUnsellable) VALUES({draftLine},{draft.Id},{other},{"DRAFT-LINE"},0,0)");
            Assert.Equal(2601, await Sql($"UPDATE ConsignmentStocktakeLines SET StocktakeId = {closed.Id} WHERE StocktakeId = {draft.Id} AND ProductVariantId = {NfcVariantId}"));
            Assert.Equal(51052, await Sql($"UPDATE ConsignmentStocktakeLines SET StocktakeId = {closed.Id} WHERE Id = {draftLine}"));
            draft = await Later(db).UpdateStocktakeAsync(AdminAccountId, draft.Id, draft.ConcurrencyToken, Count("2026-08-31", 6) with { CountedAt = CountTime("2026-08-31", 14) }, default);
            var recorded = await Later(db).RecordStocktakeAsync(AdminAccountId, draft.Id, new(draft.ConcurrencyToken), default);
            Assert.Contains(recorded.Warnings, w => w.Contains("before the end of 31 Aug 2026"));
            var line = recorded.Lines.Single(l => l.Id is not null).Id!.Value;

            // A recorded count keeps its lines and its details.
            Assert.Equal(51052, await Sql($"UPDATE ConsignmentStocktakeLines SET CountedSellable = 7 WHERE Id = {line}"));
            Assert.Equal(51052, await Sql($"INSERT INTO ConsignmentStocktakeLines(Id,StocktakeId,ProductVariantId,SkuSnapshot,CountedSellable,CountedUnsellable) VALUES({Guid.NewGuid()},{recorded.Id},{other},{"LATE-LINE"},1,0)"));
            Assert.Equal(51052, await Sql($"DELETE FROM ConsignmentStocktakeLines WHERE Id = {line}"));
            Assert.Equal(51052, await Sql($"UPDATE ConsignmentStocktakes SET Status = 'Draft' WHERE Id = {recorded.Id}"));
            Assert.Equal(51052, await Sql($"UPDATE ConsignmentStocktakes SET CountedAt = {CountTime("2026-08-31", 22)} WHERE Id = {recorded.Id}"));
            Assert.Contains(await Sql($"DELETE FROM ConsignmentStocktakes WHERE Id = {recorded.Id}"), new[] { 547, 51052 });

            // EF refuses the same changes before they reach SQL Server.
            db.ConsignmentStocktakeLines.Add(new ConsignmentStocktakeLine { StocktakeId = closed.Id, ProductVariantId = other, SkuSnapshot = "EF-INJECTED", CountedSellable = 1 });
            await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
            db.ChangeTracker.Clear();
            var tracked = await db.ConsignmentStocktakeLines.SingleAsync(l => l.Id == line);
            tracked.CountedSellable = 7;
            await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
            db.ChangeTracker.Clear();
            tracked = await db.ConsignmentStocktakeLines.SingleAsync(l => l.Id == line);
            tracked.StocktakeId = closed.Id;
            await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
            db.ChangeTracker.Clear();

            // The legitimate close still freezes every line, atomically.
            var approved = await Later(db).ApproveStocktakeAsync(OwnerAccountId, recorded.Id, Close(recorded), default);
            Assert.All(approved.Lines, l => Assert.True(l.Frozen));
            Assert.Equal(51050, await Sql($"UPDATE ConsignmentStocktakes SET Notes = 'Edited' WHERE Id = {approved.Id}"));
            Assert.Equal(51049, await Sql($"UPDATE ConsignmentStocktakeLines SET Notes = 'Edited' WHERE Id = {line}"));
            Assert.Equal((6, 0, 1, 3, 0, 10, true), await Ledger(db));
        }
        finally { MigratedSchema.Value = false; }
    }

    [Fact]
    public async Task B6_HardeningRollbackIsCleanWhenEmptyAndBlockedByItsHistory()
    {
        Assert.True(RelationalDatabase.IsAvailable, "SQL Server migration verification must not skip.");
        await using (var empty = await RelationalDatabase.CreateAsync(createSchema: false))
        {
            await using var db = empty.NewContext();
            await db.Database.MigrateAsync();
            await db.GetService<IMigrator>().MigrateAsync(StocktakeMigration);
            Assert.Equal([HardeningMigration, AgreementDocumentsMigration, ReferencesMigration, CareCompletionIdempotencyMigration, DeliveryOrdersMigration, DocumentSignaturesMigration, SettlementsMigration, RecoveriesMigration, SignatureOwnershipMigration], await db.Database.GetPendingMigrationsAsync());
            // The previous, weaker trigger is back exactly as it was.
            var definition = await db.Database.SqlQueryRaw<string>("SELECT OBJECT_DEFINITION(OBJECT_ID('TR_ConsignmentStocktakeLines_Frozen')) AS Value").SingleAsync();
            Assert.DoesNotContain("51052", definition);
            await db.Database.MigrateAsync();
            Assert.Empty(await db.Database.GetPendingMigrationsAsync());
        }
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(4); await using var db = scope.NewContext();
            var a = await AgreementFrom(db, AugustFirst); await ReceiveUnder(db, a.Id, 4, "b6-down");
            await RecordedCount(db, Count("2026-08-15", 4));
            await ReleaseReferenceRollbackGuard(db, StocktakeMigration);
            var blocked = await Assert.ThrowsAnyAsync<Exception>(() => db.GetService<IMigrator>().MigrateAsync(StocktakeMigration));
            Assert.Contains("51053", blocked.ToString());
            db.ChangeTracker.Clear();
            // Only the empty agreement-document migration above it rolled back.
            Assert.Equal([AgreementDocumentsMigration, ReferencesMigration, CareCompletionIdempotencyMigration, DeliveryOrdersMigration, DocumentSignaturesMigration, SettlementsMigration, RecoveriesMigration, SignatureOwnershipMigration], await db.Database.GetPendingMigrationsAsync());
            Assert.Equal(1, await db.ConsignmentStocktakes.CountAsync(s => s.CountedAt != null));
        }
        finally { MigratedSchema.Value = false; }
    }

    // --- B7: refund-only and unsupported corrections ---------------------------------------------------

    [Fact]
    public async Task B7_RefundOnlyCorrectionsOfALateReportAreHandled()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        var (a, price, _) = await Month(db, "b7");
        await ClosedCount(db, Count("2026-08-31", 9));
        var late = await Verified(db, ReportFor(a.Id, "2026-08", 2, "B7-B", [Refund(price.Id, 2, AugustFirst, restock: 2)]));
        Assert.Equal((9, 0, 0, 1, 0, 10, true), await Ledger(db));
        // Unlinked, the note stays open; the next count settles what it no longer finds and holds one missing.
        Assert.Equal(2, (await Position(db)).OpenSurplus);
        await ClosedCount(db, Count("2026-09-15", 8), LateClock);
        Assert.Equal((8, 0, 1, 1, 0, 10, true), await Ledger(db));
        // Codex's case: the refund is reduced to one. It used to throw; now it posts and stays consistent.
        var v2 = await Correct(db, late, ReportFor(a.Id, "2026-08", 2, "B7-B", [Refund(price.Id, 1, AugustFirst, restock: 1)]));
        await VerifyLinked(db, v2, null, LateClock);
        Assert.Equal((7, 0, 1, 2, 0, 10, true), await Ledger(db));
        // And the restock is removed altogether (a money-only refund).
        var current = await At(db, LateClock).GetSalesReportAsync(v2.Id, default);
        var v3 = await Correct(db, current, ReportFor(a.Id, "2026-08", 2, "B7-B", [Refund(price.Id, 1, AugustFirst)]));
        await VerifyLinked(db, v3, null, LateClock);
        Assert.Equal((6, 0, 1, 3, 0, 10, true), await Ledger(db));
        await AssertInvestigationMatchesOpenShortages(db);
    }

    [Fact]
    public async Task B7_ACorrectionTheShelfCannotSupportIsAClearBusinessError()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        var (a, price, _) = await Month(db, "b7-unsupported");
        await ClosedCount(db, Count("2026-08-31", 5));
        var shortage = await OpenDiscrepancy(db, "Shortage");
        var v1 = await Recorded(db, ReportFor(a.Id, "2026-08", 2, "B7U-B", [Sale(price.Id, 2)]));
        v1 = await VerifyLinked(db, v1, [Link(shortage.Id, 2)]);
        await Verified(db, ReportFor(a.Id, "2026-09", 1, "B7U-C", [Sale(price.Id, 5)]), LateClock);
        Assert.Equal((0, 0, 0, 10, 0, 10, true), await Ledger(db));
        var before = await db.ConsignmentStockLedgerEntries.CountAsync();
        var v2 = await Correct(db, v1, ReportFor(a.Id, "2026-08", 2, "B7U-B", [Sale(price.Id, 3)]));
        var unlinked = await Assert.ThrowsAsync<ApiException>(() => VerifyLinked(db, v2, null, LateClock));
        Assert.Equal(400, unlinked.StatusCode);
        // 3 short but only 2 reopened: no link can cover it, so it is a structural refusal, not an invitation to link.
        Assert.Contains("Check the delivery and earlier reports, or dispute this one", unlinked.Message);
        Assert.Empty(v2.LinkResolvableIssues);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => VerifyLinked(db, v2, [Link(shortage.Id, 2)], LateClock))).StatusCode);
        Assert.Equal(before, await db.ConsignmentStockLedgerEntries.CountAsync());
        Assert.Equal((0, 0, 0, 10, 0, 10, true), await Ledger(db));
        Assert.Equal("Recorded", (await At(db, LateClock).GetSalesReportAsync(v2.Id, default)).Status);
    }

    // --- B8: fresh evidence for every outcome -----------------------------------------------------------

    [Fact]
    public async Task B8_AResolutionNeedsEvidenceBeyondTheCountItselfInTeamAndSolo()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        await Month(db, "b8");
        var closed = await ClosedCount(db, Count("2026-08-31", 4));
        var shortage = await OpenDiscrepancy(db, "Shortage");
        Assert.Equal(3, shortage.OpenQuantity);
        Task<ConsignmentDiscrepancyResponse> Found(ConsignmentService s, Guid actor, ConsignmentDiscrepancyResponse d, string evidence, ConsignmentSelfReview? self = null) =>
            s.ResolveDiscrepancyAsync(actor, d.Id, new(d.ConcurrencyToken, "Found", 1, evidence, "One package was found in the storeroom", SelfReview: self), default);

        // Team: the count's own evidence (in any spelling) can't show the package turned up.
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => Found(Later(db), OwnerAccountId, shortage, closed.EvidenceReference))).StatusCode);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => Found(Later(db), OwnerAccountId, shortage, "  COUNT SHEET PHOTO 2026-08-31 "))).StatusCode);
        shortage = await Found(Later(db), OwnerAccountId, shortage, "Storeroom photo 2 Sep");
        Assert.Equal(("Independent (Team)", "Storeroom photo 2 Sep"), (shortage.Resolutions.Single().ReviewMode, shortage.Resolutions.Single().EvidenceReference));

        // Solo: the founder who counted needs new evidence too, cited in the attestation.
        await SoloAccess(db); await SetMode(db);
        var solo = SoloLater(db);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => Found(solo, AdminAccountId, shortage, closed.EvidenceReference,
            Attest(closed.EvidenceReference)))).StatusCode);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => Found(solo, AdminAccountId, shortage, "Owner WhatsApp photo 3 Sep",
            Attest(closed.EvidenceReference)))).StatusCode);
        var stale = shortage;
        shortage = await Found(solo, AdminAccountId, shortage, "Owner WhatsApp photo 3 Sep", Attest("Owner WhatsApp photo 3 Sep"));
        Assert.Equal("Self-reviewed (Solo)", shortage.Resolutions.Single(r => r.EvidenceReference == "Owner WhatsApp photo 3 Sep").ReviewMode);
        // A retried request with the old token is a conflict, never a second resolution.
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => Found(solo, AdminAccountId, stale, "Owner WhatsApp photo 3 Sep",
            Attest("Owner WhatsApp photo 3 Sep")))).StatusCode);
        // Revoking self-review takes effect on the next request.
        await db.AdminRoleCapabilities.Where(c => c.Capability == AdminCapabilities.ConsignmentSelfReview).ExecuteDeleteAsync();
        Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => Found(SoloLater(db), AdminAccountId, shortage, "Owner WhatsApp photo 4 Sep",
            Attest("Owner WhatsApp photo 4 Sep")))).StatusCode);
        Assert.Equal((6, 0, 1, 3, 0, 10, true), await Ledger(db));
        Assert.Equal(2, await db.ConsignmentDiscrepancyResolutions.CountAsync());
        await AssertInvestigationMatchesOpenShortages(db);
    }

    // --- Additional business checks ----------------------------------------------------------------------

    [Fact]
    public async Task ALossNeedsALaterCountOfTheSkuWithNoUnexplainedExtras()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        await Month(db, "loss");
        await ClosedCount(db, Count("2026-08-15", 5));
        var shortage = await OpenDiscrepancy(db, "Shortage");
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => Resolve(db, shortage, "ApprovedLoss", 2))).StatusCode);
        // The next count finds one extra package: it may be one of the missing two.
        await ClosedCount(db, Count("2026-08-31", 6));
        shortage = await DiscrepancyById(db, shortage.Id);
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => Resolve(db, shortage, "ApprovedLoss", 2))).StatusCode);
        await Resolve(db, await OpenDiscrepancy(db, "Surplus"), "EarlierShortageFound", 1, shortage.Id);
        shortage = await Resolve(db, await DiscrepancyById(db, shortage.Id), "ApprovedLoss", 1);
        Assert.Equal("Resolved", shortage.Status);
        Assert.Equal((6, 0, 0, 3, 1, 10, true), await Ledger(db));
    }

    [Fact]
    public async Task AClosedMonthNeedsTheFindingsAsTheyWereReviewed()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        var (_, _, d) = await Month(db, "preview");
        var reviewed = await RecordedCount(db, Count("2026-08-15", 5));
        Assert.NotNull(reviewed.ReviewFingerprint);
        // Acknowledging without saying which figures were reviewed isn't enough.
        Assert.Equal("review_outdated", (await Assert.ThrowsAsync<ApiException>(() => Later(db).ApproveStocktakeAsync(OwnerAccountId, reviewed.Id,
            new(reviewed.ConcurrencyToken, AcknowledgeWarnings: true), default))).Code);
        // A unit goes back to MyPetLink between the preview and the close: the reviewed figures are out of date.
        var s = Later(db); d = await s.GetAsync(d.Id, false, default);
        await s.ActionAsync(AdminAccountId, d.Id, "return", Action(d, "RETURN-AFTER-PREVIEW", [d.Units.First().Id]), default);
        Assert.Equal("review_outdated", (await Assert.ThrowsAsync<ApiException>(() => Later(db).ApproveStocktakeAsync(OwnerAccountId, reviewed.Id,
            Close(reviewed), default))).Code);
        Assert.Empty(db.ConsignmentStockDiscrepancies);
        var reloaded = await Later(db).GetStocktakeAsync(reviewed.Id, default);
        Assert.NotEqual(reviewed.ReviewFingerprint, reloaded.ReviewFingerprint);
        Assert.Equal("Approved", (await Later(db).ApproveStocktakeAsync(OwnerAccountId, reloaded.Id, Close(reloaded), default)).Status);
        Assert.Equal((4, 0, 2, 3, 0, 9, true), await Ledger(db));
    }

    [Fact]
    public async Task ASurplusNoteIsNeverVerifiedSellableStock()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        var (a, price, _) = await Month(db, "capacity");
        await ClosedCount(db, Count("2026-08-31", 9));
        var expected = (await Later(db).StocktakeExpectationAsync(BranchId, "2026-09-15", default)).Lines.Single();
        Assert.Equal((7, 2, 9), (expected.BookSellable, expected.OpenSurplusBefore, expected.ExpectedSellable));
        var r = await Recorded(db, ReportFor(a.Id, "2026-09", 1, "CAP-C", [Sale(price.Id, 8)]));
        var before = await Ledger(db);
        await Assert.ThrowsAsync<ApiException>(() => At(db, LateClock).VerifySalesReportAsync(OwnerAccountId, r.Id, new(r.ConcurrencyToken, AcknowledgeWarnings: true), default));
        Assert.Equal((7, 0, 0, 3, 0, 10, true), before);
        Assert.Equal(before, await Ledger(db));
    }

    [Fact]
    public async Task AReportVerifiedWhileTheMonthClosesNeverClosesOnFiguresNobodyReviewed()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(10); await using var db = scope.NewContext();
            var (a, price, _) = await Month(db, "race-close");
            var report = await Recorded(db, ReportFor(a.Id, "2026-08", 2, "RACE-CLOSE-B", [Sale(price.Id, 2)]));
            var count = await RecordedCount(db, Count("2026-08-31", 5));
            // Verify the report and close the month at once: the close either waits for the report (400) or sees
            // that the books changed since its preview (409). It never closes on the figures it was shown.
            var results = await Task.WhenAll(Enumerable.Range(0, 2).Select(async i => {
                await using var other = scope.NewContext();
                try
                {
                    if (i == 0) await Later(other).VerifySalesReportAsync(OwnerAccountId, report.Id, new(report.ConcurrencyToken, AcknowledgeWarnings: true), default);
                    else await Later(other).ApproveStocktakeAsync(OwnerAccountId, count.Id, Close(count), default);
                    return 200;
                }
                catch (ApiException e) { return e.StatusCode; }
            }));
            Assert.Equal(200, results[0]);
            Assert.Contains(results[1], new[] { 400, 409 });
            Assert.Equal("Recorded", (await Later(db).GetStocktakeAsync(count.Id, default)).Status);
            // Reloaded, the count matches the verified books exactly and closes cleanly.
            var reloaded = await Later(db).GetStocktakeAsync(count.Id, default);
            Assert.Empty(reloaded.Warnings);
            Assert.Equal("Approved", (await Later(db).ApproveStocktakeAsync(OwnerAccountId, count.Id, Close(reloaded), default)).Status);
            Assert.Equal((5, 0, 0, 5, 0, 10, true), await Ledger(db));
            Assert.Empty(db.ConsignmentStockDiscrepancies);
        }
        finally { MigratedSchema.Value = false; }
    }

    [Fact]
    public async Task ConcurrentLinksAndResolutionsSettleExactlyOnce()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(10); await using var db = scope.NewContext();
            var (a, price, _) = await Month(db, "race");
            await ClosedCount(db, Count("2026-08-31", 4));
            var shortage = await OpenDiscrepancy(db, "Shortage");
            var late = await Recorded(db, ReportFor(a.Id, "2026-08", 2, "RACE-B", [Sale(price.Id, 1)]));
            // The same late report verified twice at once, each linking the shortage: one wins, one conflicts.
            var verified = await Task.WhenAll(Enumerable.Range(0, 2).Select(async _ => {
                await using var other = scope.NewContext();
                try { await VerifyLinked(other, late, [Link(shortage.Id, 1)]); return 200; } catch (ApiException e) { return e.StatusCode; }
            }));
            Assert.Equal([200, 409], verified.Order());
            // Two resolutions of what is left, at once: exactly one moves stock.
            shortage = await DiscrepancyById(db, shortage.Id);
            var resolved = await Task.WhenAll(Enumerable.Range(0, 2).Select(async _ => {
                await using var other = scope.NewContext();
                try { await Resolve(other, shortage, "Found", 1); return 200; } catch (ApiException e) { return e.StatusCode; }
            }));
            Assert.Equal([200, 409], resolved.Order());
            Assert.Equal((5, 0, 1, 4, 0, 10, true), await Ledger(db));
            Assert.Equal(1, await db.ConsignmentStockLedgerEntries.CountAsync(e => e.EntryType == ConsignmentLedgerEntryTypes.LateReportExplainsShortage));
            Assert.Equal(2, await db.ConsignmentDiscrepancyResolutions.CountAsync());
            await AssertInvestigationMatchesOpenShortages(db);
        }
        finally { MigratedSchema.Value = false; }
    }
}
