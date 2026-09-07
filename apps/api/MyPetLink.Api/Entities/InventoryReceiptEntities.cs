namespace MyPetLink.Api.Entities;

/// <summary>
/// One immutable record of physical serialized stock received and its landed
/// cost. Production/code-generation batches remain a separate concern.
/// Corrections are appended as new receipts linked through CorrectsReceiptId.
/// </summary>
public sealed class InventoryReceipt : AuditableEntity
{
    public string ReceiptNumber { get; set; } = "";
    public Guid TagProductVariantId { get; set; }
    public Guid? SmartTagBatchId { get; set; }
    public int QuantityReceived { get; set; }
    public DateTimeOffset ReceivedAt { get; set; }
    public string? SupplierName { get; set; }
    public string? SupplierReference { get; set; }
    public string? Notes { get; set; }
    public string PurchaseCurrency { get; set; } = "MYR";
    public decimal ExchangeRateToMyr { get; set; } = 1m;
    public InventoryReceiptCostMode CostMode { get; set; }
    public decimal GoodsCost { get; set; }
    public decimal FreightCost { get; set; }
    public decimal CustomsTaxCost { get; set; }
    public decimal OtherLandedCost { get; set; }
    public decimal TotalLandedCostMyr { get; set; }
    public decimal UnitLandedCostMyr { get; set; }
    public Guid CreatedByAdminUserId { get; set; }
    public Guid? CorrectsReceiptId { get; set; }
    public string? CorrectionReason { get; set; }
    public byte[] RowVersion { get; set; } = [];

    public TagProductVariant TagProductVariant { get; set; } = null!;
    public SmartTagBatch? SmartTagBatch { get; set; }
    public AdminUser CreatedByAdminUser { get; set; } = null!;
    public InventoryReceipt? CorrectsReceipt { get; set; }
    public ICollection<SmartTag> SmartTags { get; set; } = new List<SmartTag>();
}
