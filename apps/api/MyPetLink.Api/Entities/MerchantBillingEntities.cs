namespace MyPetLink.Api.Entities;

// What a merchant was billed, what they paid, and what we owe the salesperson
// for it. Every customer-visible value here is a snapshot taken when the
// document was issued: correcting a typo in the business identity tomorrow
// must not silently rewrite an invoice a merchant already has in their inbox.

/// <summary>
/// A bill for one merchant order. Prepaid and due on receipt, so there is no
/// credit term to track and no partial state to reconcile.
/// </summary>
public sealed class MerchantInvoice : AuditableEntity
{
    public string InvoiceNumber { get; set; } = "";

    public Guid MerchantOrderId { get; set; }
    public MerchantOrder? MerchantOrder { get; set; }

    public Guid MerchantId { get; set; }
    public Merchant? Merchant { get; set; }

    /// <summary>Who issued it, as they were at the time.</summary>
    public SellerIdentitySnapshot Seller { get; set; } = new();

    // --- Merchant snapshot, copied from the order --------------------------
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

    /// <summary>Printed for reference; the order is the authority.</summary>
    public string MerchantOrderNumberSnapshot { get; set; } = "";
    public string? SourceQuotationNumberSnapshot { get; set; }

    public DateTimeOffset InvoiceDate { get; set; }

    /// <summary>
    /// Due on receipt, so this equals the invoice date. Stored rather than
    /// derived so a future credit term does not change what old invoices said.
    /// </summary>
    public DateTimeOffset DueDate { get; set; }

    public MerchantPaymentTerm PaymentTermSnapshot { get; set; } = MerchantPaymentTerm.Prepaid;
    public string Currency { get; set; } = MerchantSalesConstants.Currency;

    public decimal MerchandiseSubtotal { get; set; }
    public decimal DiscountTotal { get; set; }
    public decimal DeliveryFee { get; set; }
    public decimal GrandTotal { get; set; }

    public MerchantInvoiceStatus Status { get; set; } = MerchantInvoiceStatus.Issued;

    public DateTimeOffset? IssuedAt { get; set; }
    public DateTimeOffset? PaidAt { get; set; }
    public DateTimeOffset? CancelledAt { get; set; }

    /// <summary>Admin-only. Never printed and never emailed.</summary>
    public string? InternalNotes { get; set; }

    public byte[] RowVersion { get; set; } = [];

    public ICollection<MerchantInvoiceItem> Items { get; set; } = [];
    public ICollection<MerchantPayment> Payments { get; set; } = [];
}

/// <summary>
/// A billed line, frozen. Prices are never re-read from the catalog: an
/// invoice must still add up years after a price change.
/// </summary>
public sealed class MerchantInvoiceItem : Entity
{
    public Guid MerchantInvoiceId { get; set; }
    public MerchantInvoice? MerchantInvoice { get; set; }

    public Guid ProductId { get; set; }
    public Guid ProductVariantId { get; set; }

    public string ProductNameSnapshot { get; set; } = "";
    public string SkuCodeSnapshot { get; set; } = "";
    public string OptionNameSnapshot { get; set; } = "";
    public bool SupportsQrSnapshot { get; set; }
    public bool SupportsNfcSnapshot { get; set; }

    public int Quantity { get; set; }
    public decimal WholesaleUnitPrice { get; set; }
    public decimal LineDiscount { get; set; }
    public decimal LineSubtotal { get; set; }
    public int SortOrder { get; set; }
}

/// <summary>
/// Money actually received, entered by an administrator from a statement.
/// Full payment only: the amount must equal the invoice total exactly.
/// </summary>
public sealed class MerchantPayment : AuditableEntity
{
    public Guid MerchantInvoiceId { get; set; }
    public MerchantInvoice? MerchantInvoice { get; set; }

    public Guid MerchantOrderId { get; set; }
    public MerchantOrder? MerchantOrder { get; set; }

    public DateTimeOffset PaymentDate { get; set; }
    public decimal AmountReceived { get; set; }
    public string Currency { get; set; } = MerchantSalesConstants.Currency;

