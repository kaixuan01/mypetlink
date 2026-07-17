using System.ComponentModel.DataAnnotations;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.DTOs;

// Query string for the Tag Inventory listing. Every filter is applied in SQL;
// the frontend never has to download the full inventory to filter it.
public sealed class AdminTagInventoryQuery : PagedQuery
{
    [MaxLength(200)]
    public string? Search { get; init; }

    [MaxLength(32)]
    public string? TagCode { get; init; }

    [MaxLength(80)]
    public string? Batch { get; init; }

    // Lifecycle status (SmartTagStatus), or "archived" for archived tags.
    [MaxLength(32)]
    public string? Status { get; init; }

    [MaxLength(32)]
    public string? Fulfilment { get; init; }

    [MaxLength(32)]
    public string? TagType { get; init; }

    [MaxLength(80)]
    public string? Variant { get; init; }

    public Guid? PetId { get; init; }

    public Guid? OwnerId { get; init; }

    // true = linked to a pet, false = unclaimed stock.
    public bool? Claimed { get; init; }

    [MaxLength(200)]
    public string? Reseller { get; init; }

    public DateTimeOffset? GeneratedFrom { get; init; }

    public DateTimeOffset? GeneratedTo { get; init; }

    public DateTimeOffset? UpdatedFrom { get; init; }

    public DateTimeOffset? UpdatedTo { get; init; }

    [MaxLength(40)]
    public string? SortBy { get; init; }

    [MaxLength(8)]
    public string? SortDir { get; init; }
}

public sealed record AdminTagInventoryItemResponse(
    Guid Id,
    string TagCode,
    bool HasNfc,
    string Variant,
    string? BatchNo,
    string? ResellerName,
    SmartTagStatus Status,
    bool IsArchived,
    TagFulfilmentStatus FulfilmentStatus,
    Guid? PetId,
    string? PetName,
    Guid? OwnerUserId,
    string? OwnerName,
    string? OwnerEmail,
    Guid? OrderId,
    string? OrderNumber,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset? PrintedAt,
    DateTimeOffset? SentToResellerAt,
    DateTimeOffset? ReceivedAt,
    DateTimeOffset? SentToOwnerAt,
    DateTimeOffset? ActivatedAt,
    DateTimeOffset? DeliveredAt,
    DateTimeOffset? LastScannedAt);

public sealed record AdminTagInventoryBulkActionRequest(
    [Required, MaxLength(40)] string Action,
    [Required, MinLength(1), MaxLength(500)] Guid[] TagIds);

public sealed record AdminTagInventoryBulkFailure(
    Guid TagId,
    string TagCode,
    string Reason);

public sealed record AdminTagInventoryBulkActionResponse(
    string Action,
    int RequestedCount,
    int UpdatedCount,
    IReadOnlyCollection<AdminTagInventoryBulkFailure> Failures);
