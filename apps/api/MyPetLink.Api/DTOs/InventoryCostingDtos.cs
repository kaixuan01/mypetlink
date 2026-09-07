using System.ComponentModel.DataAnnotations;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.DTOs;

public sealed class InventoryReceiptQuery : PagedQuery
{
    public Guid? ProductVariantId { get; init; }
    public Guid? BatchId { get; init; }
    public DateTimeOffset? ReceivedFrom { get; init; }
    public DateTimeOffset? ReceivedTo { get; init; }

    /// <summary>
    /// Corrected receipts are hidden by default so a listing shows the stock
    /// that actually counts. Set this to review correction history.
    /// </summary>
    public bool IncludeSuperseded { get; init; }
}

public sealed record CreateInventoryReceiptRequest(
    Guid ProductVariantId,
    Guid? SmartTagBatchId,
    [property: Range(1, 100000)] int QuantityReceived,
    DateTimeOffset ReceivedAt,
    [property: MaxLength(200)] string? SupplierName,
    [property: MaxLength(120)] string? SupplierReference,
    [property: MaxLength(2000)] string? Notes,
    [property: Required, StringLength(3, MinimumLength = 3)] string PurchaseCurrency,
    decimal? ExchangeRateToMyr,
    InventoryReceiptCostMode CostMode,
    decimal? UnitLandedCostMyr,
    decimal? GoodsCost,
    decimal? FreightCost,
    decimal? CustomsTaxCost,
    decimal? OtherLandedCost,
    Guid? CorrectsReceiptId,
    [property: MaxLength(1000)] string? CorrectionReason,
    /// <summary>
    /// The corrected receipt's concurrency token. Required whenever
    /// <see cref="CorrectsReceiptId"/> is set, so two administrators cannot
    /// correct the same receipt from the same stale view.
    /// </summary>
    string? CorrectsReceiptRowVersion = null);

public sealed record InventoryReceiptResponse(
    Guid Id,
    string ReceiptNumber,
    Guid ProductVariantId,
    string Sku,
    string ProductName,
    Guid? SmartTagBatchId,
    string? BatchNumber,
    int QuantityReceived,
    DateTimeOffset ReceivedAt,
    string? SupplierName,
    string? SupplierReference,
    string? Notes,
    string PurchaseCurrency,
    decimal ExchangeRateToMyr,
    InventoryReceiptCostMode CostMode,
    decimal GoodsCost,
    decimal FreightCost,
    decimal CustomsTaxCost,
    decimal OtherLandedCost,
    decimal TotalLandedCostMyr,
    decimal UnitLandedCostMyr,
    Guid CreatedByAdminUserId,
    DateTimeOffset CreatedAt,
    Guid? CorrectsReceiptId,
    string? CorrectionReason,
    DateTimeOffset? SupersededAt,
    Guid? SupersededByReceiptId,
    string RowVersion);

public sealed record InventoryReceiptBatchOption(
    Guid Id,
    string BatchNumber,
    int GeneratedQuantity,
    int UnreceivedEligibleQuantity);

public sealed record InventoryReceiptSkuOption(
    Guid Id,
    string Sku,
    string ProductName,
    string VariantName,
    IReadOnlyCollection<InventoryReceiptBatchOption> Batches);

public sealed record ProfitabilityReportQuery(
    DateTimeOffset From,
    DateTimeOffset To);

public sealed record ProfitabilityOrderDetail(
    string Channel,
    Guid OrderId,
    string OrderNumber,
    DateTimeOffset CostSnapshotAt,
    decimal SellingAmount,
    decimal? CostOfGoods,
    decimal? GrossProfit,
    int Units,
    int UncostedUnits,
    bool IsFullyCosted);

/// <summary>
/// One order whose revenue is no longer realised. It is listed rather than
/// summed into the period, because an original selling price is not current
/// revenue once the money went back.
/// </summary>
public sealed record ProfitabilityExcludedOrder(
    string Channel,
    Guid OrderId,
    string OrderNumber,
    string Reason,
    decimal OriginalSellingAmount);

/// <summary>
/// A period's trading result, split so that incomplete history can never be
/// mistaken for a margin.
///
/// The Costed* figures cover only orders where every unit carries a real cost
/// snapshot, so they reconcile on their own and are the numbers to act on. The
/// Uncosted* figures carry the rest: revenue is reported, cost is not estimated
/// and no margin is offered for them. Totals span both.
/// </summary>
public sealed record ProfitabilityReportResponse(
    DateTimeOffset From,
    DateTimeOffset To,
    decimal ProductRevenue,
    decimal Discounts,
    decimal NetProductRevenue,
    int UnitsSold,
    decimal CostedNetRevenue,
    int CostedUnits,
    decimal CostedCostOfGoods,
    decimal CostedGrossProfit,
    decimal? CostedGrossMarginPercentage,
    decimal UncostedNetRevenue,
    int UncostedUnits,
    bool IsCostOfGoodsComplete,
    decimal RecordedCourierCost,
    int OrdersMissingCourierCost,
    decimal RecordedSalesCommission,
    decimal CostedCourierCost,
    decimal CostedSalesCommission,
    decimal? ContributionProfit,
    IReadOnlyCollection<ProfitabilityExcludedOrder> ExcludedOrders,
    IReadOnlyCollection<string> ExcludedCosts,
    IReadOnlyCollection<ProfitabilityOrderDetail> Orders);
