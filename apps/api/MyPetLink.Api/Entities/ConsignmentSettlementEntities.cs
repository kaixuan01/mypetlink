namespace MyPetLink.Api.Entities;

// The financial layer over verified consignment sales. A settlement is what a
// partner branch owes MyPetLink for one reporting period: the verified customer
// sales less the partner's agreed commission. It is derived only from verified
// sales-report versions, never from dispatches, Delivery Orders or stock.

public enum ConsignmentSettlementStatus { AwaitingPayment, PartiallyReceived, Settled, CreditDue }
public enum ConsignmentAttributionStatus { Resolved, NeedsResolution }

/// <summary>
/// One branch's settlement for one sales-report period (the report lineage).
/// Its figures always reflect the latest verified version; each change is kept
/// as an immutable <see cref="ConsignmentSettlementRevision"/>, and received
/// money only ever accumulates through <see cref="ConsignmentSettlementReceipt"/>.
/// </summary>
public sealed class ConsignmentSettlement : AuditableEntity
{
    public string SettlementNumber { get; set; } = "";
    public Guid MerchantId { get; set; }
    public Merchant? Merchant { get; set; }
    public Guid MerchantBranchId { get; set; }
    public Guid AgreementId { get; set; }
    public DateTimeOffset PeriodStart { get; set; }
    public DateTimeOffset PeriodEndExclusive { get; set; }
    public Guid SalesReportId { get; set; }
    public int SalesReportVersion { get; set; }
    public int Revision { get; set; }

    // --- Sales commission attribution, fixed once resolved ------------------
    public ConsignmentAttributionStatus AttributionStatus { get; set; }
    /// <summary>Why the salesperson could not be decided automatically.</summary>
    public string? AttributionIssue { get; set; }
    /// <summary>ServicingAssignment or OperatorResolution. Null while unresolved.</summary>
    public string? AttributionSource { get; set; }
    public Guid? SalespersonId { get; set; }
    public Salesperson? Salesperson { get; set; }
    public string? SalespersonCodeSnapshot { get; set; }
    public string? SalespersonNameSnapshot { get; set; }
    /// <summary>The salesperson's policy for this period. Null means no consignment commission.</summary>
    public string? CommissionPolicyCode { get; set; }
    public Guid? PolicyAssignmentId { get; set; }
    public DateTimeOffset? AttributionResolvedAt { get; set; }
    public Guid? AttributionResolvedByAdminUserId { get; set; }
    public string? AttributionResolutionReason { get; set; }

    // --- Current figures (the latest revision) ------------------------------
    public int StandardQuantity { get; set; }
    public decimal StandardSales { get; set; }
    public int PromotionQuantity { get; set; }
    public decimal PromotionSales { get; set; }
    public int RefundQuantity { get; set; }
    /// <summary>Customer value refunded, as a positive amount.</summary>
    public decimal RefundAmount { get; set; }
    public decimal EligibleSales { get; set; }
    public decimal MerchantCommission { get; set; }
    public decimal ExpectedRemittance { get; set; }
    public decimal ReceivedAmount { get; set; }
    public decimal SalesCommissionTarget { get; set; }
    /// <summary>Commission already paid above the corrected entitlement. Recovered outside the system for now.</summary>
    public decimal CommissionRecoveryRequired { get; set; }
    /// <summary>Why this period earns no sales commission, when it earns none.</summary>
    public string? CommissionNote { get; set; }

    public ConsignmentSettlementStatus Status { get; set; }
    public DateTimeOffset? SettledAt { get; set; }
    public byte[] RowVersion { get; set; } = [];

    public ICollection<ConsignmentSettlementRevision> Revisions { get; set; } = [];
    public ICollection<ConsignmentSettlementReceipt> Receipts { get; set; } = [];
}

