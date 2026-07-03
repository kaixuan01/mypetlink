using System.ComponentModel.DataAnnotations;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.DTOs;

public sealed record DeliveryDetailsRequest(
    [property: Required] string RecipientName,
    [property: Required] string PhoneE164,
    [property: Required] string AddressLine1,
    string? AddressLine2,
    [property: Required] string Postcode,
    [property: Required] string City,
    [property: Required] string State,
    string? Notes);

public sealed record CreateTagOrderRequest(
    [property: Required] Guid PetId,
    TagType TagType,
    string? Shape,
    DeliveryDetailsRequest Delivery,
    Guid? ReplacementForTagId);

public sealed record TagOrderResponse(
    Guid Id,
    string OrderNumber,
    Guid PetId,
    Guid? SmartTagId,
    TagType TagType,
    string Shape,
    decimal Amount,
    string Currency,
    OrderStatus Status,
    PaymentStatus PaymentStatus,
    DateTimeOffset CreatedAt);

public sealed record UploadPaymentProofRequest(
    Guid? MediaFileId,
    string? PaymentReference,
    string? OwnerNote);

public sealed record PaymentProofResponse(
    Guid Id,
    Guid OrderId,
    Guid MediaFileId,
    string OriginalFileName,
    string ContentType,
    long FileSize,
    string StorageProvider,
    PaymentProofStatus Status,
    string? PaymentReference,
    DateTimeOffset UploadedAt);
