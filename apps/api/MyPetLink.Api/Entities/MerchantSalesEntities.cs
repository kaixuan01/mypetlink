namespace MyPetLink.Api.Entities;

/// <summary>
/// A business that buys MyPetLink tags in bulk: a pet shop, groomer, clinic or
/// reseller. Deliberately separate from <see cref="User"/> — a merchant is an
/// account we sell to, not a pet owner who signs in.
/// </summary>
public sealed class Merchant : AuditableEntity
{
    public string MerchantCode { get; set; } = "";
    public string LegalBusinessName { get; set; } = "";
    public string? TradingName { get; set; }
    public string? BusinessRegistrationNumber { get; set; }

    /// <summary>Normalised for duplicate detection; never shown to anyone.</summary>
    public string? NormalizedBusinessRegistrationNumber { get; set; }

    public string? TaxIdentificationNumber { get; set; }
    public string? SstRegistrationNumber { get; set; }

    public string ContactPerson { get; set; } = "";
    public string ContactEmail { get; set; } = "";
    public string ContactPhone { get; set; } = "";

    public string BillingAddressLine1 { get; set; } = "";
    public string? BillingAddressLine2 { get; set; }
    public string BillingPostcode { get; set; } = "";
    public string BillingCity { get; set; } = "";
    public string BillingState { get; set; } = "";
    public string BillingCountry { get; set; } = "Malaysia";

    /// <summary>
    /// When true the delivery columns mirror billing. They are still stored, so
    /// a snapshot taken later never has to re-derive the address.
    /// </summary>
    public bool DeliveryAddressSameAsBilling { get; set; } = true;

    public string DeliveryAddressLine1 { get; set; } = "";
    public string? DeliveryAddressLine2 { get; set; }
    public string DeliveryPostcode { get; set; } = "";
    public string DeliveryCity { get; set; } = "";
    public string DeliveryState { get; set; } = "";
    public string DeliveryCountry { get; set; } = "Malaysia";

    public Guid? AssignedSalespersonId { get; set; }
    public Salesperson? AssignedSalesperson { get; set; }

    public MerchantPaymentTerm PaymentTerm { get; set; } = MerchantPaymentTerm.Prepaid;

    /// <summary>Operations-only. Never leaves an Admin DTO.</summary>
    public string? InternalNotes { get; set; }

    public bool IsActive { get; set; } = true;
    public byte[] RowVersion { get; set; } = [];
}

/// <summary>
/// Someone who sources merchant business. Not an authenticated admin — this is
/// a record we attribute sales to, nothing more.
/// </summary>
public sealed class Salesperson : AuditableEntity
{
    public const decimal MinCommissionPercentage = 0m;
    public const decimal MaxCommissionPercentage = 100m;

    public string SalespersonCode { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Email { get; set; }
    public string? Phone { get; set; }

    /// <summary>Whole percent, 0–100. Commission itself arrives in a later phase.</summary>
    public decimal DefaultCommissionPercentage { get; set; }

    public string? InternalNotes { get; set; }
    public bool IsActive { get; set; } = true;
    public byte[] RowVersion { get; set; } = [];
}

/// <summary>
/// A priced offer to a merchant. Everything a document would need is snapshotted
/// here, so editing the merchant later never rewrites what was quoted.
/// </summary>
public sealed class MerchantQuotation : AuditableEntity
{
    public string QuotationNumber { get; set; } = "";

    public Guid MerchantId { get; set; }
    public Merchant? Merchant { get; set; }

    // --- Merchant snapshot -------------------------------------------------
    public string MerchantCodeSnapshot { get; set; } = "";
    public string MerchantLegalNameSnapshot { get; set; } = "";
    public string? MerchantTradingNameSnapshot { get; set; }
    public string? MerchantRegistrationNumberSnapshot { get; set; }
    public string? MerchantTaxIdentificationNumberSnapshot { get; set; }
    public string? MerchantSstRegistrationNumberSnapshot { get; set; }

    public string ContactPersonSnapshot { get; set; } = "";
    public string ContactEmailSnapshot { get; set; } = "";
    public string ContactPhoneSnapshot { get; set; } = "";

    public string BillingAddressLine1Snapshot { get; set; } = "";
    public string? BillingAddressLine2Snapshot { get; set; }
    public string BillingPostcodeSnapshot { get; set; } = "";
    public string BillingCitySnapshot { get; set; } = "";
    public string BillingStateSnapshot { get; set; } = "";
    public string BillingCountrySnapshot { get; set; } = "";

    public string DeliveryAddressLine1Snapshot { get; set; } = "";
    public string? DeliveryAddressLine2Snapshot { get; set; }
    public string DeliveryPostcodeSnapshot { get; set; } = "";
    public string DeliveryCitySnapshot { get; set; } = "";
    public string DeliveryStateSnapshot { get; set; } = "";
    public string DeliveryCountrySnapshot { get; set; } = "";

