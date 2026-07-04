using System.ComponentModel.DataAnnotations;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.DTOs;

public sealed record DeliveryDetailsRequest(
    [Required, MaxLength(160)] string RecipientName,
    [Required, MaxLength(32)] string PhoneE164,
    [Required, MaxLength(240)] string AddressLine1,
    [MaxLength(240)] string? AddressLine2,
    [Required, MaxLength(20)] string Postcode,
    [Required, MaxLength(120)] string City,
    [Required, MaxLength(120)] string State,
    [MaxLength(600)] string? Notes);

public sealed record CreateTagOrderRequest(
    [Required] Guid PetId,
    [Required] TagType? TagType,
    [MaxLength(80)] string? Shape,
    [Required] DeliveryDetailsRequest? Delivery,
    Guid? ReplacementForTagId);

public sealed record DeliveryDetailsResponse(
    string RecipientName,
    string PhoneE164,
    string AddressLine1,
    string? AddressLine2,
    string Postcode,
    string City,
    string State,
    string? Notes);

public sealed record TagOrderResponse(
    Guid Id,
    string OrderNumber,
    Guid OwnerUserId,
    Guid PetId,
    string? PetName,
    Guid? SmartTagId,
    string? SmartTagCode,
    TagType TagType,
    string Shape,
    decimal Amount,
    string Currency,
    decimal DeliveryFee,
    OrderStatus Status,
    PaymentStatus PaymentStatus,
    Guid? ReplacementForTagId,
    DeliveryDetailsResponse Delivery,
    DateTimeOffset? PaymentSubmittedAt,
    DateTimeOffset? PaymentConfirmedAt,
    string? PaymentMethod,
    string? PaymentReference,
    string? PaymentNote,
    string? PaymentProofName,
    string? PaymentRejectionReason,
    string? TrackingStatus,
    string? TrackingNumber,
    DateTimeOffset? ShippedAt,
    DateTimeOffset? DeliveredAt,
    DateTimeOffset? CancelledAt,
    IReadOnlyCollection<PaymentProofResponse> PaymentProofs,
    IReadOnlyCollection<OrderTimelineEventResponse> Timeline,
    DateTimeOffset UpdatedAt,
    DateTimeOffset CreatedAt);

// A single chronological event in the order's status history. `OccurredAt`
// is a DateTimeOffset that the frontend formats in the viewer's local
// timezone; it may be null for lifecycle steps that have no dedicated
// timestamp (e.g. tag preparation), in which case the UI shows a safe
// fallback rather than hiding the event. `StatusTone` is one of
// "completed", "current", "warning", or "cancelled".
public sealed record OrderTimelineEventResponse(
    string Type,
    string Title,
    string? Description,
    DateTimeOffset? OccurredAt,
    string StatusTone);

public sealed record CreateTagOrderResponse(
    TagOrderResponse Order,
    SmartTagResponse Tag);

public sealed record UploadPaymentProofRequest(
    Guid? MediaFileId,
    [MaxLength(260)] string? FileName,
    [MaxLength(80)] string? PaymentMethod,
    [MaxLength(160)] string? PaymentReference,
    [MaxLength(600)] string? OwnerNote);

public sealed record PaymentProofResponse(
    Guid Id,
    Guid OrderId,
    Guid MediaFileId,
    string OriginalFileName,
    string ContentType,
    long FileSize,
    string StorageProvider,
    string PaymentMethod,
    PaymentProofStatus Status,
    string? PaymentReference,
    string? OwnerNote,
    string? RejectionReason,
    DateTimeOffset UploadedAt,
    DateTimeOffset? ReviewedAt);
