using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

// Phase 1A F-A1: Standard and Promotion commission paid in one payout and refunded on one report are two
// obligations that share origin, cause, salesperson and payout. Each response row must carry the stored
// obligation's own key so the Admin Portal can tell them apart, and that key must not move between reads.
public sealed partial class ConsignmentRelationalTests
{
    [Fact]
    public async Task FA1_EachRecoveryRowCarriesItsOwnStoredObligationKey()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(40); await using var db = scope.NewContext();
            var (a, standard, promo) = await PartnerWithStock(db, 30);
            var seller = await Seller(db, "FA1-KEYS", "Recovery Rep"); await Serve(db, seller, Now.AddDays(-30)); await OnV11(db, seller);
            var original = await Verified(db, a.Id, [Sale(standard.Id, 10), Sale(promo.Id, 3, 34.9m)]);
            var first = await SettlementFor(db, original);
            await Remit(db, first.Summary.Id, first.Summary.ExpectedRemittance, "fa1-full");
            var paid = await PaidPayout(db, seller, await Effective(db), "fa1-paid");
            Assert.Equal(57m, paid.Summary.PreparedAmount);

            // September: 2 Standard + 1 Promotion refunded → RM9 + RM4, identical in every field but the obligation.
            await Verified(db, ReportFor(a.Id, "2026-09", 1, "FA1-LATER",
                [ReturnedUnsellable(standard.Id, 2, original.PeriodStart), ReturnedUnsellable(promo.Id, 1, original.PeriodStart, 34.9m)]), LateClock);
            var initial = (await SettlementFor(db, original)).CurrentRecoveries!;
            Assert.Equal((2, 13m), (initial.Count, initial.Sum(r => r.Amount)));
            Assert.Single(initial.Select(r => (r.OriginSettlementId, r.CausedBySettlementId, r.PayoutNumber, r.SalespersonName)).Distinct());
            await AssertKeysAreTheStoredObligations(db, initial);
            Assert.Equal(initial.Select(r => r.RecoveryId), (await SettlementFor(db, original)).CurrentRecoveries!.Select(r => r.RecoveryId));

            // An earlier August refund of 1 Standard adds a third obligation: RM17.50 across three rows.
            await Verified(db, ReportFor(a.Id, "2026-08", 2, "FA1-EARLIER", [ReturnedUnsellable(standard.Id, 1, original.PeriodStart)]), LateClock);
            var updated = (await SettlementFor(db, original)).CurrentRecoveries!;
            Assert.Equal((3, 17.5m), (updated.Count, updated.Sum(r => r.Amount)));
            Assert.Equal(new[] { 4.5m, 4m, 9m }.Order(), updated.Select(r => r.Amount).Order());
            await AssertKeysAreTheStoredObligations(db, updated);
            Assert.Equal(17.5m, (await Payouts(db).GetAsync(paid.Summary.Id)).Summary.RecoveryExposure);

            // Repeated reads return the same rows in the same order with the same keys.
            var again = (await SettlementFor(db, original)).CurrentRecoveries!;
            Assert.Equal(updated, again);
        }
        finally { MigratedSchema.Value = false; }
    }

    private static async Task AssertKeysAreTheStoredObligations(MyPetLinkDbContext db, IReadOnlyList<ConsignmentCommissionRecoveryResponse> rows)
    {
        Assert.Equal(rows.Count, rows.Select(r => r.RecoveryId).Distinct().Count());
        var ids = rows.Select(r => r.RecoveryId).ToArray();
        var stored = await db.ConsignmentCommissionRecoveries.AsNoTracking()
            .Where(r => ids.Contains(r.Id) && r.SettlementRevision == r.Settlement!.Revision).ToDictionaryAsync(r => r.Id);
        Assert.Equal(rows.Count, stored.Count);
        foreach (var row in rows)
        {
            var s = stored[row.RecoveryId];
            Assert.Equal((s.SettlementId, s.CausedBySettlementId, s.Quantity, s.UnitAmount, s.Amount),
                (row.OriginSettlementId, row.CausedBySettlementId, row.Quantity, row.UnitAmount, row.Amount));
        }
    }
}
