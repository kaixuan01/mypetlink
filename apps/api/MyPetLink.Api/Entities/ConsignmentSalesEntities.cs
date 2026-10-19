namespace MyPetLink.Api.Entities;

// Partner-reported sales and the SKU stock ledger. Quantities move between
// buckets; no row here changes a ConsignmentUnit, and nothing here is an
// invoice, payment, commission or settlement entry.

public enum ConsignmentStockBucket { External, Sellable, Unsellable, Investigation, SoldUnidentified, LostUnidentified }
public enum ConsignmentPriceTermKind { Standard, Promotion }
public enum ConsignmentPriceTermStatus { Draft, Approved, Withdrawn }
public enum ConsignmentSalesReportStatus { Draft, Recorded, Verified, Disputed, Superseded, Voided }
public enum ConsignmentEvidenceLevel { Documented, Summary }
public enum ConsignmentSalesLineType { Sale, Refund }
public enum ConsignmentHandoverAttribution { AggregateSale, NonSaleWithdrawal }

/// <summary>
/// Append-only SKU quantity movement for one partner branch. Each source posts
/// once (unique source key); corrections post a reversal, never an edit.
/// </summary>
public sealed class ConsignmentStockLedgerEntry : Entity
{
    public Guid MerchantId { get; set; }
    public Guid MerchantBranchId { get; set; }
    public Guid ProductVariantId { get; set; }
    public string SkuSnapshot { get; set; } = "";
    public ConsignmentStockBucket FromBucket { get; set; }
    public ConsignmentStockBucket ToBucket { get; set; }
    public int Quantity { get; set; }
    public string EntryType { get; set; } = "";
    public string SourceType { get; set; } = "";
    public Guid SourceLineId { get; set; }
    public Guid? ReversesEntryId { get; set; }
    public DateTimeOffset EffectiveAt { get; set; }
    public DateTimeOffset PostedAt { get; set; }
    public bool IsPriorPeriodCorrection { get; set; }
    public Guid ActorAdminUserId { get; set; }
}

/// <summary>An approved selling price (Standard) or promotion for one SKU under one agreement version.</summary>
public sealed class ConsignmentPriceTerm : AuditableEntity
{
    public Guid AgreementId { get; set; }
    public ConsignmentAgreement Agreement { get; set; } = null!;
    public Guid ProductVariantId { get; set; }
    public string SkuSnapshot { get; set; } = "";
    public ConsignmentPriceTermKind Kind { get; set; }
    public string Name { get; set; } = "";
    public decimal UnitNetPrice { get; set; }
    public DateTimeOffset ValidFrom { get; set; }
    public DateTimeOffset? ValidToExclusive { get; set; }
    public string? ApprovalEvidenceReference { get; set; }
    public ConsignmentPriceTermStatus Status { get; set; }
    public Guid CreatedByAdminUserId { get; set; }
    public Guid? ApprovedByAdminUserId { get; set; }
    public DateTimeOffset? ApprovedAt { get; set; }
    public string? ReviewMode { get; set; }
    // False when this price existed before contributor history was kept: who edited it is
    // unknown, so nobody can approve it as independent (see ConsignmentRecordContributor).
    public bool ContributorHistoryComplete { get; set; } = true;
    public byte[] RowVersion { get; set; } = [];
}

/// <summary>
/// One partner sales report for a fixed half-month period. Values are frozen
/// once recorded; a correction is a new version that supersedes this one.
/// </summary>
public sealed class ConsignmentSalesReport : AuditableEntity
{
    public Guid MerchantId { get; set; }
    public Guid MerchantBranchId { get; set; }
    public Guid AgreementId { get; set; }
    public ConsignmentAgreement Agreement { get; set; } = null!;
    public DateTimeOffset PeriodStart { get; set; }
    public DateTimeOffset PeriodEndExclusive { get; set; }
    public string PartnerReference { get; set; } = "";
    public int Version { get; set; } = 1;
    public Guid? SupersedesReportId { get; set; }
    public DateTimeOffset ReportReceivedAt { get; set; }
    public ConsignmentEvidenceLevel EvidenceLevel { get; set; }
    public string EvidenceKind { get; set; } = "";
    public string EvidenceReference { get; set; } = "";
    public string? Notes { get; set; }
    public ConsignmentSalesReportStatus Status { get; set; }
    public Guid CreatedByAdminUserId { get; set; }
    public Guid? RecordedByAdminUserId { get; set; }
    public DateTimeOffset? RecordedAt { get; set; }
    public Guid? VerifiedByAdminUserId { get; set; }
    public DateTimeOffset? VerifiedAt { get; set; }
    public Guid? DisputedByAdminUserId { get; set; }
    public DateTimeOffset? DisputedAt { get; set; }
    public string? DisputeReason { get; set; }
    public string? ReviewMode { get; set; }
    public string IdempotencyKey { get; set; } = "";
    // False when this version existed before contributor history was kept.
    public bool ContributorHistoryComplete { get; set; } = true;
    // A version re-entered from the partner's evidence to recover from unknown history: its
    // figures are its own, so earlier versions' contributors and gaps no longer apply to it.
    public bool StartsFreshContributorHistory { get; set; }
    public byte[] RowVersion { get; set; } = [];
    public ICollection<ConsignmentSalesReportLine> Lines { get; set; } = [];
}

public sealed class ConsignmentSalesReportLine : Entity
{
    public Guid SalesReportId { get; set; }
    public ConsignmentSalesReport SalesReport { get; set; } = null!;
    public Guid ProductVariantId { get; set; }
    public string SkuSnapshot { get; set; } = "";
    public string ProductNameSnapshot { get; set; } = "";
    public ConsignmentSalesLineType LineType { get; set; }
    // Null only when the partner reported a price no approved term matches;
    // such a report can be recorded as reported but never verified.
    public Guid? PriceTermId { get; set; }
    public decimal? UnitListPriceSnapshot { get; set; }
    public decimal UnitNetPrice { get; set; }
    public int Quantity { get; set; }
    public DateTimeOffset? RefundOfPeriodStart { get; set; }
    public int RestockableQuantity { get; set; }
    public int UnsellableReturnedQuantity { get; set; }
    // A package only goes back on the shelf when someone confirms it came back sealed
    // and records how they know. Required whenever RestockableQuantity is above zero.
    public bool SealedReturnConfirmed { get; set; }
    public string? SealedReturnEvidence { get; set; }
    // Reserved for stocktake discrepancy reconciliation; always empty until stocktakes exist.
    public Guid? ExplainsDiscrepancyId { get; set; }
    public int QuantityExplainingDiscrepancy { get; set; }
    // Set when a later approved stocktake found no variance for this SKU (Summary evidence corroborated).
    public Guid? CorroboratedByStocktakeId { get; set; }
    public string? Notes { get; set; }
}

/// <summary>
/// One immutable row per admin who substantively shaped a price term or sales report:
/// created it, changed its values, or recorded it. Nobody listed here can approve or
/// verify that subject (or, for a report, any later version of it) as an independent
/// reviewer. Mirrors <see cref="ConsignmentDraftContributor"/> for agreement versions.
/// </summary>
public sealed class ConsignmentRecordContributor
{
    public string SubjectType { get; set; } = "";
    public Guid SubjectId { get; set; }
    public Guid AdminUserId { get; set; }
    // The first way this admin contributed: Created, Edited or Recorded.
    public string Role { get; set; } = "";
    public DateTimeOffset FirstContributedAt { get; set; }
}
