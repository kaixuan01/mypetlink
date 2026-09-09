using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public interface ICommissionPayoutStatementService
{
    Task<OrderDocumentResult> GetStatementAsync(
        Guid payoutId, CancellationToken cancellationToken = default);
}

/// <summary>
/// Reproduces a payout instruction from the immutable header and item snapshots.
/// Current commission state is consulted only for the separately labelled
/// post-payout recovery section; it never changes the historical payout total.
/// </summary>
public sealed class CommissionPayoutStatementService : ICommissionPayoutStatementService
{
    private readonly MyPetLinkDbContext _db;
    private readonly TimeProvider _time;

    public CommissionPayoutStatementService(MyPetLinkDbContext db, TimeProvider time)
    {
        _db = db;
        _time = time;
    }

    public async Task<OrderDocumentResult> GetStatementAsync(
        Guid payoutId, CancellationToken cancellationToken = default)
    {
        var payout = await _db.CommissionPayouts
            .AsNoTracking()
            .Include(item => item.Items)
                .ThenInclude(item => item.SalesCommission)
            .SingleOrDefaultAsync(item => item.Id == payoutId, cancellationToken)
            ?? throw new ApiException(404, "commission_payout_not_found",
                "That commission payout no longer exists.");

        var items = payout.Items
            .OrderBy(item => GroupOrder(item.CommissionTypeSnapshot))
            .ThenBy(item => item.CalculatedAtSnapshot)
            .ThenBy(item => item.SourceOrderNumberSnapshot)
            .ThenBy(item => item.Id)
            .ToArray();

        // Cancellation releases claims for a future payout; it does not change
        // what this historical instruction contained. Reconcile every item,
        // including released ones, before rendering anything financial.
        if (items.Length == 0
            || items.Sum(item => item.CommissionAmountSnapshot) != payout.PreparedAmount
            || items.Any(item => item.CurrencySnapshot != payout.Currency))
        {
            throw new ApiException(409, "payout_statement_reconciliation_failed",
                "This payout statement cannot be generated because its historical total does not reconcile.");
        }

        var recoveryItems = payout.Status == CommissionPayoutStatus.Paid
            ? items.Where(item => item.SalesCommission?.Status == SalesCommissionStatus.Reversed)
                .Select(item => new CommissionPayoutRecoveryLine(
                    item.SourceOrderNumberSnapshot,
                    item.CommissionAmountSnapshot,
                    item.SalesCommission!.ReversedAt,
                    item.SalesCommission.ReversalReason))
                .ToArray()
            : [];

        var model = new CommissionPayoutStatementModel(
            payout.PayoutNumber,
            payout.Status,
            payout.Seller,
            payout.SalespersonCodeSnapshot,
            payout.SalespersonNameSnapshot,
            payout.PeriodFrom,
            payout.PeriodToExclusive,
            payout.Currency,
            payout.PreparedAmount,
            payout.PreparedAt,
            payout.PaidAt,
            payout.PaymentMethod,
            payout.PaymentReference,
            payout.CancelledAt,
            payout.CancellationReason,
            payout.Notes,
            items.Select(item => new CommissionPayoutStatementLine(
                GroupLabel(item.CommissionTypeSnapshot),
                item.SourceOrderNumberSnapshot,
                item.CalculatedAtSnapshot,
                item.CommissionBaseAmountSnapshot,
                item.CommissionPercentageSnapshot,
                item.CommissionFixedAmountSnapshot,
                item.CommissionAmountSnapshot)).ToArray(),
            recoveryItems,
            _time.GetUtcNow());

        return new OrderDocumentResult(
            CommissionPayoutStatementRenderer.Render(model),
            $"MyPetLink-Commission-Payout-Statement-{SafeReference(payout.PayoutNumber)}.pdf");
    }

    internal static string GroupLabel(SalesCommissionType type) => type switch
    {
        SalesCommissionType.DirectRetailPercentage => "Direct Retail",
        SalesCommissionType.ResellerAcquisitionBonus => "Reseller Acquisition",
        SalesCommissionType.ResellerRepeatPercentage => "Reseller Repeat",
        _ => "Legacy Merchant Percentage",
    };

    private static int GroupOrder(SalesCommissionType type) => type switch
    {
        SalesCommissionType.DirectRetailPercentage => 0,
        SalesCommissionType.ResellerAcquisitionBonus => 1,
        SalesCommissionType.ResellerRepeatPercentage => 2,
        _ => 3,
    };

    private static string SafeReference(string value)
    {
        var safe = new string(value
            .Where(character => char.IsLetterOrDigit(character) || character is '-' or '_')
            .ToArray());
        return safe.Length == 0 ? "payout" : safe;
    }
}
