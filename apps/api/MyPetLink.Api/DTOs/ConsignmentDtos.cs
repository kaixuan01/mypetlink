using System.ComponentModel.DataAnnotations;
namespace MyPetLink.Api.DTOs;

// Reference is assigned by the server for a new agreement and inherited by a revision.
// Clients may echo an existing reference back; IdempotencyKey makes "create draft" safe to retry.
public sealed record SaveConsignmentAgreementRequest(
    Guid MerchantId, [MaxLength(100)] string? Reference,
    [Required] decimal? PartnerCommissionPercentage, DateTimeOffset? EffectiveFrom, DateTimeOffset? EffectiveTo,
    [MaxLength(2000)] string? DurationTerms, [MaxLength(2000)] string? SettlementFrequency,
    int? PaymentDeadlineDays, [MaxLength(2000)] string? DiscountTerms,
    [MaxLength(2000)] string? ReturnTerms, [MaxLength(2000)] string? LossTerms,
    [MaxLength(2000)] string? SignedAgreementReference, [MaxLength(2000)] string? ExternalTrackerReference,
    Guid? SupersedesAgreementId = null, [MaxLength(80)] string? IdempotencyKey = null, int? DefaultTermsRevision = null);
/// <summary>Starting terms for new agreements. Evidence (dates, signed and tracker references) is never part of it.</summary>
public sealed record ConsignmentDefaultTermsValues(decimal? PartnerCommissionPercentage, int? TrialDurationDays,
    [MaxLength(2000)] string? DurationTerms, [MaxLength(2000)] string? SettlementFrequency, int? PaymentDeadlineDays,
    [MaxLength(2000)] string? DiscountTerms, [MaxLength(2000)] string? ReturnTerms, [MaxLength(2000)] string? LossTerms);
public sealed record ConsignmentDefaultTermsRevisionResponse(int Revision, bool IsActive, ConsignmentDefaultTermsValues Terms,
    DateTimeOffset RecordedAt, string? RecordedByName);
public sealed record ConsignmentDefaultTermsResponse(int Revision, bool IsActive, ConsignmentDefaultTermsValues Terms,
    IReadOnlyList<string> Missing, DateTimeOffset? UpdatedAt, string? UpdatedByName, string ConcurrencyToken,
    IReadOnlyList<ConsignmentDefaultTermsRevisionResponse> History);
public sealed record SaveConsignmentDefaultTermsRequest([Required] string ConcurrencyToken, bool IsActive,
    [Required] ConsignmentDefaultTermsValues Terms);
public sealed record ConsignmentAgreementPrefixResponse(Guid MerchantId, string? Prefix, string SuggestedPrefix,
    bool Locked, DateTimeOffset? LockedAt, string ReferencePattern, string ConcurrencyToken);
// ConcurrencyToken is empty while the merchant has no prefix yet.
public sealed record SaveConsignmentAgreementPrefixRequest([Required, MaxLength(40)] string Prefix, string? ConcurrencyToken);
public sealed record ConsignmentAgreementResponse(Guid Id, Guid MerchantId, string MerchantName,
    string Reference, int Version, string Status, decimal PartnerCommissionPercentage,
    DateTimeOffset? EffectiveFrom, DateTimeOffset? EffectiveTo, string? DurationTerms,
    string? SettlementFrequency, int? PaymentDeadlineDays, string? DiscountTerms,
    string? ReturnTerms, string? LossTerms, string? SignedAgreementReference,
    string? ExternalTrackerReference, IReadOnlyList<string> PendingTerms, string ConcurrencyToken, string? ApprovalReviewMode = null,
    int? DefaultTermsRevision = null);
public sealed record ConsignmentLineRequest(Guid ProductVariantId, [Range(1,1000)] int Quantity,
    IReadOnlyList<Guid>? SmartTagIds = null);
public sealed record ReserveConsignmentRequest(Guid AgreementId,
    [Required, MaxLength(2000)] string Destination, [Required, MaxLength(2000)] string ExternalTrackerReference,
    [Required, MaxLength(80)] string IdempotencyKey, IReadOnlyList<ConsignmentLineRequest> Lines,
    Guid? MerchantBranchId = null);
