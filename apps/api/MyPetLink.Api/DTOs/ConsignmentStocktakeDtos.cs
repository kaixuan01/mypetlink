using System.ComponentModel.DataAnnotations;
namespace MyPetLink.Api.DTOs;

// Monthly stocktakes, discrepancies and carry forward (Phase 1B).
public sealed record ConsignmentStocktakeLineRequest(Guid ProductVariantId, int CountedSellable, int CountedUnsellable,
    [MaxLength(1000)] string? Notes = null);
public sealed record SaveConsignmentStocktakeRequest(Guid MerchantBranchId, [Required, MaxLength(10)] string CountDate,
    [Required, MaxLength(200)] string CountedBy, [Required, MaxLength(24)] string EvidenceKind, [MaxLength(1000)] string? EvidenceReference,
    [MaxLength(2000)] string? Notes, IReadOnlyList<ConsignmentStocktakeLineRequest> Lines, [MaxLength(80)] string? IdempotencyKey = null,
    DateTimeOffset? CountedAt = null, [MaxLength(1000)] string? CountedAfterCutoffNote = null);

/// <summary>
/// One SKU in a stocktake. Book figures are the ledger at the cutoff; "expected" adds open surplus
/// notes. Outcome and closing figures are a preview until the stocktake is approved, then frozen.
/// </summary>
public sealed record ConsignmentStocktakeLineResponse(Guid? Id, Guid ProductVariantId, string Sku, string ProductName,
    int BookSellable, int BookUnsellable, int BookInvestigation, int BookSold, int BookLost, int OpenSurplusBefore,
    int ExpectedSellable, int ExpectedUnsellable, int? CountedSellable, int? CountedUnsellable,
    int? SellableVariance, int? UnsellableVariance, int UnsellableFound, int UnsellableShortage, int Shortage, int Surplus,
    int SurplusNoLongerPresent, int ClosingSellable, int ClosingUnsellable, int ClosingInvestigation, int ClosingSold,
    int ClosingLost, int OpenSurplusAfter, int CustodyUnits, string? Notes, bool Frozen);

public sealed record ConsignmentStocktakeResponse(Guid Id, Guid MerchantId, string MerchantName, Guid MerchantBranchId,
    string BranchName, string CountDate, DateTimeOffset CutoffAt, string CountedBy, string EvidenceKind, string EvidenceReference,
    string? Notes, string Status, Guid? PreviousStocktakeId, DateTimeOffset? PreviousCutoffAt, DateTimeOffset CreatedAt,
    DateTimeOffset? RecordedAt, DateTimeOffset? ApprovedAt, string? ReviewMode, IReadOnlyList<ConsignmentStocktakeLineResponse> Lines,
    IReadOnlyList<string> Issues, IReadOnlyList<string> Warnings, string ConcurrencyToken)
{
    /// <summary>When the shelf was physically counted (null for counts entered before this was recorded).</summary>
    public DateTimeOffset? CountedAt { get; init; }
    public string? CountedAfterCutoffNote { get; init; }
    /// <summary>
    /// Identifies the findings shown for review. Closing the month with acknowledged findings must
    /// send it back, so a close never approves figures that changed after they were reviewed.
    /// </summary>
    public string? ReviewFingerprint { get; init; }
}

/// <summary>What a count on a given day will be compared against, before anything is entered.</summary>
public sealed record ConsignmentStocktakeExpectationResponse(Guid MerchantBranchId, string CountDate, DateTimeOffset CutoffAt,
    DateTimeOffset? PreviousCutoffAt, IReadOnlyList<ConsignmentStocktakeLineResponse> Lines, IReadOnlyList<string> Issues);

public sealed record ConsignmentDiscrepancyResolutionResponse(Guid Id, string Outcome, int Quantity, string EvidenceReference,
    string Reason, Guid? LinkedSalesReportId, Guid? RelatedDiscrepancyId, string? ReviewMode, Guid ActorAdminUserId, DateTimeOffset RecordedAt)
{
    public Guid? ReversesResolutionId { get; init; }
}
public sealed record ConsignmentDiscrepancyResponse(Guid Id, Guid MerchantId, string MerchantName, Guid MerchantBranchId,
    string BranchName, Guid ProductVariantId, string Sku, Guid OriginStocktakeId, string OriginCountDate, string Kind, int Quantity,
    int OpenQuantity, string Status, IReadOnlyList<string> AllowedOutcomes, IReadOnlyList<ConsignmentDiscrepancyResolutionResponse> Resolutions,
    DateTimeOffset CreatedAt, string ConcurrencyToken)
{
    public DateTimeOffset OriginCutoffAt { get; init; }
}
public sealed record ResolveConsignmentDiscrepancyRequest([Required] string ConcurrencyToken, [Required, MaxLength(32)] string Outcome,
    int Quantity, [MaxLength(1000)] string? EvidenceReference, [MaxLength(1000)] string? Reason, Guid? RelatedDiscrepancyId = null,
    ConsignmentSelfReview? SelfReview = null);

/// <summary>
/// A reviewer's explicit link between a late sales report and one discrepancy its period explains:
/// sales for a shortage, restocked returns (or fewer sales) for a surplus. Nothing is linked automatically.
/// </summary>
public sealed record ConsignmentLateAllocationRequest(Guid DiscrepancyId, int Quantity, [MaxLength(1000)] string? EvidenceReference,
    [MaxLength(1000)] string? Explanation);

/// <summary>A discrepancy a late report could explain, from the first count after its period.</summary>
public sealed record ConsignmentLateCandidateResponse(Guid DiscrepancyId, string Kind, Guid OriginStocktakeId, string OriginCountDate,
    DateTimeOffset OriginCutoffAt, int Quantity, int OpenQuantity);
/// <summary>An explanation by the version this report replaces. Verifying withdraws it and reopens its quantity.</summary>
public sealed record ConsignmentLateAllocationResponse(Guid ResolutionId, Guid DiscrepancyId, string Kind, Guid SalesReportId, int Quantity);
/// <summary>
/// One SKU of a report whose month a stocktake has already closed. LateShelfChange is what the count
/// couldn't have seen: negative for sales, positive for restocked returns or fewer sales.
/// </summary>
public sealed record ConsignmentLateSkuResponse(Guid ProductVariantId, string Sku, int LateShelfChange, string? ExplainsKind, int Capacity,
    IReadOnlyList<ConsignmentLateCandidateResponse> Candidates, IReadOnlyList<ConsignmentLateAllocationResponse> Withdrawn)
{
    /// <summary>Units that must be linked to this SKU's shortage before the report can verify (0 if none).</summary>
    public int RequiredLinks { get; init; }
}
public sealed record ConsignmentLateReportResponse(Guid ClosedByStocktakeId, string ClosedCountDate, DateTimeOffset ClosedCutoffAt,
    IReadOnlyList<ConsignmentLateSkuResponse> Skus);
