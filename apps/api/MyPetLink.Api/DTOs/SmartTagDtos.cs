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
    string Variant,
    SmartTagStatus Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset? ActivatedAt,
    DateTimeOffset? DeliveredAt,
    DateTimeOffset? LastScannedAt,
    Guid? ReplacementForTagId,
    DateTimeOffset? ArchivedAt);

public sealed record SmartTagScanResponse(
    Guid Id,
    TagScanSource ScanSource,
    TagScanResolvedState ResolvedState,
    DateTimeOffset ScannedAt,
    string? City,
    string? Country,
    string? DeviceType);

public sealed record SmartTagScanHistoryResponse(
    IReadOnlyCollection<SmartTagScanResponse> Items,
    int Total,
    int QrScans,
    int NfcTaps,
    int LegacyOrUnknown);
