using System.ComponentModel.DataAnnotations;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.DTOs;

// Order fulfilment is currently encoded by TagOrder.Status. This projection
// keeps payment and physical fulfilment separate for admin operations without
// adding a second persisted source of truth.
public enum AdminOrderFulfilmentStatus
{
    NotStarted,
    Preparing,
    Shipped,
    Delivered,
    Cancelled
}

public sealed class AdminOrderQuery : PagedQuery
{
    [MaxLength(200)] public string? Search { get; init; }
    [MaxLength(40)] public string? Stage { get; init; }
    [MaxLength(40)] public string? PaymentStatus { get; init; }
    [MaxLength(40)] public string? FulfilmentStatus { get; init; }
    public bool? HasProof { get; init; }
    [MaxLength(80)] public string? PaymentMethod { get; init; }
    [MaxLength(32)] public string? TagType { get; init; }
    [MaxLength(80)] public string? Variant { get; init; }
    public bool? HasAssignedTag { get; init; }
    public bool? HasTracking { get; init; }
    public Guid? OwnerId { get; init; }
    public Guid? PetId { get; init; }
    [MaxLength(200)] public string? Owner { get; init; }
    [MaxLength(160)] public string? Pet { get; init; }
    [MaxLength(120)] public string? OrderNumber { get; init; }
    [MaxLength(120)] public string? DeliveryLocation { get; init; }
    [Range(typeof(decimal), "0", "999999999999")] public decimal? AmountMin { get; init; }
    [Range(typeof(decimal), "0", "999999999999")] public decimal? AmountMax { get; init; }
    public DateTimeOffset? CreatedFrom { get; init; }
    public DateTimeOffset? CreatedTo { get; init; }
    public DateTimeOffset? UpdatedFrom { get; init; }
    public DateTimeOffset? UpdatedTo { get; init; }
    public DateTimeOffset? ProofSubmittedFrom { get; init; }
    public DateTimeOffset? ProofSubmittedTo { get; init; }
    public DateTimeOffset? PaymentConfirmedFrom { get; init; }
    public DateTimeOffset? PaymentConfirmedTo { get; init; }
    public DateTimeOffset? ShippedFrom { get; init; }
    public DateTimeOffset? ShippedTo { get; init; }
    public DateTimeOffset? DeliveredFrom { get; init; }
    public DateTimeOffset? DeliveredTo { get; init; }
    [MaxLength(40)] public string? SortBy { get; init; }
    [MaxLength(8)] public string? SortDir { get; init; }
}

public sealed record AdminOrderListItemResponse(
    Guid Id,
    string OrderNumber,
    Guid OwnerUserId,
    string OwnerName,
    string OwnerEmail,
    string OwnerPhone,
    Guid PetId,
    string PetName,
    TagType TagType,
    string Variant,
    Guid? ProductVariantId,
    string? ProductName,
    string? Sku,
    string? VariantName,
    int Quantity,
    decimal UnitBasePrice,
    decimal DiscountAmount,
    decimal FinalAmount,
    string? PromotionName,
    decimal Amount,
    string Currency,
    decimal DeliveryFee,
    OrderStatus OrderStatus,
    PaymentStatus PaymentStatus,
    AdminOrderFulfilmentStatus FulfilmentStatus,
    bool HasPaymentProof,
    PaymentProofStatus? LatestPaymentProofStatus,
    DateTimeOffset? PaymentProofSubmittedAt,
    string? PaymentMethod,
    string? PaymentReference,
    Guid? AssignedTagId,
    string? AssignedTagCode,
    string DeliveryCity,
    string DeliveryState,
    string? TrackingNumber,
    DateTimeOffset? PaymentConfirmedAt,
    DateTimeOffset? ShippedAt,
    DateTimeOffset? DeliveredAt,
    DateTimeOffset? CancelledAt,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record AdminOrderStatusCountsResponse(
    int All,
    int AwaitingPayment,
    int PaymentReview,
    int ReadyToPrepare,
    int Preparing,
    int Shipped,
    int Delivered,
    int Cancelled);

public sealed record CancelOrderRequest(
    [Required, MaxLength(600)] string? Reason);
