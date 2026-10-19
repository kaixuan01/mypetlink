namespace MyPetLink.Api.Entities;

// Monthly stocktake, discrepancy investigation and carry forward (Phase 1B). Counts are by SKU:
// no Tag Code is ever scanned, attributed or changed by a stocktake, and nothing here creates an
// invoice, payment, commission or settlement.

public enum ConsignmentStocktakeStatus { Draft, Recorded, Approved, Voided }
public enum ConsignmentDiscrepancyKind { Shortage, Surplus, UnsellableFound, UnsellableShortage }
public enum ConsignmentDiscrepancyStatus { Open, Resolved }

/// <summary>
/// One branch's physical count, taken at the end of a count day that closes a sales period
/// (the 15th or the last day of the month, Malaysia time). Approving it closes the month:
/// the snapshot is frozen and the counted stock carries forward as the next opening.
/// </summary>
public sealed class ConsignmentStocktake : AuditableEntity
{
    public Guid MerchantId { get; set; }
    public Guid MerchantBranchId { get; set; }
    // The first moment after the count day, midnight Malaysia time; movements before it are counted.
    public DateTimeOffset CutoffAt { get; set; }
    // When the shelf was physically counted, which is not the cutoff and not when it was typed in.
    // Null only for counts entered before this was recorded.
    public DateTimeOffset? CountedAt { get; set; }
    // A count taken after the cutoff, before the shop reopened: how it is known nothing moved in between.
    public string? CountedAfterCutoffNote { get; set; }
    public string CountedBy { get; set; } = "";
    public string EvidenceKind { get; set; } = "";
    public string EvidenceReference { get; set; } = "";
    public string? Notes { get; set; }
    public ConsignmentStocktakeStatus Status { get; set; }
    // The approved stocktake this one carries forward from, set when it is approved.
    public Guid? PreviousStocktakeId { get; set; }
    public Guid CreatedByAdminUserId { get; set; }
    public Guid? RecordedByAdminUserId { get; set; }
    public DateTimeOffset? RecordedAt { get; set; }
    public Guid? ApprovedByAdminUserId { get; set; }
    public DateTimeOffset? ApprovedAt { get; set; }
    public string? ReviewMode { get; set; }
    public string IdempotencyKey { get; set; } = "";
    public bool ContributorHistoryComplete { get; set; } = true;
    public byte[] RowVersion { get; set; } = [];
    public ICollection<ConsignmentStocktakeLine> Lines { get; set; } = [];
}

/// <summary>
/// One SKU's count. Book figures and outcomes are filled in, and the line frozen, when the
/// stocktake is approved; a frozen line can never change again (SQL trigger and EF guard).
/// </summary>
public sealed class ConsignmentStocktakeLine : Entity
{
    public Guid StocktakeId { get; set; }
    public ConsignmentStocktake Stocktake { get; set; } = null!;
    public Guid ProductVariantId { get; set; }
    public string SkuSnapshot { get; set; } = "";
    public int CountedSellable { get; set; }
    public int CountedUnsellable { get; set; }
    public string? Notes { get; set; }

    // Frozen at approval: the books at the cutoff, what the count changed and the closing position.
    public DateTimeOffset? FrozenAt { get; set; }
    public int? BookSellable { get; set; }
    public int? BookUnsellable { get; set; }
    public int? BookInvestigation { get; set; }
    public int? BookSold { get; set; }
    public int? BookLost { get; set; }
    public int? OpenSurplusBefore { get; set; }
    public int? UnsellableFound { get; set; }
    public int? UnsellableShortage { get; set; }
    public int? Shortage { get; set; }
    public int? Surplus { get; set; }
    public int? SurplusNoLongerPresent { get; set; }
    public int? ClosingSellable { get; set; }
    public int? ClosingUnsellable { get; set; }
    public int? ClosingInvestigation { get; set; }
    public int? ClosingSold { get; set; }
    public int? ClosingLost { get; set; }
    public int? OpenSurplusAfter { get; set; }
}

/// <summary>
/// A counted difference under investigation. Shortages hold their quantity in the Investigation
/// bucket; a surplus is a note only and never adds stock. OpenQuantity falls as resolutions are made.
/// </summary>
public sealed class ConsignmentStockDiscrepancy : AuditableEntity
{
    public Guid MerchantId { get; set; }
    public Guid MerchantBranchId { get; set; }
    public Guid ProductVariantId { get; set; }
    public string SkuSnapshot { get; set; } = "";
    public Guid OriginStocktakeId { get; set; }
    public Guid OriginStocktakeLineId { get; set; }
    public ConsignmentDiscrepancyKind Kind { get; set; }
    public int Quantity { get; set; }
    public int OpenQuantity { get; set; }
    public ConsignmentDiscrepancyStatus Status { get; set; }
    public byte[] RowVersion { get; set; } = [];
    public ICollection<ConsignmentDiscrepancyResolution> Resolutions { get; set; } = [];
}

/// <summary>One recorded outcome for part or all of a discrepancy. Append-only.</summary>
public sealed class ConsignmentDiscrepancyResolution : Entity
{
    public Guid DiscrepancyId { get; set; }
    public ConsignmentStockDiscrepancy Discrepancy { get; set; } = null!;
    public string Outcome { get; set; } = "";
    public int Quantity { get; set; }
    public string EvidenceReference { get; set; } = "";
    public string Reason { get; set; } = "";
    // A late sales report that explained it, or the shortage an earlier-found surplus came from.
    public Guid? LinkedSalesReportId { get; set; }
    public Guid? RelatedDiscrepancyId { get; set; }
    // A compensating entry: a correction withdrew the late-report explanation this row reverses,
    // and its quantity is open again. Never set on any other outcome.
    public Guid? ReversesResolutionId { get; set; }
    public Guid? ReviewEventId { get; set; }
    public string? ReviewMode { get; set; }
    public Guid ActorAdminUserId { get; set; }
    public DateTimeOffset RecordedAt { get; set; }
}
