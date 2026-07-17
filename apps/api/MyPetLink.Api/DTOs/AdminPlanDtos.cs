using System.ComponentModel.DataAnnotations;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.DTOs;

// Admin Plans module: plan definitions are read-only configuration; owner-plan
// rows show which plan each owner is assigned to and how their usage compares
// to that plan's limits. There is no subscription billing yet, so no billing
// status, renewal date, or provider fields are exposed.

public sealed class AdminOwnerPlanQuery : PagedQuery
{
    [MaxLength(200)] public string? Search { get; init; }

    [MaxLength(64)] public string? Plan { get; init; }

    // within | near | at | over — measured against the plan's pet limit using
    // the same counting rule the backend enforces (active pets only).
    [MaxLength(16)] public string? PetUsage { get; init; }

    // within | near | at | over — measured per pet against the memories-per-pet
    // limit (the busiest pet decides the state).
    [MaxLength(16)] public string? MemoryUsage { get; init; }

    // Owner has a manual support marker (plan override or legacy/grandfathered
    // access recorded on the profile).
    public bool? HasOverride { get; init; }

    public DateTimeOffset? AssignedFrom { get; init; }

    public DateTimeOffset? AssignedTo { get; init; }

    public DateTimeOffset? UpdatedFrom { get; init; }

    public DateTimeOffset? UpdatedTo { get; init; }

    [MaxLength(40)] public string? SortBy { get; init; }

    [MaxLength(8)] public string? SortDir { get; init; }
}

public sealed record AdminPlanDefinitionResponse(
    Guid Id,
    string Code,
    string Name,
    string Status,
    bool IsArchived,
    string PriceLabel,
    string? BillingNote,
    string? Description,
    int MaxPets,
    int MaxMemoriesPerPet,
    int MaxMediaPerMemory,
    int MaxFamilyMembers,
    int MaxCareRecords,
    int ScanHistoryDays,
    bool AllowsSmartTagAddOns,
    bool AllowsFoundReports,
    bool AllowsAdvancedThemes,
    int OwnerCount,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record AdminOwnerPlanItemResponse(
    Guid OwnerUserId,
    string DisplayName,
    string Email,
    string PlanCode,
    string PlanName,
    string PlanStatus,
    int PetCount,
    int ActivePetCount,
    int MaxPets,
    string PetUsageState,
    int TotalMemoryCount,
    int HighestMemoriesOnPet,
    int MaxMemoriesPerPet,
    string MemoryUsageState,
    int CareRecordCount,
    int MaxCareRecords,
    bool HasOverride,
    bool Grandfathered,
    DateTimeOffset AssignedAt,
    DateTimeOffset UpdatedAt);

public sealed record AdminOwnerPlanCountsResponse(
    int All,
    int NearPetLimit,
    int AtPetLimit,
    int OverPetLimit,
    int WithOverride);

public sealed record AdminOwnerPlanDetailResponse(
    AdminOwnerPlanItemResponse Item,
    AdminPlanDefinitionResponse Plan,
    int MemorialPetCount,
    int ArchivedPetCount,
    int ReadyMediaFileCount,
    long ReadyMediaStorageBytes,
    // Raw manual override configuration recorded on the profile, if any. This
    // is admin-entered support data, never a payment credential.
    string? OverrideNotes,
    DateTimeOffset? GrandfatheredAt,
    IReadOnlyCollection<AdminOwnerHistoryItemResponse> History);
