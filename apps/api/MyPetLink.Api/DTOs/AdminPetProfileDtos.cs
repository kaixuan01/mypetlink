using System.ComponentModel.DataAnnotations;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.DTOs;

public sealed class AdminPetProfileQuery : PagedQuery
{
    [MaxLength(200)] public string? Search { get; init; }
    [MaxLength(32)] public string? View { get; init; }
    [MaxLength(32)] public string? Lifecycle { get; init; }
    public bool? LostMode { get; init; }
    public bool? HasLastSeen { get; init; }
    [MaxLength(80)] public string? PetType { get; init; }
    [MaxLength(160)] public string? Breed { get; init; }
    [MaxLength(80)] public string? Gender { get; init; }
    [MaxLength(32)] public string? AgeMode { get; init; }
    [MaxLength(32)] public string? PublicProfile { get; init; }
    public bool? ShowAllergiesPublicly { get; init; }
    [MaxLength(64)] public string? ProfileTheme { get; init; }
    public bool? HasProfilePhoto { get; init; }
    public bool? HasCoverPhoto { get; init; }
    [MaxLength(32)] public string? QrSafety { get; init; }
    public bool? HasFinderContact { get; init; }
    public bool? HasAllergies { get; init; }
    public bool? HasEmergencyNote { get; init; }
    [MaxLength(32)] public string? TagState { get; init; }
    [MaxLength(32)] public string? TagType { get; init; }
    public Guid? OwnerId { get; init; }
    [MaxLength(200)] public string? Owner { get; init; }
    public DateTimeOffset? CreatedFrom { get; init; }
    public DateTimeOffset? CreatedTo { get; init; }
    public DateTimeOffset? UpdatedFrom { get; init; }
    public DateTimeOffset? UpdatedTo { get; init; }
    [MaxLength(40)] public string? SortBy { get; init; }
    [MaxLength(8)] public string? SortDir { get; init; }
}

public sealed record AdminPetProfileItemResponse(
    Guid Id,
    string Name,
    string Species,
    string? CustomSpecies,
    string? Breed,
    string? Gender,
    string AgeMode,
    string AgeDisplay,
    string? ProfilePhotoUrl,
    Guid OwnerUserId,
    string OwnerName,
    string OwnerEmail,
    PetLifecycleStatus Lifecycle,
    bool LostModeEnabled,
    DateTimeOffset? LostLastSeenDateTime,
    bool PublicProfileEnabled,
    bool PublicProfileAccessible,
    bool PublicProfileSetupIssue,
    string? PublicSlug,
    string? PublicCode,
    string ProfileTheme,
    bool QrSafetyEnabled,
    bool QrSafetyAccessible,
    bool QrSafetySetupIssue,
    string? SafetyCode,
    bool HasFinderContact,
    bool HasAllergies,
    bool ShowAllergiesPublicly,
    int ActiveSmartTagCount,
    int TotalSmartTagCount,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record AdminPetProfileCountsResponse(
    int All,
    int Active,
    int LostMode,
    int Memorial,
    int Archived);

public sealed record AdminPetTagSummaryResponse(
    Guid Id,
    string TagCode,
    bool HasNfc,
    string Variant,
    SmartTagStatus Status,
    bool IsArchived,
    DateTimeOffset? ActivatedAt,
    DateTimeOffset? LastScannedAt);

public sealed record AdminPetHistoryItemResponse(
    string Action,
    ActorType ActorType,
    string? ActorName,
    string? Detail,
    DateTimeOffset CreatedAt);

public sealed record AdminPetProfileDetailResponse(
    AdminPetProfileItemResponse Pet,
    string? Color,
    DateOnly? Birthday,
    short? EstimatedBirthYear,
    DateOnly? AdoptionDay,
    string? CoverPhotoUrl,
    string? GeneralArea,
    string? OwnerPhone,
    string? OwnerWhatsapp,
    string? FinderOwnerName,
    string? FinderPhone,
    string? FinderWhatsapp,
    string? EmergencyContact,
    bool ShowOwnerName,
    bool ShowGeneralArea,
    bool ShowPhone,
    bool ShowWhatsapp,
    bool ShowEmergencyNote,
    bool ShowHealthSummary,
    bool ShowAllergiesOnPublicProfile,
    IReadOnlyList<string> Allergies,
    string? SafetyNote,
    string? EmergencyNote,
    string? LostLastSeenArea,
    string? LostMessage,
    string? LostRewardNote,
    string? LostContactInstructions,
    DateOnly? MemorialPassedAwayDate,
    string? MemorialMessage,
    bool ShowMemorialOnPublicProfile,
    IReadOnlyCollection<AdminPetTagSummaryResponse> SmartTags,
    IReadOnlyCollection<AdminPetHistoryItemResponse> History);
