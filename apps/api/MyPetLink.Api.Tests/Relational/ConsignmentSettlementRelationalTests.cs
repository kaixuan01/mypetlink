using Microsoft.AspNetCore.Http;
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

// Phase 1A: the settlement and sales-commission layer over verified consignment sales.
// Every figure is checked against the confirmed v1.1 fixtures; illustrative costs are
// test constants only and never come from production code.
public sealed partial class ConsignmentRelationalTests
{
    private const string SettlementsMigration = "20261026071019_AddConsignmentSettlementsAndCommissionPolicies";
    private const string RecoveriesMigration = "20261026144016_AddConsignmentCommissionRecoveries";
    private const string SignatureOwnershipMigration = "20261027093031_EnforceDocumentSignatureOwnership";
    private const decimal IllustrativeUnitCost = 4.00m;
    private static readonly DateOnly RemittanceDay = new(2026, 9, 2);
    private static readonly DateTimeOffset PayoutClock = ReportClock.AddDays(5);

    private static CommissionPolicyService Policies(MyPetLinkDbContext db) =>
        new(db, new AuditLogService(db, new HttpContextAccessor()), new FixedClock(ReportClock));

    private static CommissionPayoutService Payouts(MyPetLinkDbContext db)
    {
        var audit = new AuditLogService(db, new HttpContextAccessor());
        var clock = new FixedClock(PayoutClock);
        return new(db, new DocumentNumberService(db), new BusinessIdentityService(db, audit, clock), audit, clock);
    }

    private static async Task<Guid> Seller(MyPetLinkDbContext db, string code, string name)
    {
        var person = new Salesperson { SalespersonCode = code, Name = name, IsActive = true };
        db.Salespersons.Add(person); await db.SaveChangesAsync();
        return person.Id;
    }

    /// <summary>Records a servicing stretch directly, as the rollout backfill or a merchant edit would.</summary>
    private static async Task Serve(MyPetLinkDbContext db, Guid seller, DateTimeOffset from, DateTimeOffset? to = null)
    {
        var person = await db.Salespersons.AsNoTracking().SingleAsync(x => x.Id == seller);
        db.MerchantServicingAssignments.Add(new MerchantServicingAssignment
        {
            MerchantId = MerchantId, SalespersonId = seller, SalespersonCodeSnapshot = person.SalespersonCode,
            SalespersonNameSnapshot = person.Name, EffectiveFrom = from, EffectiveToExclusive = to,
            Source = MerchantServicingSources.MerchantEdit, RecordedAt = from,
        });
        await db.SaveChangesAsync();
    }

    private static Task<SalespersonPolicyAssignmentResponse> OnV11(MyPetLinkDbContext db, Guid seller) =>
        Policies(db).RecordAsync(AdminAccountId, seller,
            new(CommissionPolicyCodes.V1_1, Now.AddDays(-20), Now.AddDays(-20), "Signed v1.1 commission letter", null), default);

    private static async Task<ConsignmentSalesReportResponse> Verified(MyPetLinkDbContext db, Guid agreement,
        IReadOnlyList<ConsignmentSalesLineRequest> lines, int half = 1, string reference = "SHOP-2026-08-A")
    {
        var report = await Recorded(db, Report(agreement, lines, half, reference));
        return await Later(db).VerifySalesReportAsync(OwnerAccountId, report.Id, new(report.ConcurrencyToken), default);
    }

    private static async Task<ConsignmentSettlementResponse> SettlementFor(MyPetLinkDbContext db, ConsignmentSalesReportResponse report)
    {
        var id = await db.ConsignmentSettlements.AsNoTracking()
            .Where(s => s.MerchantBranchId == BranchId && s.PeriodStart == report.PeriodStart).Select(s => s.Id).SingleAsync();
        return await Later(db).GetSettlementAsync(id, default);
    }

    private static Task<ConsignmentSettlementResponse> Remit(MyPetLinkDbContext db, Guid settlement, decimal amount, string key) =>
        Later(db).RecordSettlementReceiptAsync(AdminAccountId, settlement,
            new(RemittanceDay, amount, "BankTransfer", "IBG " + key, null, "receipt-" + key), default);

    private static ConsignmentSalesLineRequest ReturnedUnsellable(Guid term, int quantity, DateTimeOffset origin, decimal price = 39.90m) =>
        new(NfcVariantId, "Refund", term, price, quantity, origin, 0, quantity);

    private static async Task<List<SalesCommission>> Effective(MyPetLinkDbContext db) =>
        await db.SalesCommissions.AsNoTracking().Where(c => c.Status != SalesCommissionStatus.Reversed)
            .OrderBy(c => c.CalculatedAt).ThenBy(c => c.CommissionType).ToListAsync();

