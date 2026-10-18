namespace MyPetLink.Api.Entities;

public enum ConsignmentAgreementStatus { Draft, Active, Closed }
public enum ConsignmentDispatchStatus { Reserved, Dispatched, Received, Cancelled }
public enum ConsignmentUnitStatus { Reserved, Dispatched, Received, ReturnedQuarantine, Released, ExternalHandover, WrittenOff }
public enum ConsignmentReceivingState { Unconfirmed, Good, Damaged, Missing, Returned, ReviewRequired }

// Commercial terms are immutable after approval. A revision is a new row.
public sealed class ConsignmentAgreement : AuditableEntity
{
    public Guid MerchantId { get; set; }
    public Merchant Merchant { get; set; } = null!;
    public string Reference { get; set; } = "";
    public int Version { get; set; } = 1;
    public Guid? SupersedesAgreementId { get; set; }
    public decimal PartnerCommissionPercentage { get; set; }
    public DateTimeOffset? EffectiveFrom { get; set; }
    public DateTimeOffset? EffectiveTo { get; set; }
    public string? DurationTerms { get; set; }
    public string? SettlementFrequency { get; set; }
    public int? PaymentDeadlineDays { get; set; }
    public string? DiscountTerms { get; set; }
    public string? ReturnTerms { get; set; }
    public string? LossTerms { get; set; }
    public string? SignedAgreementReference { get; set; }
    public string? ExternalTrackerReference { get; set; }
    public ConsignmentAgreementStatus Status { get; set; }
    public Guid UpdatedByAdminUserId { get; set; }
    public Guid? ApprovedByAdminUserId { get; set; }
    public DateTimeOffset? ApprovedAt { get; set; }
    public string? ApprovalReviewMode { get; set; }
    public bool DraftContributorHistoryComplete { get; set; }
    public ICollection<ConsignmentDraftContributor> DraftContributors { get; set; } = [];
    public byte[] RowVersion { get; set; } = [];
}

public sealed class ConsignmentDispatch : AuditableEntity
{
    public Guid AgreementId { get; set; }
    public ConsignmentAgreement Agreement { get; set; } = null!;
    public string DispatchNumber { get; set; } = "";
    public string IdempotencyKey { get; set; } = "";
    public string RequestFingerprint { get; set; } = "";
    public string MerchantNameSnapshot { get; set; } = "";
    public string AgreementReferenceSnapshot { get; set; } = "";
    public int AgreementVersionSnapshot { get; set; }
    public decimal CommissionPercentageSnapshot { get; set; }
    public string DestinationSnapshot { get; set; } = "";
    public string ExternalTrackerReference { get; set; } = "";
    public SellerIdentitySnapshot Seller { get; set; } = new();
    public ConsignmentDispatchStatus Status { get; set; }
    public DateTimeOffset? DispatchedAt { get; set; }
    public string? ShipmentReference { get; set; }
    public DateTimeOffset? ReceivedAt { get; set; }
    public string? ReceiptAcknowledgment { get; set; }
    public Guid? MerchantBranchId { get; set; }
    public Guid? DispatchedByAdminUserId { get; set; }
    public Guid? ReceivedByAdminUserId { get; set; }
    public string? RecipientName { get; set; }
    public DateTimeOffset? PartnerReceivedAt { get; set; }
    public int? ReceivedQuantity { get; set; }
    public byte[]? IssuedDocumentContent { get; set; }
    public string? IssuedDocumentSha256 { get; set; }
    public DateTimeOffset? DocumentIssuedAt { get; set; }
    public bool HasOpenDiscrepancy { get; set; }
    public Guid UpdatedByAdminUserId { get; set; }
    public byte[] RowVersion { get; set; } = [];
    public ICollection<ConsignmentUnit> Units { get; set; } = [];
    public ICollection<ConsignmentReviewEvent> ReviewEvents { get; set; } = [];
    public ICollection<ConsignmentMovement> Movements { get; set; } = [];
    public ICollection<ConsignmentHandoverRecord> HandoverRecords { get; set; } = [];
}

public sealed class ConsignmentUnit : AuditableEntity
{
    public Guid DispatchId { get; set; }
    public ConsignmentDispatch Dispatch { get; set; } = null!;
    public Guid SmartTagId { get; set; }
    public SmartTag SmartTag { get; set; } = null!;
    public Guid ProductVariantId { get; set; }
    public Guid? BatchId { get; set; }
    public string TagCodeSnapshot { get; set; } = "";
    public string SkuSnapshot { get; set; } = "";
    public string ProductNameSnapshot { get; set; } = "";
    public string VariantSnapshot { get; set; } = "";
    public string? BatchNumberSnapshot { get; set; }
    public ConsignmentUnitStatus Status { get; set; }
    public DateTimeOffset? ReturnedAt { get; set; }
    public int? ReturnQaVersion { get; set; }
    public DateTimeOffset? ReleasedAt { get; set; }
    public string? ExternalReference { get; set; }
    public Guid? CurrentHandoverRecordId { get; set; }
    public ConsignmentReceivingState ReceivingState { get; set; }
    public Guid? DiscrepancyRecordedByAdminUserId { get; set; }
    public byte[] RowVersion { get; set; } = [];
}

// One immutable attribution per substantive contributor to an agreement version.
public sealed class ConsignmentDraftContributor
{
    public Guid AgreementId { get; set; }
    public Guid AdminUserId { get; set; }
    public DateTimeOffset FirstContributedAt { get; set; }
    public bool IsCreator { get; set; }
}

// Append-only operational history; never a sale, commission or payment ledger.
public sealed class ConsignmentMovement : Entity
{
    public Guid DispatchId { get; set; }
    public ConsignmentDispatch Dispatch { get; set; } = null!;
    public Guid? UnitId { get; set; }
    public string Action { get; set; } = "";
    public string Reference { get; set; } = "";
    public Guid ActorAdminUserId { get; set; }
    public AdminUser ActorAdminUser { get; set; } = null!;
    public DateTimeOffset OccurredAt { get; set; }
    public string? ReviewMode { get; set; }
    public string? EvidenceJson { get; set; }
}

// Append-only external reports. These are unverified reconciliation evidence,
// never authoritative financial sales, commissions or settlement entries.
public sealed class ConsignmentHandoverRecord : Entity
{
    public Guid MerchantId { get; set; }
    public Guid AgreementId { get; set; }
    public Guid DispatchId { get; set; }
    public Guid UnitId { get; set; }
    public Guid ActorAdminUserId { get; set; }
    public string EventReference { get; set; } = "";
    public string Kind { get; set; } = "Handover";
    public Guid? SupersedesRecordId { get; set; }
    public DateTimeOffset EventAt { get; set; }
    public DateTimeOffset RecordedAt { get; set; }
    public bool IsReportedSale { get; set; }
    public decimal? SellingPrice { get; set; }
    public decimal? DiscountAmount { get; set; }
    public string? DiscountDescription { get; set; }
    public string EvidenceReference { get; set; } = "";
}
