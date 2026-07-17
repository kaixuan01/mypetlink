using System.ComponentModel.DataAnnotations;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.DTOs;

// Every listing constraint is applied by AdminSmartTagService before paging.
// Finite values are validated by the service instead of being interpolated
// into dynamic SQL.
public sealed class AdminSmartTagQuery : PagedQuery
{
    [MaxLength(200)] public string? Search { get; init; }
    [MaxLength(40)] public string? Status { get; init; }
    [MaxLength(32)] public string? TagType { get; init; }
    [MaxLength(80)] public string? Variant { get; init; }
    public bool? Claimed { get; init; }
    public Guid? PetId { get; init; }
    public Guid? OwnerId { get; init; }
    [MaxLength(160)] public string? Pet { get; init; }
    [MaxLength(200)] public string? Owner { get; init; }
    public bool? HasOrder { get; init; }
    public bool? HasScans { get; init; }
    public DateTimeOffset? ActivatedFrom { get; init; }
    public DateTimeOffset? ActivatedTo { get; init; }
    public DateTimeOffset? CreatedFrom { get; init; }
    public DateTimeOffset? CreatedTo { get; init; }
    public DateTimeOffset? LastScannedFrom { get; init; }
    public DateTimeOffset? LastScannedTo { get; init; }
    [MaxLength(40)] public string? SortBy { get; init; }
    [MaxLength(8)] public string? SortDir { get; init; }
}

public sealed record AdminSmartTagItemResponse(
    Guid Id,
    string TagCode,
    bool HasNfc,
    string Variant,
    SmartTagStatus Status,
    bool IsArchived,
    Guid? PetId,
    string? PetName,
    string? SafetyCode,
    bool QrSafetyEnabled,
    Guid? OwnerUserId,
    string? OwnerName,
    string? OwnerEmail,
    Guid? OrderId,
    string? OrderNumber,
    string? BatchNumber,
    DateTimeOffset? ActivatedAt,
    DateTimeOffset? LastScannedAt,
    int ScanCount,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    Guid? ReplacementForTagId,
    string? ReplacementForTagCode,
    string? ReplacedByTagCode);

public sealed record AdminSmartTagStatusCountsResponse(
    int All,
    int Active,
    int AwaitingActivation,
    int Unclaimed,
    int Lost,
    int Disabled,
    int Replaced,
    int Archived);

public sealed record AdminSmartTagActionRequest([MaxLength(600)] string? Reason);

public sealed record AdminSmartTagBulkActionRequest(
    [Required, MaxLength(40)] string Action,
    [Required, MinLength(1), MaxLength(500)] Guid[] TagIds,
    [MaxLength(600)] string? Reason);

public sealed record AdminSmartTagBulkFailure(Guid TagId, string TagCode, string Reason);

public sealed record AdminSmartTagBulkActionResponse(
    string Action,
    int RequestedCount,
    int UpdatedCount,
    IReadOnlyCollection<AdminSmartTagBulkFailure> Failures);