    // --- Salesperson snapshot ----------------------------------------------
    public Guid? SalespersonId { get; set; }
    public Salesperson? Salesperson { get; set; }
    public string? SalespersonCodeSnapshot { get; set; }
    public string? SalespersonNameSnapshot { get; set; }
    public decimal? SalespersonCommissionPercentageSnapshot { get; set; }

    /// <summary>
    /// Who issued it, frozen when the quotation was sent. Null while it is
    /// still a draft, because a draft has never been shown to anyone.
    /// </summary>
    public SellerIdentitySnapshot? Seller { get; set; }

    public DateTimeOffset QuotationDate { get; set; }
    public DateTimeOffset ValidUntil { get; set; }
    public string Currency { get; set; } = MerchantSalesConstants.Currency;
    public MerchantPaymentTerm PaymentTermSnapshot { get; set; } = MerchantPaymentTerm.Prepaid;

    // --- Money, all server-calculated --------------------------------------
    public decimal MerchandiseSubtotal { get; set; }
    public decimal DiscountTotal { get; set; }
    public decimal DeliveryFee { get; set; }
    public decimal GrandTotal { get; set; }

    /// <summary>Appears on the merchant's copy.</summary>
    public string? CustomerNotes { get; set; }

    /// <summary>Operations-only.</summary>
    public string? InternalNotes { get; set; }

    public MerchantQuotationStatus Status { get; set; } = MerchantQuotationStatus.Draft;

    public Guid? ConvertedMerchantOrderId { get; set; }
    public MerchantOrder? ConvertedMerchantOrder { get; set; }

    public DateTimeOffset? SentAt { get; set; }
    public DateTimeOffset? AcceptedAt { get; set; }
    public DateTimeOffset? RejectedAt { get; set; }
    public DateTimeOffset? ExpiredAt { get; set; }
    public DateTimeOffset? ConvertedAt { get; set; }
    public DateTimeOffset? CancelledAt { get; set; }

    public byte[] RowVersion { get; set; } = [];

    public ICollection<MerchantQuotationItem> Items { get; set; } = [];
}

public sealed class MerchantQuotationItem : Entity
{
    public Guid QuotationId { get; set; }
    public MerchantQuotation? Quotation { get; set; }

    public Guid ProductId { get; set; }
    public Guid ProductVariantId { get; set; }

    public string ProductNameSnapshot { get; set; } = "";
    public string SkuCodeSnapshot { get; set; } = "";
    public string OptionNameSnapshot { get; set; } = "";
    public bool SupportsQrSnapshot { get; set; }
    public bool SupportsNfcSnapshot { get; set; }
    public decimal? UnitWeightGramsSnapshot { get; set; }

    public int Quantity { get; set; }

    /// <summary>The approved wholesale price. Never derived from retail.</summary>
    public decimal WholesaleUnitPrice { get; set; }

    public decimal LineDiscount { get; set; }
    public decimal LineSubtotal { get; set; }
    public int SortOrder { get; set; }
}

/// <summary>
/// A confirmed bulk sale. Physical tags are not attached here — allocation is a
/// later phase, and a merchant order never binds a tag to a pet.
/// </summary>
public sealed class MerchantOrder : AuditableEntity
{
    public string MerchantOrderNumber { get; set; } = "";

    public Guid? SourceQuotationId { get; set; }
    public MerchantQuotation? SourceQuotation { get; set; }

    public Guid MerchantId { get; set; }
    public Merchant? Merchant { get; set; }

    // --- Merchant snapshot, copied from the quotation ----------------------
    public string MerchantCodeSnapshot { get; set; } = "";
    public string MerchantLegalNameSnapshot { get; set; } = "";
    public string? MerchantTradingNameSnapshot { get; set; }
    public string? MerchantRegistrationNumberSnapshot { get; set; }
    public string? MerchantTaxIdentificationNumberSnapshot { get; set; }
    public string? MerchantSstRegistrationNumberSnapshot { get; set; }

    public string ContactPersonSnapshot { get; set; } = "";
    public string ContactEmailSnapshot { get; set; } = "";
    public string ContactPhoneSnapshot { get; set; } = "";

    public string BillingAddressLine1Snapshot { get; set; } = "";
    public string? BillingAddressLine2Snapshot { get; set; }
    public string BillingPostcodeSnapshot { get; set; } = "";
    public string BillingCitySnapshot { get; set; } = "";
    public string BillingStateSnapshot { get; set; } = "";
    public string BillingCountrySnapshot { get; set; } = "";