    private static async Task<(ConsignmentAgreementResponse Agreement, ConsignmentPriceTermResponse Standard, ConsignmentPriceTermResponse Promotion)>
        PartnerWithStock(MyPetLinkDbContext db, int quantity, decimal partnerRate = 35m)
    {
        var s = Custody(db);
        var draft = await s.SaveAgreementAsync(AdminAccountId, null, Terms() with { PartnerCommissionPercentage = partnerRate }, null, default);
        var a = await s.AgreementActionAsync(OwnerAccountId, draft.Id, "approve", new(draft.ConcurrencyToken, "Test approval"), default);
        var d = await s.ReserveAsync(AdminAccountId, Reserve(a.Id, quantity, "settlement-" + quantity), default);
        d = await s.ActionAsync(AdminAccountId, d.Id, "dispatch", Action(d, "SHIP-SETTLEMENT"), default);
        await s.ActionAsync(OwnerAccountId, d.Id, "receive", Action(d, "Signed delivery acknowledgment") with { Receipt = Receipt(d) }, default);
        var standard = await ApprovedPrice(db, a.Id);
        var promotion = await ApprovedPrice(db, a.Id, 34.90m, "Promotion", "Launch promotion", Now.AddDays(-1), Now.AddDays(40));
        return (a, standard, promotion);
    }

    [Fact]
    public async Task RetailFixtureSettlesOnFullRemittanceAndPaysThroughABatch()
    {
        await using var scope = await Database(250); await using var db = scope.NewContext();
        var (a, standard, _) = await PartnerWithStock(db, 200);
        var aina = await Seller(db, "MPL-SALES-0A", "Aina Rep");
        await Serve(db, aina, Now.AddDays(-30));
        await OnV11(db, aina);

        // Delivered stock alone earns nothing and owes nothing.
        Assert.Empty(db.ConsignmentSettlements); Assert.Empty(db.SalesCommissions);

        var report = await Verified(db, a.Id, [Sale(standard.Id, 100)]);
        var s = await SettlementFor(db, report);
        Assert.Equal((100, 3990.00m, 0, 0m), (s.Summary.StandardQuantity, s.Summary.StandardSales, s.Summary.PromotionQuantity, s.Summary.PromotionSales));
        Assert.Equal(3990.00m, s.Summary.EligibleSales);
        Assert.Equal(1396.50m, s.Summary.MerchantCommission);   // one rounding over the period, never 1,397.00
        Assert.Equal(2593.50m, s.Summary.ExpectedRemittance);
        Assert.Equal("AwaitingPayment", s.Summary.Status);
        Assert.Equal(450.00m, s.Summary.CommissionPending);
        Assert.Equal(0m, s.Summary.CommissionPayable);
        var row = Assert.Single(await Effective(db));
        Assert.Equal((SalesCommissionSourceType.ConsignmentSettlement, SalesCommissionType.ConsignmentStandardPerUnit), (row.SourceType, row.CommissionType));
        Assert.Equal((100, 4.50m, 450.00m, "v1.1", aina), (row.QualifiedQuantity, row.CommissionFixedAmountSnapshot, row.CommissionAmount, row.PolicyCode, row.SalespersonId));
        Assert.Equal((SalesCommissionStatus.Pending, (DateTimeOffset?)null), (row.Status, row.PayableAt));
        Assert.Equal(CommissionRule.ConsignmentStandardV11RuleId, row.CommissionRuleId);
        Assert.Equal(report.Id, row.ConsignmentSalesReportId);
        // Illustrative contribution using a test-only unit cost.
        Assert.Equal(1743.50m, s.Summary.EligibleSales - s.Summary.MerchantCommission - row.CommissionAmount - 100 * IllustrativeUnitCost);

        // A partial remittance leaves the commission pending.
        s = await Remit(db, s.Summary.Id, 1000.00m, "part-1");
        Assert.Equal(("PartiallyReceived", 1593.50m), (s.Summary.Status, s.Summary.Outstanding));
        Assert.Equal(SalesCommissionStatus.Pending, (await Effective(db)).Single().Status);
        // A retried submission records nothing twice; an overpayment is refused.
        s = await Remit(db, s.Summary.Id, 1000.00m, "part-1");
        Assert.Equal(1000.00m, s.Summary.ReceivedAmount); Assert.Single(s.Receipts);
        await Assert.ThrowsAsync<ApiException>(() => Remit(db, s.Summary.Id, 1593.51m, "too-much"));
        await Assert.ThrowsAsync<ApiException>(() => Later(db).RecordSettlementReceiptAsync(AdminAccountId, s.Summary.Id,
            new(RemittanceDay, 1593.50m, "BankTransfer", "IBG changed", null, "receipt-part-1"), default));

        s = await Remit(db, s.Summary.Id, 1593.50m, "part-2");
        Assert.Equal(("Settled", 0m, 450.00m, 0m), (s.Summary.Status, s.Summary.Outstanding, s.Summary.CommissionPayable, s.Summary.CommissionPending));
        row = (await Effective(db)).Single();
        Assert.Equal(SalesCommissionStatus.Payable, row.Status); Assert.Equal(ReportClock, row.PayableAt);
        await Assert.ThrowsAsync<ApiException>(() => Remit(db, s.Summary.Id, 0.01m, "after-settled"));
        // A settled period's receipts stay as recorded.
        await Assert.ThrowsAsync<ApiException>(() => Later(db).VoidSettlementReceiptAsync(AdminAccountId, s.Summary.Id, s.Receipts[0].Id,
            new("Typed the wrong amount", s.Receipts[0].ConcurrencyToken), default));

        // Solo operator: one administrator prepares and records the payout, with the bank's own transfer date.
        var payouts = Payouts(db);
        var prepared = await payouts.PrepareAsync(AdminAccountId, new([row.Id], aina, ReportClock.AddDays(-1), ReportClock.AddDays(1), 450.00m, "consignment-payout-1"));
        Assert.Equal(s.Summary.SettlementNumber, Assert.Single(prepared.Items).SourceOrderNumber);
        var again = await payouts.PrepareAsync(AdminAccountId, new([row.Id], aina, ReportClock.AddDays(-1), ReportClock.AddDays(1), 450.00m, "consignment-payout-1"));
        Assert.Equal(prepared.Summary.Id, again.Summary.Id);
        await Assert.ThrowsAsync<ApiException>(() => payouts.MarkPaidAsync(AdminAccountId, prepared.Summary.Id,
            new(prepared.Summary.ConcurrencyToken, CommissionPayoutPaymentMethod.BankTransfer, "IBG-PAYOUT-1")));
        await Assert.ThrowsAsync<ApiException>(() => payouts.MarkPaidAsync(AdminAccountId, prepared.Summary.Id,
            new(prepared.Summary.ConcurrencyToken, CommissionPayoutPaymentMethod.BankTransfer, "IBG-PAYOUT-1", new DateOnly(2026, 12, 1))));
        var paid = await payouts.MarkPaidAsync(AdminAccountId, prepared.Summary.Id,
            new(prepared.Summary.ConcurrencyToken, CommissionPayoutPaymentMethod.BankTransfer, "IBG-PAYOUT-1", new DateOnly(2026, 9, 8)));
        Assert.Equal(("Paid", "IBG-PAYOUT-1", new DateOnly(2026, 9, 8)), (paid.Summary.Status, paid.Summary.PaymentReference, paid.Summary.TransferredOn));
        Assert.Equal(PayoutClock, paid.Summary.PaidAt);
        var replay = await payouts.MarkPaidAsync(AdminAccountId, prepared.Summary.Id,
            new(paid.Summary.ConcurrencyToken, CommissionPayoutPaymentMethod.BankTransfer, "IBG-PAYOUT-1", new DateOnly(2026, 9, 8)));
        Assert.Equal(paid.Summary.PaidAt, replay.Summary.PaidAt);
        await Assert.ThrowsAsync<ApiException>(() => payouts.MarkPaidAsync(AdminAccountId, prepared.Summary.Id,
            new(paid.Summary.ConcurrencyToken, CommissionPayoutPaymentMethod.BankTransfer, "IBG-PAYOUT-1", new DateOnly(2026, 9, 7))));
        Assert.Equal(SalesCommissionStatus.Paid, (await Effective(db)).Single().Status);
        // Settlement commission can't be paid or reversed around its settlement.
        var billing = await Assert.ThrowsAsync<ApiException>(() => BillingFor(db).ReverseCommissionAsync(AdminAccountId, row.Id, new("Trying to reverse directly"), default));
        Assert.Equal("commission_managed_by_settlement", billing.Code);
        Assert.True(await db.AuditLogs.AnyAsync(x => x.Action == "consignment.settlement-receipt-recorded"));
    }

