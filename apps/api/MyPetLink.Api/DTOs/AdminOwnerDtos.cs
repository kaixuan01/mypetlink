using System.ComponentModel.DataAnnotations;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.DTOs;

public sealed class AdminOwnerQuery : PagedQuery
{
    [MaxLength(200)] public string? Search { get; init; }
    [MaxLength(40)] public string? Status { get; init; }
    public bool? ContactReady { get; init; }
    public bool? ProfileComplete { get; init; }
    [MaxLength(64)] public string? AuthProvider { get; init; }
    public bool? HasPets { get; init; }
    [Range(0, 10_000)] public int? PetCountMin { get; init; }
    [Range(0, 10_000)] public int? PetCountMax { get; init; }
    public bool? HasActivePet { get; init; }
    public bool? HasArchivedOrMemorialPet { get; init; }
    public bool? HasLostModePet { get; init; }
    public bool? HasOrders { get; init; }
    [Range(0, 100_000)] public int? OrderCountMin { get; init; }
    [Range(0, 100_000)] public int? OrderCountMax { get; init; }
    public bool? HasPendingPayment { get; init; }
    public bool? HasPendingProof { get; init; }
    public bool? HasActiveFulfilment { get; init; }
    public bool? HasDeliveredOrder { get; init; }
    [MaxLength(40)] public string? TagState { get; init; }
    [MaxLength(64)] public string? Plan { get; init; }
    public bool? PetUsageNearLimit { get; init; }
    public bool? MemoryUsageNearLimit { get; init; }
    public DateTimeOffset? JoinedFrom { get; init; }
    public DateTimeOffset? JoinedTo { get; init; }
    public DateTimeOffset? UpdatedFrom { get; init; }
    public DateTimeOffset? UpdatedTo { get; init; }
    [MaxLength(40)] public string? SortBy { get; init; }
    [MaxLength(8)] public string? SortDir { get; init; }
}

public sealed record AdminOwnerSupportItemResponse(
    Guid OwnerUserId,
    string DisplayName,
    string Email,
    UserStatus Status,
    string PlanCode,
    string PlanName,
    bool ProfileComplete,
    bool ContactReady,
    string ContactSummary,
    int FinderReadyPetCount,
    int FinderContactIssuePetCount,
    int PetCount,
    int ActivePetCount,
    int MemorialPetCount,
    int ArchivedPetCount,
    int LostModePetCount,
    int OrderCount,
    int PendingPaymentOrderCount,
    int PendingProofCount,
    int ActiveFulfilmentOrderCount,
    int DeliveredOrderCount,
    int ActiveSmartTagCount,
    int TotalSmartTagCount,
    int MemoryCount,
    int MaxPets,
    int MaxMemoriesPerPet,
    bool PetUsageNearLimit,
    bool MemoryUsageNearLimit,
    DateTimeOffset JoinedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset? LastLoginAt);

public sealed record AdminOwnerCountsResponse(
    int All,
    int Active,
    int Suspended,
    int MissingContact,
    int NoPets);

public sealed record AdminOwnerPetSummaryResponse(
    Guid PetId,
    string Name,
    PetLifecycleStatus Lifecycle,
    bool LostModeEnabled,
    bool PublicProfileSetupIssue,
    bool QrSafetySetupIssue,
    DateTimeOffset UpdatedAt);

public sealed record AdminOwnerOrderSummaryResponse(
    Guid OrderId,
    string OrderNumber,
    OrderStatus Status,
    PaymentStatus PaymentStatus,
    decimal Amount,
    string Currency,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record AdminOwnerPaymentProofSummaryResponse(
    Guid PaymentProofId,
    Guid OrderId,
    string OrderNumber,
    PaymentProofStatus Status,
    DateTimeOffset SubmittedAt,
    DateTimeOffset? ReviewedAt);

public sealed record AdminOwnerSmartTagSummaryResponse(
    Guid TagId,
    string TagCode,
    SmartTagStatus Status,
    bool IsArchived,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record AdminOwnerHistoryItemResponse(
    string Label,
    string Actor,
    DateTimeOffset CreatedAt);

public sealed record AdminOwnerDetailResponseV2(
    AdminOwnerSupportItemResponse Owner,
    string? PhoneE164,
    string? WhatsappE164,
    string? DefaultGeneralArea,
    PetVisibilityResponse DefaultPrivacy,
    IReadOnlyCollection<string> AuthenticationProviders,
    int HighestMemoriesOnPet,
    bool MemoryUsageNearLimit,
    IReadOnlyCollection<AdminOwnerPetSummaryResponse> Pets,
    IReadOnlyCollection<AdminOwnerOrderSummaryResponse> RecentOrders,
    IReadOnlyCollection<AdminOwnerPaymentProofSummaryResponse> RecentPaymentProofs,
    IReadOnlyCollection<AdminOwnerSmartTagSummaryResponse> SmartTags,
    IReadOnlyCollection<AdminOwnerHistoryItemResponse> History);
