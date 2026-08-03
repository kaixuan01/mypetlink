using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using MyPetLink.Api.Common;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.DTOs;

public sealed record DeliveryDetailsRequest(
    [Required, MaxLength(160)] string RecipientName,
    [Required, MaxLength(32)] string PhoneE164,
    [Required, MaxLength(240)] string AddressLine1,
    [MaxLength(240)] string? AddressLine2,
    [Required, MaxLength(20)] string Postcode,
    [Required, MaxLength(120)] string City,
    [MaxLength(8)] string? StateCode,
    [MaxLength(600)] string? Notes);

public sealed record CreateTagOrderItemRequest(
    [Required] Guid PetId,
    [Required, MaxLength(32)] string ProductVariantKey,
    [Range(1, TagOrderLimits.MaxQuantityPerLine)] int Quantity);

[method: JsonConstructor]
public sealed record CreateTagOrderRequest(
    IReadOnlyCollection<CreateTagOrderItemRequest>? Items,
    [Required] DeliveryDetailsRequest? Delivery,
    Guid? ReplacementForTagId,
    // Optional per-attempt idempotency key. Omitting it keeps the legacy
    // non-idempotent behaviour for older clients. The attribute must target the
    // constructor parameter, like every other member here — a [property:]
    // target is ignored for validation and makes MVC throw on every request.
    [MaxLength(80)] string? IdempotencyKey = null)
{
    public CreateTagOrderRequest(
        Guid petId,
        string productVariantKey,
        int quantity,
        DeliveryDetailsRequest? delivery,
        Guid? replacementForTagId,
        string? idempotencyKey = null)
        : this(
            [new CreateTagOrderItemRequest(petId, productVariantKey, quantity)],
            delivery,
            replacementForTagId,
            idempotencyKey)
    {
    }
}

public sealed record TagOrderItemResponse(
    Guid? Id,
    Guid PetId,
    string PetName,
    string Sku,
    string ProductName,
    string VariantName,
    decimal UnitBasePrice,
    int Quantity,
    decimal Subtotal,
    string? PromotionName,
    decimal DiscountAmount,
    decimal FinalUnitPrice,
    decimal FinalAmount,
    decimal? UnitWeightGrams,
    string Currency,
    // Capabilities as sold, so order history never reflects later SKU edits.
    bool SupportsQr,
    bool SupportsNfc,
    IReadOnlyCollection<AssignedOrderTagResponse> AssignedTags);

public sealed record AssignedOrderTagResponse(
    Guid Id,
    string TagCode,
    Guid? OrderItemId,
    Guid PetId,
    string PetName,
    SmartTagStatus Status);

public sealed record DeliveryDetailsResponse(
    string RecipientName,
    string PhoneE164,
    string AddressLine1,
    string? AddressLine2,
    string Postcode,
    string City,
    string State,
    string? StateCode,
    string Country,
    string? ZoneName,
    string? DeliveryMethod,
    string? FreeDeliveryReason,
    string? Notes);

public sealed record TagOrderResponse(
    Guid Id,
    string OrderNumber,
    string? ReceiptNumber,
    Guid OwnerUserId,
    Guid PetId,
    string? PetName,
    Guid? SmartTagId,
    string? SmartTagCode,
    TagType TagType,
    string Variant,
    decimal Amount,
    string Currency,
    decimal DeliveryFee,
    decimal TotalAmount,
    OrderStatus Status,
    PaymentStatus PaymentStatus,
    Guid? ReplacementForTagId,
    TagOrderItemResponse? Item,
    IReadOnlyCollection<TagOrderItemResponse> Items,
    decimal MerchandiseSubtotal,
    decimal DiscountTotal,
    decimal? EstimatedShipmentWeightGrams,
    DeliveryDetailsResponse Delivery,
    DateTimeOffset? PaymentSubmittedAt,
    DateTimeOffset? PaymentConfirmedAt,
    string? PaymentMethod,
    string? PaymentReference,
    string? PaymentNote,
    string? PaymentProofName,
    string? PaymentRejectionReason,
    OwnerPaymentConfirmationEmailResponse? PaymentConfirmationEmail,
    string? TrackingStatus,
    string? CourierProvider,
    string? CourierService,
    string? TrackingNumber,
    DateTimeOffset? ReadyToShipAt,
    DateTimeOffset? ShippedAt,
    DateTimeOffset? DeliveredAt,
    DateTimeOffset? CancelledAt,
    IReadOnlyCollection<PaymentProofResponse> PaymentProofs,
    IReadOnlyCollection<OrderTimelineEventResponse> Timeline,
    DateTimeOffset UpdatedAt,
    DateTimeOffset CreatedAt,
    string? TrackingUrl = null);

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
    SmartTagResponse? Tag);

public sealed record UploadPaymentProofRequest(
    Guid? MediaFileId,
    [MaxLength(260)] string? FileName,
    [MaxLength(80)] string? PaymentMethod,
    [MaxLength(160)] string? PaymentReference,
    [MaxLength(600)] string? OwnerNote,
    [Required, Range(typeof(decimal), "0.01", "999999999999")] decimal? SubmittedAmount = null);

public sealed record PaymentProofResponse(
    Guid Id,
    Guid OrderId,
    Guid MediaFileId,
    string OriginalFileName,
    string ContentType,
    long FileSize,
    string StorageProvider,
    string PaymentMethod,
    decimal? SubmittedAmount,
    PaymentProofStatus Status,
    string? PaymentReference,
    string? OwnerNote,
    string? RejectionReason,
    DateTimeOffset UploadedAt,
    DateTimeOffset? ReviewedAt);