/// <summary>An immutable statement of a settlement as calculated from one verified report version.</summary>
public sealed class ConsignmentSettlementRevision : Entity
{
    public Guid SettlementId { get; set; }
    public ConsignmentSettlement? Settlement { get; set; }
    public int Revision { get; set; }
    public Guid SalesReportId { get; set; }
    public int SalesReportVersion { get; set; }
    public string Reason { get; set; } = "";
    public int StandardQuantity { get; set; }
    public decimal StandardSales { get; set; }
    public int PromotionQuantity { get; set; }
    public decimal PromotionSales { get; set; }
    public int RefundQuantity { get; set; }
    public decimal RefundAmount { get; set; }
    public decimal EligibleSales { get; set; }
    public decimal MerchantCommission { get; set; }
    public decimal ExpectedRemittance { get; set; }
    public Guid? SalespersonId { get; set; }
    public string? CommissionPolicyCode { get; set; }
    public decimal SalesCommissionTarget { get; set; }
    public decimal CommissionRecoveryRequired { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public Guid CreatedByAdminUserId { get; set; }
    public ICollection<ConsignmentSettlementLine> Lines { get; set; } = [];
}

/// <summary>
/// One verified report line as it counts in a settlement revision: its signed
/// customer value, the partner commission rate it falls under, and the sales
/// commission it carries. Kept per SKU and price term so later cost-of-goods
/// recognition can trace sold quantities without any Tag Code.
/// </summary>
public sealed class ConsignmentSettlementLine : Entity
{
    public Guid RevisionId { get; set; }
    public ConsignmentSettlementRevision? RevisionRecord { get; set; }
    public Guid SourceReportLineId { get; set; }
    public ConsignmentSalesLineType LineType { get; set; }
    public Guid ProductVariantId { get; set; }
    public string SkuSnapshot { get; set; } = "";
    public Guid PriceTermId { get; set; }
    public ConsignmentPriceTermKind PriceKind { get; set; }
    public decimal UnitPrice { get; set; }
    public int Quantity { get; set; }
    /// <summary>Signed: a refund is negative.</summary>
    public decimal Amount { get; set; }
    public decimal MerchantCommissionPercentage { get; set; }
    public DateTimeOffset? RefundOfPeriodStart { get; set; }
    /// <summary>Who the line's sales commission belongs to: the period's salesperson for a sale, the refunded sale's for a refund.</summary>
    public Guid? CommissionSalespersonId { get; set; }
    public decimal? CommissionUnitAmount { get; set; }
    public Guid? CommissionRuleId { get; set; }
}

/// <summary>
/// Money a partner remitted against a settlement. Append-only: a receipt
/// recorded by mistake is voided with a reason, never edited or deleted, and
/// only while the settlement's commission is still pending.
/// </summary>
public sealed class ConsignmentSettlementReceipt : AuditableEntity
{
    public Guid SettlementId { get; set; }
    public ConsignmentSettlement? Settlement { get; set; }
    public DateOnly ReceivedOn { get; set; }
    public decimal Amount { get; set; }
    public MerchantPaymentMethod Method { get; set; }
    public string Reference { get; set; } = "";
    public string? Notes { get; set; }
    public string IdempotencyKey { get; set; } = "";
    public string RequestFingerprint { get; set; } = "";
    public Guid RecordedByAdminUserId { get; set; }
    public DateTimeOffset RecordedAt { get; set; }
    public DateTimeOffset? VoidedAt { get; set; }
    public Guid? VoidedByAdminUserId { get; set; }
    public string? VoidReason { get; set; }
    public byte[] RowVersion { get; set; } = [];
}

/// <summary>
/// Commission already paid above a period's corrected entitlement: cash a salesperson
/// was paid for tags that a correction or a later refund took away. One row per paid
/// commission row affected and per settlement that caused it, written for each
/// settlement revision; the rows of the owning settlement's latest revision are the
/// current obligation. Unpaid commission is never a recovery: it is simply re-issued
/// lower. Nothing here moves money: it records what is owed back, for whom, from which
/// payout, so a later recovery workflow can settle it.
/// </summary>
public sealed class ConsignmentCommissionRecovery : Entity
{
    /// <summary>The settlement whose commission was over-paid (where the sale was made).</summary>
    public Guid SettlementId { get; set; }
    public ConsignmentSettlement? Settlement { get; set; }
    public int SettlementRevision { get; set; }
    /// <summary>The settlement whose report caused it: the same period for a correction, a later one for a refund.</summary>
    public Guid CausedBySettlementId { get; set; }
    public Guid SalespersonId { get; set; }
    public Guid OriginCommissionId { get; set; }
    public SalesCommission? OriginCommission { get; set; }
    /// <summary>The paid payout the over-paid commission was part of.</summary>
    public Guid? CommissionPayoutId { get; set; }
    public int Quantity { get; set; }
    public decimal UnitAmount { get; set; }
    public decimal Amount { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