    public MerchantPaymentMethod Method { get; set; }

    /// <summary>Bank or wallet reference. Often genuinely absent.</summary>
    public string? TransactionReference { get; set; }

    /// <summary>Admin-only note. Never printed and never emailed.</summary>
    public string? InternalNote { get; set; }

    /// <summary>Optional proof file; B2B payments are usually reconciled from a statement.</summary>
    public Guid? PaymentProofMediaFileId { get; set; }
    public MediaFile? PaymentProofMediaFile { get; set; }

    public Guid? RecordedByAdminUserId { get; set; }
    public AdminUser? RecordedByAdminUser { get; set; }
    public DateTimeOffset RecordedAt { get; set; }

    public byte[] RowVersion { get; set; } = [];
}

/// <summary>
/// Proof of payment for the merchant. One per fully paid invoice, immutable
/// once issued.
/// </summary>
public sealed class MerchantReceipt : AuditableEntity
{
    public string ReceiptNumber { get; set; } = "";

    public Guid MerchantInvoiceId { get; set; }
    public MerchantInvoice? MerchantInvoice { get; set; }

    public Guid MerchantPaymentId { get; set; }
    public MerchantPayment? MerchantPayment { get; set; }

    public Guid MerchantOrderId { get; set; }
    public MerchantOrder? MerchantOrder { get; set; }

    public Guid MerchantId { get; set; }
    public Merchant? Merchant { get; set; }

    public SellerIdentitySnapshot Seller { get; set; } = new();

    public string MerchantLegalNameSnapshot { get; set; } = "";
    public string? MerchantTradingNameSnapshot { get; set; }
    public string? MerchantRegistrationNumberSnapshot { get; set; }
    public string? MerchantTaxIdentificationNumberSnapshot { get; set; }

    public string ContactPersonSnapshot { get; set; } = "";
    public string ContactEmailSnapshot { get; set; } = "";

    public string BillingAddressLine1Snapshot { get; set; } = "";
    public string? BillingAddressLine2Snapshot { get; set; }
    public string BillingPostcodeSnapshot { get; set; } = "";
    public string BillingCitySnapshot { get; set; } = "";
    public string BillingStateSnapshot { get; set; } = "";
    public string BillingCountrySnapshot { get; set; } = "";

    public string InvoiceNumberSnapshot { get; set; } = "";
    public string MerchantOrderNumberSnapshot { get; set; } = "";

    public DateTimeOffset PaymentDate { get; set; }
    public MerchantPaymentMethod PaymentMethod { get; set; }

    /// <summary>Absent when the merchant gave no reference. The document omits the row rather than printing a placeholder.</summary>
    public string? TransactionReference { get; set; }

    public string Currency { get; set; } = MerchantSalesConstants.Currency;
    public decimal MerchandiseSubtotal { get; set; }
    public decimal DiscountTotal { get; set; }
    public decimal DeliveryFee { get; set; }
    public decimal AmountPaid { get; set; }

    public DateTimeOffset IssuedAt { get; set; }

    public byte[] RowVersion { get; set; } = [];

    public ICollection<MerchantReceiptItem> Items { get; set; } = [];
}

public sealed class MerchantReceiptItem : Entity
{
    public Guid MerchantReceiptId { get; set; }
    public MerchantReceipt? MerchantReceipt { get; set; }

    public string ProductNameSnapshot { get; set; } = "";
    public string SkuCodeSnapshot { get; set; } = "";
    public string OptionNameSnapshot { get; set; } = "";

    public int Quantity { get; set; }
    public decimal WholesaleUnitPrice { get; set; }
    public decimal LineDiscount { get; set; }
    public decimal LineSubtotal { get; set; }
    public int SortOrder { get; set; }
}

/// <summary>
/// What a salesperson earned on a paid order. Internal only: it never appears
/// on a merchant document or in a merchant email.
///
/// The base is the merchandise subtotal less the order discount. Delivery is
/// excluded — passing a courier charge through is not selling.
/// </summary>
public sealed class SalesCommission : AuditableEntity
{
    public SalesCommissionSourceType SourceType { get; set; } =
        SalesCommissionSourceType.MerchantOrder;
    public SalesCommissionType CommissionType { get; set; } =
        SalesCommissionType.MerchantOrderPercentage;

