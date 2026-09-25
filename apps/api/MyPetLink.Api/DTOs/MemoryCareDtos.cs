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
    IReadOnlyCollection<Guid>? MediaFileIds,
    /// <summary>
    /// Other pets this Moment is also about. Every id must belong to the
    /// authenticated user; tagging another household's pet needs their consent
    /// and is not supported yet. These never consume a Moment allowance — a
    /// Moment about three pets is one Moment.
    /// </summary>
    IReadOnlyCollection<Guid>? AdditionalPetIds = null);

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
    IReadOnlyCollection<Guid>? MediaFileIds,
    /// <summary>
    /// Replaces the additional subject pets when supplied. Omit to leave them
    /// unchanged; send an empty collection to clear them.
    /// </summary>
    IReadOnlyCollection<Guid>? AdditionalPetIds = null);

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
    DateTimeOffset? ArchivedAt,
    /// <summary>Other pets this Moment is about, besides the primary one.</summary>
    IReadOnlyCollection<Guid> AdditionalPetIds,
    /// <summary>When this Moment first became public. Null while it is private.</summary>
    DateTimeOffset? PublishedAt,
    /// <summary>
    /// When MyPetLink hid this Moment from every public surface. Null unless it
    /// is hidden. Only a moderator can clear it; changing the Moment's own
    /// visibility does not.
    /// </summary>
    DateTimeOffset? HiddenByMyPetLinkAt = null);

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
    IReadOnlyCollection<Guid>? MediaFileIds,
    [MaxLength(120)] string? CareName = null,
    Guid? FulfillsCareRecordId = null);

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
    bool? ClearDueDate = null,
    [MaxLength(120)] string? CareName = null,
    Guid? FulfillsCareRecordId = null,
    bool? ClearCareName = null,
    bool? ClearFulfillsCareRecordId = null);

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
    DateTimeOffset? ArchivedAt,
    string? CareName,
    Guid? FulfillsCareRecordId,
    IReadOnlyCollection<CareRecordDocumentResponse> Documents);

public sealed record CareRecordDocumentResponse(
    Guid Id,
    string OriginalFileName,
    string ContentType,
    long FileSizeBytes,
    MediaUploadCategory Category,
    int SortOrder);
