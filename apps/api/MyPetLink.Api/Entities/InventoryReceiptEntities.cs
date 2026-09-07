namespace MyPetLink.Api.Entities;

/// <summary>
/// One immutable record of physical serialized stock received and its landed
/// cost. Production/code-generation batches remain a separate concern.
///
/// Corrections are appended as new receipts linked through CorrectsReceiptId.
/// The corrected receipt is then stamped superseded and hands its serialized
/// tags to the correction, so exactly one active receipt owns any unit and the
/// received quantity can never be counted twice. A superseded receipt is never
/// deleted: it stays queryable for audit and keeps its original figures.
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

    /// <summary>
    /// Set when a later receipt corrected this one. A superseded receipt owns
    /// no serialized tags, is excluded from active listings and from every
    /// valuation or spend total, and can never be corrected again.
    /// </summary>
    public DateTimeOffset? SupersededAt { get; set; }
    public Guid? SupersededByReceiptId { get; set; }

    public byte[] RowVersion { get; set; } = [];

    public TagProductVariant TagProductVariant { get; set; } = null!;
    public SmartTagBatch? SmartTagBatch { get; set; }
    public AdminUser CreatedByAdminUser { get; set; } = null!;
    public InventoryReceipt? CorrectsReceipt { get; set; }
    public InventoryReceipt? SupersededByReceipt { get; set; }
    public ICollection<SmartTag> SmartTags { get; set; } = new List<SmartTag>();
}

/// <summary>
/// The single definition of "this stock receipt still counts". A receipt counts
/// until a correction supersedes it; after that the correction owns the units
/// and the original survives only as history. Expressed as an expression tree
/// so listings, valuations and reports all run the identical rule in the
/// database rather than each restating it.
/// </summary>
public static class InventoryReceiptRules
{
    public static System.Linq.Expressions.Expression<Func<InventoryReceipt, bool>> IsActive =>
        receipt => receipt.SupersededAt == null;
}