public sealed record ConsignmentActionRequest([Required] string ConcurrencyToken,
    [Required, MaxLength(1000)] string Reference, IReadOnlyList<Guid>? UnitIds = null,
    ConsignmentReceiptEvidence? Receipt = null, ConsignmentHandoverEvidence? Handover = null, ConsignmentSelfReview? SelfReview = null,
    [MaxLength(16)] string? ReturnFromBucket = null);
public sealed record ConsignmentReceiptEvidence([Required, MaxLength(200)] string Recipient,
    DateTimeOffset ReceivedAt, int Quantity, int DamagedQuantity, int MissingQuantity,
    [Required, MaxLength(1000)] string SignedEvidenceReference,
    IReadOnlyList<Guid>? GoodUnitIds = null, IReadOnlyList<Guid>? DamagedUnitIds = null,
    IReadOnlyList<Guid>? MissingUnitIds = null, IReadOnlyList<Guid>? ReturnedUnitIds = null);
public sealed record ConsignmentHandoverEvidence([Required, MaxLength(150)] string EventReference,
    DateTimeOffset EventAt, bool IsReportedSale,
    [Range(typeof(decimal), "0", "999999.99")] decimal? SellingPrice,
    [Range(typeof(decimal), "0", "999999.99")] decimal? DiscountAmount,
    [MaxLength(1000)] string? DiscountDescription, Guid? SupersedesRecordId = null,
    [MaxLength(24)] string? Attribution = null);
public sealed record ConsignmentDispatchResponse(Guid Id, Guid AgreementId, string DispatchNumber,
    string MerchantName, string AgreementReference, int AgreementVersion, decimal CommissionPercentage,
    string Destination, string Status, string ExternalTrackerReference, DateTimeOffset? DispatchedAt,
    DateTimeOffset? ReceivedAt, string? ShipmentReference, string? ReceiptAcknowledgment,
    int Reserved, int PartnerHeld, int ReturnedQuarantine, int Released, int ExternalHandovers,
    int ActivatedWithoutExternalReference, IReadOnlyList<ConsignmentUnitResponse> Units,
    IReadOnlyList<ConsignmentMovementResponse> History, string ConcurrencyToken,
    Guid? MerchantBranchId, bool HasOpenDiscrepancy, bool HasIssuedDocument,
    string? RecipientName, DateTimeOffset? PartnerReceivedAt, int? ReceivedQuantity,
    IReadOnlyList<ConsignmentHandoverResponse> Reconciliation)
{
    public IReadOnlyList<ConsignmentReviewResponse> Reviews { get; init; } = [];
    public int WrittenOff => Units.Count(u => u.Status == "WrittenOff");
    public bool ReservationReused { get; init; }
    /// <summary>
    /// Whether any of this delivery's units is in the partner's SKU stock ledger. Kept for older
    /// clients; decisions about a handover use each unit's own <see cref="ConsignmentUnitResponse.StockTracked"/>.
    /// </summary>
    public bool StockTracked { get; init; }
}
// No account, pet or finder-contact data crosses this projection.
public sealed record ConsignmentUnitResponse(Guid Id, string? TagCode, string Sku, string ProductName,
    string Variant, string? Batch, string Status, string QaStatus, bool IsActivated,
    string? ExternalReference,Guid? CurrentHandoverRecordId, string ReceivingState = "Unconfirmed")
{
    public string UnitReference => "CU-" + Id.ToString("N").ToUpperInvariant();
    /// <summary>
    /// Whether this unit's arrival is in the partner's SKU stock ledger. Decided per unit:
    /// one delivery can hold both units received before tracking began and units counted since.
    /// </summary>
    public bool StockTracked { get; init; }
}
public sealed record ConsignmentMovementResponse(string Action, string Reference, DateTimeOffset OccurredAt,
    Guid? UnitId, Guid ActorAdminUserId, string? EvidenceJson,string? ActorName, string? ReviewMode = null);
public sealed record ConsignmentHandoverResponse(Guid Id, Guid UnitId, Guid ActorAdminUserId,
    string EventReference, string Kind, DateTimeOffset EventAt, DateTimeOffset RecordedAt,
    bool IsReportedSale, decimal? SellingPrice, decimal? DiscountAmount, string? DiscountDescription,
    string EvidenceReference, Guid? SupersedesRecordId, string VerificationStatus = "Unverified external report",
    string? Attribution = null);
