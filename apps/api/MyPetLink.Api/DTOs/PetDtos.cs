using System.ComponentModel.DataAnnotations;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.DTOs;

public enum PetAgeMode
{
    ExactBirthday,
    EstimatedBirthYear,
    Unknown
}

public enum PetAgeSource
{
    ExactBirthday,
    EstimatedBirthYear,
    Unknown
}

public sealed record PetAgeInfoResponse(
    PetAgeSource Source,
    int? AgeInYears,
    string DisplayLabel);

public sealed record PetContactRequest(
    bool UseOwnerDefaults,
    [MaxLength(200)]
    string? OwnerDisplayName,
    [MaxLength(32)]
    string? PhoneE164,
    [MaxLength(32)]
    string? WhatsappE164,
    [MaxLength(32)]
    string? EmergencyContactE164,
    [MaxLength(200)]
    string? GeneralAreaOverride);

public sealed record PetVisibilityRequest(
    bool ShowOwnerName,
    bool ShowGeneralArea,
    bool ShowPhone,
    bool ShowWhatsapp,
    bool ShowEmergencyNote,
    bool ShowCareBadges,
    bool ShowMoments,
    bool ShowTimeline,
    bool ShowBirthdayOnTimeline,
    bool ShowAdoptionDayOnTimeline,
    bool ShowHealthSummary);

public sealed record CreatePetRequest(
    [Required, MaxLength(120)] string Name,
    [Required, MaxLength(80)] string Species,
    [MaxLength(120)]
    string? CustomSpecies,
    [MaxLength(160)]
    string? Breed,
    [MaxLength(80)]
    string? Gender,
    [MaxLength(120)]
    string? Color,
    PetAgeMode? AgeInformationMode,
    DateOnly? Birthday,
    short? EstimatedBirthYear,
    DateOnly? AdoptionDay,
    [MaxLength(200)]
    string? GeneralArea,
    [MaxLength(2000)]
    string? Bio,
    IReadOnlyList<string>? PersonalityTags,
    [MaxLength(64)]
    string? ProfileTheme,
    PetContactRequest? Contact,
    PetVisibilityRequest? Visibility,
    [MaxLength(2000)]
    string? SafetyNote,
    [MaxLength(2000)]
    string? EmergencyNote,
    [Range(0, 100)] byte? CoverPositionX = null,
    [Range(0, 100)] byte? CoverPositionY = null,
    IReadOnlyList<string>? FavoriteFoods = null,
    IReadOnlyList<string>? FavoriteToys = null,
    // Legacy single-value fields, still accepted from older clients. Ignored
    // when the list fields are provided.
    [MaxLength(80)] string? FavoriteFood = null,
    [MaxLength(80)] string? FavoriteToy = null);

public sealed record UpdatePetRequest(
    [MaxLength(120)]
    string? Name,
    [MaxLength(80)]
    string? Species,
    [MaxLength(120)]
    string? CustomSpecies,
    [MaxLength(160)]
    string? Breed,
    [MaxLength(80)]
    string? Gender,
    [MaxLength(120)]
    string? Color,
    PetAgeMode? AgeInformationMode,
    DateOnly? Birthday,
    short? EstimatedBirthYear,
    DateOnly? AdoptionDay,
    [MaxLength(200)]
    string? GeneralArea,
    [MaxLength(2000)]
    string? Bio,
    IReadOnlyList<string>? PersonalityTags,
    [MaxLength(64)]
    string? ProfileTheme,
    PetContactRequest? Contact,
    PetVisibilityRequest? Visibility,
    [MaxLength(2000)]
    string? SafetyNote,
    [MaxLength(2000)]
    string? EmergencyNote,
    [Range(0, 100)] byte? CoverPositionX = null,
    [Range(0, 100)] byte? CoverPositionY = null,
    IReadOnlyList<string>? FavoriteFoods = null,
    IReadOnlyList<string>? FavoriteToys = null,
    // Legacy single-value fields, still accepted from older clients. Ignored
    // when the list fields are provided.
    [MaxLength(80)] string? FavoriteFood = null,
    [MaxLength(80)] string? FavoriteToy = null);

