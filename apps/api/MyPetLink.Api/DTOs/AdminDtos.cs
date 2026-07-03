using System.ComponentModel.DataAnnotations;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.DTOs;

public sealed record AdminDashboardSummaryResponse(
    int TotalOwners,
    int TotalPets,
    int LostModePets,
    int PendingPaymentProofs,
    int OrdersInPreparation,
    int ActiveTags,
    int LostOrDisabledTags,
    int UnclaimedTags);

public sealed record AdminOrderResponse(
    Guid Id,
    string OrderNumber,
    Guid OwnerUserId,
    Guid PetId,
    Guid? SmartTagId,
    OrderStatus Status,
    PaymentStatus PaymentStatus,
    decimal Amount,
    string Currency,
    DateTimeOffset CreatedAt);

public sealed record ReviewPaymentProofRequest(
    [Required] string Reason);

public sealed record UpdateOrderStatusRequest(
    OrderStatus Status,
    string? TrackingNumber);

public sealed record GenerateTagCodesRequest(
    [Range(1, 50)] int Count,
    bool HasNfc,
    string? Shape,
    string? BatchNo);

public sealed record AdminSmartTagResponse(
    Guid Id,
    string TagCode,
    Guid? OwnerUserId,
    Guid? PetId,
    Guid? OrderId,
    string? BatchNo,
    bool HasNfc,
    string Shape,
    SmartTagStatus Status,
    DateTimeOffset CreatedAt);

public sealed record UpdateSmartTagStatusRequest(
    SmartTagStatus Status,
    string? Reason);

public sealed record UpdateAppSettingsRequest(
    IReadOnlyDictionary<string, object?> Changes);
