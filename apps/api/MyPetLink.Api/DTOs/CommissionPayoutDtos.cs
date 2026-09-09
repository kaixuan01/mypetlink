using System.ComponentModel.DataAnnotations;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.DTOs;

public sealed record PrepareCommissionPayoutRequest(
    [property: Required, MinLength(1)] IReadOnlyCollection<Guid> SalesCommissionIds,
    Guid SalespersonId,
    DateTimeOffset PeriodFrom,
    DateTimeOffset PeriodToExclusive,
    [property: Range(typeof(decimal), "0", "79228162514264337593543950335")] decimal ExpectedTotal,
    [property: Required, MaxLength(80)] string IdempotencyKey,
    [property: MaxLength(2000)] string? Notes = null);

public sealed record MarkCommissionPayoutPaidRequest(
    [property: Required] string ConcurrencyToken,
    CommissionPayoutPaymentMethod PaymentMethod,
    [property: Required, MaxLength(200)] string PaymentReference);

public sealed record CancelCommissionPayoutRequest(
    [property: Required] string ConcurrencyToken,
    [property: Required, MaxLength(1000)] string Reason);

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
    bool RequiresRecovery);

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
    string ConcurrencyToken);

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