    [Fact]
    public async Task PromotionFixtureAndMixedPriceTermsUseTheApprovedTermNotThePrice()
    {
        await using var scope = await Database(250); await using var db = scope.NewContext();
        var (a, standard, promotion) = await PartnerWithStock(db, 200);
        var aina = await Seller(db, "MPL-SALES-0A", "Aina Rep");
        await Serve(db, aina, Now.AddDays(-30)); await OnV11(db, aina);

        var first = await SettlementFor(db, await Verified(db, a.Id, [Sale(promotion.Id, 100, 34.90m)]));
        Assert.Equal((0, 100, 3490.00m), (first.Summary.StandardQuantity, first.Summary.PromotionQuantity, first.Summary.PromotionSales));
        Assert.Equal((1221.50m, 2268.50m, 400.00m), (first.Summary.MerchantCommission, first.Summary.ExpectedRemittance, first.Summary.CommissionPending));
        Assert.Equal(1468.50m, first.Summary.EligibleSales - first.Summary.MerchantCommission - first.Summary.CommissionPending - 100 * IllustrativeUnitCost);
        Assert.Equal(SalesCommissionType.ConsignmentPromotionPerUnit, (await Effective(db)).Single().CommissionType);

        var mixed = await SettlementFor(db, await Verified(db, a.Id, [Sale(standard.Id, 60), Sale(promotion.Id, 40, 34.90m)], 2, "SHOP-2026-08-B"));
        Assert.Equal((60, 2394.00m, 40, 1396.00m), (mixed.Summary.StandardQuantity, mixed.Summary.StandardSales, mixed.Summary.PromotionQuantity, mixed.Summary.PromotionSales));
        Assert.Equal((3790.00m, 1326.50m, 2463.50m, 430.00m),
            (mixed.Summary.EligibleSales, mixed.Summary.MerchantCommission, mixed.Summary.ExpectedRemittance, mixed.Summary.CommissionPending));
        Assert.Equal(2, mixed.Commissions.Count(c => c.Status == "Pending"));
        Assert.Equal(270.00m, mixed.Commissions.Single(c => c.CommissionType == "ConsignmentStandardPerUnit").CommissionAmount);
        Assert.Equal(160.00m, mixed.Commissions.Single(c => c.CommissionType == "ConsignmentPromotionPerUnit").CommissionAmount);
    }