    public Guid? MerchantOrderId { get; set; }
    public MerchantOrder? MerchantOrder { get; set; }

    public Guid? MerchantPaymentId { get; set; }
    public MerchantPayment? MerchantPayment { get; set; }

    public Guid? TagOrderId { get; set; }
    public TagOrder? TagOrder { get; set; }

    /// <summary>Set for every merchant-sourced commission; null for retail.</summary>
    public Guid? MerchantId { get; set; }
    public Merchant? Merchant { get; set; }

    public Guid SalespersonId { get; set; }
    public Salesperson? Salesperson { get; set; }

    public string SalespersonCodeSnapshot { get; set; } = "";
    public string SalespersonNameSnapshot { get; set; } = "";
    public decimal? CommissionPercentageSnapshot { get; set; }
    public decimal? CommissionFixedAmountSnapshot { get; set; }

    /// <summary>
    /// Null for legacy merchant commissions, whose percentage was snapshotted
    /// on the merchant order before CommissionRule existed.
    /// </summary>
    public Guid? CommissionRuleId { get; set; }
    public CommissionRule? CommissionRule { get; set; }
    public DateTimeOffset? CommissionRuleEffectiveFromSnapshot { get; set; }

    public decimal CommissionBaseAmount { get; set; }
    public decimal CommissionAmount { get; set; }
    public string Currency { get; set; } = MerchantSalesConstants.Currency;

    public SalesCommissionStatus Status { get; set; } = SalesCommissionStatus.Payable;

    public DateTimeOffset CalculatedAt { get; set; }
    public DateTimeOffset? PaidAt { get; set; }
    public Guid? PaidByAdminUserId { get; set; }
    public AdminUser? PaidByAdminUser { get; set; }
    public DateTimeOffset? ReversedAt { get; set; }
    public Guid? ReversedByAdminUserId { get; set; }
    public AdminUser? ReversedByAdminUser { get; set; }

    /// <summary>
    /// Required when a payable or paid commission is invalidated. PaidAt is
    /// deliberately retained so a later reversal never erases payout history.
    /// </summary>
    public string? ReversalReason { get; set; }

    public string? InternalNote { get; set; }

    public byte[] RowVersion { get; set; } = [];

    public ICollection<CommissionPayoutItem> PayoutItems { get; set; } = [];
}

/// <summary>
/// One authorised payout instruction for exactly one salesperson and one
/// half-open earning period. Prepared is already a financial reservation;
/// there is deliberately no editable draft state.
/// </summary>
public sealed class CommissionPayout : AuditableEntity
{
    public string PayoutNumber { get; set; } = "";
    public Guid SalespersonId { get; set; }
    public Salesperson? Salesperson { get; set; }
    public string SalespersonCodeSnapshot { get; set; } = "";
    public string SalespersonNameSnapshot { get; set; } = "";
    public SellerIdentitySnapshot Seller { get; set; } = new();
    public DateTimeOffset PeriodFrom { get; set; }
    public DateTimeOffset PeriodToExclusive { get; set; }
    public string Currency { get; set; } = MerchantSalesConstants.Currency;
    public decimal PreparedAmount { get; set; }
    public CommissionPayoutStatus Status { get; set; } = CommissionPayoutStatus.Prepared;
    public DateTimeOffset PreparedAt { get; set; }
    public Guid PreparedByAdminUserId { get; set; }
    public AdminUser? PreparedByAdminUser { get; set; }
    public DateTimeOffset? PaidAt { get; set; }
    public Guid? PaidByAdminUserId { get; set; }
    public AdminUser? PaidByAdminUser { get; set; }
    public CommissionPayoutPaymentMethod? PaymentMethod { get; set; }
    public string? PaymentReference { get; set; }
    public string? Notes { get; set; }
    public DateTimeOffset? CancelledAt { get; set; }
    public Guid? CancelledByAdminUserId { get; set; }
    public AdminUser? CancelledByAdminUser { get; set; }
    public string? CancellationReason { get; set; }
    public string IdempotencyKey { get; set; } = "";
    public string RequestFingerprint { get; set; } = "";
    public byte[] RowVersion { get; set; } = [];
    public ICollection<CommissionPayoutItem> Items { get; set; } = [];
}

