using MyPetLink.Api.Entities;

namespace MyPetLink.Api.DTOs;

public sealed record CreateMemoryRequest(
    string Title,
    DateOnly? Date,
    string? Type,
    string? Caption,
    MemoryVisibility Visibility,
    bool ShowOnPublicProfile,
    bool ShowInLifeTimeline,
    string? TimelineNote,
    IReadOnlyCollection<Guid>? MediaFileIds);

public sealed record UpdateMemoryRequest(
    string? Title,
    DateOnly? Date,
    string? Type,
    string? Caption,
    MemoryVisibility? Visibility,
    bool? ShowOnPublicProfile,
    bool? ShowInLifeTimeline,
    string? TimelineNote,
    IReadOnlyCollection<Guid>? MediaFileIds);

public sealed record MemoryResponse(
    Guid Id,
    Guid PetId,
    string Title,
    DateOnly? Date,
    MemoryVisibility Visibility,
    bool ShowOnPublicProfile);

public sealed record CreateCareRecordRequest(
    CareRecordType Type,
    string Title,
    DateOnly? Date,
    DateOnly? DueDate,
    string? Provider,
    string? Notes,
    CareRecordPublicVisibility PublicVisibility,
    IReadOnlyCollection<Guid>? MediaFileIds);

public sealed record UpdateCareRecordRequest(
    CareRecordType? Type,
    string? Title,
    DateOnly? Date,
    DateOnly? DueDate,
    string? Provider,
    string? Notes,
    CareRecordPublicVisibility? PublicVisibility,
    IReadOnlyCollection<Guid>? MediaFileIds);

public sealed record CareRecordResponse(
    Guid Id,
    Guid PetId,
    CareRecordType Type,
    string Title,
    DateOnly? Date,
    DateOnly? DueDate,
    CareRecordPublicVisibility PublicVisibility,
    string DerivedStatus);