    [Fact]
    public async Task MerchantRateComesFromTheApprovedAgreementNotAGlobalValue()
    {
        await using var scope = await Database(250); await using var db = scope.NewContext();
        var (a, standard, _) = await PartnerWithStock(db, 200, partnerRate: 30m);
        var s = await SettlementFor(db, await Verified(db, a.Id, [Sale(standard.Id, 100)]));
        Assert.Equal((3990.00m, 1197.00m, 2793.00m), (s.Summary.EligibleSales, s.Summary.MerchantCommission, s.Summary.ExpectedRemittance));
        Assert.All(s.Lines, l => Assert.Equal(30m, l.MerchantCommissionPercentage));
    }

    [Fact]
    public async Task LegacyAndUnattributedPeriodsEarnNothingUntilAnOperatorDecides()
    {
        await using var scope = await Database(250); await using var db = scope.NewContext();
        var (a, standard, _) = await PartnerWithStock(db, 200);
        var aina = await Seller(db, "MPL-SALES-0A", "Aina Rep");
        var badrul = await Seller(db, "MPL-SALES-0B", "Badrul Rep");

        // No servicing representative recorded: the merchant still owes its remittance, but nobody is assigned commission.
        var first = await SettlementFor(db, await Verified(db, a.Id, [Sale(standard.Id, 10)]));
        Assert.Equal(("NeedsResolution", 259.35m), (first.Summary.AttributionStatus, first.Summary.ExpectedRemittance));
        Assert.Empty(db.SalesCommissions);

        // An operator names Aina, but Aina is still on legacy terms, which pay no consignment commission.
        var resolved = await Later(db).ResolveSettlementAttributionAsync(AdminAccountId, first.Summary.Id,
            new(aina, "Aina serviced the shop all August per the visit log", first.Summary.ConcurrencyToken), default);
        Assert.Equal(("Resolved", "OperatorResolution", (string?)null), (resolved.Summary.AttributionStatus, resolved.Summary.AttributionSource, resolved.Summary.CommissionPolicyCode));
        Assert.Contains("no recorded commission terms", resolved.Summary.CommissionNote);
        Assert.Empty(db.SalesCommissions);
        await Assert.ThrowsAsync<ApiException>(() => Later(db).ResolveSettlementAttributionAsync(AdminAccountId, first.Summary.Id,
            new(badrul, "Trying to move earned commission", resolved.Summary.ConcurrencyToken), default));

        // The servicing representative changed inside the next period: it is never split by guesswork.
        await Serve(db, aina, Now.AddDays(-30), Now.AddDays(15));
        await Serve(db, badrul, Now.AddDays(15));
        await OnV11(db, badrul);
        var second = await SettlementFor(db, await Verified(db, a.Id, [Sale(standard.Id, 10)], 2, "SHOP-2026-08-B"));
        Assert.Equal("NeedsResolution", second.Summary.AttributionStatus);
        Assert.Contains("changed during this period", second.Summary.AttributionIssue);
        Assert.Empty(db.SalesCommissions);
        second = await Later(db).ResolveSettlementAttributionAsync(AdminAccountId, second.Summary.Id,
            new(badrul, "Badrul took over before most of the period's sales", second.Summary.ConcurrencyToken), default);
        var row = Assert.Single(await Effective(db));
        Assert.Equal((badrul, 45.00m, SalesCommissionStatus.Pending, "v1.1"), (row.SalespersonId, row.CommissionAmount, row.Status, row.PolicyCode));
        Assert.True(await db.AuditLogs.AnyAsync(x => x.Action == "consignment.settlement-attribution-resolved"));
    }

