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
    public Guid? OrderItemId { get; set; }
    public Guid? BatchId { get; set; }
    public Guid? ProductVariantId { get; set; }
    public Guid? InventoryReceiptId { get; set; }
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
    public TagOrderItem? OrderItem { get; set; }
    public SmartTagBatch? Batch { get; set; }
    public TagProductVariant? ProductVariant { get; set; }
    public InventoryReceipt? InventoryReceipt { get; set; }
    public SmartTag? ReplacementForTag { get; set; }
}

public sealed class TagOrder : AuditableEntity
{
    public string OrderNumber { get; set; } = "";
    // Assigned once, in the same transaction that confirms payment. Historical
    // receipts keep this value even if fulfilment state changes later.
    public string? ReceiptNumber { get; set; }
    public Guid OwnerUserId { get; set; }
    public Guid PetId { get; set; }
    public Guid? SmartTagId { get; set; }
    public Guid? ReplacementForTagId { get; set; }
    // Legacy single-value summary of what the order is for. Orders always set
    // it from the SKU they sold; the default names the only tag still sold so a
    // new order can never fall back to the discontinued QR-only product.
    public TagType TagType { get; set; } = TagType.QrNfcSmartTag;
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
    public string? StateCode { get; set; }
    public string? Country { get; set; }
    public string? DeliveryZoneName { get; set; }
    public string? DeliveryMethodName { get; set; }
    public string? FreeShippingReason { get; set; }
    // Immutable snapshot of where the charged delivery fee came from
    // ("ZoneDefault" or "StateOverride"). Explains a historical fee after an
    // administrator later changes or removes an override.
    public string? DeliveryRateSource { get; set; }
    public decimal? TotalAmount { get; set; }
    public string? DeliveryNotes { get; set; }
    public string? TrackingStatus { get; set; }
    // Stable configured courier key. CourierProvider remains the immutable
    // customer-facing display snapshot; null means a custom/legacy courier.
    public string? CourierProviderCode { get; set; }
    public string? CourierProvider { get; set; }
    public string? CourierService { get; set; }
    public string? TrackingNumber { get; set; }
    public decimal? ActualCourierCost { get; set; }
    public string? ShippingNotes { get; set; }
    public DateTimeOffset? ReadyToShipAt { get; set; }
    public DateTimeOffset? ShippedAt { get; set; }
    public DateTimeOffset? DeliveredAt { get; set; }
    public DateTimeOffset? CancelledAt { get; set; }
    // Immutable per-order snapshot of the unpaid-reservation deadline, stamped
    // by the server at creation and restarted when a proof is rejected.
    // Snapshotting rather than deriving from the current setting means changing
    // the policy later can never shorten or extend an existing reservation.
    public DateTimeOffset? PaymentReservationExpiresAt { get; set; }
    // Set only when the automatic expiry cancelled this order, so the customer
    // timeline can distinguish it from an admin or owner cancellation.
    public DateTimeOffset? PaymentReservationExpiredAt { get; set; }
    // Client-supplied idempotency key for one order-submission attempt, unique
    // per owner. A repeat with the same key returns the original order; the
    // fingerprint detects the same key being reused with a different payload.
    public string? IdempotencyKey { get; set; }
    public string? RequestFingerprint { get; set; }
    // Immutable owner-attribution snapshot. It is server-derived and therefore
    // deliberately absent from checkout requests and idempotency fingerprints.
    public Guid? SalespersonId { get; set; }
    public string? SalespersonCodeSnapshot { get; set; }
    public string? SalespersonNameSnapshot { get; set; }
    public ReferralAttributionSource? AttributionSource { get; set; }
    public DateTimeOffset? AttributedAt { get; set; }
    public byte[] RowVersion { get; set; } = [];

    public User OwnerUser { get; set; } = null!;
    public Pet Pet { get; set; } = null!;
    public SmartTag? SmartTag { get; set; }
    public SmartTag? ReplacementForTag { get; set; }
    public Salesperson? Salesperson { get; set; }
    public ICollection<PaymentProof> PaymentProofs { get; set; } = new List<PaymentProof>();
    public ICollection<TagOrderItem> Items { get; set; } = new List<TagOrderItem>();
    public ICollection<SmartTag> AssignedTags { get; set; } = new List<SmartTag>();
    public ICollection<EmailOutbox> EmailOutboxMessages { get; set; } = new List<EmailOutbox>();
}

/// <summary>
/// Immutable per-unit cost provenance captured when a retail order ships.
/// A row is also written for legacy uncosted tags, with a null unit cost, so
/// missing cost can never be mistaken for zero.
/// </summary>
public sealed class TagOrderItemCostAllocation : Entity
{
    public Guid TagOrderItemId { get; set; }
    public Guid SmartTagId { get; set; }
    public Guid? InventoryReceiptId { get; set; }
    public string TagCodeSnapshot { get; set; } = "";
    public string? InventoryReceiptNumberSnapshot { get; set; }
    public decimal? UnitLandedCostMyrSnapshot { get; set; }
    public InventoryCostBasis CostBasis { get; set; } = InventoryCostBasis.Unavailable;
    public DateTimeOffset CostSnapshotAt { get; set; }

    public TagOrderItem TagOrderItem { get; set; } = null!;
    public SmartTag SmartTag { get; set; } = null!;
    public InventoryReceipt? InventoryReceipt { get; set; }
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
    // Customer-declared amount captured with this proof. It is evidence for
    // Admin comparison only and never changes the authoritative order total.
    // Null is retained for legacy proofs created before this field existed.
    public decimal? SubmittedAmount { get; set; }
    public string? PaymentReference { get; set; }
    public string? OwnerNote { get; set; }
    public PaymentProofStatus Status { get; set; } = PaymentProofStatus.PendingReview;
    public Guid? ReviewedByAdminUserId { get; set; }
    public DateTimeOffset? ReviewedAt { get; set; }
    public string? RejectionReason { get; set; }

    public TagOrder Order { get; set; } = null!;
    public MediaFile MediaFile { get; set; } = null!;
    public AdminUser? ReviewedByAdminUser { get; set; }
    public ICollection<EmailOutbox> EmailOutboxMessages { get; set; } = new List<EmailOutbox>();
}

/// <summary>
/// Single-row checkout policy owned by business Admin (governance category D:
/// a runtime business value expected to change without a deployment). It is
/// deliberately separate from Shipping/Fulfilment Settings, which own parcel
/// and courier operations rather than payment-window policy.
/// </summary>
public sealed class OrderCheckoutSetting : AuditableEntity
{
    public const int MinPaymentReservationMinutes = 30;
    public const int MaxPaymentReservationMinutes = 72 * 60;
    public const int DefaultPaymentReservationMinutes = 120;

    /// <summary>
    /// How long an unpaid order may hold its inventory reservation before the
    /// automatic expiry releases it.
    /// </summary>
    public int PaymentReservationMinutes { get; set; } = DefaultPaymentReservationMinutes;

    public Guid? UpdatedByAdminUserId { get; set; }
    public byte[] RowVersion { get; set; } = [];

    public AdminUser? UpdatedByAdminUser { get; set; }
}
