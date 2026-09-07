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
    [property: MaxLength(1000)] string? CorrectionReason);

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
    int UncostedUnits);

public sealed record ProfitabilityReportResponse(
    DateTimeOffset From,
    DateTimeOffset To,
    decimal ProductRevenue,
    decimal Discounts,
    decimal NetProductRevenue,
    int UnitsSold,
    decimal KnownCostOfGoods,
    bool IsCostOfGoodsComplete,
    decimal? GrossProfit,
    decimal? GrossMarginPercentage,
    int UncostedUnits,
    decimal RecordedCourierCost,
    int OrdersMissingCourierCost,
    decimal RecordedSalesCommission,
    decimal? ContributionProfit,
    IReadOnlyCollection<string> ExcludedCosts,
    IReadOnlyCollection<ProfitabilityOrderDetail> Orders);