    [Fact]
    public async Task CorrectionsReplaceUnpaidCommissionAndKeepTheFirstRate()
    {
        await using var scope = await Database(250); await using var db = scope.NewContext();
        var (a, standard, _) = await PartnerWithStock(db, 200);
        var aina = await Seller(db, "MPL-SALES-0A", "Aina Rep");
        await Serve(db, aina, Now.AddDays(-30)); await OnV11(db, aina);
        var v1 = await Verified(db, a.Id, [Sale(standard.Id, 100)]);
        var first = await SettlementFor(db, v1);

        // A later rate for this salesperson never re-prices a period already calculated.
        var rules = new CommissionRuleService(db, new AuditLogService(db, new HttpContextAccessor()), new FixedClock(ReportClock));
        await rules.CreateAsync(AdminAccountId, new(nameof(SalesCommissionType.ConsignmentStandardPerUnit), aina, null, 5.00m, null, null, null,
            "MYR", Now.AddDays(-30), null, true, null, null, CommissionPolicyCodes.V1_1), default);
        // A rule that has calculated commission keeps its terms.
        var seeded = await db.CommissionRules.AsNoTracking().SingleAsync(r => r.Id == CommissionRule.ConsignmentStandardV11RuleId);
        var locked = await Assert.ThrowsAsync<ApiException>(() => rules.UpdateAsync(AdminAccountId, seeded.Id, new(nameof(SalesCommissionType.ConsignmentStandardPerUnit),
            null, null, 4.75m, null, null, null, "MYR", seeded.EffectiveFrom, null, true, null, Convert.ToBase64String(seeded.RowVersion), CommissionPolicyCodes.V1_1), default));
        Assert.Equal("commission_rule_in_use", locked.Code);

        var v2 = await Later(db).CorrectSalesReportAsync(AdminAccountId, v1.Id, new(v1.ConcurrencyToken, "Partner recounted two sales"), default);
        v2 = await Later(db).UpdateSalesReportAsync(AdminAccountId, v2.Id, v2.ConcurrencyToken, Report(a.Id, [Sale(standard.Id, 98)]), default);
        v2 = await Later(db).RecordSalesReportAsync(AdminAccountId, v2.Id, new(v2.ConcurrencyToken), default);
        var verified = await Later(db).VerifySalesReportAsync(OwnerAccountId, v2.Id, new(v2.ConcurrencyToken), default);
        await Assert.ThrowsAsync<ApiException>(() => Later(db).VerifySalesReportAsync(OwnerAccountId, v2.Id, new(verified.ConcurrencyToken), default));

        var s = await SettlementFor(db, verified);
        Assert.Equal((first.Summary.Id, 2, 2, 3910.20m, 1368.57m, 2541.63m),
            (s.Summary.Id, s.Summary.Revision, s.Summary.SalesReportVersion, s.Summary.EligibleSales, s.Summary.MerchantCommission, s.Summary.ExpectedRemittance));
        var row = Assert.Single(await Effective(db));
        Assert.Equal((98, 4.50m, 441.00m, 2), (row.QualifiedQuantity, row.CommissionFixedAmountSnapshot, row.CommissionAmount, row.ConsignmentSettlementRevision));
        var replaced = await db.SalesCommissions.AsNoTracking().SingleAsync(c => c.Status == SalesCommissionStatus.Reversed);
        Assert.Equal(450.00m, replaced.CommissionAmount); Assert.Contains("revision 2", replaced.ReversalReason);
        Assert.Equal(2, s.Revisions.Count);
        Assert.Equal("Superseded", (await Later(db).GetSalesReportAsync(v1.Id, default)).Status);
    }

    [Fact]
    public async Task ACommissionInAPreparedPayoutBlocksACorrectionUntilThePayoutIsCancelled()
    {
        await using var scope = await Database(250); await using var db = scope.NewContext();
        var (a, standard, _) = await PartnerWithStock(db, 200);
        var aina = await Seller(db, "MPL-SALES-0A", "Aina Rep");
        await Serve(db, aina, Now.AddDays(-30)); await OnV11(db, aina);
        var v1 = await Verified(db, a.Id, [Sale(standard.Id, 10)]);
        var s = await SettlementFor(db, v1);
        await Remit(db, s.Summary.Id, s.Summary.ExpectedRemittance, "full");
        var row = (await Effective(db)).Single();
        var prepared = await Payouts(db).PrepareAsync(AdminAccountId, new([row.Id], aina, ReportClock.AddDays(-1), ReportClock.AddDays(1), 45.00m, "reserve-then-correct"));

        var v2 = await Later(db).CorrectSalesReportAsync(AdminAccountId, v1.Id, new(v1.ConcurrencyToken, "Partner recounted one sale"), default);
        v2 = await Later(db).UpdateSalesReportAsync(AdminAccountId, v2.Id, v2.ConcurrencyToken, Report(a.Id, [Sale(standard.Id, 9)]), default);
        v2 = await Later(db).RecordSalesReportAsync(AdminAccountId, v2.Id, new(v2.ConcurrencyToken), default);
        var blocked = await Assert.ThrowsAsync<ApiException>(() => Later(db).VerifySalesReportAsync(OwnerAccountId, v2.Id, new(v2.ConcurrencyToken), default));
        Assert.Contains(prepared.Summary.PayoutNumber, blocked.Message);
        // A refused request's half-built changes die with its request scope; this test shares one context, so drop them.
        db.ChangeTracker.Clear();
        // Nothing moved: the report, stock and commission are exactly as before.
        Assert.Equal("Recorded", (await Later(db).GetSalesReportAsync(v2.Id, default)).Status);
        Assert.Equal(SalesCommissionStatus.Payable, (await Effective(db)).Single().Status);

        await Payouts(db).CancelAsync(AdminAccountId, prepared.Summary.Id, new(prepared.Summary.ConcurrencyToken, "Correction pending for this period"));
        await Later(db).VerifySalesReportAsync(OwnerAccountId, v2.Id, new(v2.ConcurrencyToken), default);
        var after = Assert.Single(await Effective(db));
        // The settlement stays fully received at the corrected, lower figure, so the corrected commission is payable.
        Assert.Equal((9, 40.50m, SalesCommissionStatus.Payable), (after.QualifiedQuantity, after.CommissionAmount, after.Status));
        Assert.Equal("CreditDue", (await SettlementFor(db, v1)).Summary.Status);
    }

