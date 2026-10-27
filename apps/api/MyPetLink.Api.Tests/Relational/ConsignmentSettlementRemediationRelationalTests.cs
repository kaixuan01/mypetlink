using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Tokens;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

// Regression tests for the independent Phase 1A review (F1-F6, F8). Each mirrors the reviewer's
// reproduction; the HTTP tests run real ASP.NET Core model binding, validation, JWT validation
// and capability resolution against a migrated SQL Server database.
public sealed partial class ConsignmentRelationalTests
{
    private static async Task<ConsignmentSalesReportResponse> Corrected(MyPetLinkDbContext db, ConsignmentSalesReportResponse old,
        Guid agreement, IReadOnlyList<ConsignmentSalesLineRequest> lines, int half = 1, string reference = "SHOP-2026-08-A")
    {
        var v = await Later(db).CorrectSalesReportAsync(AdminAccountId, old.Id, new(old.ConcurrencyToken, "Partner corrected the report"), default);
        v = await Later(db).UpdateSalesReportAsync(AdminAccountId, v.Id, v.ConcurrencyToken, Report(agreement, lines, half, reference), default);
        return await Later(db).RecordSalesReportAsync(AdminAccountId, v.Id, new(v.ConcurrencyToken), default);
    }

    private static Task<ConsignmentSalesReportResponse> VerifyRecorded(MyPetLinkDbContext db, ConsignmentSalesReportResponse recorded) =>
        Later(db).VerifySalesReportAsync(OwnerAccountId, recorded.Id, new(recorded.ConcurrencyToken), default);

    private static async Task<CommissionPayoutResponse> PaidPayout(MyPetLinkDbContext db, Guid seller, IReadOnlyCollection<SalesCommission> rows, string key)
    {
        var prepared = await Payouts(db).PrepareAsync(AdminAccountId, new(rows.Select(r => r.Id).ToArray(), seller,
            ReportClock.AddDays(-1), ReportClock.AddDays(1), rows.Sum(r => r.CommissionAmount), key));
        return await Payouts(db).MarkPaidAsync(AdminAccountId, prepared.Summary.Id,
            new(prepared.Summary.ConcurrencyToken, CommissionPayoutPaymentMethod.BankTransfer, "IBG-" + key, new DateOnly(2026, 9, 8)));
    }

    // --- F2: a corrected period that is no longer fully paid can't pay commission ----------------

    [Fact]
    public async Task F2_PriceOnlyCorrectionOfAReservedPeriodIsRefusedAndNothingMoves()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(30); await using var db = scope.NewContext();
            var (a, _, promo) = await PartnerWithStock(db, 20);
            var seller = await Seller(db, "MPL-SALES-0A", "Aina Rep"); await Serve(db, seller, Now.AddDays(-30)); await OnV11(db, seller);
            var higher = await ApprovedPrice(db, a.Id, 36.90m, "Promotion", "Alternative promotion", Now.AddDays(-1), Now.AddDays(40));
            var v1 = await Verified(db, a.Id, [Sale(promo.Id, 10, 34.90m)]);
            var s = await SettlementFor(db, v1);
            Assert.Equal(226.85m, s.Summary.ExpectedRemittance);
            await Remit(db, s.Summary.Id, 226.85m, "full");
            var row = Assert.Single(await Effective(db));
            var prepared = await Payouts(db).PrepareAsync(AdminAccountId, new([row.Id], seller, ReportClock.AddDays(-1), ReportClock.AddDays(1), 40m, "reserved"));

            var v2 = await Corrected(db, v1, a.Id, [Sale(higher.Id, 10, 36.90m)]);
            var refused = await Assert.ThrowsAsync<ApiException>(() => VerifyRecorded(db, v2));
            Assert.Equal(409, refused.StatusCode);
            Assert.Contains(prepared.Summary.PayoutNumber, refused.Message);
            db.ChangeTracker.Clear();
            Assert.Equal("Recorded", (await Later(db).GetSalesReportAsync(v2.Id, default)).Status);
            var unchanged = await SettlementFor(db, v1);
            Assert.Equal((1, "Settled", 226.85m), (unchanged.Summary.Revision, unchanged.Summary.Status, unchanged.Summary.ExpectedRemittance));

            // Once the payout is cancelled, the correction applies and the commission waits for the RM13 still due.
            await Payouts(db).CancelAsync(AdminAccountId, prepared.Summary.Id, new(prepared.Summary.ConcurrencyToken, "Partner corrected the price"));
            await VerifyRecorded(db, v2);
            s = await SettlementFor(db, v1);
            Assert.Equal(("PartiallyReceived", 239.85m, 13.00m, 40m, 0m), (s.Summary.Status, s.Summary.ExpectedRemittance, s.Summary.Outstanding, s.Summary.CommissionPending, s.Summary.CommissionPayable));
            var pending = Assert.Single(await Effective(db));
            Assert.Equal((SalesCommissionStatus.Pending, (DateTimeOffset?)null), (pending.Status, pending.PayableAt));
            var notPayable = await Assert.ThrowsAsync<ApiException>(() => Payouts(db).PrepareAsync(AdminAccountId,
                new([pending.Id], seller, ReportClock.AddDays(-1), ReportClock.AddDays(1), 40m, "too-early")));
            Assert.Equal("commission_not_payable", notPayable.Code);