/// <summary>
/// Immutable financial values selected into a payout. Cancellation releases
/// the claim without deleting this row, preserving exactly what was prepared.
/// </summary>
public sealed class CommissionPayoutItem : AuditableEntity
{
    public Guid CommissionPayoutId { get; set; }
    public CommissionPayout? CommissionPayout { get; set; }
    public Guid SalesCommissionId { get; set; }
    public SalesCommission? SalesCommission { get; set; }
    public SalesCommissionSourceType SourceTypeSnapshot { get; set; }
    public SalesCommissionType CommissionTypeSnapshot { get; set; }
    public Guid? MerchantOrderIdSnapshot { get; set; }
    public Guid? TagOrderIdSnapshot { get; set; }
    public string SourceOrderNumberSnapshot { get; set; } = "";
    public decimal CommissionBaseAmountSnapshot { get; set; }
    public decimal CommissionAmountSnapshot { get; set; }
    public decimal? CommissionPercentageSnapshot { get; set; }
    public decimal? CommissionFixedAmountSnapshot { get; set; }
    public string CurrencySnapshot { get; set; } = MerchantSalesConstants.Currency;
    public DateTimeOffset CalculatedAtSnapshot { get; set; }
    public DateTimeOffset? ReleasedAt { get; set; }
    public Guid? ReleasedByAdminUserId { get; set; }
    public AdminUser? ReleasedByAdminUser { get; set; }
    public string? ReleaseReason { get; set; }
}

/// <summary>
/// Effective-dated, Admin-managed commission policy. A rule is either a
/// percentage or a fixed amount, never both. Direct retail resolves per paid
/// order; reseller acquisition and repeat terms are resolved at activation.
/// </summary>
public sealed class CommissionRule : AuditableEntity
{
    public static readonly Guid DefaultDirectRetailRuleId =
        Guid.Parse("a971d6d5-86a8-4f85-a5e4-9cb85a1f3b01");
    public static readonly Guid DefaultResellerAcquisition10To19RuleId =
        Guid.Parse("a971d6d5-86a8-4f85-a5e4-9cb85a1f3b11");
    public static readonly Guid DefaultResellerAcquisition20To49RuleId =
        Guid.Parse("a971d6d5-86a8-4f85-a5e4-9cb85a1f3b12");
    public static readonly Guid DefaultResellerAcquisition50To99RuleId =
        Guid.Parse("a971d6d5-86a8-4f85-a5e4-9cb85a1f3b13");
    public static readonly Guid DefaultResellerAcquisition100PlusRuleId =
        Guid.Parse("a971d6d5-86a8-4f85-a5e4-9cb85a1f3b14");
    public static readonly Guid DefaultResellerRepeatRuleId =
        Guid.Parse("a971d6d5-86a8-4f85-a5e4-9cb85a1f3b20");

    public SalesCommissionType CommissionType { get; set; }
    public Guid? SalespersonId { get; set; }
    public Salesperson? Salesperson { get; set; }
    public decimal? Percentage { get; set; }
    public decimal? FixedAmount { get; set; }
    public int? MinQuantity { get; set; }
    public int? MaxQuantity { get; set; }
    public int? EligibilityMonths { get; set; }
    public string Currency { get; set; } = MerchantSalesConstants.Currency;
    public DateTimeOffset EffectiveFrom { get; set; }
    public DateTimeOffset? EffectiveTo { get; set; }
    public bool IsActive { get; set; } = true;
    public string? Notes { get; set; }
    public Guid? UpdatedByAdminUserId { get; set; }
    public AdminUser? UpdatedByAdminUser { get; set; }
    public byte[] RowVersion { get; set; } = [];
}