    [Fact]
    public async Task RefundsOfAPaidPeriodRecoverFromItsEarnerAndShowInTheRefundPeriod()
    {
        await using var scope = await Database(250); await using var db = scope.NewContext();
        var (a, standard, _) = await PartnerWithStock(db, 200);
        var aina = await Seller(db, "MPL-SALES-0A", "Aina Rep");
        await Serve(db, aina, Now.AddDays(-30)); await OnV11(db, aina);

        // A refund inside the same report nets before anything is payable.
        var p1 = await Verified(db, a.Id, [Sale(standard.Id, 100), ReturnedUnsellable(standard.Id, 2, Now.AddDays(-1))]);
        var s1 = await SettlementFor(db, p1);
        Assert.Equal((98, 2, 79.80m, 3910.20m, 1368.57m, 2541.63m, 441.00m),
            (s1.Summary.StandardQuantity - s1.Summary.RefundQuantity, s1.Summary.RefundQuantity, s1.Summary.RefundAmount,
             s1.Summary.EligibleSales, s1.Summary.MerchantCommission, s1.Summary.ExpectedRemittance, s1.Summary.CommissionPending));
        await Remit(db, s1.Summary.Id, s1.Summary.ExpectedRemittance, "p1");
        var p1Row = (await Effective(db)).Single();
        Assert.Equal((98, SalesCommissionStatus.Payable), (p1Row.QualifiedQuantity, p1Row.Status));
        var payout = await Payouts(db).PrepareAsync(AdminAccountId, new([p1Row.Id], aina, ReportClock.AddDays(-1), ReportClock.AddDays(1), 441.00m, "p1-payout"));
        await Payouts(db).MarkPaidAsync(AdminAccountId, payout.Summary.Id, new(payout.Summary.ConcurrencyToken, CommissionPayoutPaymentMethod.DuitNow, "DN-1", new DateOnly(2026, 9, 6)));

        // Two refunds of the paid period, reported with the next period's sales. They reduce the period
        // whose sale they reverse (already paid, so RM9 is owed back), and never the refund period's own commission.
        var p2 = await Verified(db, a.Id, [Sale(standard.Id, 10), ReturnedUnsellable(standard.Id, 2, p1.PeriodStart)], 2, "SHOP-2026-08-B");
        var s2 = await SettlementFor(db, p2);
        Assert.Equal((10, 399.00m, 2, 79.80m, 319.20m), (s2.Summary.StandardQuantity, s2.Summary.StandardSales, s2.Summary.RefundQuantity, s2.Summary.RefundAmount, s2.Summary.EligibleSales));
        Assert.Equal((111.72m, 207.48m, 45.00m, 9.00m), (s2.Summary.MerchantCommission, s2.Summary.ExpectedRemittance, s2.Summary.CommissionPending, s2.Summary.CommissionRecoveryRequired));
        // The paid row and payout are unchanged; the obligation names Aina, that row and that payout.
        Assert.Equal(SalesCommissionStatus.Paid, (await db.SalesCommissions.AsNoTracking().SingleAsync(c => c.Id == p1Row.Id)).Status);
        var after1 = await SettlementFor(db, p1);
        Assert.Equal((441.00m, 0m), (after1.Summary.CommissionPaid, after1.Summary.CommissionRecoveryRequired));
        var obligation = Assert.Single(await db.ConsignmentCommissionRecoveries.AsNoTracking()
            .Where(r => r.SettlementRevision == r.Settlement!.Revision).ToListAsync());
        Assert.Equal((aina, p1Row.Id, payout.Summary.Id, s2.Summary.Id, 2, 9.00m),
            (obligation.SalespersonId, obligation.OriginCommissionId, obligation.CommissionPayoutId, obligation.CausedBySettlementId, obligation.Quantity, obligation.Amount));
        Assert.Equal(9.00m, (await Payouts(db).GetAsync(payout.Summary.Id)).Summary.RecoveryExposure);
    }

