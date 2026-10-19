using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

// Regression tests for the Phase 1B final gate (R2 here)'s findings R1 (a historical close must not settle obligations
// changed after its cutoff) and R2 (a sold-out late report must be linkable). Real service paths with
// controlled time; no trigger is disabled.
public sealed partial class ConsignmentRelationalTests
{
    // --- R2 -----------------------------------------------------------------------------------------

    [Fact]
    public async Task R2_ASoldOutLateReportSaysWhichIssuesALinkCanResolve()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        var (a, price, _) = await Month(db, "r2");
        // Codex FG10: a count of zero puts all 7 under investigation; the late report sells those 7.
        await ClosedCount(db, Count("2026-08-31", 0));
        var shortage = await OpenDiscrepancy(db, "Shortage");
        Assert.Equal((0, 0, 7, 3, 0, 10, true), await Ledger(db));
        var report = await Recorded(db, ReportFor(a.Id, "2026-08", 2, "R2-B", [Sale(price.Id, 7)]));
        var issue = Assert.Single(report.Issues);
        Assert.Equal([issue], report.LinkResolvableIssues);
        var sku = report.LateReport!.Skus.Single();
        Assert.Equal((7, 7, shortage.Id), (sku.RequiredLinks, sku.Candidates.Single().OpenQuantity, sku.Candidates.Single().DiscrepancyId));
        // Without a link, or with too little, verification is refused and nothing moves.
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => VerifyLinked(db, report, null))).StatusCode);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => VerifyLinked(db, report, [Link(shortage.Id, 6, "Six dated sale receipts")]))).StatusCode);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => VerifyLinked(db, report, [Link(shortage.Id, 7, "Count sheet photo 2026-08-31")]))).StatusCode);
        Assert.Equal((0, 0, 7, 3, 0, 10, true), await Ledger(db));
        // The full link with its own evidence verifies: 0 / 0 / 10, balanced.
        await VerifyLinked(db, report, [Link(shortage.Id, 7, "Seven dated sale receipts before the count")]);
        Assert.Equal((0, 0, 0, 10, 0, 10, true), await Ledger(db));
        Assert.Equal("Resolved", (await DiscrepancyById(db, shortage.Id)).Status);
        await AssertInvestigationMatchesOpenShortages(db);
    }

    [Fact]
    public async Task R2_StructuralIssuesAreNeverMarkedResolvableByALink()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        var (a, price, _) = await Month(db, "r2-structural");
        await ClosedCount(db, Count("2026-08-31", 0));
        // Eight sold, but the count found only 7 missing: no link can cover the eighth.
        var tooMany = await Recorded(db, ReportFor(a.Id, "2026-08", 2, "R2S-B", [Sale(price.Id, 8)]));
        Assert.NotEmpty(tooMany.Issues);
        Assert.Empty(tooMany.LinkResolvableIssues);
        Assert.Equal(0, tooMany.LateReport!.Skus.Single().RequiredLinks);
    }

    [Fact]
    public async Task R2_AnUnapprovedPriceStaysStructuralEvenWhenALinkWouldCoverTheStock()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        var (a, _, _) = await Month(db, "r2-price");
        await ClosedCount(db, Count("2026-08-31", 0));
        var unpriced = await Later(db).CreateSalesReportAsync(AdminAccountId, ReportFor(a.Id, "2026-08", 2, "R2P-B", [Sale(null, 7, 35m)]), default);
        unpriced = await Later(db).RecordSalesReportAsync(AdminAccountId, unpriced.Id, new(unpriced.ConcurrencyToken), default);
        Assert.Contains(unpriced.Issues, i => i.Contains("approved price"));
        Assert.DoesNotContain(unpriced.Issues.Where(i => i.Contains("approved price")), i => unpriced.LinkResolvableIssues.Contains(i));
        var shortage = await OpenDiscrepancy(db, "Shortage");
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => VerifyLinked(db, unpriced, [Link(shortage.Id, 7, "Seven dated sale receipts")]))).StatusCode);
        Assert.Equal((0, 0, 7, 3, 0, 10, true), await Ledger(db));
    }
}