            await Remit(db, s.Summary.Id, 13.00m, "rest");
            Assert.Equal(SalesCommissionStatus.Payable, Assert.Single(await Effective(db)).Status);
        }
        finally { MigratedSchema.Value = false; }
    }

    [Fact]
    public async Task F2_UnreservedPayableCommissionGoesBackToPendingWhenACorrectionLeavesMoneyOutstanding()
    {
        await using var scope = await Database(30); await using var db = scope.NewContext();
        var (a, _, promo) = await PartnerWithStock(db, 20);
        var seller = await Seller(db, "MPL-SALES-0A", "Aina Rep"); await Serve(db, seller, Now.AddDays(-30)); await OnV11(db, seller);
        var higher = await ApprovedPrice(db, a.Id, 36.90m, "Promotion", "Alternative promotion", Now.AddDays(-1), Now.AddDays(40));
        var v1 = await Verified(db, a.Id, [Sale(promo.Id, 10, 34.90m)]);
        await Remit(db, (await SettlementFor(db, v1)).Summary.Id, 226.85m, "full");
        var original = Assert.Single(await Effective(db));
        Assert.Equal(SalesCommissionStatus.Payable, original.Status);

        await VerifyRecorded(db, await Corrected(db, v1, a.Id, [Sale(higher.Id, 10, 36.90m)]));
        var demoted = Assert.Single(await Effective(db));
        // The same row (same quantity, rate and earner) is kept; only its eligibility changes, and that change is audited.
        Assert.Equal((original.Id, SalesCommissionStatus.Pending, (DateTimeOffset?)null), (demoted.Id, demoted.Status, demoted.PayableAt));
        Assert.True(await db.AuditLogs.AnyAsync(x => x.Action == "consignment.commission-back-to-pending" && x.EntityId == original.Id));
        Assert.Empty(await db.SalesCommissions.AsNoTracking().Where(c => c.Status == SalesCommissionStatus.Payable).ToListAsync());
    }

    [Fact]
    public async Task F2_PayoutRefusesConsignmentCommissionWhoseSettlementIsNotFullyReceived()
    {
        await using var scope = await Database(30); await using var db = scope.NewContext();
        var (a, standard, _) = await PartnerWithStock(db, 20);
        var seller = await Seller(db, "MPL-SALES-0A", "Aina Rep"); await Serve(db, seller, Now.AddDays(-30)); await OnV11(db, seller);
        var v1 = await Verified(db, a.Id, [Sale(standard.Id, 10)]);
        var s = await SettlementFor(db, v1);
        await Remit(db, s.Summary.Id, s.Summary.ExpectedRemittance, "full");
        var row = Assert.Single(await Effective(db));
        var prepared = await Payouts(db).PrepareAsync(AdminAccountId, new([row.Id], seller, ReportClock.AddDays(-1), ReportClock.AddDays(1), 45m, "prepared"));
        // Defence in depth: even if a settlement were reopened by some other route, the payout refuses it.
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE ConsignmentSettlements SET Status = 'PartiallyReceived', SettledAt = NULL, ReceivedAmount = 100 WHERE Id = {s.Summary.Id}");
        var refused = await Assert.ThrowsAsync<ApiException>(() => Payouts(db).MarkPaidAsync(AdminAccountId, prepared.Summary.Id,
            new(prepared.Summary.ConcurrencyToken, CommissionPayoutPaymentMethod.BankTransfer, "IBG-1", new DateOnly(2026, 9, 8))));
        Assert.Equal("commission_settlement_not_received", refused.Code);
        await Payouts(db).CancelAsync(AdminAccountId, prepared.Summary.Id, new((await Payouts(db).GetAsync(prepared.Summary.Id)).Summary.ConcurrencyToken, "Settlement reopened"));
        var prepareRefused = await Assert.ThrowsAsync<ApiException>(() => Payouts(db).PrepareAsync(AdminAccountId,
            new([row.Id], seller, ReportClock.AddDays(-1), ReportClock.AddDays(1), 45m, "second")));
        Assert.Equal("commission_settlement_not_received", prepareRefused.Code);
        Assert.Equal(SalesCommissionStatus.Payable, (await db.SalesCommissions.AsNoTracking().SingleAsync()).Status);
    }

    [Fact]
    public async Task F2_ConcurrentPayoutPreparationAndPriceCorrectionNeverPayAnUnsettledPeriod()
    {
        await using var scope = await Database(30);
        Guid seller, rowId, settlementId; ConsignmentSalesReportResponse v2;
        await using (var db = scope.NewContext())
        {
            var (a, _, promo) = await PartnerWithStock(db, 20);
            seller = await Seller(db, "MPL-SALES-0A", "Aina Rep"); await Serve(db, seller, Now.AddDays(-30)); await OnV11(db, seller);
            var higher = await ApprovedPrice(db, a.Id, 36.90m, "Promotion", "Alternative promotion", Now.AddDays(-1), Now.AddDays(40));
            var v1 = await Verified(db, a.Id, [Sale(promo.Id, 10, 34.90m)]);
            settlementId = (await SettlementFor(db, v1)).Summary.Id;
            await Remit(db, settlementId, 226.85m, "full");
            rowId = Assert.Single(await Effective(db)).Id;
            v2 = await Corrected(db, v1, a.Id, [Sale(higher.Id, 10, 36.90m)]);
        }
        using var gate = new SemaphoreSlim(0, 2);
        async Task<string> Prepare()
        {
            await using var db = scope.NewContext(); await gate.WaitAsync();
            try { await Payouts(db).PrepareAsync(AdminAccountId, new([rowId], seller, ReportClock.AddDays(-1), ReportClock.AddDays(1), 40m, "race")); return "prepared"; }
            catch (ApiException) { return "refused"; }
        }
        async Task<string> Correct()
        {
            await using var db = scope.NewContext(); await gate.WaitAsync();
            try { await VerifyRecorded(db, v2); return "corrected"; }
            catch (ApiException) { return "refused"; }
        }
        var tasks = new[] { Prepare(), Correct() };
        gate.Release(2);
        var outcome = await Task.WhenAll(tasks);
        Assert.Single(outcome, x => x != "refused");
        await using var check = scope.NewContext();
        var s = await check.ConsignmentSettlements.AsNoTracking().SingleAsync(x => x.Id == settlementId);
        var row = await check.SalesCommissions.AsNoTracking().Include(c => c.PayoutItems).SingleAsync(c => c.Id == rowId);
        if (outcome[0] == "prepared")
            Assert.Equal((ConsignmentSettlementStatus.Settled, SalesCommissionStatus.Payable), (s.Status, row.Status));
        else
            Assert.Equal((ConsignmentSettlementStatus.PartiallyReceived, SalesCommissionStatus.Pending, 0),
                (s.Status, row.Status, row.PayoutItems.Count(i => i.ReleasedAt == null)));
    }

    [Fact]
    public async Task F2_ACorrectionWaitsForTheRowLockAPayoutTakesBeforeReservingCommission()
    {
        // Deterministic form of the race above: a payout holds exactly the row lock it takes before
        // reserving or paying commission, and changes the row (as recording it paid does). A correction
        // of that period must wait and then plan from the payout's result; reading past the lock through
        // the settlement index would plan from the old row and overwrite the payout's change.
        await using var scope = await Database(30);
        Guid rowId; ConsignmentSalesReportResponse v2;
        await using (var db = scope.NewContext())
        {
            var (a, _, promo) = await PartnerWithStock(db, 20);
            var seller = await Seller(db, "MPL-SALES-0A", "Aina Rep"); await Serve(db, seller, Now.AddDays(-30)); await OnV11(db, seller);
            var higher = await ApprovedPrice(db, a.Id, 36.90m, "Promotion", "Alternative promotion", Now.AddDays(-1), Now.AddDays(40));
            var v1 = await Verified(db, a.Id, [Sale(promo.Id, 10, 34.90m)]);
            await Remit(db, (await SettlementFor(db, v1)).Summary.Id, 226.85m, "full");
            rowId = Assert.Single(await Effective(db)).Id;
            v2 = await Corrected(db, v1, a.Id, [Sale(higher.Id, 10, 36.90m)]);
        }
        await using var payoutSide = scope.NewContext();
        await using (var tx = await payoutSide.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable))
        {
            await payoutSide.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM [SalesCommissions] WITH (UPDLOCK, HOLDLOCK) WHERE [Id] = {rowId}");
            await using var correctionSide = scope.NewContext();
            var correction = VerifyRecorded(correctionSide, v2);
            var finishedWhileLocked = await Task.WhenAny(correction, Task.Delay(TimeSpan.FromSeconds(4))) == correction;
            await payoutSide.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE [SalesCommissions] SET [Status] = 'Paid', [PaidAt] = SYSDATETIMEOFFSET() WHERE [Id] = {rowId}");
            await tx.CommitAsync();
            Assert.False(finishedWhileLocked, "The correction finished while a payout held the commission row.");
            await correction;
        }
        // The correction saw the paid row: it stays Paid; the period now owes RM13 but nothing paid is rewritten.
        await using var check = scope.NewContext();
        Assert.Equal(SalesCommissionStatus.Paid, (await check.SalesCommissions.AsNoTracking().SingleAsync(c => c.Id == rowId)).Status);
        Assert.Single(await check.SalesCommissions.AsNoTracking().Where(c => c.Status != SalesCommissionStatus.Reversed).ToListAsync());
    }

    // --- F3: terms accepted before the period but recorded after it was calculated ---------------

    [Fact]
    public async Task F3_LateRecordedTermsThatCoveredThePeriodApplyOnRecalculationWithAudit()
    {
        await using var scope = await Database(30); await using var db = scope.NewContext();
        var (a, standard, _) = await PartnerWithStock(db, 20);
        var seller = await Seller(db, "MPL-SALES-0A", "Aina Rep"); await Serve(db, seller, Now.AddDays(-30));
        var s = await SettlementFor(db, await Verified(db, a.Id, [Sale(standard.Id, 10)]));
        Assert.Equal(("Resolved", (string?)null, 0m), (s.Summary.AttributionStatus, s.Summary.CommissionPolicyCode, s.Summary.CommissionPending));
        await OnV11(db, seller); // accepted and effective before the period, recorded only now
        s = await Later(db).GetSettlementAsync(s.Summary.Id, default);
        s = await Later(db).RecalculateSettlementAsync(AdminAccountId, s.Summary.Id, new("Signed terms dated before the period are now recorded", s.Summary.ConcurrencyToken), default);
        Assert.Equal(("Resolved", seller, "v1.1", 45m), (s.Summary.AttributionStatus, s.Summary.SalespersonId, s.Summary.CommissionPolicyCode, s.Summary.CommissionPending));
        Assert.True(await db.AuditLogs.AnyAsync(x => x.Action == "consignment.settlement-commission-terms-applied" && x.EntityId == s.Summary.Id
            && x.OldValue!.Contains("null") && x.NewValue!.Contains("v1.1")));
    }

    [Fact]
    public async Task F3_TermsThatStartedAfterThePeriodBeganNeverApplyLate()
    {
        await using var scope = await Database(30); await using var db = scope.NewContext();
        var (a, standard, _) = await PartnerWithStock(db, 20);
        var seller = await Seller(db, "MPL-SALES-0A", "Aina Rep"); await Serve(db, seller, Now.AddDays(-30));
        var s = await SettlementFor(db, await Verified(db, a.Id, [Sale(standard.Id, 10)]));
        await Policies(db).RecordAsync(AdminAccountId, seller, new(CommissionPolicyCodes.V1_1, Now.AddDays(5), Now.AddDays(5), "Accepted mid-period", null), default);
        s = await Later(db).RecalculateSettlementAsync(AdminAccountId, s.Summary.Id, new("Checking whether the new terms apply", s.Summary.ConcurrencyToken), default);
        Assert.Equal(((string?)null, 0m), (s.Summary.CommissionPolicyCode, s.Summary.CommissionPending));
        Assert.Contains("only part of this period", s.Summary.CommissionNote);
    }

    // --- F4: naming a salesperson never extends their terms ------------------------------------

    [Fact]
    public async Task F4_ManualResolutionNeverPaysTheUncoveredPartOfAPeriod()
    {
        await using var scope = await Database(30); await using var db = scope.NewContext();
        var (a, standard, _) = await PartnerWithStock(db, 20);
        var seller = await Seller(db, "MPL-SALES-0A", "Aina Rep"); await Serve(db, seller, Now.AddDays(-30));
        await Policies(db).RecordAsync(AdminAccountId, seller, new(CommissionPolicyCodes.V1_1, Now.AddDays(5), Now.AddDays(5), "Terms first accepted mid-period", null), default);
        var s = await SettlementFor(db, await Verified(db, a.Id, [Sale(standard.Id, 10)]));
        Assert.Equal("NeedsResolution", s.Summary.AttributionStatus);
        s = await Later(db).ResolveSettlementAttributionAsync(AdminAccountId, s.Summary.Id,
            new(seller, "Representative serviced all of this period", s.Summary.ConcurrencyToken), default);
        Assert.Equal(("Resolved", seller, (string?)null, 0m), (s.Summary.AttributionStatus, s.Summary.SalespersonId, s.Summary.CommissionPolicyCode, s.Summary.CommissionPending));
        Assert.Contains("only part of this period", s.Summary.CommissionNote);
        Assert.Empty(db.SalesCommissions);
    }

    [Fact]
    public async Task F4_ManualResolutionPaysWhenTermsCoverTheWholePeriodAndNotWithoutTerms()
    {
        await using var scope = await Database(40); await using var db = scope.NewContext();
        var (a, standard, _) = await PartnerWithStock(db, 30);
        var covered = await Seller(db, "MPL-SALES-0A", "Aina Rep"); await OnV11(db, covered);
        var uncovered = await Seller(db, "MPL-SALES-0B", "Badrul Rep");
        // Mixed history: Badrul until mid-period, then Aina. Nobody covers the whole period automatically.
        await Serve(db, uncovered, Now.AddDays(-30), Now.AddDays(3)); await Serve(db, covered, Now.AddDays(3));
        var first = await SettlementFor(db, await Verified(db, a.Id, [Sale(standard.Id, 10)]));
        Assert.Equal("NeedsResolution", first.Summary.AttributionStatus);
        first = await Later(db).ResolveSettlementAttributionAsync(AdminAccountId, first.Summary.Id,
            new(uncovered, "Badrul made most visits this period", first.Summary.ConcurrencyToken), default);
        Assert.Equal(((string?)null, 0m), (first.Summary.CommissionPolicyCode, first.Summary.CommissionPending));
        Assert.Contains("no recorded commission terms", first.Summary.CommissionNote);

        var second = await SettlementFor(db, await Verified(db, a.Id, [Sale(standard.Id, 10)], 2, "SHOP-2026-08-B"));
        Assert.Equal(("Resolved", covered, "v1.1", 45m), (second.Summary.AttributionStatus, second.Summary.SalespersonId, second.Summary.CommissionPolicyCode, second.Summary.CommissionPending));
    }

    // --- F5: a period keeps its first rate across every revision -------------------------------

    [Fact]
    public async Task F5_FirstRateSurvivesAPriceKindDisappearingAndReturningAcrossManyRevisions()
    {
        await using var scope = await Database(60); await using var db = scope.NewContext();
        var (a, standard, promo) = await PartnerWithStock(db, 50);
        var seller = await Seller(db, "MPL-SALES-0A", "Aina Rep"); await Serve(db, seller, Now.AddDays(-30)); await OnV11(db, seller);
        var v1 = await Verified(db, a.Id, [Sale(standard.Id, 10)]);
        Assert.Equal(45m, (await SettlementFor(db, v1)).Summary.CommissionPending);
        var v2 = await VerifyRecorded(db, await Corrected(db, v1, a.Id, [Sale(promo.Id, 10, 34.90m)]));
        Assert.Equal(40m, (await SettlementFor(db, v2)).Summary.CommissionPending);
        var rules = new CommissionRuleService(db, new AuditLogService(db, new HttpContextAccessor()), new FixedClock(ReportClock));
        await rules.CreateAsync(AdminAccountId, new(nameof(SalesCommissionType.ConsignmentStandardPerUnit), seller, null, 5m, null, null, null,
            "MYR", Now.AddDays(-30), null, true, null, null, CommissionPolicyCodes.V1_1), default);
        await rules.CreateAsync(AdminAccountId, new(nameof(SalesCommissionType.ConsignmentPromotionPerUnit), seller, null, 4.75m, null, null, null,
            "MYR", Now.AddDays(-30), null, true, null, null, CommissionPolicyCodes.V1_1), default);
        var v3 = await VerifyRecorded(db, await Corrected(db, v2, a.Id, [Sale(standard.Id, 10)]));
        Assert.Equal(45m, (await SettlementFor(db, v3)).Summary.CommissionPending);
        var v4 = await VerifyRecorded(db, await Corrected(db, v3, a.Id, [Sale(standard.Id, 6), Sale(promo.Id, 4, 34.90m)]));
        var s = await SettlementFor(db, v4);
        Assert.Equal((4, 43m), (s.Summary.Revision, s.Summary.CommissionPending)); // 6 x RM4.50 + 4 x RM4.00
        Assert.All(await Effective(db), row => Assert.Contains(row.CommissionFixedAmountSnapshot, new decimal?[] { 4.50m, 4.00m }));
    }

    [Fact]
    public async Task F5_ANewPeriodStillUsesTheRateInForceForIt()
    {
        await using var scope = await Database(40); await using var db = scope.NewContext();
        var (a, standard, _) = await PartnerWithStock(db, 30);
        var seller = await Seller(db, "MPL-SALES-0A", "Aina Rep"); await Serve(db, seller, Now.AddDays(-30)); await OnV11(db, seller);
        await Verified(db, a.Id, [Sale(standard.Id, 10)]);
        var rules = new CommissionRuleService(db, new AuditLogService(db, new HttpContextAccessor()), new FixedClock(ReportClock));
        await rules.CreateAsync(AdminAccountId, new(nameof(SalesCommissionType.ConsignmentStandardPerUnit), seller, null, 5m, null, null, null,
            "MYR", Now.AddDays(-30), null, true, null, null, CommissionPolicyCodes.V1_1), default);
        var second = await SettlementFor(db, await Verified(db, a.Id, [Sale(standard.Id, 10)], 2, "SHOP-2026-08-B"));
        Assert.Equal(50m, second.Summary.CommissionPending);
    }

    // --- F6: recovery is cash actually paid, owed by its earner, visible everywhere ---------------

    [Fact]
    public async Task F6_PaidCorrectionRecoveryReconcilesAcrossSettlementPayoutLedgerAndStatement()
    {
        await using var scope = await Database(30); await using var db = scope.NewContext();
        var (a, standard, _) = await PartnerWithStock(db, 20);
        var seller = await Seller(db, "MPL-SALES-0A", "Aina Rep"); await Serve(db, seller, Now.AddDays(-30)); await OnV11(db, seller);
        var v1 = await Verified(db, a.Id, [Sale(standard.Id, 10)]);
        await Remit(db, (await SettlementFor(db, v1)).Summary.Id, 259.35m, "full");
        var row = Assert.Single(await Effective(db));
        var paid = await PaidPayout(db, seller, [row], "recovery");
        await VerifyRecorded(db, await Corrected(db, v1, a.Id, [Sale(standard.Id, 8)]));

        var s = await SettlementFor(db, v1);
        var payout = await Payouts(db).GetAsync(paid.Summary.Id);
        Assert.Equal((SalesCommissionStatus.Paid, 45m), ((await db.SalesCommissions.AsNoTracking().SingleAsync(c => c.Id == row.Id)).Status, payout.Summary.PreparedAmount));
        Assert.Equal((9m, 9m), (s.Summary.CommissionRecoveryRequired, payout.Summary.RecoveryExposure));
        var item = Assert.Single(payout.Items);
        Assert.Equal((true, 9m), (item.RequiresRecovery, item.RecoveryAmount));
        var ledger = new SalesReportingService(db, new AuditLogService(db, new HttpContextAccessor()), new FixedClock(PayoutClock));
        var (ledgerRows, _) = await ledger.ListCommissionsAsync(new CommissionLedgerQuery { From = ReportClock.AddDays(-2), ToExclusive = ReportClock.AddDays(2), Page = 1, PageSize = 50 }, default);
        Assert.True(Assert.Single(ledgerRows, r => r.Id == row.Id).RequiresRecovery);
        var pdf = await new CommissionPayoutStatementService(db, new FixedClock(PayoutClock)).GetStatementAsync(paid.Summary.Id);
        var text = MerchantDocumentServiceTests.Squash(MerchantDocumentServiceTests.ExtractText(pdf.Content));
        Assert.Contains("Corrected", text); Assert.Contains("MYR9.00", text);
        Assert.Contains("Transferredon08Sep2026", text); // the bank date, not the recording time

        // Correcting back to ten tags clears the obligation instead of adding a second one.
        var v3 = await VerifyRecorded(db, await Corrected(db, (await Later(db).GetSalesReportAsync((await SettlementFor(db, v1)).Summary.SalesReportId, default)), a.Id, [Sale(standard.Id, 10)]));
        s = await SettlementFor(db, v3);
        Assert.Equal((0m, 0m, 45m), (s.Summary.CommissionRecoveryRequired, (await Payouts(db).GetAsync(paid.Summary.Id)).Summary.RecoveryExposure, s.Summary.CommissionPaid));
    }

    [Fact]
    public async Task F6_RefundOfAnUnpaidPeriodReducesItsCommissionAndIsNeverACashRecovery()
    {
        await using var scope = await Database(30); await using var db = scope.NewContext();
        var (a, standard, _) = await PartnerWithStock(db, 20);
        var seller = await Seller(db, "MPL-SALES-0A", "Aina Rep"); await Serve(db, seller, Now.AddDays(-30)); await OnV11(db, seller);
        var first = await Verified(db, a.Id, [Sale(standard.Id, 10)]);
        var second = await Verified(db, a.Id, [ReturnedUnsellable(standard.Id, 2, first.PeriodStart)], 2, "SHOP-2026-08-B");
        Assert.Equal(0m, await db.SalesCommissions.Where(c => c.Status == SalesCommissionStatus.Paid).SumAsync(c => c.CommissionAmount));
        Assert.Equal(0m, (await SettlementFor(db, second)).Summary.CommissionRecoveryRequired);
        var origin = await SettlementFor(db, first);
        Assert.Equal((36m, 0m, 2), (origin.Summary.CommissionPending, origin.Summary.CommissionRecoveryRequired, origin.Summary.Revision));
        Assert.Contains("Refunds in sales report", origin.Revisions.First().Reason);
        Assert.Empty(db.ConsignmentCommissionRecoveries);
        // Correcting the refund away restores the original commission.
        await VerifyRecorded(db, await Corrected(db, second, a.Id, [ReturnedUnsellable(standard.Id, 1, first.PeriodStart)], 2, "SHOP-2026-08-B"));
        Assert.Equal(40.50m, (await SettlementFor(db, first)).Summary.CommissionPending);
    }

    [Fact]
    public async Task F6_RefundsRecoverFromTheOriginalEarnerWhenTheRefundPeriodHasAnotherSalesperson()
    {
        await using var scope = await Database(40); await using var db = scope.NewContext();
        var (a, standard, _) = await PartnerWithStock(db, 30);
        var aina = await Seller(db, "MPL-SALES-0A", "Aina Rep"); await OnV11(db, aina);
        var badrul = await Seller(db, "MPL-SALES-0B", "Badrul Rep"); await OnV11(db, badrul);
        // Aina covers the first half-month; Badrul the second (from 16 August, Malaysia time).
        var handover = new DateTimeOffset(2026, 8, 16, 0, 0, 0, TimeSpan.FromHours(8));
        await Serve(db, aina, Now.AddDays(-30), handover); await Serve(db, badrul, handover);
        var first = await Verified(db, a.Id, [Sale(standard.Id, 10)]);
        await Remit(db, (await SettlementFor(db, first)).Summary.Id, 259.35m, "first");
        var ainaRow = Assert.Single(await Effective(db));
        var payout = await PaidPayout(db, aina, [ainaRow], "aina");
        var second = await Verified(db, a.Id, [Sale(standard.Id, 4), ReturnedUnsellable(standard.Id, 3, first.PeriodStart)], 2, "SHOP-2026-08-B");
        var s2 = await SettlementFor(db, second);
        Assert.Equal((badrul, 18m, 13.50m), (s2.Summary.SalespersonId, s2.Summary.CommissionPending, s2.Summary.CommissionRecoveryRequired));
        var obligation = Assert.Single(await db.ConsignmentCommissionRecoveries.AsNoTracking().Where(r => r.SettlementRevision == r.Settlement!.Revision).ToListAsync());
        Assert.Equal((aina, ainaRow.Id, payout.Summary.Id, 3), (obligation.SalespersonId, obligation.OriginCommissionId, obligation.CommissionPayoutId, obligation.Quantity));
        Assert.Equal(13.50m, (await Payouts(db).GetAsync(payout.Summary.Id)).Summary.RecoveryExposure);
        Assert.All((await Effective(db)).Where(c => c.SalespersonId == badrul), c => Assert.Equal(SalesCommissionStatus.Pending, c.Status));
    }

    [Fact]
    public async Task F6_PartlyPaidPeriodReducesUnpaidCommissionBeforeAnyCashRecovery()
    {
        await using var scope = await Database(40); await using var db = scope.NewContext();
        var (a, standard, _) = await PartnerWithStock(db, 30);
        var seller = await Seller(db, "MPL-SALES-0A", "Aina Rep"); await Serve(db, seller, Now.AddDays(-30)); await OnV11(db, seller);
        var v1 = await Verified(db, a.Id, [Sale(standard.Id, 10)]);
        var s = await SettlementFor(db, v1);
        await Remit(db, s.Summary.Id, s.Summary.ExpectedRemittance, "first");
        var paid = await PaidPayout(db, seller, [Assert.Single(await Effective(db))], "first");
        // A correction adds four tags (still unpaid), then refunds take five back: four unpaid first, then one paid.
        var v2 = await VerifyRecorded(db, await Corrected(db, v1, a.Id, [Sale(standard.Id, 14)]));
        Assert.Equal(18m, (await SettlementFor(db, v2)).Summary.CommissionPending);
        await Verified(db, a.Id, [ReturnedUnsellable(standard.Id, 5, v1.PeriodStart)], 2, "SHOP-2026-08-B");
        var after = await SettlementFor(db, v2);
        Assert.Equal((0m, 45m), (after.Summary.CommissionPending, after.Summary.CommissionPaid));
        Assert.Equal(4.50m, (await Payouts(db).GetAsync(paid.Summary.Id)).Summary.RecoveryExposure);
    }

    // --- F8: a receipt key never hides a changed detail ------------------------------------------

    [Fact]
    public async Task F8_ReceiptRetriesCompareEveryDetailUnambiguously()
    {
        await using var scope = await Database(30); await using var db = scope.NewContext();
        var (a, standard, _) = await PartnerWithStock(db, 20);
        var s = await SettlementFor(db, await Verified(db, a.Id, [Sale(standard.Id, 10)]));
        var first = new RecordConsignmentSettlementReceiptRequest(RemittanceDay, 100m, "BankTransfer", "REF|PART", "DETAIL", "canonical-key-1");
        await Later(db).RecordSettlementReceiptAsync(AdminAccountId, s.Summary.Id, first, default);
        foreach (var changed in new[] { first with { Reference = "REF", Notes = "PART|DETAIL" }, first with { Notes = null },
                     first with { Amount = 100.01m }, first with { Method = "DuitNow" }, first with { ReceivedOn = RemittanceDay.AddDays(-1) } })
        {
            var conflict = await Assert.ThrowsAsync<ApiException>(() => Later(db).RecordSettlementReceiptAsync(AdminAccountId, s.Summary.Id, changed, default));
            Assert.Equal(409, conflict.StatusCode);
        }
        // Surrounding whitespace and Unicode composition are the same detail; the replay records nothing new.
        var replay = await Later(db).RecordSettlementReceiptAsync(AdminAccountId, s.Summary.Id, first with { Reference = "  REF|PART ", Notes = "DETAIL\t" }, default);
        Assert.Equal((100m, 1), (replay.Summary.ReceivedAmount, replay.Receipts.Count));
        var composed = first with { Reference = "Café transfer", IdempotencyKey = "canonical-key-2", Notes = null };
        await Later(db).RecordSettlementReceiptAsync(AdminAccountId, s.Summary.Id, composed, default);
        var decomposed = await Later(db).RecordSettlementReceiptAsync(AdminAccountId, s.Summary.Id,
            composed with { Reference = "Café transfer", Notes = "" }, default);
        Assert.Equal((200m, 2), (decomposed.Summary.ReceivedAmount, decomposed.Receipts.Count));
    }

    // --- F1: payout commands over real HTTP ----------------------------------------------------

    private const string HttpJwtKey = "phase1a-remediation-disposable-local-only-signing-key";

    private sealed class FinanceHttpFactory(string connection) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:MyPetLinkDb"] = connection,
                ["Jwt:Issuer"] = "phase1a-remediation", ["Jwt:Audience"] = "phase1a-remediation", ["Jwt:SigningKey"] = HttpJwtKey,
                ["DevAuth:Enabled"] = "false", ["Email:Enabled"] = "false", ["Storage:Provider"] = "Local",
            }));
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<DbContextOptions<MyPetLinkDbContext>>(); services.RemoveAll<MyPetLinkDbContext>();
                services.AddDbContext<MyPetLinkDbContext>(o => o.UseSqlServer(connection, sql => sql.EnableRetryOnFailure()));
                services.PostConfigure<Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerOptions>("Bearer", options =>
                {
                    options.TokenValidationParameters.ValidIssuer = "phase1a-remediation";
                    options.TokenValidationParameters.ValidAudience = "phase1a-remediation";
                    options.TokenValidationParameters.IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(HttpJwtKey));
                });
                services.RemoveAll<Microsoft.Extensions.Hosting.IHostedService>();
            });
        }
    }

    private static string FinanceToken(Guid user) => new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
        "phase1a-remediation", "phase1a-remediation", [new Claim("sub", user.ToString())], DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddHours(1),
        new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(HttpJwtKey)), SecurityAlgorithms.HmacSha256)));

    [Fact]
    public async Task F1_PayoutCommandsBindValidateAndAuthorizeOverRealHttp()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(30); await using var db = scope.NewContext();
            var (a, standard, promotion) = await PartnerWithStock(db, 20);
            var seller = await Seller(db, "MPL-SALES-0A", "Aina Rep"); await Serve(db, seller, Now.AddDays(-30)); await OnV11(db, seller);
            var super = await db.AdminRoles.SingleAsync(r => r.Code == AdminRoleTemplates.SuperAdminCode);
            db.AdminUserRoles.Add(new AdminUserRoleAssignment { AdminUserId = CheckerAdminId, AdminRoleId = super.Id });
            var viewer = new AdminRoleDefinition { Code = "payout-viewer", Name = "Payout viewer" };
            viewer.Capabilities.Add(new AdminRoleCapability { Capability = AdminCapabilities.PayoutsView });
            viewer.Assignments.Add(new AdminUserRoleAssignment { AdminUserId = AdminRecordId });
            db.AdminRoles.Add(viewer); await db.SaveChangesAsync();
            var s = await SettlementFor(db, await Verified(db, a.Id, [Sale(standard.Id, 10), Sale(promotion.Id, 2, 34.90m)]));
            await Remit(db, s.Summary.Id, s.Summary.ExpectedRemittance, "http");
            var rows = await Effective(db);
            var standardRow = rows.Single(c => c.CommissionType == SalesCommissionType.ConsignmentStandardPerUnit);
            var promotionRow = rows.Single(c => c.CommissionType == SalesCommissionType.ConsignmentPromotionPerUnit);

            await using var factory = new FinanceHttpFactory(db.Database.GetConnectionString()!);
            using var client = factory.CreateClient();
            const string root = "/api/v1/admin/merchant-sales/commission-payouts";
            object Prepare(Guid row, decimal total, string key) => new { salesCommissionIds = new[] { row }, salespersonId = seller,
                periodFrom = ReportClock.AddDays(-1), periodToExclusive = ReportClock.AddDays(1), expectedTotal = total, idempotencyKey = key };
            async Task<(HttpStatusCode Status, string Body)> Post(string path, object body, Guid? user)
            {
                using var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body) };
                if (user is Guid id) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", FinanceToken(id));
                using var response = await client.SendAsync(request);
                return (response.StatusCode, await response.Content.ReadAsStringAsync());
            }
            string Token(string body) => System.Text.Json.JsonDocument.Parse(body).RootElement.GetProperty("data").GetProperty("summary").GetProperty("concurrencyToken").GetString()!;
            Guid Id(string body) => System.Text.Json.JsonDocument.Parse(body).RootElement.GetProperty("data").GetProperty("summary").GetProperty("id").GetGuid();

            // Unauthenticated and view-only callers are refused before any financial change.
            Assert.Equal(HttpStatusCode.Unauthorized, (await Post(root, Prepare(standardRow.Id, 45m, "anon"), null)).Status);
            Assert.Equal(HttpStatusCode.Forbidden, (await Post(root, Prepare(standardRow.Id, 45m, "viewer"), AdminAccountId)).Status);

            // Invalid requests are the application's 400, never a server error.
            var missing = await Post(root, new { salespersonId = seller, expectedTotal = 45m, idempotencyKey = "no-ids" }, OwnerAccountId);
            Assert.Equal(HttpStatusCode.BadRequest, missing.Status);
            Assert.Contains("validation", missing.Body, StringComparison.OrdinalIgnoreCase);
            var tooLong = await Post(root, Prepare(standardRow.Id, 45m, new string('k', 81)), OwnerAccountId);
            Assert.Equal(HttpStatusCode.BadRequest, tooLong.Status);

            var prepared = await Post(root, Prepare(standardRow.Id, 45m, "http-prepare"), OwnerAccountId);
            Assert.Equal(HttpStatusCode.OK, prepared.Status);
            var replay = await Post(root, Prepare(standardRow.Id, 45m, "http-prepare"), OwnerAccountId);
            Assert.Equal((HttpStatusCode.OK, Id(prepared.Body)), (replay.Status, Id(replay.Body)));
            var payoutId = Id(prepared.Body);

            var noDate = await Post($"{root}/{payoutId}/mark-paid", new { concurrencyToken = Token(prepared.Body), paymentMethod = "BankTransfer", paymentReference = "IBG-HTTP" }, OwnerAccountId);
            Assert.Equal(HttpStatusCode.BadRequest, noDate.Status); Assert.Contains("transferredOn", noDate.Body);
            var noReference = await Post($"{root}/{payoutId}/mark-paid", new { concurrencyToken = Token(prepared.Body), paymentMethod = "BankTransfer", transferredOn = "2026-09-08" }, OwnerAccountId);
            Assert.Equal(HttpStatusCode.BadRequest, noReference.Status);
            var paid = await Post($"{root}/{payoutId}/mark-paid", new { concurrencyToken = Token(prepared.Body), paymentMethod = "BankTransfer", paymentReference = "IBG-HTTP", transferredOn = "2026-09-08" }, OwnerAccountId);
            Assert.Equal(HttpStatusCode.OK, paid.Status);
            Assert.Contains("\"transferredOn\":\"2026-09-08\"", paid.Body);
            var repeat = await Post($"{root}/{payoutId}/mark-paid", new { concurrencyToken = Token(paid.Body), paymentMethod = "BankTransfer", paymentReference = "IBG-HTTP", transferredOn = "2026-09-08" }, OwnerAccountId);
            Assert.Equal(HttpStatusCode.OK, repeat.Status);

            var second = await Post(root, Prepare(promotionRow.Id, 8m, "http-cancel"), OwnerAccountId);
            Assert.Equal(HttpStatusCode.OK, second.Status);
            var noReason = await Post($"{root}/{Id(second.Body)}/cancel", new { concurrencyToken = Token(second.Body) }, OwnerAccountId);
            Assert.Equal(HttpStatusCode.BadRequest, noReason.Status);
            var cancelled = await Post($"{root}/{Id(second.Body)}/cancel", new { concurrencyToken = Token(second.Body), reason = "Prepared for the wrong period" }, OwnerAccountId);
            Assert.Equal(HttpStatusCode.OK, cancelled.Status);

            db.ChangeTracker.Clear();
            var stored = await db.CommissionPayouts.AsNoTracking().SingleAsync(p => p.Id == payoutId);
            Assert.Equal((CommissionPayoutStatus.Paid, new DateOnly(2026, 9, 8), "IBG-HTTP"), (stored.Status, stored.TransferredOn, stored.PaymentReference));
            Assert.Equal(SalesCommissionStatus.Paid, (await db.SalesCommissions.AsNoTracking().SingleAsync(c => c.Id == standardRow.Id)).Status);
            Assert.Equal(SalesCommissionStatus.Payable, (await db.SalesCommissions.AsNoTracking().SingleAsync(c => c.Id == promotionRow.Id)).Status);
        }
        finally { MigratedSchema.Value = false; }
    }
}