    public string DeliveryAddressLine1Snapshot { get; set; } = "";
    public string? DeliveryAddressLine2Snapshot { get; set; }
    public string DeliveryPostcodeSnapshot { get; set; } = "";
    public string DeliveryCitySnapshot { get; set; } = "";
    public string DeliveryStateSnapshot { get; set; } = "";
    public string DeliveryCountrySnapshot { get; set; } = "";

    public Guid? SalespersonId { get; set; }
    public Salesperson? Salesperson { get; set; }
    public string? SalespersonCodeSnapshot { get; set; }
    public string? SalespersonNameSnapshot { get; set; }
    public decimal? SalespersonCommissionPercentageSnapshot { get; set; }

    public MerchantPaymentTerm PaymentTermSnapshot { get; set; } = MerchantPaymentTerm.Prepaid;
    public string Currency { get; set; } = MerchantSalesConstants.Currency;

    public decimal MerchandiseSubtotal { get; set; }
    public decimal DiscountTotal { get; set; }
    public decimal DeliveryFee { get; set; }
    public decimal GrandTotal { get; set; }

    public MerchantOrderPaymentStatus PaymentStatus { get; set; } =
        MerchantOrderPaymentStatus.AwaitingPayment;

    public MerchantOrderFulfilmentStatus FulfilmentStatus { get; set; } =
        MerchantOrderFulfilmentStatus.NotStarted;

    public string? InternalNotes { get; set; }

    public DateTimeOffset? PaymentConfirmedAt { get; set; }
    public DateTimeOffset? CancelledAt { get; set; }

    // --- Shipment, following the retail order's own courier conventions -----
    // CourierProviderCode is the stable configured key; CourierProvider is the
    // display name frozen at the moment of shipment.
    public string? CourierProviderCode { get; set; }
    public string? CourierProvider { get; set; }
    public string? CourierService { get; set; }
    public string? TrackingNumber { get; set; }
    /// <summary>Frozen at shipment so a later template change cannot rewrite history.</summary>
    public string? TrackingUrlSnapshot { get; set; }
    /// <summary>Admin only. Never reaches a merchant document or email.</summary>
    public decimal? InternalCourierCost { get; set; }
    /// <summary>Admin only. Never reaches a merchant document or email.</summary>
    public string? InternalShippingNotes { get; set; }

    public DateTimeOffset? PreparingAt { get; set; }
    public DateTimeOffset? ReadyToShipAt { get; set; }
    public DateTimeOffset? ShippedAt { get; set; }
    public DateTimeOffset? DeliveredAt { get; set; }

    public Guid? FulfilmentUpdatedByAdminUserId { get; set; }
    public AdminUser? FulfilmentUpdatedByAdminUser { get; set; }

    public byte[] RowVersion { get; set; } = [];

    public ICollection<MerchantOrderItem> Items { get; set; } = [];
    public ICollection<MerchantOrderAllocatedTag> AllocatedTags { get; set; } = [];
}

/// <summary>
/// One row per physical tag held for one merchant order line. This is the only
/// place a merchant order and a <see cref="SmartTag"/> are connected: quantity
/// alone can never stand in for the individual units that were sold.
/// </summary>
public sealed class MerchantOrderAllocatedTag : Entity
{
    public Guid MerchantOrderId { get; set; }
    public MerchantOrder? MerchantOrder { get; set; }

    public Guid MerchantOrderItemId { get; set; }
    public MerchantOrderItem? MerchantOrderItem { get; set; }

    /// <summary>Denormalised for the merchant-facing lookups that never join the order.</summary>
    public Guid MerchantId { get; set; }
    public Merchant? Merchant { get; set; }

    public Guid SmartTagId { get; set; }
    public SmartTag? SmartTag { get; set; }

    /// <summary>Frozen so a released tag still shows what was allocated.</summary>
    public string TagCodeSnapshot { get; set; } = "";
    public Guid ProductVariantId { get; set; }
    public Guid? BatchId { get; set; }
    public SmartTagBatch? Batch { get; set; }
    public string? BatchNoSnapshot { get; set; }

    public MerchantAllocationStatus Status { get; set; } = MerchantAllocationStatus.Allocated;

    public DateTimeOffset AllocatedAt { get; set; }
    public Guid AllocatedByAdminUserId { get; set; }
    public AdminUser? AllocatedByAdminUser { get; set; }
    /// <summary>True when the server chose the tag rather than the admin.</summary>
    public bool WasAutomatic { get; set; }

    public DateTimeOffset? SentToMerchantAt { get; set; }

    /// <summary>Set instead of deleting the row, so the decision stays auditable.</summary>
    public DateTimeOffset? ReleasedAt { get; set; }
    public string? ReleasedReason { get; set; }
    public Guid? ReleasedByAdminUserId { get; set; }
    public AdminUser? ReleasedByAdminUser { get; set; }

