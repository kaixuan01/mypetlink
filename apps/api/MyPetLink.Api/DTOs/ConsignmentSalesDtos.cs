using System.ComponentModel.DataAnnotations;
namespace MyPetLink.Api.DTOs;

// Approved selling prices
public sealed record SaveConsignmentPriceTermRequest(Guid AgreementId, Guid ProductVariantId,
    [Required, MaxLength(16)] string Kind, [MaxLength(100)] string? Name, decimal UnitNetPrice,
    DateTimeOffset ValidFrom, DateTimeOffset? ValidToExclusive, [MaxLength(1000)] string? ApprovalEvidenceReference);
public sealed record CopyConsignmentPriceTermsRequest(Guid FromAgreementId, Guid ToAgreementId);
public sealed record ConsignmentPriceTermResponse(Guid Id, Guid AgreementId, Guid ProductVariantId, string Sku,
    string Kind, string Name, decimal UnitNetPrice, DateTimeOffset ValidFrom, DateTimeOffset? ValidToExclusive,
    string? ApprovalEvidenceReference, string Status, DateTimeOffset? ApprovedAt, string? ReviewMode, string ConcurrencyToken,
    bool ContributorHistoryComplete = true);

/// <summary>A reviewed decision on a price term or sales report.</summary>
/// <remarks>
/// Allocations apply only when verifying a report for a closed month; ReviewedFingerprint only when
/// closing a month (the stocktake's ReviewFingerprint at the time its findings were reviewed).
/// </remarks>
public sealed record ConsignmentReviewRequest([Required] string ConcurrencyToken, [MaxLength(1000)] string? Reason = null,
    ConsignmentSelfReview? SelfReview = null, bool AcknowledgeWarnings = false, DateTimeOffset? EndAt = null,
    [MaxLength(60)] IReadOnlyList<ConsignmentLateAllocationRequest>? Allocations = null, [MaxLength(128)] string? ReviewedFingerprint = null);
public sealed record ConsignmentTokenRequest([Required] string ConcurrencyToken);

// Sales reports
public sealed record ConsignmentSalesLineRequest(Guid ProductVariantId, [Required, MaxLength(16)] string LineType,
    Guid? PriceTermId, decimal UnitNetPrice, int Quantity, DateTimeOffset? RefundOfPeriodStart = null,
    int RestockableQuantity = 0, int UnsellableReturnedQuantity = 0, [MaxLength(1000)] string? Notes = null,
    bool SealedReturnConfirmed = false, [MaxLength(300)] string? SealedReturnEvidence = null);
public sealed record SaveConsignmentSalesReportRequest(Guid AgreementId, Guid MerchantBranchId,
    [Required, MaxLength(7)] string PeriodMonth, int Half, [Required, MaxLength(100)] string PartnerReference,
    DateTimeOffset ReportReceivedAt, [Required, MaxLength(16)] string EvidenceLevel, [Required, MaxLength(24)] string EvidenceKind,
    [MaxLength(1000)] string? EvidenceReference, [MaxLength(2000)] string? Notes,
    IReadOnlyList<ConsignmentSalesLineRequest> Lines, [MaxLength(80)] string? IdempotencyKey = null);
public sealed record ConsignmentSalesLineResponse(Guid Id, Guid ProductVariantId, string Sku, string ProductName, string LineType,
    Guid? PriceTermId, string? PriceTermName, string? PriceTermKind, decimal? UnitListPrice, decimal UnitNetPrice, int Quantity,
    decimal NetValue, decimal PromotionalDiscount, DateTimeOffset? RefundOfPeriodStart, int RestockableQuantity,
    int UnsellableReturnedQuantity, string? Notes, bool SealedReturnConfirmed = false, string? SealedReturnEvidence = null);
public sealed record ConsignmentSalesReportResponse(Guid Id, Guid MerchantId, string MerchantName, Guid MerchantBranchId,
    string BranchName, Guid AgreementId, string AgreementReference, int AgreementVersion, DateTimeOffset PeriodStart,
    DateTimeOffset PeriodEndExclusive, string PartnerReference, int Version, Guid? SupersedesReportId, Guid? SupersededById,
    DateTimeOffset ReportReceivedAt, string EvidenceLevel, string EvidenceKind, string EvidenceReference, string? Notes,
    string Status, DateTimeOffset CreatedAt, DateTimeOffset? RecordedAt, DateTimeOffset? VerifiedAt, string? ReviewMode,
    DateTimeOffset? DisputedAt, string? DisputeReason, IReadOnlyList<ConsignmentSalesLineResponse> Lines,
    int UnitsSold, int UnitsRefunded, decimal NetSalesValue, IReadOnlyList<string> Issues, IReadOnlyList<string> Warnings,
    string ConcurrencyToken)
{
    /// <summary>False when someone may have edited these figures without it being recorded (see Re-enter).</summary>
    public bool ContributorHistoryComplete { get; init; } = true;
    /// <summary>Set while the report is unverified and a stocktake has already closed its month.</summary>
    public ConsignmentLateReportResponse? LateReport { get; init; }
    /// <summary>
    /// The issues a reviewer's explicit links (in LateReport) can resolve. Every other issue still blocks
    /// verification; verification re-checks all of them with the links supplied.
    /// </summary>
    public IReadOnlyList<string> LinkResolvableIssues { get; init; } = [];
}

// SKU stock position per partner branch
public sealed record ConsignmentSkuPositionResponse(Guid ProductVariantId, string Sku, string ProductName,
    int Sellable, int Unsellable, int Investigation, int SoldUnidentified, int LostUnidentified,
    int UnverifiedSold, int UnverifiedRestockable, int ProvisionalSellable, int CustodyUnits, bool TieOutBalanced,
    int UntrackedUnits, int DeliveryHolds, int ActivatedInCustody)
{
    /// <summary>Counted packages beyond the books, noted for investigation and never added to stock.</summary>
    public int OpenSurplus { get; init; }
    public int OpenDiscrepancies { get; init; }
}
public sealed record ConsignmentStockPositionResponse(Guid MerchantId, string MerchantName, Guid MerchantBranchId,
    string BranchName, IReadOnlyList<ConsignmentSkuPositionResponse> Skus, DateTimeOffset? LastVerifiedPeriodEnd,
    int ReportsAwaitingVerification, int DisputedReports)
{
    /// <summary>The last day of the branch's latest closed month, if a stocktake has closed one.</summary>
    public string? LastClosedCountDate { get; init; }
    public int OpenDiscrepancies { get; init; }
    public bool StocktakeInProgress { get; init; }
}
public sealed record StartConsignmentStockTrackingRequest(Guid MerchantBranchId, [Required, MaxLength(1000)] string Reason);