    [Fact]
    public async Task RefundsBeyondAPeriodsOwnSalesBecomeAnExplicitRecoveryAndCredit()
    {
        await using var scope = await Database(250); await using var db = scope.NewContext();
        var (a, standard, _) = await PartnerWithStock(db, 200);
        var aina = await Seller(db, "MPL-SALES-0A", "Aina Rep");
        await Serve(db, aina, Now.AddDays(-30)); await OnV11(db, aina);
        var p1 = await Verified(db, a.Id, [Sale(standard.Id, 100)]);
        var s1 = await SettlementFor(db, p1);
        await Remit(db, s1.Summary.Id, s1.Summary.ExpectedRemittance, "p1");
        var p1Row = (await Effective(db)).Single();
        var payout = await Payouts(db).PrepareAsync(AdminAccountId, new([p1Row.Id], aina, ReportClock.AddDays(-1), ReportClock.AddDays(1), 450.00m, "p1-paid"));
        await Payouts(db).MarkPaidAsync(AdminAccountId, payout.Summary.Id, new(payout.Summary.ConcurrencyToken, CommissionPayoutPaymentMethod.BankTransfer, "IBG-P1", new DateOnly(2026, 9, 6)));

        var p2 = await Verified(db, a.Id, [ReturnedUnsellable(standard.Id, 2, p1.PeriodStart)], 2, "SHOP-2026-08-B");
        var s2 = await SettlementFor(db, p2);
        // MyPetLink owes the partner its share of the refund, and Aina was paid for two tags that came back.
        Assert.Equal((-79.80m, -27.93m, -51.87m, "CreditDue"), (s2.Summary.EligibleSales, s2.Summary.MerchantCommission, s2.Summary.ExpectedRemittance, s2.Summary.Status));
        Assert.Equal(9.00m, s2.Summary.CommissionRecoveryRequired);
        Assert.Single(await Effective(db));   // no negative ledger row; the paid row stays as paid
        await Assert.ThrowsAsync<ApiException>(() => Remit(db, s2.Summary.Id, 1.00m, "nothing-due"));
    }

    [Fact]
    public async Task ConcurrentRemittancesNeverOverpayOrDoublePost()
    {
        await using var scope = await Database(250);
        Guid settlement;
        await using (var db = scope.NewContext())
        {
            var (a, standard, _) = await PartnerWithStock(db, 200);
            settlement = (await SettlementFor(db, await Verified(db, a.Id, [Sale(standard.Id, 100)]))).Summary.Id;
        }
        async Task<string> Attempt(string key)
        {
            await using var db = scope.NewContext();
            try { await Remit(db, settlement, 2593.50m, key); return "recorded"; }
            catch (ApiException) { return "refused"; }
        }
        var outcomes = await Task.WhenAll(Attempt("race-a"), Attempt("race-b"), Attempt("race-a"), Attempt("race-c"));
        await using var check = scope.NewContext();
        var s = await check.ConsignmentSettlements.AsNoTracking().SingleAsync();
        Assert.Equal((2593.50m, ConsignmentSettlementStatus.Settled), (s.ReceivedAmount, s.Status));
        Assert.Equal(2593.50m, await check.ConsignmentSettlementReceipts.SumAsync(r => r.Amount));
        Assert.Single(await check.ConsignmentSettlementReceipts.ToListAsync());
        Assert.Contains("recorded", outcomes);
    }

