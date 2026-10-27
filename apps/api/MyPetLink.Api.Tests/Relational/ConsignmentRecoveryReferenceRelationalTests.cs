using Microsoft.EntityFrameworkCore;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

// Phase 1A final remediation (R3): one recovery obligation is shown on the period where the
// commission was paid and on the report that took it away. Both settlements must name the same
// obligation, with its origin, cause and payout, so it can never read as two amounts owed.
public sealed partial class ConsignmentRelationalTests
{
    [Fact]
    public async Task R3_OriginAndCauseSettlementsShowTheSameSingleRecoveryWithItsReferences()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(30); await using var db = scope.NewContext();
            var (a, standard, _) = await PartnerWithStock(db, 20);
            var seller = await Seller(db, "MPL-SALES-0A", "Aina Rep"); await Serve(db, seller, Now.AddDays(-30)); await OnV11(db, seller);
            var first = await Verified(db, a.Id, [Sale(standard.Id, 10)]);
            await Remit(db, (await SettlementFor(db, first)).Summary.Id, 259.35m, "r3-full");
            var paid = await PaidPayout(db, seller, await Effective(db), "r3-paid");
            var refund = await Verified(db, a.Id, [ReturnedUnsellable(standard.Id, 2, first.PeriodStart)], 2, "SHOP-2026-08-B");

            var origin = await SettlementFor(db, first);
            var cause = await SettlementFor(db, refund);
            var fromOrigin = Assert.Single(origin.CurrentRecoveries!);
            var fromCause = Assert.Single(cause.CurrentRecoveries!);
            Assert.Equal(fromOrigin, fromCause);
            Assert.Equal((origin.Summary.Id, origin.Summary.SettlementNumber, cause.Summary.Id, cause.Summary.SettlementNumber),
                (fromOrigin.OriginSettlementId, fromOrigin.OriginSettlementNumber, fromOrigin.CausedBySettlementId, fromOrigin.CausedBySettlementNumber));
            Assert.Equal(("Aina Rep", paid.Summary.PayoutNumber, 2, 4.50m, 9m),
                (fromOrigin.SalespersonName, fromOrigin.PayoutNumber, fromOrigin.Quantity, fromOrigin.UnitAmount, fromOrigin.Amount));

            // The amount owed is counted once, on the report that caused it; the origin's history line is that same row.
            Assert.Equal((0m, 9m), (origin.Summary.CommissionRecoveryRequired, cause.Summary.CommissionRecoveryRequired));
            Assert.Equal(9m, origin.Revisions.First().CommissionRecoveryRequired);
            Assert.Equal(9m, (await Payouts(db).GetAsync(paid.Summary.Id)).Summary.RecoveryExposure);
            Assert.Equal(1, await db.ConsignmentCommissionRecoveries.CountAsync());
        }
        finally { MigratedSchema.Value = false; }
    }
}
