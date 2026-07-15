using System.ComponentModel.DataAnnotations;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.DTOs;

public sealed record CreateMemoryRequest(
    [Required, MaxLength(160)]
    string Title,
    DateOnly? Date,
    [Required, MaxLength(80)]
    string? Type,
    [MaxLength(2000)]
    string? Caption,
    MemoryVisibility? Visibility,
    bool? ShowOnPublicProfile,
    bool? ShowInLifeTimeline,
    [MaxLength(500)]
    string? TimelineNote,
    IReadOnlyCollection<Guid>? MediaFileIds);

public sealed record UpdateMemoryRequest(
    [MaxLength(160)]
    string? Title,
    DateOnly? Date,
    [MaxLength(80)]
    string? Type,
    [MaxLength(2000)]
    string? Caption,
    MemoryVisibility? Visibility,
    bool? ShowOnPublicProfile,
    bool? ShowInLifeTimeline,
    [MaxLength(500)]
    string? TimelineNote,
    IReadOnlyCollection<Guid>? MediaFileIds);

public sealed record MemoryResponse(
    Guid Id,
    Guid PetId,
    string Title,
    DateOnly? Date,
    string? Type,
    string? Caption,
    MemoryVisibility Visibility,
    bool ShowOnPublicProfile,
    bool ShowInLifeTimeline,
    string? TimelineNote,
    IReadOnlyCollection<MemoryMediaResponse> Media,
    Guid? CoverMediaId,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset? ArchivedAt);

public sealed record MemoryMediaResponse(
    Guid Id,
    string Type,
    string? Url,
    string? Caption,
    string? AltText,
    int SortOrder);

public sealed record CreateCareRecordRequest(
    CareRecordType? Type,
    [Required, MaxLength(160)] string Title,
    DateOnly? Date,
    DateOnly? DueDate,
    [MaxLength(160)]
    string? Provider,
    [MaxLength(2000)]
    string? Notes,
    CareRecordPublicVisibility? PublicVisibility,
    IReadOnlyCollection<Guid>? MediaFileIds);

public sealed record UpdateCareRecordRequest(
    CareRecordType? Type,
    [MaxLength(160)]
    string? Title,
    DateOnly? Date,
    DateOnly? DueDate,
    [MaxLength(160)]
    string? Provider,
    [MaxLength(2000)]
    string? Notes,
    CareRecordPublicVisibility? PublicVisibility,
    IReadOnlyCollection<Guid>? MediaFileIds,
    bool? ClearDueDate = null);

public sealed record CareRecordResponse(
    Guid Id,
    Guid PetId,
    CareRecordType Type,
    string Title,
    DateOnly? Date,
    DateOnly? DueDate,
    string? Provider,
    string? Notes,
    CareRecordPublicVisibility PublicVisibility,
    string DerivedStatus,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset? ArchivedAt);
