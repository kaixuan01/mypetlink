namespace MyPetLink.Api.DTOs;

// --- Salesperson commission policy assignments -----------------------------

public sealed record SalespersonPolicyAssignmentResponse(
    Guid Id,
    Guid SalespersonId,
    string PolicyCode,
    DateTimeOffset AcceptedAt,
    DateTimeOffset EffectiveFrom,
    DateTimeOffset? EffectiveToExclusive,
    string AgreementReference,
    string? Notes,
    DateTimeOffset CreatedAt,
    DateTimeOffset? EndedAt,
    string? EndReason,
    string ConcurrencyToken);

public sealed record RecordSalespersonPolicyAssignmentRequest(
    string PolicyCode,
    DateTimeOffset AcceptedAt,
    DateTimeOffset EffectiveFrom,
    string AgreementReference,
    string? Notes);

public sealed record EndSalespersonPolicyAssignmentRequest(
    DateTimeOffset EffectiveToExclusive,
    string Reason,
    string ConcurrencyToken);

// --- Consignment settlements ------------------------------------------------

public sealed record ConsignmentSettlementSummaryResponse(
    Guid Id,
    string SettlementNumber,
    Guid MerchantId,
    string MerchantName,
    Guid MerchantBranchId,
    string BranchName,
    DateTimeOffset PeriodStart,
    DateTimeOffset PeriodEndExclusive,
    Guid SalesReportId,
    int SalesReportVersion,
    int Revision,
    string Status,
    int StandardQuantity,
    decimal StandardSales,
    int PromotionQuantity,
    decimal PromotionSales,
    int RefundQuantity,
    decimal RefundAmount,
    decimal EligibleSales,
    decimal MerchantCommission,
    decimal ExpectedRemittance,
    decimal ReceivedAmount,
    decimal Outstanding,
    decimal CreditDue,
    string AttributionStatus,
    string? AttributionIssue,
    string? AttributionSource,
    Guid? SalespersonId,
    string? SalespersonName,
    string? CommissionPolicyCode,
    decimal CommissionPending,
    decimal CommissionPayable,
    decimal CommissionPaid,
    decimal CommissionRecoveryRequired,
    string? CommissionNote,
    string ConcurrencyToken);

public sealed record ConsignmentSettlementLineResponse(
    Guid SourceReportLineId,
    string LineType,
    string Sku,
    string PriceKind,
    decimal UnitPrice,
    int Quantity,
    decimal Amount,
    decimal MerchantCommissionPercentage,
    DateTimeOffset? RefundOfPeriodStart,
    Guid? CommissionSalespersonId,
    decimal? CommissionUnitAmount);

public sealed record ConsignmentSettlementRevisionResponse(
    int Revision,
    Guid SalesReportId,
    int SalesReportVersion,
    string Reason,
    decimal EligibleSales,
    decimal MerchantCommission,
    decimal ExpectedRemittance,
    decimal SalesCommissionTarget,
    decimal CommissionRecoveryRequired,
    DateTimeOffset CreatedAt);

public sealed record ConsignmentSettlementReceiptResponse(
    Guid Id,
    DateOnly ReceivedOn,
    decimal Amount,
    string Method,
    string Reference,
    string? Notes,
    DateTimeOffset RecordedAt,
    DateTimeOffset? VoidedAt,
    string? VoidReason,
    string ConcurrencyToken);

public sealed record ConsignmentSettlementCommissionResponse(
    Guid Id,
    Guid SalespersonId,
    string SalespersonName,
    string CommissionType,
    int QualifiedQuantity,
    decimal UnitAmount,
    decimal CommissionAmount,
    string Status,
    int Revision,
    string? PolicyCode,
    DateTimeOffset CalculatedAt,
    DateTimeOffset? PayableAt,
    DateTimeOffset? PaidAt,
    DateTimeOffset? ReversedAt,
    string? ReversalReason,
    string? PayoutNumber,
    string PayoutClaimState);

public sealed record ConsignmentSettlementResponse(
    ConsignmentSettlementSummaryResponse Summary,
    string AgreementReference,
    int AgreementVersion,
    IReadOnlyList<ConsignmentSettlementLineResponse> Lines,
    IReadOnlyList<ConsignmentSettlementRevisionResponse> Revisions,
    IReadOnlyList<ConsignmentSettlementReceiptResponse> Receipts,
    IReadOnlyList<ConsignmentSettlementCommissionResponse> Commissions,
    DateTimeOffset? AttributionResolvedAt,
    string? AttributionResolutionReason,
    IReadOnlyList<ConsignmentCommissionRecoveryResponse>? CurrentRecoveries = null);

/// <summary>
/// One recovery obligation in force that involves this settlement, either because its commission was
/// over-paid here (origin) or because this settlement's report took it away (cause). The same row is
/// shown on both settlements, so it is one amount owed, never two. <see cref="RecoveryId"/> is the stored
/// obligation's own key: two obligations can share every other field (Standard and Promotion commission
/// paid in one payout and refunded on one report), so it is the only safe way to tell rows apart.
/// </summary>
public sealed record ConsignmentCommissionRecoveryResponse(
    Guid RecoveryId,
    Guid OriginSettlementId,
    string OriginSettlementNumber,
    DateTimeOffset OriginPeriodStart,
    Guid CausedBySettlementId,
    string CausedBySettlementNumber,
    DateTimeOffset CausedByPeriodStart,
    string SalespersonName,
    string? PayoutNumber,
    int Quantity,
    decimal UnitAmount,
    decimal Amount);

public sealed record RecordConsignmentSettlementReceiptRequest(
    DateOnly ReceivedOn,
    decimal Amount,
    string Method,
    string Reference,
    string? Notes,
    string IdempotencyKey);

public sealed record VoidConsignmentSettlementReceiptRequest(
    string Reason,
    string ConcurrencyToken);

public sealed record ResolveConsignmentAttributionRequest(
    Guid? SalespersonId,
    string Reason,
    string ConcurrencyToken);

public sealed record RecalculateConsignmentSettlementRequest(
    string Reason,
    string ConcurrencyToken);
