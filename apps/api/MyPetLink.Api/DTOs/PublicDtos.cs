using MyPetLink.Api.Entities;

namespace MyPetLink.Api.DTOs;

public sealed record PublicPetProfileResponse(
    string PublicCode,
    string PublicSlug,
    string PublicProfileVersion,
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
    PetLifecycleStatus LifecycleStatus,
    bool LostModeEnabled,
    string? OwnerDisplayName,
    string? GeneralArea,
    string? ProfilePhotoUrl,
    string? CoverPhotoUrl,
    byte CoverPositionX,
    byte CoverPositionY,
    string? Bio,
    IReadOnlyList<string> PersonalityTags,
    IReadOnlyList<string> FavoriteFoods,
    IReadOnlyList<string> FavoriteToys,
    string? MemorialMessage,
    IReadOnlyCollection<PublicMemorySummaryResponse> Memories,
    IReadOnlyCollection<PublicCareSummaryResponse> CareRecords);

public sealed record PublicProfileSocialResponse(
    string PublicCode,
    string PublicSlug,
    string PublicProfileVersion,
    string Name,
    string Species,
    string? CustomSpecies,
    string? Breed,
    string AgeDisplayLabel,
    PetLifecycleStatus LifecycleStatus,
    bool LostModeEnabled,
    string? ProfilePhotoUrl,
    string? CoverPhotoUrl,
    byte CoverPositionX,
    byte CoverPositionY);

public sealed record PublicMemorySummaryResponse(
    string Title,
    DateOnly? MomentDate,
    string? Type,
    string? Caption,
    bool ShowOnPublicProfile,
    bool ShowInLifeTimeline,
    string? TimelineNote,
    IReadOnlyCollection<MemoryMediaResponse> Media);

public sealed record PublicCareSummaryResponse(
    string Type,
    string Title,
    DateOnly? RecordDate,
    DateOnly? DueDate,
    string? Provider,
    string? Notes);

public sealed record PublicSafetyContactResponse(
    string? OwnerDisplayName,
    string? PhoneE164,
    string? WhatsappE164,
    string? EmergencyContactE164);

public sealed record PublicSafetyPageResponse(
    string SafetyCode,
    string State,
    string Name,
    string Species,
    DateOnly? Birthday,
    short? EstimatedBirthYear,
    PetAgeInfoResponse Age,
    PetLifecycleStatus LifecycleStatus,
    bool LostModeEnabled,
    string? GeneralArea,
    string? SafetyNote,
    string? EmergencyNote,
    string? LostLastSeenArea,
    DateTimeOffset? LostLastSeenDateTime,
    string? LostMessage,
    string? LostRewardNote,
    string? LostExtraContactInstruction,
    string? ProfilePhotoUrl,
    string? CoverPhotoUrl,
    byte CoverPositionX,
    byte CoverPositionY,
    bool ShowFoundLocationAction,
    PublicSafetyContactResponse? Contact);

public sealed record QrSafetyPageResponse(
    string SafetyCode,
    string Name,
    PetLifecycleStatus LifecycleStatus,
    bool LostModeEnabled,
    string? SafetyNote,
    string? EmergencyNote,
    bool ShowPhone,
    bool ShowWhatsapp);

public sealed record TagScanPageResponse(
    string State,
    string TagCode,
    string? Status,
    PublicSafetyPageResponse? Profile);

public sealed record SubmitScanLocationConsentRequest(
    Guid TagScanId,
    decimal? Latitude,
    decimal? Longitude,
    bool Consent);