    public byte[] RowVersion { get; set; } = [];

    /// <summary>An allocation counts towards an order only while it is unreleased.</summary>
    public bool IsActive => ReleasedAt is null;
}

/// <summary>
/// The immutable record behind the Delivery Order document. Every value is a
/// snapshot: reading live merchant or catalog data later would silently rewrite
/// a document that has already left the building.
/// </summary>
public sealed class MerchantDeliveryOrder : Entity
{
    public string DeliveryOrderNumber { get; set; } = "";

    public Guid MerchantOrderId { get; set; }
    public MerchantOrder? MerchantOrder { get; set; }
    public string MerchantOrderNumberSnapshot { get; set; } = "";

    public Guid MerchantId { get; set; }
    public string MerchantCodeSnapshot { get; set; } = "";
    public string MerchantLegalNameSnapshot { get; set; } = "";
    public string? MerchantTradingNameSnapshot { get; set; }
    public string ContactPersonSnapshot { get; set; } = "";
    public string ContactEmailSnapshot { get; set; } = "";
    public string ContactPhoneSnapshot { get; set; } = "";

    public string DeliveryAddressLine1Snapshot { get; set; } = "";
    public string? DeliveryAddressLine2Snapshot { get; set; }
    public string DeliveryPostcodeSnapshot { get; set; } = "";
    public string DeliveryCitySnapshot { get; set; } = "";
    public string DeliveryStateSnapshot { get; set; } = "";
    public string DeliveryCountrySnapshot { get; set; } = "";

    public string? CourierProviderSnapshot { get; set; }
    public string? CourierServiceSnapshot { get; set; }
    public string? TrackingNumberSnapshot { get; set; }

    public DateTimeOffset IssuedAt { get; set; }
    public Guid IssuedByAdminUserId { get; set; }
    public AdminUser? IssuedByAdminUser { get; set; }

    public DateTimeOffset? CancelledAt { get; set; }

    public byte[] RowVersion { get; set; } = [];

    public ICollection<MerchantDeliveryOrderItem> Items { get; set; } = [];
}

/// <summary>
/// One line of a Delivery Order, with the production batches the units came
/// from. Individual tag database ids and tag codes are deliberately absent:
/// this record backs a document that leaves the building.
/// </summary>
public sealed class MerchantDeliveryOrderItem : Entity
{
    public Guid MerchantDeliveryOrderId { get; set; }
    public MerchantDeliveryOrder? MerchantDeliveryOrder { get; set; }

    public Guid MerchantOrderItemId { get; set; }

    public string ProductNameSnapshot { get; set; } = "";
    public string SkuCodeSnapshot { get; set; } = "";
    public string OptionNameSnapshot { get; set; } = "";
    public bool SupportsQrSnapshot { get; set; }
    public bool SupportsNfcSnapshot { get; set; }

    public int OrderedQuantity { get; set; }
    public int AllocatedQuantity { get; set; }

    /// <summary>"B-2601 x 60; B-2602 x 40" — batch numbers and counts only.</summary>
    public string BatchSummarySnapshot { get; set; } = "";

    public int SortOrder { get; set; }
}

public sealed class MerchantOrderItem : Entity
{
    public Guid MerchantOrderId { get; set; }
    public MerchantOrder? MerchantOrder { get; set; }

    public Guid ProductId { get; set; }
    public Guid ProductVariantId { get; set; }

    public string ProductNameSnapshot { get; set; } = "";
    public string SkuCodeSnapshot { get; set; } = "";
    public string OptionNameSnapshot { get; set; } = "";
    public bool SupportsQrSnapshot { get; set; }
    public bool SupportsNfcSnapshot { get; set; }
    public decimal? UnitWeightGramsSnapshot { get; set; }

    public int Quantity { get; set; }
    public decimal WholesaleUnitPrice { get; set; }
    public decimal LineDiscount { get; set; }
    public decimal LineSubtotal { get; set; }
    public int SortOrder { get; set; }
}

/// <summary>
/// One row per counted document series. Incremented inside the caller's
/// transaction with an update lock, so two requests can never read the same
/// number — see <c>DocumentNumberService</c>.
/// </summary>
public sealed class DocumentNumberCounter
{
    /// <summary>e.g. "merchant", "quotation:260805". Unique.</summary>
    public string CounterKey { get; set; } = "";

    public long NextValue { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public static class MerchantSalesConstants
{
    public const string Currency = "MYR";

    /// <summary>A quotation is valid for two weeks unless told otherwise.</summary>
    public const int DefaultQuotationValidityDays = 14;

    public const int MaxItemsPerQuotation = 50;
    public const int MaxQuantityPerLine = 100_000;
}
