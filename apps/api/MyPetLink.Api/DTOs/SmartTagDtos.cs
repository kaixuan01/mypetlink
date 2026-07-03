using MyPetLink.Api.Entities;

namespace MyPetLink.Api.DTOs;

public sealed record ActivateTagRequest(Guid PetId);

public sealed record SmartTagResponse(
    Guid Id,
    string TagCode,
    Guid? PetId,
    Guid? OwnerUserId,
    Guid? OrderId,
    bool HasNfc,
    string Shape,
    SmartTagStatus Status,
    DateTimeOffset? ActivatedAt,
    DateTimeOffset? LastScannedAt);