public sealed record PetContactResponse(
    bool UseOwnerDefaults,
    string? OwnerDisplayName,
    string? PhoneE164,
    string? WhatsappE164,
    string? EmergencyContactE164,
    string? GeneralAreaOverride);

public sealed record PetVisibilityResponse(
    bool ShowOwnerName,
    bool ShowGeneralArea,
    bool ShowPhone,
    bool ShowWhatsapp,
    bool ShowEmergencyNote,
    bool ShowCareBadges,
    bool ShowMoments,
    bool ShowTimeline,
    bool ShowBirthdayOnTimeline,
    bool ShowAdoptionDayOnTimeline,
    bool ShowHealthSummary);

public sealed record PetListItemResponse(
    Guid Id,
    string Name,
    string Species,
    string? CustomSpecies,
    DateOnly? Birthday,
    short? EstimatedBirthYear,
    PetAgeInfoResponse Age,
    Guid? ProfileMediaId,
    Guid? CoverMediaId,
    string? ProfilePhotoUrl,
    string? CoverPhotoUrl,
    byte CoverPositionX,
    byte CoverPositionY,
    IReadOnlyList<string> PersonalityTags,
    string PublicSlug,
    string PublicCode,
    string? PublicProfileVersion,
    string SafetyCode,
    PetLifecycleStatus LifecycleStatus,
    bool LostModeEnabled,
    string PublicProfilePath,
    string QrSafetyPath,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record PetDetailResponse(
    Guid Id,
    string Name,
    string Species,
    string? CustomSpecies,
    string? Breed,
    string? Gender,
    string? Color,
    DateOnly? Birthday,
    short? EstimatedBirthYear,
    PetAgeInfoResponse Age,
    DateOnly? AdoptionDay,
    string? GeneralArea,
    string? Bio,
    IReadOnlyList<string> PersonalityTags,
    IReadOnlyList<string> FavoriteFoods,
    IReadOnlyList<string> FavoriteToys,
    Guid? ProfileMediaId,
    Guid? CoverMediaId,
    string? ProfilePhotoUrl,
    string? CoverPhotoUrl,
    byte CoverPositionX,
    byte CoverPositionY,
    string ProfileTheme,
    PetLifecycleStatus LifecycleStatus,
    bool LostModeEnabled,
    string? LostLastSeenArea,
    DateTimeOffset? LostLastSeenDateTime,
    string? LostMessage,
    string? LostRewardNote,
    string? LostExtraContactInstruction,
    DateOnly? MemorialPassedAwayDate,
    string? MemorialMessage,
    bool ShowMemorialOnPublicProfile,
    string PublicCode,
    string PublicSlug,
    string? PublicProfileVersion,
    string SafetyCode,
    string PublicProfilePath,
    string QrSafetyPath,
    PetContactResponse Contact,
    PetVisibilityResponse Visibility,
    string? SafetyNote,
    string? EmergencyNote,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset? ArchivedAt);

public sealed record PetResponse(
    Guid Id,
    string Name,
    string Species,
    PetLifecycleStatus LifecycleStatus,
    bool LostModeEnabled,
    string PublicCode,
    string SafetyCode,
    string PublicProfilePath,
    string QrSafetyPath,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record MarkPetMemorialRequest(
    DateOnly? PassedAwayDate,
    [MaxLength(2000)]
    string? MemorialMessage,
    bool ShowMemorialOnPublicProfile);

public sealed record UpdateLostModeRequest(
    bool Enabled,
    string? LastSeenArea,
    DateTimeOffset? LastSeenDateTime,
    string? LostMessage,
    string? RewardNote,
    string? ExtraContactInstruction);
