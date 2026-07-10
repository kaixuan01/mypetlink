using System.ComponentModel.DataAnnotations;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.DTOs;

public sealed record InitializeMediaUploadRequest(
    Guid? PetId,
    Guid? MomentId,
    Guid? CareRecordId,
    Guid? OrderId,
    [Required] MediaUploadCategory? Category,
    [Required, MaxLength(260)] string OriginalFileName,
    [Required, MaxLength(120)] string ContentType,
    [Range(1, long.MaxValue)] long FileSizeBytes,
    int? Width,
    int? Height,
    int? DurationSeconds);

public sealed record MediaUploadResponse(
    Guid MediaId,
    MediaUploadCategory Category,
    MediaFileType MediaType,
    MediaUploadStatus Status,
    bool IsPublic,
    string UploadUrl,
    string Method,
    IReadOnlyDictionary<string, string> RequiredHeaders,
    DateTimeOffset ExpiresAt);

public sealed record CompleteMediaUploadResponse(
    Guid MediaId,
    MediaUploadCategory Category,
    MediaFileType MediaType,
    MediaUploadStatus Status,
    bool IsPublic,
    string? PublicUrl,
    DateTimeOffset CompletedAt);

public sealed record MediaDownloadUrlResponse(
    Guid MediaId,
    string DownloadUrl,
    DateTimeOffset ExpiresAt,
    string ContentType,
    string OriginalFileName);

