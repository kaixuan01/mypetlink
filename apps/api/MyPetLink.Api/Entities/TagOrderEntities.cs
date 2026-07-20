namespace MyPetLink.Api.Entities;

public sealed class SmartTagBatch : AuditableEntity
{
    public string BatchNo { get; set; } = "";
    public int Quantity { get; set; }
    public bool HasNfc { get; set; }
    // Tag variant: "Lightweight" or "Standard" (formerly the physical shape).
    public string Variant { get; set; } = "Standard";
    public Guid? GeneratedByAdminUserId { get; set; }
    public Guid? ProductVariantId { get; set; }
    public DateTimeOffset? GeneratedAt { get; set; }
    public DateTimeOffset? ExportedAt { get; set; }
    public DateTimeOffset? PrintedAt { get; set; }
    public DateTimeOffset? SentToResellerAt { get; set; }
    public string? ResellerName { get; set; }
    public string? Remarks { get; set; }
    public DateTimeOffset? ArchivedAt { get; set; }

    public AdminUser? GeneratedByAdminUser { get; set; }
    public TagProductVariant? ProductVariant { get; set; }
    public ICollection<SmartTag> SmartTags { get; set; } = new List<SmartTag>();
}

public sealed class SmartTag : AuditableEntity
{
    public string TagCode { get; set; } = "";
    public Guid? OwnerUserId { get; set; }
    public Guid? PetId { get; set; }
    public Guid? OrderId { get; set; }
    public Guid? BatchId { get; set; }
    public Guid? ProductVariantId { get; set; }
    public bool HasNfc { get; set; }
    // Tag variant: "Lightweight" or "Standard" (formerly the physical shape).
    public string Variant { get; set; } = "Standard";
    public SmartTagStatus Status { get; set; } = SmartTagStatus.Unclaimed;
    // Physical fulfilment progress, tracked separately from the lifecycle
    // Status above. Timestamps record when each fulfilment step happened.
    public TagFulfilmentStatus FulfilmentStatus { get; set; } = TagFulfilmentStatus.Generated;
    public DateTimeOffset? PrintedAt { get; set; }
    public DateTimeOffset? SentToResellerAt { get; set; }
    public DateTimeOffset? ReceivedAt { get; set; }
    public DateTimeOffset? SentToOwnerAt { get; set; }
    public DateTimeOffset? ActivatedAt { get; set; }
    public DateTimeOffset? DeliveredAt { get; set; }
    public DateTimeOffset? LastScannedAt { get; set; }
    public Guid? ReplacementForTagId { get; set; }
    public DateTimeOffset? ArchivedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
    public byte[] RowVersion { get; set; } = [];

    public User? OwnerUser { get; set; }
    public Pet? Pet { get; set; }
    public TagOrder? Order { get; set; }
    public SmartTagBatch? Batch { get; set; }
    public TagProductVariant? ProductVariant { get; set; }
    public SmartTag? ReplacementForTag { get; set; }
}

public sealed class TagOrder : AuditableEntity
{
    public string OrderNumber { get; set; } = "";
    public Guid OwnerUserId { get; set; }
    public Guid PetId { get; set; }
    public Guid? SmartTagId { get; set; }
    public Guid? ReplacementForTagId { get; set; }
    public TagType TagType { get; set; } = TagType.QrPetTag;
    // Tag variant: "Lightweight" or "Standard" (formerly the physical shape).
    public string Variant { get; set; } = "Standard";
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "MYR";
    public decimal DeliveryFee { get; set; }
    public OrderStatus Status { get; set; } = OrderStatus.PendingPayment;
    public PaymentStatus PaymentStatus { get; set; } = PaymentStatus.Pending;
    public DateTimeOffset? PaymentConfirmedAt { get; set; }
    public string RecipientName { get; set; } = "";
    public string DeliveryPhoneE164 { get; set; } = "";
    public string AddressLine1 { get; set; } = "";
    public string? AddressLine2 { get; set; }
    public string Postcode { get; set; } = "";
    public string City { get; set; } = "";
    public string State { get; set; } = "";
    public string? DeliveryNotes { get; set; }
    public string? TrackingStatus { get; set; }
    public string? TrackingNumber { get; set; }
    public DateTimeOffset? ShippedAt { get; set; }
    public DateTimeOffset? DeliveredAt { get; set; }
    public DateTimeOffset? CancelledAt { get; set; }
    public byte[] RowVersion { get; set; } = [];

    public User OwnerUser { get; set; } = null!;
    public Pet Pet { get; set; } = null!;
    public SmartTag? SmartTag { get; set; }
    public SmartTag? ReplacementForTag { get; set; }
    public ICollection<PaymentProof> PaymentProofs { get; set; } = new List<PaymentProof>();
    public ICollection<TagOrderItem> Items { get; set; } = new List<TagOrderItem>();
}

public sealed class PaymentProof : AuditableEntity
{
    public Guid OrderId { get; set; }
    public Guid MediaFileId { get; set; }
    public string OriginalFileName { get; set; } = "";
    public string StorageFileName { get; set; } = "";
    public string ContentType { get; set; } = "";
    public long FileSize { get; set; }
    public string StorageProvider { get; set; } = "Local";
    public string StoragePath { get; set; } = "";
    public string Sha256 { get; set; } = "";
    public DateTimeOffset UploadedAt { get; set; } = DateTimeOffset.UtcNow;
    public string PaymentMethod { get; set; } = "QR Payment";
    public string? PaymentReference { get; set; }
    public string? OwnerNote { get; set; }
    public PaymentProofStatus Status { get; set; } = PaymentProofStatus.PendingReview;
    public Guid? ReviewedByAdminUserId { get; set; }
    public DateTimeOffset? ReviewedAt { get; set; }
    public string? RejectionReason { get; set; }

    public TagOrder Order { get; set; } = null!;
    public MediaFile MediaFile { get; set; } = null!;
    public AdminUser? ReviewedByAdminUser { get; set; }
}
