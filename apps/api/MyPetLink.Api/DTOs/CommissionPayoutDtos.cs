using System.ComponentModel.DataAnnotations;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.DTOs;

// Validation attributes target the constructor parameters. ASP.NET Core validates a
// positional record through its constructor, and refuses (with a 500) a record whose
// validation metadata sits on the generated properties instead.
public sealed record PrepareCommissionPayoutRequest(
    [Required, MinLength(1)] IReadOnlyCollection<Guid> SalesCommissionIds,
    Guid SalespersonId,
    DateTimeOffset PeriodFrom,
    DateTimeOffset PeriodToExclusive,
    [Range(typeof(decimal), "0", "79228162514264337593543950335")] decimal ExpectedTotal,
    [Required, MaxLength(80)] string IdempotencyKey,
    [MaxLength(2000)] string? Notes = null);

public sealed record MarkCommissionPayoutPaidRequest(
    [Required] string ConcurrencyToken,
    CommissionPayoutPaymentMethod PaymentMethod,
    [Required, MaxLength(200)] string PaymentReference,
    // The date the money actually left the bank. Required for every new payment
    // record; nullable only so an old client gets a clear validation message.
    DateOnly? TransferredOn = null);

public sealed record CancelCommissionPayoutRequest(
    [Required] string ConcurrencyToken,
    [Required, MaxLength(1000)] string Reason);

public sealed class CommissionPayoutQuery
{
    [Range(1, int.MaxValue)] public int Page { get; set; } = 1;
    [Range(1, 100)] public int PageSize { get; set; } = 50;
    public Guid? SalespersonId { get; set; }
    public string? Status { get; set; }
    public DateTimeOffset? From { get; set; }
    public DateTimeOffset? ToExclusive { get; set; }
    public string? PayoutNumber { get; set; }
}

public sealed record CommissionPayoutItemResponse(
    Guid Id,
    Guid SalesCommissionId,
    string SourceType,
    string CommissionType,
    Guid? MerchantOrderId,
    Guid? TagOrderId,
    string SourceOrderNumber,
    decimal CommissionBaseAmount,
    decimal CommissionAmount,
    decimal? CommissionPercentage,
    decimal? CommissionFixedAmount,
    string Currency,
    DateTimeOffset CalculatedAt,
    string CurrentCommissionStatus,
    DateTimeOffset? ReversedAt,
    string? ReversalReason,
    DateTimeOffset? ReleasedAt,
    string? ReleaseReason,
    bool RequiresRecovery,
    Guid? ConsignmentSettlementId = null,
    // Cash paid on this row that a later correction or refund took away, still to be recovered.
    decimal RecoveryAmount = 0m);

public sealed record CommissionPayoutSummaryResponse(
    Guid Id,
    string PayoutNumber,
    Guid SalespersonId,
    string SalespersonCode,
    string SalespersonName,
    DateTimeOffset PeriodFrom,
    DateTimeOffset PeriodToExclusive,
    string Currency,
    decimal PreparedAmount,
    string Status,
    int ItemCount,
    decimal RecoveryExposure,
    DateTimeOffset PreparedAt,
    DateTimeOffset? PaidAt,
    DateTimeOffset? CancelledAt,
    string? PaymentMethod,
    string? PaymentReference,
    string ConcurrencyToken,
    DateOnly? TransferredOn = null);

public sealed record CommissionPayoutResponse(
    CommissionPayoutSummaryResponse Summary,
    SellerIdentitySnapshot Seller,
    Guid PreparedByAdminUserId,
    string PreparedBy,
    Guid? PaidByAdminUserId,
    string? PaidBy,
    string? PaymentMethod,
    string? PaymentReference,
    string? Notes,
    Guid? CancelledByAdminUserId,
    string? CancelledBy,
    string? CancellationReason,
    IReadOnlyCollection<CommissionPayoutItemResponse> Items);