    [Fact]
    public async Task PolicyAssignmentsAreNeverBackdatedOverlappingOrEndedRetroactively()
    {
        await using var scope = await Database(4); await using var db = scope.NewContext();
        var aina = await Seller(db, "MPL-SALES-0A", "Aina Rep");
        var policies = Policies(db);
        var early = await Assert.ThrowsAsync<ApiException>(() => policies.RecordAsync(AdminAccountId, aina,
            new(CommissionPolicyCodes.V1_1, Now, Now.AddDays(-1), "Signed v1.1 letter", null), default));
        Assert.Equal("validation_failed", early.Code);
        await Assert.ThrowsAsync<ApiException>(() => policies.RecordAsync(AdminAccountId, aina,
            new("v9", Now, Now, "Signed letter", null), default));
        var assigned = await policies.RecordAsync(AdminAccountId, aina, new(CommissionPolicyCodes.V1_1, Now, Now, "Signed v1.1 letter", null), default);
        var overlap = await Assert.ThrowsAsync<ApiException>(() => policies.RecordAsync(AdminAccountId, aina,
            new(CommissionPolicyCodes.V1_1, Now, Now.AddDays(3), "Second letter", null), default));
        Assert.Equal("commission_policy_overlap", overlap.Code);
        await Assert.ThrowsAsync<ApiException>(() => policies.EndAsync(AdminAccountId, aina, assigned.Id,
            new(Now.AddDays(1), "Ending in the past", assigned.ConcurrencyToken), default));
        var ended = await policies.EndAsync(AdminAccountId, aina, assigned.Id,
            new(ReportClock.AddDays(10), "Moving to a new arrangement", assigned.ConcurrencyToken), default);
        Assert.Equal(ReportClock.AddDays(10), ended.EffectiveToExclusive);
        // Raw edits of terms are refused by the model, not just by the service.
        var row = await db.SalespersonPolicyAssignments.SingleAsync();
        row.AgreementReference = "Edited";
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task APeriodVerifiedBeforeSettlementsExistIsNeverBackFilled()
    {
        await using var scope = await Database(250); await using var db = scope.NewContext();
        var (a, standard, _) = await PartnerWithStock(db, 200);
        var v1 = await Verified(db, a.Id, [Sale(standard.Id, 10)]);
        // Simulate a period verified before this release: its settlement never existed.
        await db.Database.ExecuteSqlRawAsync("DELETE FROM ConsignmentSettlementLines; DELETE FROM ConsignmentSettlementRevisions; DELETE FROM ConsignmentSettlements;");
        var v2 = await Later(db).CorrectSalesReportAsync(AdminAccountId, v1.Id, new(v1.ConcurrencyToken, "Partner recounted one sale"), default);
        v2 = await Later(db).UpdateSalesReportAsync(AdminAccountId, v2.Id, v2.ConcurrencyToken, Report(a.Id, [Sale(standard.Id, 9)]), default);
        v2 = await Later(db).RecordSalesReportAsync(AdminAccountId, v2.Id, new(v2.ConcurrencyToken), default);
        await Later(db).VerifySalesReportAsync(OwnerAccountId, v2.Id, new(v2.ConcurrencyToken), default);
        Assert.Empty(db.ConsignmentSettlements); Assert.Empty(db.SalesCommissions);
        Assert.True(await db.AuditLogs.AnyAsync(x => x.Action == "consignment.settlement-not-started"));
    }

    [Fact]
    public async Task MigrationRecordsRolloutServicingSeedsTheRateCardAndGuardsRollback()
    {
        Assert.True(RelationalDatabase.IsAvailable, "SQL Server must run for the settlement release gate; skipping is not acceptable.");
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true, createSchema: false);
        await using var db = scope.NewContext();
        var migrator = db.GetService<IMigrator>();
        await migrator.MigrateAsync("20261024151533_AddDocumentSignatures");
        // Neither entity changes in this migration, so the current model writes the previous schema exactly.
        var person = new Salesperson { SalespersonCode = "MPL-SALES-RB", Name = "Rollout Rep", IsActive = true };
        var shop = new Merchant
        {
            MerchantCode = "MPL-M-RB", LegalBusinessName = "Rollout Shop", ContactPerson = "Owner", ContactEmail = "shop@example.com",
            ContactPhone = "+60123456789", BillingAddressLine1 = "1 Jalan", BillingPostcode = "50000", BillingCity = "KL", BillingState = "KL",
            DeliveryAddressLine1 = "1 Jalan", DeliveryPostcode = "50000", DeliveryCity = "KL", DeliveryState = "KL", AssignedSalesperson = person,
        };
        var unassigned = new Merchant
        {
            MerchantCode = "MPL-M-RC", LegalBusinessName = "Unassigned Shop", ContactPerson = "Owner", ContactEmail = "shop2@example.com",
            ContactPhone = "+60123456780", BillingAddressLine1 = "2 Jalan", BillingPostcode = "50000", BillingCity = "KL", BillingState = "KL",
            DeliveryAddressLine1 = "2 Jalan", DeliveryPostcode = "50000", DeliveryCity = "KL", DeliveryState = "KL",
        };
        db.AddRange(person, shop, unassigned); await db.SaveChangesAsync();
        var (seller, merchant) = (person.Id, shop.Id);
        await migrator.MigrateAsync();
        db.ChangeTracker.Clear();
        var rollout = await db.MerchantServicingAssignments.AsNoTracking().SingleAsync();
        Assert.Equal((merchant, seller, "Rollout", (DateTimeOffset?)null), (rollout.MerchantId, rollout.SalespersonId, rollout.Source, rollout.EffectiveToExclusive));
        var card = await db.CommissionRules.AsNoTracking().Where(r => r.PolicyCode == CommissionPolicyCodes.V1_1).OrderBy(r => r.FixedAmount).ToListAsync();
        Assert.Equal(new[] { 4.00m, 4.50m }, card.Select(r => r.FixedAmount!.Value));
        // Legacy rules are left exactly as they were.
        Assert.Equal(15m, (await db.CommissionRules.AsNoTracking().SingleAsync(r => r.Id == CommissionRule.DefaultDirectRetailRuleId)).Percentage);
        // A clean rollback succeeds; once financial history exists it is refused.
        await migrator.MigrateAsync("20261024151533_AddDocumentSignatures");
        await migrator.MigrateAsync();
        Assert.Equal(1, await db.MerchantServicingAssignments.CountAsync());
        // A reassignment after rollout is history the rollback would erase.
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE MerchantServicingAssignments SET EffectiveToExclusive = {DateTimeOffset.UtcNow.AddDays(1)}");
        Assert.Equal(51063, (await SqlFailure(() => migrator.MigrateAsync("20261024151533_AddDocumentSignatures"))).Number);
        Assert.Contains(SettlementsMigration, await db.Database.GetAppliedMigrationsAsync());
    }

    private static MerchantBillingService BillingFor(MyPetLinkDbContext db)
    {
        var audit = new AuditLogService(db, new HttpContextAccessor());
        var identity = new BusinessIdentityService(db, audit, new FixedClock(ReportClock));
        var gate = new EmailTemplateGate(db, Microsoft.Extensions.Options.Options.Create(new EmailOptions()));
        return new MerchantBillingService(db, new DocumentNumberService(db), identity,
            new MerchantEmailService(db, gate, audit, new FixedClock(ReportClock)), audit, new FixedClock(ReportClock));
    }
}
