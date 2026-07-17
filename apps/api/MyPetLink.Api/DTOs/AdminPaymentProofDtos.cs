using System.ComponentModel.DataAnnotations;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.DTOs;

public sealed class AdminPaymentProofQuery : PagedQuery
{
    [MaxLength(200)] public string? Search { get; init; }
    [MaxLength(40)] public string? Status { get; init; }
    [MaxLength(40)] public string? OrderPaymentStatus { get; init; }
    public bool? HasReference { get; init; }
    public bool? HasMedia { get; init; }
    public bool? NeedsAttention { get; init; }
    public bool? Overdue { get; init; }
    [MaxLength(80)] public string? PaymentMethod { get; init; }
    [MaxLength(200)] public string? Owner { get; init; }
    public Guid? OwnerId { get; init; }
    [MaxLength(200)] public string? Reviewer { get; init; }
    [Range(typeof(decimal), "0", "999999999999")] public decimal? AmountMin { get; init; }
    [Range(typeof(decimal), "0", "999999999999")] public decimal? AmountMax { get; init; }
    public DateTimeOffset? SubmittedFrom { get; init; }
    public DateTimeOffset? SubmittedTo { get; init; }
    public DateTimeOffset? ReviewedFrom { get; init; }
    public DateTimeOffset? ReviewedTo { get; init; }
    [MaxLength(40)] public string? SortBy { get; init; }
    [MaxLength(8)] public string? SortDir { get; init; }
}

public sealed record AdminPaymentProofListItemResponse(
    Guid Id,
    Guid OrderId,
    string OrderNumber,
    Guid OwnerUserId,
    string OwnerName,
    string OwnerEmail,
    string OwnerPhone,
    string? PetName,
    string? TagCode,
    decimal ExpectedAmount,
    string Currency,
    PaymentProofStatus Status,
    OrderStatus OrderStatus,
    PaymentStatus OrderPaymentStatus,
    AdminOrderFulfilmentStatus FulfilmentStatus,
    string OriginalFileName,
    string ContentType,
    long FileSize,
    bool HasMedia,
    string PaymentMethod,
    string? PaymentReference,
    string? OwnerNote,
    string? RejectionReason,
    DateTimeOffset SubmittedAt,
    DateTimeOffset? ReviewedAt,
    string? ReviewerName,
    string? ReviewerEmail,
    DateTimeOffset UpdatedAt,
    bool ReferenceUsedByOtherOrder,
    bool ProofFileUsedByOtherOrder,
    bool OrderStateConflict,
    int PendingProofCount,
    bool RequiresAttention);

public sealed record AdminPaymentProofCountsResponse(
    int All,
    int PendingReview,
    int Approved,
    int Rejected,
    int Superseded,
    int NeedsAttention);
