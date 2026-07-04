using MyPetLink.Api.Entities;

namespace MyPetLink.Api.DTOs;

public sealed record ActivateTagRequest(Guid? PetId);

public sealed record SmartTagResponse(
    Guid Id,
    string TagCode,
    Guid? PetId,
    Guid? OwnerUserId,
    Guid? OrderId,
    string? OrderNumber,
    string? PetName,
    string? BatchNo,
    bool HasNfc,
    string Shape,
    SmartTagStatus Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset? ActivatedAt,
    DateTimeOffset? DeliveredAt,
    DateTimeOffset? LastScannedAt,
    Guid? ReplacementForTagId,
    DateTimeOffset? ArchivedAt);
